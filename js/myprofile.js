import { get, post, patch } from './api.js';
import { state } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { avatarEl, getAvatarUrl, getAvatarColor, handleAvatarUpload } from './avatar.js';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from './push.js';
import { acceptChallenge, refuseChallenge } from './challenges.js';

// =============================================
// PROFILO PERSONALE — modal completo
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

  // Aggiorna state con dati freschi
  state.currentUser = { ...state.currentUser, ...player };

  if (state.allPlayers.length === 0) {
    state.allPlayers = await get('players', 'select=*');
  }

  const bonus  = tPts.reduce((a, t) => a + t.punti, 0);
  const winPct = player.partite_giocate > 0
    ? Math.round(player.vinte / player.partite_giocate * 100) : 0;

  const [bg] = getAvatarColor(player.nome);
  const avatarUrl = getAvatarUrl(player.id);

  // ---- AVATAR ----
  const avatarSection = `
    <div style="position:relative;width:88px;height:88px;flex-shrink:0">
      <div style="width:88px;height:88px;overflow:hidden;border-radius:50%;border:2px solid ${bg}55">
        <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
          onload="this.nextElementSibling.style.display='none'">
        <div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${bg}22;color:${bg};font-size:32px;font-weight:700;border-radius:50%">
          ${player.nome[0].toUpperCase()}
        </div>
      </div>
      <label style="position:absolute;bottom:0;right:0;width:28px;height:28px;background:var(--surface3);border:1px solid var(--border2);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer" title="Cambia foto">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <input type="file" accept="image/*" style="display:none" onchange="window._handleAvatarUpload('${player.id}', this)">
      </label>
    </div>`;

  // ---- SFIDE IN ARRIVO ----
  let challengesHtml = '';
  if (incoming.length > 0) {
    const items = incoming.map(c => {
      const sfidante = state.allPlayers.find(p => p.id === c.sfidante_id);
      return `<div class="pending-item">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${sfidante?.nome || '?'} ti sfida!</div>
          ${c.messaggio ? `<div style="font-size:12px;color:var(--text2);margin-top:2px">"${c.messaggio}"</div>` : ''}
        </div>
        <div class="pending-btns">
          <button class="btn-sm btn-sm-confirm"
            onclick="window._acceptChallenge('${c.id}');document.getElementById('myProfileModal').classList.remove('open')">✓</button>
          <button class="btn-sm btn-sm-deny"
            onclick="window._refuseChallenge('${c.id}');document.getElementById('myProfileModal').classList.remove('open')">✗</button>
        </div>
      </div>`;
    }).join('');

    challengesHtml = `
      <div class="profile-section">
        <div class="profile-section-label">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 4 12 6 14"/><line x1="5" y1="11" x2="9" y2="7"/></svg>
          Sfide in arrivo (${incoming.length})
        </div>
        <div style="background:rgba(0,180,216,0.05);border:1px solid rgba(0,180,216,0.15);border-radius:12px;padding:12px">
          ${items}
        </div>
      </div>`;
  }

  // ---- PUSH TOGGLE ----
  const pushOn    = pushStatus === 'subscribed';
  const pushLabel = pushOn ? 'Notifiche attive' : 'Notifiche disattive';
  const pushSub   = pushOn ? 'Ricevi avvisi per sfide e partite' : 'Attiva per ricevere avvisi push';

  const pushHtml = `
    <div class="profile-section">
      <div class="profile-section-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        Notifiche
      </div>
      <div class="push-toggle" onclick="window._togglePushFromProfile()" style="cursor:pointer">
        <div>
          <div class="push-toggle-label">${pushLabel}</div>
          <div class="push-toggle-sub">${pushSub}</div>
        </div>
        <button class="toggle-switch ${pushOn ? 'on' : ''}" id="profilePushSwitch"></button>
      </div>
    </div>`;

  // ---- BIO ----
  const bioHtml = `
    <div class="profile-section">
      <div class="profile-section-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
        Bio
      </div>
      <textarea class="form-input" id="myBioInput" rows="3"
        style="resize:none;font-size:13px;line-height:1.5"
        placeholder="Il tuo stile di gioco, il tuo colpo preferito..."
        maxlength="200">${player.bio || ''}</textarea>
      <button class="btn btn-secondary" style="margin-top:8px;padding:8px 16px;width:auto;font-size:13px"
        onclick="window._saveBio()">Salva</button>
    </div>`;

  // ---- STATISTICHE ----
  const statsHtml = `
    <div class="profile-section">
      <div class="profile-section-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Statistiche
      </div>
      <div class="profile-stats-row">
        <div class="profile-stat"><span class="profile-stat-val">${player.partite_giocate}</span><span class="profile-stat-lbl">Partite</span></div>
        <div class="profile-stat"><span class="profile-stat-val" style="color:var(--accent)">${player.vinte}</span><span class="profile-stat-lbl">Vinte</span></div>
        <div class="profile-stat"><span class="profile-stat-val" style="color:var(--accent2)">${player.perse}</span><span class="profile-stat-lbl">Perse</span></div>
        <div class="profile-stat"><span class="profile-stat-val" style="color:var(--gold)">${winPct}%</span><span class="profile-stat-lbl">Win%</span></div>
      </div>
    </div>`;

  // ---- ULTIME PARTITE ----
  const recentMatchesHtml = matches.slice(0, 5).map(m => {
    const isWin = m.winner_id === u.id;
    const oppId = m.player1_id === u.id ? m.player2_id : m.player1_id;
    const opp   = state.allPlayers.find(p => p.id === oppId);
    const score = m.punteggio1 != null
      ? (m.player1_id === u.id
          ? `${m.punteggio1}–${m.punteggio2}`
          : `${m.punteggio2}–${m.punteggio1}`)
      : '';
    return `<div class="profile-match-row">
      <span class="profile-match-result ${isWin ? 'win' : 'loss'}">${isWin ? 'V' : 'S'}</span>
      <span style="font-size:13px;flex:1">vs <strong>${opp?.nome || '?'}</strong>${score ? ` <span style="color:var(--text2);font-family:var(--font-mono);font-size:12px">${score}</span>` : ''}</span>
      <span style="font-size:11px;color:var(--text3)">${new Date(m.data).toLocaleDateString('it')}</span>
    </div>`;
  }).join('') || '<div style="font-size:13px;color:var(--text2);padding:8px 0">Nessuna partita ancora</div>';

  // ---- RENDER FINALE ----
  document.getElementById('myProfileContent').innerHTML = `
    <!-- Hero -->
    <div class="profile-hero">
      ${avatarSection}
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-display);font-size:30px;letter-spacing:2px;line-height:1">${player.nome}</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:6px">${player.elo} ELO${bonus > 0 ? ` · +${bonus} bonus` : ''}</div>
        ${player.bio ? `<div style="font-size:12px;color:var(--text2);margin-top:6px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${player.bio}"</div>` : ''}
      </div>
    </div>

    ${challengesHtml}
    ${statsHtml}

    <div class="profile-section">
      <div class="profile-section-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        Ultime partite
      </div>
      ${recentMatchesHtml}
    </div>

    ${pushHtml}
    ${bioHtml}

    <div class="profile-section" style="margin-top:8px">
      <button class="btn btn-danger" id="myProfileLogoutBtn" style="display:flex;align-items:center;justify-content:center;gap:8px">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Esci dall'account
      </button>
    </div>
  `;

  // Attach logout after render
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
// TOGGLE PUSH DAL PROFILO
// =============================================
export async function togglePushFromProfile() {
  const status = await getPushStatus();
  if (status === 'subscribed') {
    await unsubscribeFromPush();
  } else {
    await subscribeToPush();
  }
  // Ricarica il profilo per aggiornare il toggle
  await renderMyProfile();
  // Aggiorna anche l'icona nell'header
  await updatePushIcon();
}

