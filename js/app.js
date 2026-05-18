// =============================================
// APP.JS — Entry point
// =============================================

import { state }         from './state.js';
import { initModalDismiss, showSection, toast } from './ui.js';
import { restoreSession, openLoginModal, showLoginForm, showRegisterForm,
         doLogin, doRegister, afterRegister, logout } from './auth.js';
import { loadRanking, showProfile }      from './ranking.js';
import { loadPartite, submitMatch, confirmMatch, loadMatchHistory, addScoreToMatch } from './matches.js';
import { loadTornei, backToTornei, creaTorneo, openTorneo,
         iscrivitiTorneo, generaGironi, avanzaAFinale,
         openRegistraMatchTorneo, closeTorneoMatchModal, submitTorneoMatch,
         confirmTorneoMatch, generaFinale, chiudiTorneo } from './tornei.js';
import { loadStats }     from './stats.js';
import { loadAdmin, adminAddPlayer, adminDeletePlayer, adminResetElo, adminDeleteMatch, adminEditMatch, adminLoadMatches, adminDeleteTorneo, adminIscriviTorneo, recalcAllElo, downloadPinBackup } from './admin.js';
import { handleAvatarUpload } from './avatar.js';
import { loadBacheca, bachekaPost, bachekaDelete } from './bacheca.js';
import { loadHomeFeed } from './feed.js';
import { registerServiceWorker } from './push.js';
import { openMyProfile, saveBio, togglePush, togglePushFromProfile,
         updatePushIcon, updateChallengeBadge } from './myprofile.js';
import { closeScorekeeper, skMinus, skReset, skDismiss, skConfirm, skSubmitFromFooter, openScorekeeper } from './Scorekeeper.js';

// =============================================
// BRIDGE GLOBAL
// =============================================
window._showProfile             = showProfile;
window._backToTornei            = backToTornei;
window._confirmMatch            = confirmMatch;
window._loadMatchHistory        = loadMatchHistory;
window._adminDeletePlayer       = adminDeletePlayer;
window._adminResetElo           = adminResetElo;
window._adminDeleteMatch        = adminDeleteMatch;
window._adminEditMatch          = adminEditMatch;
window._adminLoadMatches        = adminLoadMatches;
window._adminDeleteTorneo       = adminDeleteTorneo;
window._adminIscriviTorneo      = adminIscriviTorneo;
window._adminRecalcElo          = async () => { await recalcAllElo(); await loadRanking(); toast('Elo ricalcolato!'); };
window._openTorneo              = openTorneo;
window._creaTorneo              = creaTorneo;
window._iscrivitiTorneo         = iscrivitiTorneo;
window._generaGironi            = generaGironi;
window._avanzaAFinale           = avanzaAFinale;
window._openRegistraMatchTorneo = openRegistraMatchTorneo;
window._closeTorneoMatchModal   = closeTorneoMatchModal;
window._submitTorneoMatch       = submitTorneoMatch;
window._confirmTorneoMatch      = confirmTorneoMatch;
window._generaFinale            = generaFinale;
window._chiudiTorneo            = chiudiTorneo;
window._handleAvatarUpload      = (id, input) => handleAvatarUpload(id, input, showProfile);
window._openMyProfile           = openMyProfile;
window._saveBio                 = saveBio;
window._togglePush              = togglePush;
window._togglePushFromProfile   = togglePushFromProfile;
window._closeScorekeeper        = closeScorekeeper;
window._skMinus                 = skMinus;
window._skReset                 = skReset;
window._skDismiss               = skDismiss;
window._skConfirm               = skConfirm;
window._skSubmitFromFooter      = skSubmitFromFooter;
window._scorekeeperModule       = { openScorekeeper };
window._addScoreToMatch         = addScoreToMatch;
window._bachekaPost             = bachekaPost;
window._bachekaDelete           = bachekaDelete;

// FAB
window._openFab = () => {
  if (!state.currentUser) return toast('Devi essere loggato', 'error');
  document.getElementById('fab_score_row').style.display = 'none';
  document.getElementById('fabScoreToggle').textContent = '✏️ Risultato';
  document.getElementById('fab_p2').value = '';
  document.getElementById('fabModal').classList.add('open');
};

