import { get, patch } from './api.js';
import { state } from './state.js';
import { toast, openModal, getRankLabel } from './ui.js';
import { getAvatarUrl, getAvatarColor, handleAvatarUpload } from './avatar.js';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from './push.js';
import { acceptChallenge, refuseChallenge } from './challenges.js';

// ── APRI PROFILO PERSONALE ────────────────────────
export async function openMyProfile() {
  if (!state.currentUser) return;
  openModal('myProfileModal');
  document.getElementById('myProfileContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';
  await renderMyProfile();
}

async function renderMyProfile() {
  const u = state.currentUser;

  const [player, matches, tPts, incoming, pushStatus, tornei] = await Promise.all([
    get('players', `id=eq.${u.id}&select=*`).then(r => r[0]),
    get('matches', `or=(player1_id.eq.${u.id},player2_id.eq.${u.id})&confermata=eq.true&order=data.desc&select=*`),
    get('tournament_points', `player_id=eq.${u.id}&select=punti,torneo_id`),
    get('challenges', `sfidato_id=eq.${u.id}&stato=eq.pending&order=creato_il.desc&select=*`),
    getPushStatus(),
    get('tournaments', 'stato=eq.chiuso&select=id,nome,tipo').catch(() => [])
  ]);

  state.currentUser = { ...state.currentUser, ...player };
  if (!state.allPlayers.length) state.allPlayers = await get('players', 'select=*');

  const bonus  = tPts.reduce((a, t) => a + t.punti, 0);

  // Tornei vinti
  const torneiVinti = [];
  const torneiIds = tPts.map(tp => tp.torneo_id).filter(Boolean);
  if (torneiIds.length > 0) {
    const allPts = await get('tournament_points',
      `torneo_id=in.(${torneiIds.join(',')})&select=torneo_id,player_id,punti`
    ).catch(() => []);
    for (const t of tornei) {
      const ptsInTorneo = allPts.filter(tp => tp.torneo_id === t.id);
      if (!ptsInTorneo.length) continue;
      const maxPts = Math.max(...ptsInTorneo.map(tp => tp.punti));
      const myPts  = ptsInTorneo.find(tp => tp.player_id === u.id);
      if (myPts && myPts.punti === maxPts) torneiVinti.push(t);
    }
  }
  const winPct = player.partite_giocate > 0
    ? Math.round(player.vinte / player.partite_giocate * 100) : 0;

  const ranked = state.allPlayers
    .filter(p => p.partite_giocate > 0)
    .sort((a,b) => b.elo - a.elo);
  const rank       = ranked.findIndex(p => p.id === u.id) + 1;
  const rankLabel  = getRankLabel(rank);
  const isLeader   = rank === 1;

  const [bg]      = getAvatarColor(player.nome);
  const initials  = player.nome.slice(0,2).toUpperCase();
  const avatarUrl = getAvatarUrl(player.id);
  const pushOn    = pushStatus === 'subscribed';

  const sectionHeader = label => `
    <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:8px">
      ${label} <span style="flex:1;height:1px;background:var(--b1);display:block"></span>
    </div>`;

  const challengesHtml = incoming.map(c => {
    const sfidante = state.allPlayers.find(p => p.id === c.sfidante_id);
    return `<div class="pmod-ch-card">
      <div class="pmod-ch-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 4 12 6 14"/><line x1="5" y1="11" x2="9" y2="7"/></svg>
      </div>
      <div class="pmod-ch-text">
        <div class="pmod-ch-name">${sfidante?.nome || '?'} ti sfida!</div>
        ${c.messaggio ? `<div class="pmod-ch-msg">"${c.messaggio}"</div>` : ''}
      </div>
      <div class="pmod-ch-btns">
        <button class="pmod-cbtn pmod-cbtn-y"
          onclick="window._acceptChallenge('${c.id}');document.getElementById('myProfileModal').classList.remove('open')">✓</button>
        <button class="pmod-cbtn pmod-cbtn-n"
          onclick="window._refuseChallenge('${c.id}');document.getElementById('myProfileModal').classList.remove('open')">✗</button>
      </div>
    </div>`;
  }).join('');

  // Pallini ultime 5 partite
  const formDotsHtml = matches.slice(0, 5).length > 0
    ? `<div class="pmod-form-dots">${
        matches.slice(0, 5).map(m =>
          `<span class="pmod-dot ${m.winner_id === u.id ? 'win' : 'loss'}" title="${m.winner_id === u.id ? 'Vittoria' : 'Sconfitta'}"></span>`
        ).join('')
      }</div>`
    : '';

  const recentHtml = matches.slice(0, 5).map(m => {
    const isWin = m.winner_id === u.id;
    const oppId = m.player1_id === u.id ? m.player2_id : m.player1_id;
    const opp   = state.allPlayers.find(p => p.id === oppId);
    const score = m.punteggio1 != null
      ? (m.player1_id === u.id ? `${m.punteggio1}–${m.punteggio2}` : `${m.punteggio2}–${m.punteggio1}`)
      : '';
    return `<div class="pmod-match">
      <div class="pmod-result ${isWin ? 'win' : 'loss'}">${isWin ? 'V' : 'S'}</div>
      <div class="pmod-opp">vs <strong>${opp?.nome || '?'}</strong></div>
      ${score ? `<div class="pmod-score">${score}</div>` : ''}
      <div class="pmod-date">${new Date(m.data).toLocaleDateString('it',{day:'2-digit',month:'2-digit'})}</div>
    </div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text2);padding:8px 0">Nessuna partita ancora</div>';

  const coverStyle  = isLeader
    ? 'background:linear-gradient(135deg,#1a1200 0%,#120f00 60%,#0d0f1a 100%)'
    : 'background:linear-gradient(135deg,#0d1a08 0%,#0f1a1f 60%,#0d0f1a 100%)';
  const posStyle    = isLeader ? 'background:rgba(245,166,35,0.1);color:var(--gold);border-color:rgba(245,166,35,0.25)' : '';

  document.getElementById('myProfileContent').innerHTML = `
    <div class="pmod-bar">
      <span class="pmod-bar-title">Il mio profilo</span>
      <button class="pmod-close" onclick="document.getElementById('myProfileModal').classList.remove('open')">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="pmod-cover" style="${coverStyle}">
      <div class="pmod-rank-bg" style="color:rgba(200,240,0,0.06)">${rank > 0 ? '#'+rank : ''}</div>
    </div>
    <div class="pmod-hero">
      <div class="pmod-av-wrap">
        <div class="pmod-av" style="background:${bg}18;color:${bg};${isLeader ? 'border-color:rgba(245,166,35,0.6);box-shadow:0 0 0 3px rgba(245,166,35,0.15)' : ''}">
          <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:none"
            onload="this.style.display='block';this.nextElementSibling.style.display='none'"
            onerror="this.style.display='none'">
          <span>${initials}</span>
        </div>
        <label class="pmod-cam" title="Cambia foto">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <input type="file" accept="image/*" style="display:none" onchange="window._handleAvatarUpload('${player.id}', this)">
        </label>
      </div>
      <div style="padding-bottom:2px;min-width:0;flex:1">
        <div class="pmod-name">${player.nome}</div>
        <div class="pmod-meta">
          <span class="pmod-elo">${player.elo} ELO${bonus > 0 ? ` · +${bonus} bonus` : ''}</span>
          <span class="pmod-pos" style="${posStyle}">${rankLabel}</span>
        </div>
        ${formDotsHtml}
      </div>
    </div>
    ${player.bio ? `<div class="pmod-bio">"${player.bio}"</div>` : ''}
    <div class="pmod-stats">
      <div class="pmod-stat"><span class="pmod-sv">${player.partite_giocate}</span><span class="pmod-sl">Partite</span></div>
      <div class="pmod-stat"><span class="pmod-sv" style="color:var(--accent)">${player.vinte}</span><span class="pmod-sl">Vinte</span></div>
      <div class="pmod-stat"><span class="pmod-sv" style="color:var(--accent2)">${player.perse}</span><span class="pmod-sl">Perse</span></div>
      <div class="pmod-stat"><span class="pmod-sv" style="color:var(--gold)">${winPct}%</span><span class="pmod-sl">Win%</span></div>
    </div>
    ${incoming.length ? `<div class="pmod-section">${sectionHeader(`Sfide in arrivo (${incoming.length})`)}${challengesHtml}</div>` : ''}
    ${torneiVinti.length > 0 ? `
    <div class="pmod-section">
      ${sectionHeader('Palmarès')}
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
    <div class="pmod-section">${sectionHeader('Ultime partite')}${recentHtml}</div>
    <div class="pmod-section">
      ${sectionHeader('Notifiche push')}
      <div class="pmod-push" onclick="window._togglePushFromProfile()">
        <div>
          <div class="pmod-push-lbl">${pushOn ? 'Notifiche attive' : 'Notifiche disattive'}</div>
          <div class="pmod-push-sub">${pushOn ? 'Ricevi avvisi per sfide e partite' : 'Attiva per ricevere avvisi push'}</div>
        </div>
        <button class="toggle-switch ${pushOn ? 'on' : ''}" id="profilePushSwitch"></button>
      </div>
    </div>
    <div class="pmod-section">
      ${sectionHeader('La mia bio')}
      <textarea class="pmod-bio-ta" id="myBioInput" rows="3"
        placeholder="Il tuo stile di gioco, il tuo colpo preferito..."
        maxlength="200">${player.bio || ''}</textarea>
      <button class="btn btn-secondary" style="margin-top:6px;padding:7px 14px;width:auto;font-size:12px"
        onclick="window._saveBio()">Salva bio</button>
    </div>
    <div class="pmod-section pmod-pb">
      <button class="pmod-logout-btn" id="myProfileLogoutBtn">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Esci dall'account
      </button>
    </div>
  `;

  document.getElementById('myProfileLogoutBtn')?.addEventListener('click', () => {
    document.getElementById('myProfileModal').classList.remove('open');
    document.getElementById('logoutBtn').click();
  });
}

// ── SALVA BIO ────────────────────────────────────
export async function saveBio() {
  const bio = document.getElementById('myBioInput')?.value?.trim() || '';
  await patch('players', `id=eq.${state.currentUser.id}`, { bio });
  state.currentUser.bio = bio;
  toast('Bio salvata!');
}

// ── TOGGLE PUSH ───────────────────────────────────
export async function togglePushFromProfile() {
  const status = await getPushStatus();
  if (status === 'subscribed') await unsubscribeFromPush();
  else await subscribeToPush();
  await renderMyProfile();
  await updatePushIcon();
}

export async function updatePushIcon() {
  const icon = document.getElementById('pushIcon');
  if (!icon || !state.currentUser) return;
  const status  = await getPushStatus();
  const bellOn  = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const bellOff = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  icon.innerHTML = status === 'subscribed' ? bellOn : bellOff;
}

export async function togglePush() {
  const status = await getPushStatus();
  if (status === 'subscribed') {
    await unsubscribeFromPush();
    toast('Notifiche disattivate');
  } else {
    await subscribeToPush();
  }
  await updatePushIcon();
}

// ── BADGE SFIDE ───────────────────────────────────
export async function updateChallengeBadge() {
  if (!state.currentUser) return;
  try {
    const pending  = await get('challenges', `sfidato_id=eq.${state.currentUser.id}&stato=eq.pending`);
    const badge    = document.getElementById('challengeBadge');
    const navSfide = document.getElementById('navSfide');
    if (!badge) return;
    const count = pending.length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
      if (navSfide) {
        let nb = navSfide.querySelector('.nav-badge');
        if (!nb) { nb = document.createElement('span'); nb.className = 'nav-badge'; navSfide.appendChild(nb); }
        nb.textContent = count;
      }
    } else {
      badge.style.display = 'none';
      navSfide?.querySelector('.nav-badge')?.remove();
    }
  } catch(e) {}
}
