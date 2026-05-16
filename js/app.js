// =============================================
// APP.JS — Entry point
// =============================================

import { state }         from './state.js';
import { initModalDismiss, showSection, toast } from './ui.js';
import { restoreSession, openLoginModal, showLoginForm, showRegisterForm,
         doLogin, doRegister, afterRegister, logout } from './auth.js';
import { loadRanking, showProfile }      from './ranking.js';
import { loadPartite, updateMatchPlayers, submitMatch, submitMatchClassic, openScorekeeperForMatch, confirmMatch, loadMatchHistory, addScoreToMatch } from './matches.js';
import { loadTornei, backToTornei, creaTorneo, openTorneo,
         iscrivitiTorneo, generaGironi, avanzaAFinale,
         openRegistraMatchTorneo, closeTorneoMatchModal, submitTorneoMatch,
         confirmTorneoMatch, generaFinale, chiudiTorneo } from './tornei.js';
import { loadStats }     from './stats.js';
import { loadAdmin, adminAddPlayer, adminDeletePlayer, adminResetElo, adminDeleteMatch, adminEditMatch, adminLoadMatches, adminDeleteTorneo, adminIscriviTorneo, recalcAllElo, downloadPinBackup } from './admin.js';
import { handleAvatarUpload } from './avatar.js';
import { loadChallenges, sendChallenge, acceptChallenge,
         refuseChallenge, cancelChallenge } from './challenges.js';
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
window._updateMatchPlayers      = updateMatchPlayers;
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
window._sendChallenge           = sendChallenge;
window._acceptChallenge         = acceptChallenge;
window._refuseChallenge         = refuseChallenge;
window._cancelChallenge         = cancelChallenge;
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

// =============================================
// NAV
// =============================================
function setupNav() {
  const navMap = {
    'ranking':     () => loadRanking(),
    'partite':     () => loadPartite(),
    'tornei':      () => loadTornei(),
    'statistiche': () => loadStats(),
    'sfide':       () => loadChallenges(),
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
    logout(() => { loadPartite(); updateChallengeBadge(); })
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
// PARTITE
// =============================================
function setupPartite() {
  document.getElementById('btn-submit-match').addEventListener('click', openScorekeeperForMatch);
  document.getElementById('btn-submit-match-classic').addEventListener('click', submitMatchClassic);
  document.getElementById('match_p1').addEventListener('change', updateMatchPlayers);
  document.getElementById('match_p2').addEventListener('change', updateMatchPlayers);
}

// =============================================
// ADMIN
// =============================================
function setupAdmin() {
  document.getElementById('btn-admin-add-player').addEventListener('click', adminAddPlayer);
  document.getElementById('btn-download-backup').addEventListener('click', downloadPinBackup);
}

// =============================================
// INIT
// =============================================
async function init() {
  initModalDismiss();
  setupNav();
  setupHeader();
  setupAuthModal();
  setupPartite();
  setupAdmin();

  // PWA
  await registerServiceWorker();

  // Sessione
  await restoreSession();

  // UI post-login
  if (state.currentUser) {
    await updatePushIcon();
    await updateChallengeBadge();
  }

  // Ranking iniziale
  await loadRanking();

  // Breaking News in home — in parallelo con il ranking
  loadHomeFeed();

  // Polling badge sfide ogni 30s
  setInterval(async () => {
    if (state.currentUser) await updateChallengeBadge();
  }, 30000);
}

init();