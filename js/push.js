import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_ANON_KEY } from './config.js';
import { get, post, patch } from './api.js';
import { state } from './state.js';
import { toast } from './ui.js';

// =============================================
// PUSH NOTIFICATIONS — Client
// =============================================

// VAPID public key — la generiamo dopo con la Edge Function
// Placeholder: verrà sostituita con la chiave reale
const VAPID_PUBLIC_KEY = 'BCOiTsPO4eScSeBno1s-kceWV3Uwx-T_L5jmF1OLFM6Dw5XLwQvh6ZmbdQRG_lBrPdfBVJmUCU01PyZvQk4nKnc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// =============================================
// REGISTRA SERVICE WORKER
// =============================================
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('[PWA] Service Worker registrato:', reg.scope);

    // Ascolta messaggi dal SW (es. navigazione da notifica)
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'NAVIGATE') {
        const section = event.data.url.split('#')[1];
        if (section) {
          document.querySelector(`[data-section="${section}"]`)?.click();
        }
      }
    });

    return reg;
  } catch(e) {
    console.error('[PWA] Registrazione SW fallita:', e);
    return null;
  }
}

// =============================================
// CHIEDI PERMESSO E SOTTOSCRIVI
// =============================================
export async function subscribeToPush() {
  if (!state.currentUser) return toast('Devi essere loggato per attivare le notifiche', 'error');
  if (!('PushManager' in window)) return toast('Notifiche push non supportate su questo browser', 'error');

  // Chiedi permesso
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return toast('Permesso notifiche negato', 'error');
  }

  try {
    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    // Salva subscription su Supabase
    const subJson = subscription.toJSON();

    // Upsert — se esiste già aggiorna
    const existing = await get('push_subscriptions', `player_id=eq.${state.currentUser.id}`);
    if (existing.length > 0) {
      await patch('push_subscriptions', `player_id=eq.${state.currentUser.id}`, {
        subscription: subJson
      });
    } else {
      await post('push_subscriptions', {
        player_id:    state.currentUser.id,
        subscription: subJson
      });
    }

    // Aggiorna flag sul player
    await patch('players', `id=eq.${state.currentUser.id}`, { push_enabled: true });
    state.currentUser.push_enabled = true;

    toast('🔔 Notifiche attivate!');
    return true;
  } catch(e) {
    console.error('[Push] Errore subscription:', e);
    toast('Errore attivazione notifiche', 'error');
    return false;
  }
}

// =============================================
// DISATTIVA NOTIFICHE
// =============================================
export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();

    // Rimuovi da Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?player_id=eq.${state.currentUser.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    await patch('players', `id=eq.${state.currentUser.id}`, { push_enabled: false });
    state.currentUser.push_enabled = false;

    toast('Notifiche disattivate');
  } catch(e) {
    console.error('[Push] Errore unsubscribe:', e);
  }
}

// =============================================
// CONTROLLA STATO NOTIFICHE
// =============================================
export async function getPushStatus() {
  if (!('PushManager' in window)) return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';

  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

// =============================================
// INVIA NOTIFICA PUSH via Edge Function
// Chiamata lato client per notificare altri giocatori
// =============================================
export async function sendPushNotification({ playerIds, title, body, tag, url }) {
  try {
    
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ playerIds, title, body, tag, url })
    });
    const json = await res.json();
    console.log('[Push] Risposta:', res.status, json);
  } catch(e) {
    console.error('[Push] Errore invio notifica:', e);
  }
}
