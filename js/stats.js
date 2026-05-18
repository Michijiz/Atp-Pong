import { get } from './api.js';
import { state } from './state.js';

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
      const pts = tPoints
        .filter(p => p.torneo_id === t.id)
        .sort((a, b) => b.punti - a.punti);
      const winner = pts[0] ? getName(pts[0].player_id) : '—';

      return `
        <div class="card" style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
          <div style="font-size:40px;flex-shrink:0">🏆</div>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-display);font-size:18px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.nome}</div>
            <div style="font-size:13px;font-weight:700;color:var(--accent);margin-top:3px">${winner}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${new Date(t.data_inizio).toLocaleDateString('it',{day:'numeric',month:'long',year:'numeric'})} · ${t.tipo}</div>
          </div>
        </div>`;
    }).join('')}`;
}