window._fabToggleScore = () => {
  const row = document.getElementById('fab_score_row');
  const btn = document.getElementById('fabScoreToggle');
  const hidden = row.style.display === 'none';
  row.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? '✕ Chiudi' : '✏️ Risultato';
};

window._fabOpenLive = () => {
  const p2Id = document.getElementById('fab_p2').value;
  if (!p2Id) return toast('Seleziona un avversario', 'error');
  const p1Name = state.currentUser?.nome || 'Tu';
  const p2Name = state.allPlayers.find(p => p.id === p2Id)?.nome || '?';
  document.getElementById('fabModal').classList.remove('open');
  openScorekeeper({
    p1Name, p2Name,
    onConfirm: (s1, s2) => submitMatch(state.currentUser.id, p2Id, s1, s2)
  });
};

window._fabSubmitClassic = async () => {
  const p2Id = document.getElementById('fab_p2').value;
  const s1   = parseInt(document.getElementById('fab_score1').value);
  const s2   = parseInt(document.getElementById('fab_score2').value);
  if (!p2Id)           return toast('Seleziona un avversario', 'error');
  if (isNaN(s1) || isNaN(s2)) return toast('Inserisci i punteggi', 'error');
  document.getElementById('fabModal').classList.remove('open');
  await submitMatch(state.currentUser.id, p2Id, s1, s2);
};

// =============================================
// NAV
// =============================================
function setupNav() {
  const navMap = {
    'ranking':     () => loadRanking(),
    'partite':     () => loadPartite(),
    'tornei':      () => loadTornei(),
    'statistiche': () => loadStats(),
    'sfide':       () => loadBacheca(),
    'admin':       () => loadAdmin(),
  };

  document.querySelectorAll('.sidebar-nav-btn[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      showSection(section, btn);
      navMap[section]?.();
      closeSidebar();
    });
  });
}

// =============================================
// HEADER
// =============================================
function setupHeader() {
  document.getElementById('loginBtn').addEventListener('click', openLoginModal);
  document.getElementById('logoutBtn').addEventListener('click', () =>
    logout(() => { loadPartite(); updateChallengeBadge(); updateFabVisibility(); })
  );
  document.getElementById('helpBtn').addEventListener('click', () =>
    document.getElementById('helpModal').classList.add('open')
  );
}

// =============================================
// AUTH MODAL
// =============================================
function setupAuthModal() {
  document.getElementById('btn-do-login').addEventListener('click', async () => {
    await doLogin();
    if (state.currentUser) {
      await updatePushIcon();
      await updateChallengeBadge();
      updateFabVisibility();
      loadPartite();
    }
  });
  document.getElementById('btn-show-register').addEventListener('click', showRegisterForm);
  document.getElementById('btn-show-login').addEventListener('click', showLoginForm);
  document.getElementById('btn-do-register').addEventListener('click', doRegister);
  document.getElementById('btn-after-register').addEventListener('click', () =>
    afterRegister(() => { loadRanking(); loadPartite(); updateChallengeBadge(); })
  );
}

// =============================================
// ADMIN
// =============================================
function setupAdmin() {
  document.getElementById('btn-admin-add-player').addEventListener('click', adminAddPlayer);
  document.getElementById('btn-download-backup').addEventListener('click', downloadPinBackup);
}

function updateFabVisibility() {
  const fab = document.getElementById('fabBtn');
  if (fab) fab.style.display = state.currentUser ? 'flex' : 'none';
}

// =============================================
// INIT
// =============================================
async function init() {
  initModalDismiss();
  setupNav();
  setupHeader();
  setupAuthModal();
  setupAdmin();

  await registerServiceWorker();
  await restoreSession();

  if (state.currentUser) {
    await updatePushIcon();
    await updateChallengeBadge();
  }

  updateFabVisibility();
  await loadRanking();
  loadHomeFeed();

  setInterval(async () => {
    if (state.currentUser) await updateChallengeBadge();
  }, 30000);
}

init();