// =============================================
// AGGIORNA ICONA PUSH NELL'HEADER
// =============================================
export async function updatePushIcon() {
  const icon = document.getElementById('pushIcon');
  if (!icon || !state.currentUser) return;
  const status = await getPushStatus();
  const bellOn  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const bellOff = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  icon.innerHTML = status === 'subscribed' ? bellOn : bellOff;
}

// =============================================
// TOGGLE PUSH DALL'HEADER
// =============================================
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

// =============================================
// AGGIORNA BADGE SFIDE NELL'HEADER
// =============================================
export async function updateChallengeBadge() {
  if (!state.currentUser) return;
  try {
    const pending = await get('challenges',
      `sfidato_id=eq.${state.currentUser.id}&stato=eq.pending`
    );
    const badge  = document.getElementById('challengeBadge');
    const navBtn = document.getElementById('navSfide');
    if (!badge) return;

    const count = pending.length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
      if (navBtn) {
        // aggiorna solo il testo della <span>, non toccare l'SVG
        const span = navBtn.querySelector('span');
        if (span) span.textContent = `Sfide (${count})`;
        navBtn.style.color = 'var(--accent3)';
      }
    } else {
      badge.style.display = 'none';
      if (navBtn) {
        const span = navBtn.querySelector('span');
        if (span) span.textContent = 'Sfide';
        navBtn.style.color = '';
      }
    }
  } catch(e) {}
}
