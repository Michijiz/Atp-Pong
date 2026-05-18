import { get, post, del } from './api.js';
import { state } from './state.js';
import { toast } from './ui.js';
import { avatarEl, getAvatarUrl } from './avatar.js';

const MAX_CHARS = 120;

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'ora';
  if (diff < 3600) return `${Math.floor(diff/60)}m fa`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h fa`;
  return `${Math.floor(diff/86400)}g fa`;
}

export async function loadBacheca() {
  const el = document.getElementById('bachecarContent');
  if (!el) return;

  const [posts, players] = await Promise.all([
    get('bacheca', 'order=creato_il.desc&limit=30&select=*'),
    get('players', 'select=id,nome')
  ]);

  const getName = id => players.find(p => p.id === id)?.nome || '?';

  const postForm = state.currentUser ? `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:10px;align-items:flex-end">
        <div style="flex:1">
          <input type="text" class="form-input" id="bachekaInput" maxlength="${MAX_CHARS}"
            placeholder="Scrivi un messaggio... (es. Chi gioca stasera alle 18?)"
            onkeydown="if(event.key==='Enter')window._bachekaPost()">
        </div>
        <button class="btn btn-primary" style="width:auto;padding:12px 20px;flex-shrink:0" onclick="window._bachekaPost()">Invia</button>
      </div>
    </div>` : '';

  const postsHtml = posts.length
    ? posts.map(p => {
        const isMe = state.currentUser?.id === p.player_id;
        return `<div class="bacheca-post">
          ${avatarEl(getName(p.player_id), 36, getAvatarUrl(p.player_id))}
          <div class="bacheca-body">
            <div class="bacheca-text">${p.testo}</div>
            <div class="bacheca-meta">
              <strong>${getName(p.player_id)}</strong>
              <span>· ${timeAgo(p.creato_il)}</span>
              ${isMe ? `<button class="bacheca-del" onclick="window._bachekaDelete('${p.id}')">✕ Elimina</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="icon">💬</div><p>Nessun messaggio ancora. Rompete il ghiaccio!</p></div>';

  el.innerHTML = postForm + `<div class="card">${postsHtml}</div>`;
}

export async function bachekaPost() {
  if (!state.currentUser) return toast('Devi essere loggato', 'error');
  const input = document.getElementById('bachekaInput');
  const testo = input?.value.trim();
  if (!testo) return toast('Scrivi qualcosa', 'error');
  await post('bacheca', { player_id: state.currentUser.id, testo });
  input.value = '';
  await loadBacheca();
}

export async function bachekaDelete(id) {
  await del('bacheca', `id=eq.${id}`);
  await loadBacheca();
}
