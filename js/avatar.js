import { SUPABASE_URL, SUPABASE_KEY, AVATAR_COLORS } from './config.js';
import { toast } from './ui.js';

// =============================================
// AVATAR
// =============================================

export function getAvatarColor(name) {
  let h = 0;
  for (let c of name) h = ((h << 5) - h) + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function getAvatarUrl(playerId) {
  if (!playerId) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/Avatars/${playerId}`;
}

export function avatarEl(name, size = 32, avatarUrl = null) {
  const [bg, fg] = getAvatarColor(name);
  if (avatarUrl) {
    return `<div class="avatar" style="width:${size}px;height:${size}px;border:1.5px solid ${bg}44;overflow:hidden;padding:0">
      <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"
        onerror="if(this.parentElement){this.parentElement.innerHTML='${name[0].toUpperCase()}';this.parentElement.style.background='${bg}22';this.parentElement.style.color='${fg}'}">
    </div>`;
  }
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${bg}22;color:${fg};border:1.5px solid ${bg}44">${name[0].toUpperCase()}</div>`;
}

export async function uploadAvatar(playerId, file) {
  const url = `${SUPABASE_URL}/storage/v1/object/Avatars/${playerId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert': 'true'
    },
    body: file
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch(e) {}
    throw new Error(`${res.status}: ${msg}`);
  }
  return getAvatarUrl(playerId);
}

export async function handleAvatarUpload(playerId, input, onSuccess) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return toast('Immagine troppo grande (max 2MB)', 'error');

  toast('Caricamento foto...');
  try {
    await uploadAvatar(playerId, file);
    toast('Foto aggiornata!');
    if (onSuccess) onSuccess(playerId);
  } catch(e) {
    console.error('Avatar upload error:', e);
    toast(`Errore upload: ${e.message}`, 'error');
  }
}
