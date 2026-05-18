import { get, post, patch } from './api.js';
import { state } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

// =============================================
// AUTH
// =============================================

// Salt globale mantenuto per retrocompatibilità — cambiarlo invaliderebbe tutti i PIN esistenti
export async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + 'pongatp_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function updateAuthUI() {
  const isLogged = !!state.currentUser;
  const isAdmin  = state.currentUser?.ruolo === 'admin';

  document.getElementById('loginBtn').style.display    = isLogged ? 'none'  : 'block';
  document.getElementById('logoutBtn').style.display   = isLogged ? 'block' : 'none';
  document.getElementById('userBadge').style.display   = isLogged ? 'flex'  : 'none';
  document.getElementById('adminNavBtn').style.display = isAdmin  ? 'block' : 'none';

  if (isLogged) {
    document.getElementById('userName').textContent = state.currentUser.nome;
    const dotEl = document.querySelector('#userBadge .dot');
    if (dotEl) dotEl.textContent = state.currentUser.nome.slice(0, 2).toUpperCase();
  }

  if (state.currentUser) {
    localStorage.setItem('pongatp_user', JSON.stringify({ id: state.currentUser.id }));
  } else {
    localStorage.removeItem('pongatp_user');
  }
}

export async function restoreSession() {
  const saved = localStorage.getItem('pongatp_user');
  if (!saved) return;
  try {
    const u = JSON.parse(saved);
    const res = await get('players', `id=eq.${u.id}&select=*`);
    if (res && res.length > 0) {
      state.currentUser = res[0];
      updateAuthUI();
    }
  } catch(e) {
    localStorage.removeItem('pongatp_user');
  }
}

export function openLoginModal() {
  showLoginForm();
  populateLoginSelect();
  openModal('loginModal');
}

export function showLoginForm() {
  document.getElementById('loginForm').style.display        = 'block';
  document.getElementById('registerForm').style.display     = 'none';
  document.getElementById('pinGeneratedForm').style.display = 'none';
  document.getElementById('modalTitle').textContent         = 'Accedi';
}

export function showRegisterForm() {
  document.getElementById('loginForm').style.display        = 'none';
  document.getElementById('registerForm').style.display     = 'block';
  document.getElementById('pinGeneratedForm').style.display = 'none';
  document.getElementById('modalTitle').textContent         = 'Crea Profilo';
}

async function populateLoginSelect() {
  const players = await get('players', 'order=nome.asc&select=id,nome');
  const sel = document.getElementById('login_player');
  sel.innerHTML = '<option value="">Seleziona...</option>';
  players.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nome}</option>`);
}

export async function doLogin() {
  const pid = document.getElementById('login_player').value;
  const pin = document.getElementById('login_pin').value;
  if (!pid || !pin) return toast('Completa tutti i campi', 'error');

  const hashed = await hashPin(pin);
  const res = await get('players', `id=eq.${pid}&pin_hash=eq.${hashed}`);
  if (!res || res.length === 0) return toast('PIN errato', 'error');

  state.currentUser = res[0];
  updateAuthUI();
  closeModal('loginModal');
  toast(`Bentornato, ${state.currentUser.nome}!`);
}

export async function doRegister() {
  const nome = document.getElementById('reg_name').value.trim();
  if (!nome || nome.length < 2) return toast('Il nome deve avere almeno 2 caratteri', 'error');
  if (nome.length > 30)         return toast('Il nome non può superare 30 caratteri', 'error');

  const existing = await get('players', `nome=ilike.${encodeURIComponent(nome)}`);
  if (existing && existing.length > 0) return toast('Nome già esistente', 'error');

  const pin      = generatePin();
  const pin_hash = await hashPin(pin);
  const newPlayer = await post('players', { nome, pin_hash, ruolo: 'player', elo: 1000 });

  document.getElementById('generatedPin').textContent       = pin;
  document.getElementById('registerForm').style.display     = 'none';
  document.getElementById('pinGeneratedForm').style.display = 'block';
  document.getElementById('modalTitle').textContent         = 'Salva il tuo PIN';

  state.currentUser = newPlayer[0];
  state.allPlayers  = [];
}

export function afterRegister(onDone) {
  updateAuthUI();
  closeModal('loginModal');
  toast(`Profilo creato! Benvenuto, ${state.currentUser.nome}!`);
  if (onDone) onDone();
}

export function logout(onDone) {
  state.currentUser = null;
  updateAuthUI();
  toast('Logout effettuato');
  if (onDone) onDone();
}
