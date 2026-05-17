import { get, post, patch } from './api.js';
import { state } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { avatarEl, getAvatarUrl, getAvatarColor, handleAvatarUpload } from './avatar.js';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from './push.js';
import { acceptChallenge, refuseChallenge } from './challenges.js';

// =============================================
// PROFILO PERSONALE
// =============================================

export async function openMyProfile() {
  if (!state.currentUser) return;
  openModal('myProfileModal');
  document.getElementById('myProfileContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';
  await renderMyProfile();
}

async function renderMyProfile() {
  const u = state.currentUser;

  const [player, matches, tPts, incoming, pushStatus] = await Promise.all([
    get('players', `id=eq.${u.id}&select=*`).then(r => r[0]),
    get('matches', `or=(player1_id.eq.${u.id},player2_id.eq.${u.id})&confermata=eq.true&order=data.desc&select=*`),
    get('tournament_points', `player_id=eq.${u.id}&select=punti`),
    get('challenges', `sfidato_id=eq.${u.id}&stato=eq.pending&order=creato_il.desc&select=*`),
    getPushStatus()
  ]);

  state.currentUser = { ...state.currentUser, ...player };
  if (state.allPlayers.length === 0) state.allPlayers = await get('players', 'select=*');

  const bonus  = tPts.reduce((a, t) => a + t.punti, 0);
  const totale = player.elo + bonus;
  const winPct = player.partite_giocate > 0
    ? Math.round(player.vinte / player.partite_giocate * 100) : 0;

  const ranked = state.allPlayers
    .filter(p => p.partite_giocate > 0)
    .sort((a, b) => b.elo - a.elo);
  const rankPos = ranked.findIndex(p => p.id === u.id) + 1;

  const [bg]      = getAvatarColor(player.nome);
  const avatarUrl = getAvatarUrl(player.id);
  const pushOn    = pushStatus === 'subscribed';
  const winColor  = winPct >= 60 ? 'var(--accent)' : winPct >= 40 ? 'var(--text)' : 'var(--accent2)';
  const coverBg   = rankPos === 1
    ? 'background:linear-gradient(135deg,#1a1200,#120f00,#0d0f1a)'
    : 'background:linear-gradient(135deg,#0d1a08,#0f1a1f,#0d0f1a)';

  // sfide in arrivo
  const challengesHtml = incoming.length > 0 ? `
    <div class="profile-sec">
      <div class="profile-sec-label">Sfide in arrivo (${incoming.length})</div>
      ${incoming.map(c => {
        const sfidante = state.allPlayers.find(p => p.id === c.sfidante_id);
        return `<div class="ch-card">
          <div class="ch-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 4 12 6 14"/><line x1="5" y1="11" x2="9" y2="7"/></svg>
          </div>
          <div class="ch-text">
            <div class="ch-name">${sfidante?.nome || '?'} ti sfida!</div>
            ${c.messaggio ? `<div class="ch-msg">"${c.messaggio}"</div>` : ''}
          </div>
          <div class="ch-btns">
            <button class="cbtn cbtn-y" onclick="window._acceptChallenge('${c.id}');document.getElementById('myProfileModal').classList.remove('open')">✓</button>
            <button class="cbtn cbtn-n" onclick="window._refuseChallenge('${c.id}');document.getElementById('myProfileModal').classList.remove('open')">✗</button>
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  // ultime partite
  const recentMatchesHtml = matches.slice(0, 5).map(m => {
    const isWin  = m.winner_id === u.id;
    const oppId  = m.player1_id === u.id ? m.player2_id : m.player1_id;
    const opp    = state.allPlayers.find(p => p.id === oppId);
    const myScore  = m.player1_id === u.id ? m.punteggio1 : m.punteggio2;
    const oppScore = m.player1_id === u.id ? m.punteggio2 : m.punteggio1;
    const score = myScore != null ? `${myScore}–${oppScore}` : '';
    return `<div class="profile-match-row">
      <div class="profile-match-result ${isWin ? 'win' : 'loss'}">${isWin ? 'V' : 'S'}</div>
      <div style="font-size:12px;flex:1">vs <strong>${opp?.nome || '?'}</strong></div>
      ${score ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text2)">${score}</div>` : ''}
      <div style="font-size:10px;color:var(--text3);margin-left:8px">${new Date(m.data).toLocaleDateString('it')}</div>
    </div>`;
  }).join('') || '<div style="font-size:12px;color:var(--text2);padding:8px 0">Nessuna partita ancora</div>';

  document.getElementById('myProfileContent').innerHTML = `
    <!-- COVER -->
    <div class="profile-cover" style="${coverBg}">
      ${rankPos > 0 ? `<div class="profile-cover-rank">#${rankPos}</div>` : ''}
    </div>

    <!-- HERO ROW -->
    <div class="profile-hero-row">
      <div class="profile-av-wrap">
        <div class="profile-av" style="background:${bg}18;color:${bg}${rankPos === 1 ? ';border-color:rgba(245,166,35,0.5)' : ''}">
          <img src="${avatarUrl}"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
            onload="this.nextElementSibling.style.display='none'">
          <span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">${player.nome[0].toUpperCase()}</span>
        </div>
        <label class="profile-av-cam" title="Cambia foto">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <input type="file" accept="image/*" style="display:none" onchange="window._handleAvatarUpload('${player.id}', this)">
        </label>
      </div>
      <div class="profile-hero-text">
        <div class="profile-name">${player.nome}</div>
        <div class="profile-sub">
          <span class="profile-elo-val">${player.elo} ELO${bonus > 0 ? ` · +${bonus} bonus` : ''}</span>
          ${rankPos > 0 ? `<span class="profile-rank-badge"${rankPos === 1 ? ' style="background:rgba(245,166,35,0.1);color:var(--gold);border-color:rgba(245,166,35,0.25)"' : ''}>${rankPos === 1 ? '👑 ' : ''}#${rankPos}</span>` : ''}
        </div>
      </div>
    </div>

    ${player.bio ? `<div class="profile-bio">"${player.bio}"</div>` : ''}

    <!-- STAT STRIP -->
    <div class="stat-strip">
      <div class="stat-cell">
        <span class="stat-val">${player.partite_giocate}</span>
        <span class="stat-lbl">Partite</span>
      </div>
      <div class="stat-cell">
        <span class="stat-val" style="color:var(--accent)">${player.vinte}</span>
        <span class="stat-lbl">Vinte</span>
      </div>
      <div class="stat-cell">
        <span class="stat-val" style="color:var(--accent2)">${player.perse}</span>
        <span class="stat-lbl">Perse</span>
      </div>
      <div class="stat-cell">
        <span class="stat-val" style="color:${winColor}">${winPct}%</span>
        <span class="stat-lbl">Win%</span>
      </div>
    </div>

    ${challengesHtml}

    <!-- ULTIME PARTITE -->
    <div class="profile-sec">
      <div class="profile-sec-label">Ultime partite</div>
      ${recentMatchesHtml}
    </div>

    <!-- NOTIFICHE -->
    <div class="profile-sec">
      <div class="profile-sec-label">Notifiche push</div>
      <div class="push-toggle" onclick="window._togglePushFromProfile()" style="cursor:pointer">
        <div>
          <div class="push-toggle-label">${pushOn ? 'Notifiche attive' : 'Notifiche disattive'}</div>
          <div class="push-toggle-sub">${pushOn ? 'Ricevi avvisi per sfide e partite' : 'Attiva per ricevere avvisi push'}</div>
        </div>
        <button class="toggle-switch ${pushOn ? 'on' : ''}" id="profilePushSwitch"></button>
      </div>
    </div>

    <!-- BIO -->
    <div class="profile-sec">
      <div class="profile-sec-label">La mia bio</div>
      <textarea class="bio-input" id="myBioInput" rows="3"
        placeholder="Il tuo stile di gioco, il tuo colpo preferito..."
        maxlength="200">${player.bio || ''}</textarea>
      <button class="btn btn-secondary" style="margin-top:6px;width:auto;padding:7px 14px;font-size:12px" onclick="window._saveBio()">Salva</button>
    </div>

    <!-- LOGOUT -->
    <div class="profile-sec" style="padding-bottom:16px">
      <button class="btn btn-danger" id="myProfileLogoutBtn" style="display:flex;align-items:center;justify-content:center;gap:8px">
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

// =============================================
// SALVA BIO
// =============================================
export async function saveBio() {
  const bio = document.getElementById('myBioInput')?.value?.trim() || '';
  await patch('players', `id=eq.${state.currentUser.id}`, { bio });
  state.currentUser.bio = bio;
  toast('Bio salvata!');
}

// =============================================
// TOGGLE PUSH
// =============================================
export async function togglePushFromProfile() {
  const status = await getPushStatus();
  if (status === 'subscribed') await unsubscribeFromPush();
  else await subscribeToPush();
  await renderMyProfile();
  await updatePushIcon();
}

export async function togglePush() {
  const status = await getPushStatus();
  if (status === 'subscribed') { await unsubscribeFromPush(); toast('Notifiche disattivate'); }
  else await subscribeToPush();
  await updatePushIcon();
}

// =============================================
// PUSH ICON (header — non più usata visivamente, mantenuta per compatibilità)
// =============================================
export async function updatePushIcon() {
  // con il nuovo header non c'è più il pushIcon — no-op sicuro
  const icon = document.getElementById('pushIcon');
  if (!icon || !state.currentUser) return;
  const status = await getPushStatus();
  const bellOn  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const bellOff = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  icon.innerHTML = status === 'subscribed' ? bellOn : bellOff;
}

// =============================================
// BADGE SFIDE
// =============================================
export async function updateChallengeBadge() {
  if (!state.currentUser) return;
  try {
    const pending = await get('challenges', `sfidato_id=eq.${state.currentUser.id}&stato=eq.pending`);
    const badge   = document.getElementById('challengeBadge');
    const navBtn  = document.getElementById('navSfide');
    if (!badge) return;
    const count = pending.length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
      if (navBtn) navBtn.style.color = 'var(--accent2)';
    } else {
      badge.style.display = 'none';
      if (navBtn) navBtn.style.color = '';
    }
  } catch(_) {}
}
