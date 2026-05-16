import { get } from './api.js';
import { state } from './state.js';
import { openModal } from './ui.js';
import { avatarEl, getAvatarUrl, getAvatarColor, handleAvatarUpload } from './avatar.js';

// =============================================
// RANKING
// =============================================

export async function loadRanking() {
  document.getElementById('rankingBody').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [players, tPoints] = await Promise.all([
    get('players', 'order=elo.desc&select=*'),
    get('tournament_points', 'select=player_id,punti')
  ]);

  state.allPlayers = players;

  const tPtsMap = {};
  tPoints.forEach(tp => {
    tPtsMap[tp.player_id] = (tPtsMap[tp.player_id] || 0) + tp.punti;
  });

  const allSorted = players.map(p => ({
    ...p,
    bonus:  tPtsMap[p.id] || 0,
    totale: p.elo + (tPtsMap[p.id] || 0)
  })).sort((a, b) => b.totale - a.totale);

  // Solo chi ha giocato almeno una partita è classificato
  const ranked   = allSorted.filter(p => p.partite_giocate > 0);
  const unranked = allSorted.filter(p => p.partite_giocate === 0);

  document.getElementById('heroSub').textContent = `${ranked.length} classificati · ${unranked.length} in attesa`;
  // Fix #11 — calcola streak del currentUser dai match recenti
  let streakHtml = '';
  if (state.currentUser) {
    const myMatches = await get('matches',
      `or=(player1_id.eq.${state.currentUser.id},player2_id.eq.${state.currentUser.id})&confermata=eq.true&order=data.desc&limit=20&select=winner_id`
    );
    let streak = 0, streakType = null;
    for (const m of myMatches) {
      const won = m.winner_id === state.currentUser.id;
      if (streakType === null) { streakType = won; streak = 1; }
      else if (won === streakType) streak++;
      else break;
    }
    if (streak >= 2) {
      const icon  = streakType ? '🔥' : '❄️';
      const label = streakType ? `${streak} vittorie consecutive` : `${streak} sconfitte consecutive`;
      streakHtml  = `<div class="pill">${icon} <strong>${label}</strong></div>`;
    }
  }

  document.getElementById('heroPills').innerHTML = `
    <div class="pill">Partite <strong>${players.reduce((a, p) => a + p.partite_giocate, 0)}</strong></div>
    <div class="pill">Top Elo <strong>${Math.max(...players.map(p => p.elo), 1000)}</strong></div>
    ${streakHtml}`;

  if (ranked.length === 0) {
    document.getElementById('rankingBody').innerHTML =
      '<div class="empty"><div class="icon">🏓</div><p>Nessun giocatore ancora. Registrati!</p></div>';
    return;
  }

  // Fix #7 — mostra la posizione dell'utente corrente in cima
  const myRank = state.currentUser
    ? ranked.findIndex(p => p.id === state.currentUser.id) + 1
    : 0;
  const isUnrankedMe = state.currentUser
    ? unranked.some(p => p.id === state.currentUser.id)
    : false;

  if (myRank > 0) {
    const myData = ranked[myRank - 1];
    document.getElementById('heroSub').innerHTML =
      `${ranked.length} classificati — <span style="color:var(--accent);font-weight:700">Sei #${myRank}</span> con ${myData.totale} punti`;
  } else if (isUnrankedMe) {
    document.getElementById('heroSub').innerHTML =
      `${ranked.length} classificati — <span style="color:var(--text2);font-weight:700">Non classificato</span> · gioca la tua prima partita!`;
  }

  document.getElementById('rankingBody').innerHTML = ranked.map((p, i) => {
    const rank      = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const winPct    = p.partite_giocate > 0 ? Math.round(p.vinte / p.partite_giocate * 100) : 0;
    const winColor  = winPct >= 60 ? 'var(--accent)' : winPct >= 40 ? 'var(--text)' : 'var(--accent2)';
    const isMe      = state.currentUser?.id === p.id;

    return `<div class="player-row ${rank===1?'top1':rank===2?'top2':rank===3?'top3':''} ${isMe ? 'my-row' : ''}"
      onclick="window._showProfile('${p.id}')" style="${isMe ? 'border-left:3px solid var(--accent);background:rgba(0,255,136,0.04);' : ''}">
      <div class="rank-num ${rankClass}">${rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank}</div>
      <div class="player-name-cell">
        ${avatarEl(p.nome, 38, getAvatarUrl(p.id))}
        <span class="player-name">${p.nome}${isMe ? ' <span style="font-size:10px;color:var(--accent);font-family:var(--font-mono)">(tu)</span>' : ''}</span>
      </div>
      <div class="elo-val">${p.elo}</div>
      <div class="pts-val">${p.bonus > 0 ? '+' + p.bonus : '—'}</div>
      <div class="total-val">${p.totale}</div>
      <div class="wl-val" style="color:var(--accent)">${p.vinte}</div>
      <div class="wl-val" style="color:var(--accent2)">${p.perse}</div>
      <div class="winpct" style="color:${winColor}">${winPct}%</div>
    </div>`;
  }).join('') + (unranked.length > 0 ? `
    <div style="padding:12px 16px;font-size:11px;font-family:var(--font-mono);color:var(--text2);letter-spacing:0.08em;border-top:1px solid var(--border);margin-top:4px;text-transform:uppercase">
      Non classificati · devono ancora giocare
    </div>
    ${unranked.map(p => {
      const isMe = state.currentUser?.id === p.id;
      return `<div class="player-row ${isMe ? 'my-row' : ''}"
        onclick="window._showProfile('${p.id}')" style="opacity:0.45;${isMe ? 'border-left:3px solid var(--accent);' : ''}">
        <div class="rank-num" style="color:var(--text2)">—</div>
        <div class="player-name-cell">
          ${avatarEl(p.nome, 38, getAvatarUrl(p.id))}
          <span class="player-name">${p.nome}${isMe ? ' <span style="font-size:10px;color:var(--accent);font-family:var(--font-mono)">(tu)</span>' : ''}</span>
        </div>
        <div class="elo-val" style="color:var(--text2)">—</div>
        <div class="pts-val">${p.bonus > 0 ? '+' + p.bonus : '—'}</div>
        <div class="total-val" style="color:var(--text2)">—</div>
        <div class="wl-val">—</div>
        <div class="wl-val">—</div>
        <div class="winpct" style="color:var(--text2)">—</div>
      </div>`;
    }).join('')}` : '');
}

