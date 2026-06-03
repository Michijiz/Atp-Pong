import { get } from './api.js';
import { state } from './state.js';
import { avatarEl, getAvatarUrl } from './avatar.js';

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

  const getPlayer = id => players.find(p => p.id === id);

  el.innerHTML = `
    <div class="sec-label">Tornei conclusi</div>
    ${tornei.map(t => {
      const pts = tPoints
        .filter(p => p.torneo_id === t.id)
        .sort((a, b) => b.punti - a.punti);
      const winnerPlayer = pts[0] ? getPlayer(pts[0].player_id) : null;
      const winnerNome   = winnerPlayer?.nome || '—';
      const tipoClass    = 'tipo-' + t.tipo;

      return '<div class="card" style="margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<div style="position:relative;flex-shrink:0">' +
            avatarEl(winnerNome, 52, winnerPlayer ? getAvatarUrl(winnerPlayer.id) : null) +
            '<div style="position:absolute;bottom:-4px;right:-4px;font-size:18px;line-height:1">🏆</div>' +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-family:var(--font-display);font-size:19px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + t.nome + '</div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--accent);margin-top:2px">' + winnerNome + '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap">' +
              '<span class="torneo-tipo-badge ' + tipoClass + '">' + t.tipo + '</span>' +
              '<span style="font-size:11px;color:var(--text2)">' + new Date(t.data_inizio).toLocaleDateString('it',{day:'numeric',month:'long',year:'numeric'}) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('')}`;
}
