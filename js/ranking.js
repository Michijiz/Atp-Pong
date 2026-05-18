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
 document.getElementById('rankingPodium')?.innerHTML = '';

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

  const ranked   = allSorted.filter(p => p.partite_giocate > 0);
  const unranked = allSorted.filter(p => p.partite_giocate === 0);

  // --- Hero sub ---
  const myRank = state.currentUser
    ? ranked.findIndex(p => p.id === state.currentUser.id) + 1 : 0;
  const isUnrankedMe = state.currentUser
    ? unranked.some(p => p.id === state.currentUser.id) : false;

  if (myRank > 0) {
    const myData = ranked[myRank - 1];
    document.getElementById('heroSub').innerHTML =
      `${ranked.length} classificati — <span style="color:var(--accent);font-weight:700">Sei #${myRank}</span> con ${myData.totale} punti`;
  } else if (isUnrankedMe) {
    document.getElementById('heroSub').innerHTML =
      `${ranked.length} classificati — <span style="color:var(--text2);font-weight:700">Non classificato</span> · gioca la tua prima partita!`;
  } else {
    document.getElementById('heroSub').textContent =
      `${ranked.length} classificati · ${unranked.length} in attesa`;
  }

  // --- Pills ---
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
  document.getElementById('heroPills').innerHTML =
    `<div class="pill">Partite <strong>${players.reduce((a, p) => a + p.partite_giocate, 0)}</strong></div>
     <div class="pill">Top ELO <strong>${Math.max(...players.map(p => p.elo), 1000)}</strong></div>
     ${streakHtml}`;

  if (ranked.length === 0) {
    document.getElementById('rankingPodium').innerHTML = '';
    document.getElementById('rankingBody').innerHTML =
      '<div class="empty"><div class="icon">🏓</div><p>Nessun giocatore ancora. Registrati!</p></div>';
    return;
  }

  // --- PODIO (top 3) ---
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(Boolean); // 2-1-3 visually
  const podClasses  = ['pod-2', 'pod-1', 'pod-3'];
  const podEmojis   = ['🥈', '👑', '🥉'];
  const podNums     = [2, 1, 3];

  document.getElementById('rankingPodium').innerHTML = podiumOrder.map((p, i) => {
    const [bg] = getAvatarColor(p.nome);
    const avatarUrl = getAvatarUrl(p.id);
    const isMe = state.currentUser?.id === p.id;
    return `<div class="pod-card ${podClasses[i]}" onclick="window._showProfile('${p.id}')" style="cursor:pointer">
      <div class="pod-pos">${podEmojis[i]} #${podNums[i]}</div>
      <div class="pod-av" style="background:${bg}18;color:${bg}${isMe ? ';box-shadow:0 0 0 2px ' + bg : ''}">
        <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
          onload="this.nextElementSibling.style.display='none'">
        <span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
          ${p.nome[0].toUpperCase()}
        </span>
      </div>
      <div class="pod-name">${p.nome}${isMe ? ' <span style="color:var(--accent);font-size:9px">(tu)</span>' : ''}</div>
      <div class="pod-elo">${p.elo}</div>
      <div class="pod-pts">${p.totale} pts</div>
    </div>`;
  }).join('');

  // --- LISTA DAL 4° ---
  const listRows = ranked.slice(3);

  if (listRows.length === 0) {
    document.getElementById('rankingBody').innerHTML =
      '<div style="padding:14px 16px;font-size:12px;color:var(--text2);text-align:center">Solo tre giocatori in classifica</div>';
  } else {
    document.getElementById('rankingBody').innerHTML = listRows.map((p, i) => {
      const rank  = i + 4;
      const isMe  = state.currentUser?.id === p.id;
      const [bg]  = getAvatarColor(p.nome);
      const avatarUrl = getAvatarUrl(p.id);
      return `<div class="player-row ${isMe ? 'my-row' : ''}"
        onclick="window._showProfile('${p.id}')"
        style="${isMe ? 'border-left:2px solid var(--accent);background:rgba(200,240,0,0.03)' : ''}">
        <div class="rank-num">${rank}</div>
        <div class="player-name-cell">
          <div class="avatar" style="background:${bg}18;color:${bg}">
            <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
              onload="this.nextElementSibling.style.display='none'">
            <span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
              ${p.nome[0].toUpperCase()}
            </span>
          </div>
          <div style="min-width:0">
            <div class="player-name">${p.nome}${isMe ? ' <span style="font-size:9px;color:var(--accent)">(tu)</span>' : ''}</div>
            <div class="form-dots" id="form-${p.id}"></div>
          </div>
        </div>
        <div class="elo-val">${p.elo}</div>
        <div class="pts-val">${p.totale}</div>
        <div class="trend-val trend-eq" id="trend-${p.id}">—</div>
      </div>`;
    }).join('');

    // carica form dots in background senza bloccare il render
    loadFormDots(listRows);
  }

  // --- UNRANKED ---
  if (unranked.length > 0) {
    const unrankedHtml = `
      <div style="padding:10px 14px;font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;border-top:1px solid var(--b1)">
        Non classificati · devono ancora giocare
      </div>
      ${unranked.map(p => {
        const isMe = state.currentUser?.id === p.id;
        const [bg] = getAvatarColor(p.nome);
        return `<div class="player-row" onclick="window._showProfile('${p.id}')" style="opacity:0.45">
          <div class="rank-num">—</div>
          <div class="player-name-cell">
            <div class="avatar" style="background:${bg}18;color:${bg}">${p.nome[0].toUpperCase()}</div>
            <div class="player-name">${p.nome}${isMe ? ' <span style="font-size:9px;color:var(--accent)">(tu)</span>' : ''}</div>
          </div>
          <div class="elo-val" style="color:var(--text2)">—</div>
          <div class="pts-val">—</div>
          <div class="trend-val trend-eq">—</div>
        </div>`;
      }).join('')}`;
    document.getElementById('rankingBody').insertAdjacentHTML('beforeend', unrankedHtml);
  }
}

