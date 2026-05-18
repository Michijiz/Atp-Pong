import { get } from './api.js';
import { state } from './state.js';
import { avatarEl, getAvatarUrl } from './avatar.js';
import { TORNEO_CONFIG } from './config.js';

// =============================================
// ALBO D'ORO — tornei conclusi
// =============================================

export async function loadStats() {
  const el = document.getElementById('statsContent');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [tornei, tPoints, players] = await Promise.all([
    get('tournaments', 'stato=eq.chiuso&order=data_inizio.desc&select=*'),
    get('tournament_points', 'select=*'),
    get('players', 'select=id,nome')
  ]);

  if (!tornei.length) {
    el.innerHTML = '<div class="empty"><div class="icon">🏆</div><p>Nessun torneo concluso ancora</p></div>';
    return;
  }

  const getName = id => players.find(p => p.id === id)?.nome || '?';
  const medals = ['🥇','🥈','🥉'];

  el.innerHTML = `
    <div class="sec-label">Tornei conclusi</div>
    ${tornei.map(t => {
      const cfg = TORNEO_CONFIG?.[t.tipo] || {};
      const pts = tPoints
        .filter(p => p.torneo_id === t.id)
        .sort((a, b) => b.punti - a.punti)
        .slice(0, 3);

      const podio = pts.map((p, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;${i < pts.length-1 ? 'border-bottom:1px solid var(--b1)' : ''}">
          <span style="font-size:18px;width:26px;text-align:center">${medals[i]}</span>
          ${avatarEl(getName(p.player_id), 34, getAvatarUrl(p.player_id))}
          <div style="flex:1;font-weight:700;font-size:14px">${getName(p.player_id)}</div>
          <div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--gold)">+${p.punti} pts</div>
        </div>`).join('');

      return `
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
            <div>
              <div style="font-family:var(--font-display);font-size:20px;letter-spacing:1px">${t.nome}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:4px">
                ${new Date(t.data_inizio).toLocaleDateString('it',{day:'numeric',month:'long',year:'numeric'})}
              </div>
            </div>
            <span class="badge badge-torneo">${t.tipo}</span>
          </div>
          ${podio || '<div style="color:var(--text2);font-size:12px">Nessun punto assegnato</div>'}
        </div>`;
    }).join('')}`;
}
