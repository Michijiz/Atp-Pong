// =============================================
// UI — Toast, Modal, Navigazione
// =============================================

export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  el.innerHTML = `<span style="display:flex;align-items:center;flex-shrink:0">${icon}</span> ${msg}`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function openModal(id) {
  document.getElementById(id).classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

export function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`sec-${id}`)?.classList.add('active');
}

// Chiudi modal cliccando fuori
export function initModalDismiss() {
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) closeModal(el.id);
    });
  });
}

// =============================================
// Fix #20 — Dialog di conferma custom (no native confirm())
// =============================================
export function confirmDialog(message, onConfirm, onCancel) {
  // Rimuovi eventuali dialog precedenti
  document.getElementById('_confirmDialog')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '_confirmDialog';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:24px;
  `;

  overlay.innerHTML = `
    <div style="
      background:var(--s1);border:1px solid var(--b1);border-radius:var(--radius);
      padding:28px 24px;max-width:340px;width:100%;text-align:center;
    ">
      <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:rgba(255,82,82,0.1);margin:0 auto 12px"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div style="font-size:15px;color:var(--text);line-height:1.5;margin-bottom:24px">${message}</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="_confirmNo"  class="btn btn-secondary" style="width:auto;padding:10px 20px">Annulla</button>
        <button id="_confirmYes" class="btn btn-danger"    style="width:auto;padding:10px 20px">Conferma</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cleanup = () => overlay.remove();
  document.getElementById('_confirmYes').addEventListener('click', () => { cleanup(); onConfirm?.(); });
  document.getElementById('_confirmNo').addEventListener('click',  () => { cleanup(); onCancel?.(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) { cleanup(); onCancel?.(); } });
}