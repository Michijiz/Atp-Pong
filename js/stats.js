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
    get('tournaments', 'stato=eq.chiuso&order=creato_il.desc&select=*'),
    get('tournament_points', 'select=*'),
    get('players', 'select=id,nome')
  ]);

  if (!tornei.length) {
    el.innerHTML = '<div class="empty"><div class="icon">🏆</div><p>Nessun torneo concluso ancora</p></div>';
    return;
  }

  const getName = id => players.find(p => p.id === id)?.nome || '?';

  el.innerHTML = `
    <div class="section-title">🏆 <span>Albo d'Oro</span></div>
    ${tornei.map(t => {
      const cfg = TORNEO_CONFIG[t.tipo] || TORNEO_CONFIG.amichevole;
      const pts = tPoints
        .filter(p => p.torneo_id === t.id)
        .sort((a, b) => b.punti - a.punti)
        .slice(0, 3);

      const medals = ['🥇','🥈','🥉'];
      const podio = pts.map((p, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;${i < pts.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
          <span style="font-size:20px;width:28px;text-align:center">${medals[i]}</span>
          ${avatarEl(getName(p.player_id), 36, getAvatarUrl(p.player_id))}
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px">${getName(p.player_id)}</div>
          </div>
          <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--gold)">+${p.punti} pts</div>
        </div>`).join('');

      return `
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
            <div>
              <div style="font-family:var(--font-display);font-size:22px;letter-spacing:1px">${t.nome}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:4px">
                ${new Date(t.creato_il).toLocaleDateString('it',{day:'numeric',month:'long',year:'numeric'})}
              </div>
            </div>
            <span class="badge badge-torneo" style="margin-top:4px">${cfg.label || t.tipo}</span>
          </div>
          ${podio || '<div style="color:var(--text2);font-size:13px">Nessun punto assegnato</div>'}
        </div>`;
    }).join('')}`;
}