// =============================================
// PROFILO GIOCATORE
// =============================================

export async function showProfile(playerId) {
  openModal('profileModal');
  document.getElementById('profileContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [player, matches, tPts, eloHist] = await Promise.all([
    get('players', `id=eq.${playerId}&select=*`).then(r => r[0]),
    get('matches', `or=(player1_id.eq.${playerId},player2_id.eq.${playerId})&confermata=eq.true&order=data.desc&select=*`),
    get('tournament_points', `player_id=eq.${playerId}&select=punti`),
    get('elo_history', `player_id=eq.${playerId}&order=data.asc&select=elo,data`)
  ]);

  const bonus  = tPts.reduce((a, t) => a + t.punti, 0);
  const winPct = player.partite_giocate > 0
    ? Math.round(player.vinte / player.partite_giocate * 100) : 0;

  // H2H
  const h2h = {};
  for (const m of matches) {
    const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
    if (!h2h[oppId]) h2h[oppId] = { v: 0, s: 0 };
    if (m.winner_id === playerId) h2h[oppId].v++;
    else h2h[oppId].s++;
  }

  // Elo chart
  const eloData = eloHist.map(e => e.elo);
  if (eloData.length === 0) eloData.push(player.elo);
  const minElo = Math.min(...eloData) - 20;
  const maxElo = Math.max(...eloData) + 20;
  const range  = maxElo - minElo || 1;
  const chartW = 400, chartH = 100;
  const pts = eloData.map((e, i) => {
    const x = eloData.length > 1 ? i / (eloData.length - 1) * chartW : chartW / 2;
    const y = chartH - ((e - minElo) / range) * chartH;
    return `${x},${y}`;
  }).join(' ');

  const chartSvg = `<svg viewBox="0 0 ${chartW} ${chartH + 16}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00ff88" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#00ff88" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polyline points="${pts}" fill="none" stroke="#00ff88" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <text x="2" y="${chartH - 2}" fill="var(--text2)" font-size="10" font-family="monospace">${minElo + 20}</text>
    <text x="2" y="10"            fill="var(--accent)" font-size="10" font-family="monospace">${maxElo - 20}</text>
    <text x="${chartW - 2}" y="10" fill="var(--text2)" font-size="10" font-family="monospace" text-anchor="end">ora</text>
  </svg>`;

  // Ultimi match
  const recentMatches = matches.slice(0, 5).map(m => {
    const isWin  = m.winner_id === playerId;
    const oppId  = m.player1_id === playerId ? m.player2_id : m.player1_id;
    const opp    = state.allPlayers.find(p => p.id === oppId);
    const score  = m.punteggio1 != null
      ? (m.player1_id === playerId
          ? `${m.punteggio1}-${m.punteggio2}`
          : `${m.punteggio2}-${m.punteggio1}`)
      : '';
    return `<div class="match-item">
      <div class="match-players">
        <span class="${isWin ? 'match-winner' : 'match-loser'}">${isWin ? 'Vinta' : 'Persa'}</span>
        <span class="match-vs">vs</span>
        <span>${opp?.nome || 'Sconosciuto'}</span>
        ${score ? `<span class="match-score">${score}</span>` : ''}
      </div>
      <span class="match-date">${new Date(m.data).toLocaleDateString('it')}</span>
    </div>`;
  }).join('') || '<div class="empty"><p>Nessuna partita ancora</p></div>';

  // H2H list
  const h2hList = Object.entries(h2h).map(([oppId, rec]) => {
    const opp = state.allPlayers.find(p => p.id === oppId);
    return `<div class="h2h-row">
      <span class="h2h-name">${opp?.nome || 'Sconosciuto'}</span>
      <span class="h2h-record">
        <span class="h2h-win">${rec.v}V</span> / <span class="h2h-lose">${rec.s}S</span>
      </span>
    </div>`;
  }).join('') || '<div class="empty"><p>Nessun testa a testa</p></div>';

  const [bg] = getAvatarColor(player.nome);
  const avatarUrl = getAvatarUrl(player.id);
  const isOwner   = state.currentUser?.id === player.id || state.currentUser?.ruolo === 'admin';

  const avatarSection = `
    <div style="position:relative;width:80px;height:80px;flex-shrink:0">
      <div class="profile-avatar" style="width:80px;height:80px;overflow:hidden;padding:0;border:2px solid ${bg}44">
        <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
          onload="this.nextElementSibling.style.display='none'">
        <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${bg}22;color:${bg};font-size:28px;font-weight:700;border-radius:50%">
          ${player.nome[0].toUpperCase()}
        </div>
      </div>
      ${isOwner ? `<label style="position:absolute;bottom:0;right:0;width:24px;height:24px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px" title="Cambia foto">
        📷<input type="file" accept="image/*" style="display:none" onchange="window._handleAvatarUpload('${player.id}', this)">
      </label>` : ''}
    </div>`;

  document.getElementById('profileContent').innerHTML = `
    <div class="profile-header">
      ${avatarSection}
      <div class="profile-info">
        <h2>${player.nome}</h2>
        <div class="profile-elo">Elo: ${player.elo} | Totale: ${player.elo + bonus}</div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-box"><span class="val" style="color:var(--text)">${player.partite_giocate}</span><span class="lbl">Partite</span></div>
      <div class="stat-box"><span class="val" style="color:var(--accent)">${player.vinte}</span><span class="lbl">Vittorie</span></div>
      <div class="stat-box"><span class="val" style="color:var(--accent2)">${player.perse}</span><span class="lbl">Sconfitte</span></div>
    </div>
    <div class="stat-box" style="margin-bottom:16px;text-align:center">
      <span class="val" style="color:var(--gold)">${winPct}%</span>
      <span class="lbl">Win Rate</span>
    </div>
    ${eloData.length > 1
      ? `<div style="margin-bottom:16px">
           <div style="font-size:11px;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Andamento Elo</div>
           <div class="elo-chart">${chartSvg}</div>
         </div>`
      : ''}
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Ultime partite</div>
    ${recentMatches}
    ${Object.keys(h2h).length > 0
      ? `<hr class="divider">
         <div style="font-size:11px;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Testa a Testa</div>
         ${h2hList}`
      : ''}
  `;
}
