import { get, post, patch } from './api.js';
import { state } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { avatarEl, getAvatarUrl } from './avatar.js';
import { sendPushNotification } from './push.js';
import { addFeedEvent } from './feed.js';

// =============================================
// SISTEMA SFIDE
// =============================================

// =============================================
// CARICA SEZIONE SFIDE
// =============================================
export async function loadChallenges() {
  const container = document.getElementById('challengesContent');
  if (!container) return;

  if (!state.currentUser) {
    container.innerHTML = '<div class="empty"><div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 4 12 6 14"/><line x1="5" y1="11" x2="9" y2="7"/></svg></div><p>Accedi per vedere e inviare sfide</p></div>';
    return;
  }

  container.innerHTML = '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [incoming, outgoing, allPlayers] = await Promise.all([
    get('challenges', `sfidato_id=eq.${state.currentUser.id}&stato=eq.pending&order=creato_il.desc&select=*`),
    get('challenges', `sfidante_id=eq.${state.currentUser.id}&stato=in.(pending,accepted)&order=creato_il.desc&select=*`),
    get('players', 'order=nome.asc&select=*')
  ]);

  if (state.allPlayers.length === 0) state.allPlayers = allPlayers;

  let html = '';

  // ---- SFIDE IN ARRIVO ----
  if (incoming.length > 0) {
    html += `<div class="pending-banner" style="border-color:rgba(0,180,216,0.3);background:rgba(0,180,216,0.04)">
      <h3 style="color:var(--accent3)">Sfide ricevute (${incoming.length})</h3>
      ${incoming.map(c => {
        const sfidante = state.allPlayers.find(p => p.id === c.sfidante_id);
        const ago      = timeAgo(c.creato_il);
        return `<div class="pending-item">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
            ${avatarEl(sfidante?.nome || '?', 32, getAvatarUrl(c.sfidante_id))}
            <div>
              <div style="font-weight:600;font-size:14px">${sfidante?.nome || '?'} ti sfida!</div>
              ${c.messaggio ? `<div style="font-size:12px;color:var(--text2);margin-top:2px">"${c.messaggio}"</div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${ago}</div>
            </div>
          </div>
          <div class="pending-btns">
            <button class="btn-sm btn-sm-confirm" onclick="window._acceptChallenge('${c.id}')">✓ Accetta</button>
            <button class="btn-sm btn-sm-deny"    onclick="window._refuseChallenge('${c.id}')">✗ Rifiuta</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ---- SFIDE INVIATE ----
  if (outgoing.length > 0) {
    html += `<div class="card" style="margin-bottom:16px">
      <div class="card-title">Sfide Inviate</div>
      ${outgoing.map(c => {
        const sfidato = state.allPlayers.find(p => p.id === c.sfidato_id);
        const ago     = timeAgo(c.creato_il);
        const statoColor = c.stato === 'accepted' ? 'var(--accent)' : 'var(--gold)';
        const statoLabel = c.stato === 'accepted' ? '✅ Accettata' : '⏳ In attesa';
        const daysPending = (Date.now() - new Date(c.creato_il).getTime()) / 86400000;
        const staleWarning = c.stato === 'pending' && daysPending >= 2
          ? `<span style="font-size:11px;color:var(--accent2)">⚠️ Nessuna risposta da ${Math.floor(daysPending)}g</span>`
          : '';
        // Se la sfida è accettata, mostra CTA per registrare la partita
        const registraCta = c.stato === 'accepted'
          ? `<button class="btn-sm btn-sm-confirm" onclick="
              document.querySelector('[data-section=partite]').click();
              setTimeout(() => {
                document.getElementById('match_p2').value = '${c.sfidato_id}';
                window._updateMatchPlayers && window._updateMatchPlayers();
              }, 300)
            ">🏓 Registra</button>`
          : '';
        return `<div class="match-item">
          <div style="display:flex;align-items:center;gap:10px;flex:1">
            ${avatarEl(sfidato?.nome || '?', 32, getAvatarUrl(c.sfidato_id))}
            <div>
              <div style="font-weight:600;font-size:14px">vs ${sfidato?.nome || '?'}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${ago}</div>
              ${staleWarning}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            <span style="font-size:12px;color:${statoColor};font-weight:600">${statoLabel}</span>
            ${registraCta}
            ${c.stato === 'pending' ? `<button class="btn-sm btn-sm-deny" onclick="window._cancelChallenge('${c.id}')">Annulla</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ---- NUOVA SFIDA ----
  const sfidabili = state.allPlayers.filter(p => p.id !== state.currentUser.id);
  html += `<div class="card">
    <div class="card-title">Invia Sfida</div>
    <div class="form-group">
      <label class="form-label">Sfida</label>
      <select class="form-select" id="challenge_target">
        <option value="">Seleziona avversario...</option>
        ${sfidabili.map(p => `<option value="${p.id}">${p.nome} (${p.elo} Elo)</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Messaggio (opzionale)</label>
      <input type="text" class="form-input" id="challenge_msg"
        placeholder="es. Oggi alle 18 in sala mensa?" maxlength="100">
    </div>
    <button class="btn btn-primary" onclick="window._sendChallenge()"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 4 12 6 14"/><line x1="5" y1="11" x2="9" y2="7"/></svg> Invia Sfida</button>
  </div>`;

  if (incoming.length === 0 && outgoing.length === 0) {
    html = `<div class="empty" style="margin-bottom:16px">
      <div class="icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 4 12 6 14"/><line x1="5" y1="11" x2="9" y2="7"/></svg></div>
      <p>Nessuna sfida attiva — lanciane una!</p>
    </div>` + html.slice(html.indexOf('<div class="card">'));
  }

  container.innerHTML = html;
}

// =============================================
// INVIA SFIDA
// =============================================
export async function sendChallenge() {
  const targetId = document.getElementById('challenge_target').value;
  const msg      = document.getElementById('challenge_msg').value.trim();

  if (!targetId) return toast('Seleziona un avversario', 'error');

  // Controlla sfida già pendente
  const existing = await get('challenges',
    `sfidante_id=eq.${state.currentUser.id}&sfidato_id=eq.${targetId}&stato=eq.pending`
  );
  if (existing.length > 0) return toast('Hai già una sfida pendente con questo giocatore', 'error');

  await post('challenges', {
    sfidante_id: state.currentUser.id,
    sfidato_id:  targetId,
    stato:       'pending',
    messaggio:   msg
  });

  const target = state.allPlayers.find(p => p.id === targetId);

  // Feed event
  await addFeedEvent({
    tipo:      'challenge_sent',
    player1_id: state.currentUser.id,
    player2_id: targetId,
    metadata:  { messaggio: msg }
  });

  // Notifica push al sfidato
  await sendPushNotification({
    playerIds: [targetId],
    title:     'Nuova Sfida',
    body:      `${state.currentUser.nome} ti ha sfidato${msg ? ': "' + msg + '"' : '!'}`,
    tag:       'challenge',
    url:       '/#sfide'
  });

  toast(`Sfida inviata a ${target?.nome}!`);
  await loadChallenges();
}

// =============================================
// ACCETTA SFIDA
// =============================================
export async function acceptChallenge(challengeId) {
  const [c] = await get('challenges', `id=eq.${challengeId}&select=*`);

  await patch('challenges', `id=eq.${challengeId}`, {
    stato:       'accepted',
    risposto_il: new Date().toISOString()
  });

  const sfidante = state.allPlayers.find(p => p.id === c.sfidante_id);

  // Feed event
  await addFeedEvent({
    tipo:       'challenge_accepted',
    player1_id: state.currentUser.id,
    player2_id: c.sfidante_id,
    metadata:   {}
  });

  // Notifica push allo sfidante
  await sendPushNotification({
    playerIds: [c.sfidante_id],
    title:     '✅ Sfida Accettata!',
    body:      `${state.currentUser.nome} ha accettato la tua sfida. Preparati!`,
    tag:       'challenge-accepted',
    url:       '/#sfide'
  });

  toast(`Sfida accettata! Che vinca il migliore 🏓`);
  await loadChallenges();
}

// =============================================
// RIFIUTA SFIDA
// =============================================
export async function refuseChallenge(challengeId) {
  const [c] = await get('challenges', `id=eq.${challengeId}&select=*`);

  await patch('challenges', `id=eq.${challengeId}`, {
    stato:       'refused',
    risposto_il: new Date().toISOString()
  });

  const sfidante = state.allPlayers.find(p => p.id === c.sfidante_id);

  // Feed event — il momento più sociale dell'intera app 😄
  await addFeedEvent({
    tipo:       'challenge_refused',
    player1_id: state.currentUser.id,
    player2_id: c.sfidante_id,
    metadata:   {}
  });

  // Notifica push allo sfidante
  await sendPushNotification({
    playerIds: [c.sfidante_id],
    title:     '😤 Sfida Rifiutata',
    body:      `${state.currentUser.nome} ha rifiutato la tua sfida.`,
    tag:       'challenge-refused',
    url:       '/#sfide'
  });

  toast('Sfida rifiutata');
  await loadChallenges();
}

// =============================================
// ANNULLA SFIDA (sfidante)
// =============================================
export async function cancelChallenge(challengeId) {
  await patch('challenges', `id=eq.${challengeId}`, { stato: 'expired' });
  toast('Sfida annullata');
  await loadChallenges();
}

// =============================================
// UTILITY
// =============================================
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs  / 24);

  if (mins < 1)   return 'ora';
  if (mins < 60)  return `${mins}m fa`;
  if (hrs  < 24)  return `${hrs}h fa`;
  return `${days}g fa`;
}