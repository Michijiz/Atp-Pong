// =============================================
// SCOREKEEPER — modal tap-to-score
// =============================================
// Usato sia per partite libere che per partite di torneo.
// Chiamare openScorekeeper(config) per aprirlo.
//
// config = {
//   p1Name, p2Name,           // nomi da mostrare
//   onConfirm(s1, s2),        // callback con i punteggi finali
//   onCancel()                 // opzionale — chiude senza salvare
// }

let _sk = { s1: 0, s2: 0, bannerDismissed: false, config: null };

export function openScorekeeper(config) {
  _sk = { s1: 0, s2: 0, bannerDismissed: false, config };

  document.getElementById('skName1').textContent = config.p1Name || 'P1';
  document.getElementById('skName2').textContent = config.p2Name || 'P2';
  _skUpdateUI();

  document.getElementById('scorekeeperModal').classList.add('open');

  // Collega i tap sulle metà
  const L = document.getElementById('skHalfL');
  const R = document.getElementById('skHalfR');
  L._skHandler = e => _skAdd(1, e);
  R._skHandler = e => _skAdd(2, e);
  L.addEventListener('click', L._skHandler);
  R.addEventListener('click', R._skHandler);
}

export function closeScorekeeper() {
  document.getElementById('scorekeeperModal').classList.remove('open');
  _detachHandlers();
  if (_sk.config?.onCancel) _sk.config.onCancel();
}

function _detachHandlers() {
  const L = document.getElementById('skHalfL');
  const R = document.getElementById('skHalfR');
  if (L._skHandler) { L.removeEventListener('click', L._skHandler); L._skHandler = null; }
  if (R._skHandler) { R.removeEventListener('click', R._skHandler); R._skHandler = null; }
}

function _skAdd(p, e) {
  if (p === 1) _sk.s1++;
  else         _sk.s2++;
  _skBump(p === 1 ? 'skScore1' : 'skScore2');
  _skFlash(e.clientX, e.clientY);
  _skUpdateUI();
  _skMaybeShowBanner();
}

export function skMinus(p) {
  if (p === 1 && _sk.s1 > 0) _sk.s1--;
  if (p === 2 && _sk.s2 > 0) _sk.s2--;
  _sk.bannerDismissed = false;
  document.getElementById('skBanner').classList.remove('show');
  _skUpdateUI();
}

export function skReset() {
  _sk.s1 = 0; _sk.s2 = 0; _sk.bannerDismissed = false;
  document.getElementById('skBanner').classList.remove('show');
  _skUpdateUI();
}

export function skDismiss() {
  _sk.bannerDismissed = true;
  document.getElementById('skBanner').classList.remove('show');
}

export async function skConfirm() {
  const { s1, s2, config } = _sk;
  document.getElementById('skBanner').classList.remove('show');
  document.getElementById('scorekeeperModal').classList.remove('open');
  _detachHandlers();
  if (config?.onConfirm) await config.onConfirm(s1, s2);
}

export async function skSubmitFromFooter() {
  const { s1, s2 } = _sk;
  // Accetta qualsiasi punteggio > 0 dal footer — la validazione la fa onConfirm
  if (s1 === 0 && s2 === 0) return;
  await skConfirm();
}

// =============================================
// INTERNALS
// =============================================

function _skIsValid(a, b) {
  const max = Math.max(a, b), min = Math.min(a, b);
  return max >= 21 && max - min >= 2;
}

function _skUpdateUI() {
  const { s1, s2 } = _sk;
  document.getElementById('skScore1').textContent = s1;
  document.getElementById('skScore2').textContent = s2;
  const ready = s1 > 0 || s2 > 0;
  document.getElementById('skSubmitBtn').classList.toggle('ready', ready);
}

function _skMaybeShowBanner() {
  if (_sk.bannerDismissed) return;
  if (!_skIsValid(_sk.s1, _sk.s2)) return;
  const { s1, s2, config } = _sk;
  const winnerName = s1 > s2 ? (config?.p1Name || 'P1') : (config?.p2Name || 'P2');
  document.getElementById('skBannerName').textContent  = winnerName;
  document.getElementById('skBannerScore').textContent = `${s1} — ${s2}`;
  document.getElementById('skBanner').classList.add('show');
}

function _skBump(id) {
  const el = document.getElementById(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 120);
}

function _skFlash(clientX, clientY) {
  const table = document.getElementById('skTable');
  const rect  = table.getBoundingClientRect();
  const el    = document.createElement('div');
  el.className = 'sk-point-flash';
  el.textContent = '+1';
  el.style.left = (clientX - rect.left - 16) + 'px';
  el.style.top  = (clientY - rect.top  - 16) + 'px';
  table.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.45s, transform 0.45s';
    el.style.opacity    = '1';
    el.style.transform  = 'translateY(-36px)';
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 280);
  });
}