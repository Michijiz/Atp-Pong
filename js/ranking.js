import { get } from './api.js';
import { state } from './state.js';
import { openModal, getRankLabel } from './ui.js';
import { getAvatarUrl, getAvatarColor } from './avatar.js';

// =============================================
// RANKING
// =============================================

export async function loadRanking() {
  document.getElementById('rankingBody').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';
  const podium = document.getElementById('rankingPodium');
  if (podium) podium.innerHTML = '';

  const [players, tPoints] = await Promise.all([
    get('players', 'order=elo.desc&select=*'),
    get('tournament_points', 'select=player_id,punti').catch(() => [])
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
  const myRank       = state.currentUser ? ranked.findIndex(p => p.id === state.currentUser.id) + 1 : 0;
  const isUnrankedMe = state.currentUser ? unranked.some(p => p.id === state.currentUser.id) : false;

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

  // --- Pills + streak ---
  let streakHtml = '';
  if (state.currentUser) {
    const myMatches = await get('matches',
      `or=(player1_id.eq.${state.currentUser.id},player2_id.eq.${state.currentUser.id})&confermata=eq.true&order=data.desc&limit=20&select=winner_id`
    ).catch(() => []);
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
    `<div class="pill">Partite <strong>${Math.round(players.reduce((a, p) => a + p.partite_giocate, 0) / 2)}</strong></div>
     <div class="pill">Top ELO <strong>${Math.max(...players.map(p => p.elo), 1000)}</strong></div>
     ${streakHtml}`;

  if (ranked.length === 0) {
    document.getElementById('rankingPodium').innerHTML = '';
    document.getElementById('rankingBody').innerHTML =
      '<div class="empty"><div class="icon">🏓</div><p>Nessun giocatore ancora. Registrati!</p></div>';
    return;
  }

  // --- PODIO (top 3) ---
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
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
      const rank = i + 4;
      const isMe = state.currentUser?.id === p.id;
      const [bg] = getAvatarColor(p.nome);
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
      </div>`;
    }).join('');

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
          <div class="elo-val" style="color:var(--text3)">${p.elo}</div>
          <div class="pts-val" style="color:var(--text3)">—</div>
        </div>`;
      }).join('')}`;
    document.getElementById('rankingBody').innerHTML += unrankedHtml;
  }
}

async function loadFormDots(players) {
  const ids = players.map(p => p.id);
  if (!ids.length) return;

  const matches = await get('matches',
    `or=(${ids.map(id => `player1_id.eq.${id},player2_id.eq.${id}`).join(',')})&confermata=eq.true&order=data.desc&limit=200&select=player1_id,player2_id,winner_id`
  ).catch(() => []);

  players.forEach(p => {
    const dots = matches
      .filter(m => m.player1_id === p.id || m.player2_id === p.id)
      .slice(0, 5)
      .map(m => `<span class="dot ${m.winner_id === p.id ? 'win' : 'loss'}"></span>`)
      .join('');
    const el = document.getElementById(`form-${p.id}`);
    if (el) el.innerHTML = dots;
  });
}

// =============================================
// PROFILO GIOCATORE
// Ogni fetch ha .catch(() => fallback) — nessun crash silenzioso
// =============================================
export async function showProfile(playerId) {
  openModal('profileModal');
  document.getElementById('profileContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  try {
    // Fetch paralleli: ogni query degrada gracefully se la tabella non è accessibile
    const [player, matches, eloHist, myTournamentPts, tornei] = await Promise.all([
      get('players', `id=eq.${playerId}&select=*`).then(r => r[0]).catch(() => null),
      get('matches', `or=(player1_id.eq.${playerId},player2_id.eq.${playerId})&confermata=eq.true&order=data.desc&select=*`).catch(() => []),
      get('elo_history', `player_id=eq.${playerId}&order=creato_il.asc&select=elo`).catch(() => []),
      get('tournament_points', `player_id=eq.${playerId}&select=punti,torneo_id`).catch(() => []),
      get('tournaments', 'stato=eq.chiuso&select=id,nome,tipo').catch(() => [])
    ]);

    if (!player) {
      document.getElementById('profileContent').innerHTML =
        '<p style="padding:20px;color:var(--text2)">Giocatore non trovato</p>';
      return;
    }
    if (!state.allPlayers.length) state.allPlayers = await get('players', 'select=*').catch(() => []);

    // Tornei vinti
    const torneiVinti = [];
    const torneiIds = myTournamentPts.map(tp => tp.torneo_id).filter(Boolean);
    if (torneiIds.length > 0) {
      const allPts = await get('tournament_points',
        `torneo_id=in.(${torneiIds.join(',')})&select=torneo_id,player_id,punti`
      ).catch(() => []);
      for (const t of tornei) {
        const ptsInTorneo = allPts.filter(tp => tp.torneo_id === t.id);
        if (!ptsInTorneo.length) continue;
        const maxPts = Math.max(...ptsInTorneo.map(tp => tp.punti));
        const myPts  = ptsInTorneo.find(tp => tp.player_id === playerId);
        if (myPts && myPts.punti === maxPts) torneiVinti.push(t);
      }
    }

    const winPct = player.partite_giocate > 0
      ? Math.round(player.vinte / player.partite_giocate * 100) : 0;

    const rank = state.allPlayers
      .filter(p => p.partite_giocate > 0)
      .sort((a, b) => b.elo - a.elo)
      .findIndex(p => p.id === playerId) + 1;
    const rankLabel = getRankLabel(rank);

    // H2H
    const h2h = {};
    for (const m of matches) {
      const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
      if (!h2h[oppId]) h2h[oppId] = { v: 0, s: 0 };
      m.winner_id === playerId ? h2h[oppId].v++ : h2h[oppId].s++;
    }
    const h2hEntries = Object.entries(h2h).sort((a, b) => (b[1].v + b[1].s) - (a[1].v + a[1].s));

    // ELO chart
    const eloData = eloHist.map(e => e.elo);
    if (!eloData.length) eloData.push(player.elo);
    const minE  = Math.min(...eloData) - 10;
    const maxE  = Math.max(...eloData) + 10;
    const range = maxE - minE || 1;
    const W = 280, H = 48;
    const svgPts = eloData.map((e, i) => {
      const x = eloData.length > 1 ? i / (eloData.length - 1) * W : W / 2;
      const y = H - ((e - minE) / range) * H;
      return `${x},${y}`;
    }).join(' ');
    const lastY    = H - ((eloData[eloData.length - 1] - minE) / range) * H;
    const eloColor = eloData.length > 1 && eloData[eloData.length-1] >= eloData[0]
      ? 'var(--accent)' : 'var(--accent2)';
    const gradId   = `eg_${playerId.replace(/-/g,'').slice(0,8)}`;
    const chartSvg = eloData.length > 1 ? `
      <svg viewBox="0 0 ${W} ${H+2}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${eloColor}" stop-opacity="0.18"/>
            <stop offset="100%" stop-color="${eloColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <polygon points="0,${H} ${svgPts} ${W},${H}" fill="url(#${gradId})"/>
        <polyline points="${svgPts}" fill="none" stroke="${eloColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${W}" cy="${lastY}" r="3" fill="${eloColor}"/>
      </svg>` : '';

    const [bg]     = getAvatarColor(player.nome);
    const initials  = player.nome.slice(0,2).toUpperCase();
    const isOwner   = state.currentUser?.id === player.id || state.currentUser?.ruolo === 'admin';
    const avatarUrl = getAvatarUrl(player.id);
    const canChallenge = state.currentUser && state.currentUser.id !== player.id;
    const closeJs  = `document.getElementById('profileModal').classList.remove('open')`;

    document.getElementById('profileContent').innerHTML = `

      <!-- TOPBAR sticky -->
      <div class="pmod-bar">
        <span class="pmod-bar-title">Profilo</span>
        <button class="pmod-close" onclick="${closeJs}">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- HERO -->
      <div style="display:flex;align-items:center;gap:16px;padding:16px;border-bottom:1px solid var(--b1)">
        <div style="position:relative;flex-shrink:0">
          <div style="width:80px;height:80px;border-radius:50%;border:3px solid ${bg}55;overflow:hidden;background:${bg}18;color:${bg};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;font-family:var(--font-display);letter-spacing:1px">
            <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:none"
              onload="this.style.display='block';this.nextElementSibling.style.display='none'"
              onerror="this.style.display='none'">
            <span>${initials}</span>
          </div>
          ${isOwner ? `<label style="position:absolute;bottom:0;right:0;width:22px;height:22px;border-radius:50%;background:var(--accent);border:2px solid var(--s1);display:flex;align-items:center;justify-content:center;cursor:pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <input type="file" accept="image/*" style="display:none" onchange="window._handleAvatarUpload('${player.id}', this)">
          </label>` : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--font-display);font-size:28px;letter-spacing:2px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${player.nome}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap">
            <span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--accent)">${player.elo} ELO</span>
            ${rank > 0 ? `<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:100px;background:rgba(255,107,43,0.1);color:var(--accent);border:1px solid rgba(255,107,43,0.25)">${rankLabel}</span>` : ''}
            ${torneiVinti.map(t => `<span title="Vincitore: ${t.nome}" style="font-size:17px;line-height:1">🏆</span>`).join('')}
          </div>
          ${matches.length > 0 ? `<div class="pmod-form-dots" style="margin-top:8px">${
            matches.slice(0,5).map(m =>
              `<span class="pmod-dot ${m.winner_id === playerId ? 'win' : 'loss'}"></span>`
            ).join('')
          }</div>` : ''}
          ${player.bio ? `<div style="font-size:12px;color:var(--text2);font-style:italic;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">"${player.bio}"</div>` : ''}
        </div>
      </div>

      <!-- STATS 4 colonne -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--b1);border-bottom:1px solid var(--b1)">
        ${[
          ['Partite', player.partite_giocate, 'var(--text)'],
          ['Vinte',   player.vinte,           'var(--accent)'],
          ['Perse',   player.perse,           'var(--accent2)'],
          ['Win%',    winPct + '%',           'var(--gold)'],
        ].map(([label, val, color]) => `
          <div style="background:var(--s1);padding:13px 4px;text-align:center">
            <div style="font-family:var(--font-mono);font-size:21px;font-weight:700;color:${color};line-height:1">${val}</div>
            <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-top:5px">${label}</div>
          </div>`).join('')}
      </div>

      <!-- ELO CHART -->
      ${chartSvg ? `
      <div style="padding:12px 14px;border-bottom:1px solid var(--b1)">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Andamento ELO</div>
        <div style="background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:8px 10px">${chartSvg}</div>
      </div>` : ''}

      <!-- PALMARES -->
      ${torneiVinti.length > 0 ? `
      <div style="padding:14px 16px;border-bottom:1px solid var(--b1)">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Palmarès</div>
        <div class="pmod-palmares">
          ${torneiVinti.map(t => `
            <div class="pmod-trophy-row">
              <div class="pmod-trophy-icon">🏆</div>
              <div class="pmod-trophy-info">
                <div class="pmod-trophy-name">${t.nome}</div>
                <div class="pmod-trophy-tipo">${t.tipo}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- ULTIME PARTITE -->
      <div style="padding:12px 14px;border-bottom:1px solid var(--b1)">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Ultime partite</div>
        ${matches.slice(0, 5).map((m, idx) => {
          const isWin = m.winner_id === playerId;
          const oppId = m.player1_id === playerId ? m.player2_id : m.player1_id;
          const opp   = state.allPlayers.find(p => p.id === oppId);
          const score = m.punteggio1 != null
            ? (m.player1_id === playerId ? `${m.punteggio1}–${m.punteggio2}` : `${m.punteggio2}–${m.punteggio1}`)
            : '';
          return `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;${idx < 4 ? 'border-bottom:1px solid rgba(30,40,54,0.5)' : ''}">
            <div style="width:24px;height:24px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;background:${isWin ? 'rgba(200,240,0,0.1)' : 'rgba(255,77,77,0.1)'};color:${isWin ? 'var(--accent)' : 'var(--accent2)'}">${isWin ? 'V' : 'S'}</div>
            <div style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">vs <strong>${opp?.nome || '?'}</strong></div>
            ${score ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);flex-shrink:0">${score}</div>` : ''}
            <div style="font-size:10px;color:var(--text3);flex-shrink:0">${new Date(m.data).toLocaleDateString('it',{day:'2-digit',month:'2-digit'})}</div>
          </div>`;
        }).join('') || '<div style="font-size:12px;color:var(--text2);padding:4px 0">Nessuna partita ancora</div>'}
      </div>

      <!-- H2H top 5 -->
      ${h2hEntries.length > 0 ? `
      <div style="padding:12px 14px;border-bottom:1px solid var(--b1)">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Testa a testa</div>
        ${h2hEntries.slice(0, 5).map(([oppId, rec], idx) => {
          const opp = state.allPlayers.find(p => p.id === oppId);
          const tot = rec.v + rec.s;
          const pct = Math.round(rec.v / tot * 100);
          return `<div style="display:flex;align-items:center;gap:9px;padding:6px 0;${idx < Math.min(h2hEntries.length, 5)-1 ? 'border-bottom:1px solid rgba(30,40,54,0.5)' : ''}">
            <div style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${opp?.nome || '?'}</div>
            <div style="width:56px;height:4px;border-radius:100px;background:rgba(255,77,77,0.2);overflow:hidden;flex-shrink:0">
              <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:100px"></div>
            </div>
            <div style="font-family:var(--font-mono);font-size:11px;flex-shrink:0;min-width:36px;text-align:right">
              <span style="color:var(--accent)">${rec.v}</span><span style="color:var(--text3)">/${tot}</span>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- SFIDA CTA -->
      ${canChallenge ? `
      <div style="padding:14px 14px 20px">
        <button
          style="width:100%;padding:12px;border-radius:11px;background:var(--accent);color:var(--bg);border:none;font-size:13px;font-weight:800;letter-spacing:0.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"
          onclick="window._sendChallenge('${player.id}');${closeJs}">
          ⚔️ Sfida ${player.nome}
        </button>
      </div>` : '<div style="height:16px"></div>'}
    `;

  } catch(err) {
    console.error('[showProfile] errore:', err);
    document.getElementById('profileContent').innerHTML =
      `<div style="padding:24px;text-align:center;color:var(--text2)">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-size:13px">Errore nel caricamento del profilo</div>
        <button onclick="window._showProfile('${playerId}')" style="margin-top:12px;padding:8px 16px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);color:var(--text);font-size:12px;cursor:pointer">Riprova</button>
      </div>`;
  }
}