// carica form dots (ultimi 5 risultati) per ogni giocatore in lista
async function loadFormDots(players) {
  await Promise.all(players.map(async p => {
    try {
      const matches = await get('matches',
        `or=(player1_id.eq.${p.id},player2_id.eq.${p.id})&confermata=eq.true&order=data.desc&limit=5&select=winner_id`
      );
      const el = document.getElementById(`form-${p.id}`);
      if (!el) return;
      el.innerHTML = matches.map(m => {
        const won = m.winner_id === p.id;
        return `<div class="form-dot ${won ? 'w' : 'l'}"></div>`;
      }).join('');
    } catch (_) {}
  }));
}

// =============================================
// PROFILO GIOCATORE (pubblico)
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

  // Rank
  const allSorted = [...(state.allPlayers.length ? state.allPlayers : [player])];
  const rank = allSorted.filter(p => p.partite_giocate > 0)
    .sort((a,b) => b.elo - a.elo)
    .findIndex(p => p.id === playerId) + 1;
  const rankLabel = rank === 1 ? '👑 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : rank > 0 ? `#${rank}` : '—';

  // H2H
  const h2h = {};
  for (const m of matches) {
    const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
    if (!h2h[oppId]) h2h[oppId] = { v: 0, s: 0 };
    if (m.winner_id === playerId) h2h[oppId].v++;
    else h2h[oppId].s++;
  }

  // ELO chart
  const eloData = eloHist.map(e => e.elo);
  if (!eloData.length) eloData.push(player.elo);
  const minE = Math.min(...eloData) - 10, maxE = Math.max(...eloData) + 10;
  const range = maxE - minE || 1;
  const W = 308, H = 58;
  const pts = eloData.map((e, i) => {
    const x = eloData.length > 1 ? i / (eloData.length - 1) * W : W / 2;
    const y = H - ((e - minE) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  const polyPts = `0,${H} ${pts} ${W},${H}`;
  const chartSvg = eloData.length > 1 ? `
    <svg viewBox="0 0 ${W} ${H+10}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#c8f000" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#c8f000" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${polyPts}" fill="url(#eg)"/>
      <polyline points="${pts}" fill="none" stroke="#c8f000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${W}" cy="${eloData.length>1 ? H-((eloData[eloData.length-1]-minE)/range)*H : H/2}" r="3" fill="#c8f000"/>
      <text x="3" y="${H+8}" fill="#2d3f52" font-size="9" font-family="monospace">${Math.round(minE+10)}</text>
      <text x="3" y="10" fill="#c8f000" font-size="9" font-family="monospace">${Math.round(maxE-10)}</text>
    </svg>` : '';

  // Ultimi match
  const recentHtml = matches.slice(0, 5).map(m => {
    const isWin = m.winner_id === playerId;
    const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
    const opp   = state.allPlayers.find(p => p.id === oppId);
    const score = m.punteggio1 != null
      ? (m.player1_id === playerId ? `${m.punteggio1}–${m.punteggio2}` : `${m.punteggio2}–${m.punteggio1}`)
      : '';
    return `<div class="pmod-match">
      <div class="pmod-result ${isWin ? 'win' : 'loss'}">${isWin ? 'V' : 'S'}</div>
      <div class="pmod-opp">vs <strong>${opp?.nome || '?'}</strong></div>
      ${score ? `<div class="pmod-score">${score}</div>` : ''}
      <div class="pmod-date">${new Date(m.data).toLocaleDateString('it',{day:'2-digit',month:'2-digit'})}</div>
    </div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text2);padding:8px 0">Nessuna partita ancora</div>';

  // H2H list
  const h2hHtml = Object.entries(h2h).map(([oppId, rec]) => {
    const opp  = state.allPlayers.find(p => p.id === oppId);
    const pct  = Math.round(rec.v / (rec.v + rec.s) * 100);
    return `<div class="pmod-h2h">
      <span style="flex:1;font-size:12px">${opp?.nome || '?'}</span>
      <div class="pmod-h2h-bar"><div class="pmod-h2h-fill" style="width:${pct}%"></div></div>
      <div class="pmod-h2h-rec">
        <span style="color:var(--accent)">${rec.v}</span>
        <span style="color:var(--text2)">/</span>
        <span style="color:var(--accent2)">${rec.s}</span>
      </div>
    </div>`;
  }).join('');

  const [bg] = getAvatarColor(player.nome);
  const initials = player.nome.slice(0,2).toUpperCase();
  const isOwner  = state.currentUser?.id === player.id || state.currentUser?.ruolo === 'admin';
  const avatarUrl = getAvatarUrl(player.id);
  const canChallenge = state.currentUser && state.currentUser.id !== player.id;

  const camHtml = isOwner ? `
    <label class="pmod-cam" title="Cambia foto">
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      <input type="file" accept="image/*" style="display:none" onchange="window._handleAvatarUpload('${player.id}', this)">
    </label>` : '';

  document.getElementById('profileContent').innerHTML = `
    <div class="pmod-bar">
      <span class="pmod-bar-title">Profilo</span>
      <button class="pmod-close" onclick="document.getElementById('profileModal').classList.remove('open')">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="pmod-cover">
      <div class="pmod-rank-bg">${rank > 0 ? '#'+rank : ''}</div>
    </div>

    <div class="pmod-hero">
      <div class="pmod-av-wrap">
        <div class="pmod-av" style="background:${bg}18;color:${bg}">
          <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:none" onload="this.style.display='block';this.nextElementSibling.style.display='none'" onerror="this.style.display='none'">
          <span>${initials}</span>
        </div>
        ${camHtml}
      </div>
      <div style="padding-bottom:4px;min-width:0;flex:1">
        <div class="pmod-name">${player.nome}</div>
        <div class="pmod-meta">
          <span class="pmod-elo">${player.elo} ELO</span>
          <span class="pmod-pos">${rankLabel}</span>
        </div>
      </div>
    </div>

    ${player.bio ? `<div class="pmod-bio">"${player.bio}"</div>` : ''}

    <div class="pmod-stats">
      <div class="pmod-stat">
        <span class="pmod-sv">${player.partite_giocate}</span>
        <span class="pmod-sl">Partite</span>
      </div>
      <div class="pmod-stat">
        <span class="pmod-sv" style="color:var(--accent)">${player.vinte}</span>
        <span class="pmod-sl">Vinte</span>
      </div>
      <div class="pmod-stat">
        <span class="pmod-sv" style="color:var(--accent2)">${player.perse}</span>
        <span class="pmod-sl">Perse</span>
      </div>
      <div class="pmod-stat">
        <span class="pmod-sv" style="color:var(--gold)">${winPct}%</span>
        <span class="pmod-sl">Win%</span>
      </div>
    </div>

    ${chartSvg ? `
    <div class="pmod-section">
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        Andamento ELO <span style="flex:1;height:1px;background:var(--b1);display:block"></span>
      </div>
      <div class="pmod-chart">${chartSvg}</div>
    </div>` : ''}

    <div class="pmod-section">
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        Ultime partite <span style="flex:1;height:1px;background:var(--b1);display:block"></span>
      </div>
      ${recentHtml}
    </div>

    ${h2hHtml ? `
    <div class="pmod-section">
      <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:8px">
        Testa a testa <span style="flex:1;height:1px;background:var(--b1);display:block"></span>
      </div>
      ${h2hHtml}
    </div>` : ''}

    ${canChallenge ? `
    <div class="pmod-section pmod-pb">
      <button class="pmod-sfida-btn" onclick="window._sendChallenge('${player.id}');document.getElementById('profileModal').classList.remove('open')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>
        Sfida ${player.nome}
      </button>
    </div>` : ''}
  `;
}
