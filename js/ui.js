// =============================================
// UI — Toast, Modal, Navigazione, Utility condivise
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

export function initModalDismiss() {
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target === el) closeModal(el.id);
    });
  });
}

// =============================================
// UTILITY CONDIVISE
// =============================================

/** Converti una data in stringa relativa "Xm fa", "Xh fa", ecc. */
export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs  / 24);

  if (mins < 1)  return 'adesso';
  if (mins < 60) return `${mins}m fa`;
  if (hrs  < 24) return `${hrs}h fa`;
  if (days < 7)  return `${days}g fa`;
  return new Date(dateStr).toLocaleDateString('it');
}

/** Etichetta posizione in classifica: 👑 #1, 🥈 #2, 🥉 #3, #N o '—' */
export function getRankLabel(rank) {
  if (rank === 1) return '👑 #1';
  if (rank === 2) return '🥈 #2';
  if (rank === 3) return '🥉 #3';
  if (rank  >  3) return `#${rank}`;
  return '—';
}

// =============================================
// Dialog di conferma custom (no native confirm)
// =============================================
export function confirmDialog(message, onConfirm, onCancel) {
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
      <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:rgba(255,82,82,0.1);margin:0 auto 12px">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
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

// =============================================
// Score input modal condiviso
// Usato da addScoreToMatch (matches.js) e adminEditMatch (admin.js)
//
// config = { title, subtitle, s1: val, s2: val, p1Name, p2Name, onSave(s1, s2), validate }
// =============================================
export function scoreInputModal({ title = 'RISULTATO', subtitle = '', p1Name, p2Name, s1 = '', s2 = '', onSave, validate }) {
  document.getElementById('_scoreDialog')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '_scoreDialog';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:3000;
    display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
      padding:24px;max-width:340px;width:100%">
      <div style="font-family:var(--font-display);font-size:20px;letter-spacing:2px;margin-bottom:4px">${title}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:20px;letter-spacing:0.5px;text-transform:uppercase">${subtitle || `${p1Name} vs ${p2Name}`}</div>
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">${p1Name}</div>
          <input id="_sd_s1" type="number" min="0" max="99" value="${s1}" placeholder="es. 21"
            style="width:100%;background:var(--surface2);border:1px solid var(--border2);color:var(--text);
            border-radius:var(--radius);padding:12px;font-size:24px;font-family:var(--font-mono);
            text-align:center;outline:none;-moz-appearance:textfield">
        </div>
        <div style="font-size:20px;color:var(--text2);padding-top:20px">—</div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">${p2Name}</div>
          <input id="_sd_s2" type="number" min="0" max="99" value="${s2}" placeholder="es. 17"
            style="width:100%;background:var(--surface2);border:1px solid var(--border2);color:var(--text);
            border-radius:var(--radius);padding:12px;font-size:24px;font-family:var(--font-mono);
            text-align:center;outline:none;-moz-appearance:textfield">
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="_sd_cancel" class="btn btn-secondary" style="flex:1">Annulla</button>
        <button id="_sd_ok"     class="btn btn-primary"   style="flex:2">Salva</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('_sd_s1')?.focus(), 50);

  const cleanup = () => overlay.remove();
  document.getElementById('_sd_cancel').addEventListener('click', cleanup);
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('_sd_ok').click();
    if (e.key === 'Escape') cleanup();
  });

  document.getElementById('_sd_ok').addEventListener('click', async () => {
    const v1 = parseInt(document.getElementById('_sd_s1').value);
    const v2 = parseInt(document.getElementById('_sd_s2').value);
    if (isNaN(v1) || isNaN(v2)) return toast('Inserisci entrambi i punteggi', 'error');
    if (validate && !validate(v1, v2)) return toast('Punteggio non valido (21 con +2 di scarto)', 'error');
    cleanup();
    await onSave(v1, v2);
  });
}
