import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { get, post } from './api.js';
import { state } from './state.js';
import { avatarEl, getAvatarUrl } from './avatar.js';

// =============================================
// LIVE FEED — Breaking News
// =============================================

let realtimeChannel = null;

// =============================================
// AGGIUNGE EVENTO AL FEED
// Chiamata da altri moduli (matches, challenges, tornei)
// =============================================
export async function addFeedEvent({ tipo, player1_id, player2_id, metadata = {} }) {
  try {
    await post('feed_events', { tipo, player1_id, player2_id, metadata });
  } catch(e) {
    console.error('[Feed] Errore inserimento evento:', e);
  }
}

// =============================================
// CARICA FEED
// =============================================
export async function loadFeed() {
  const container = document.getElementById('feedContent');
  if (!container) return;

  container.innerHTML = '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [events, players] = await Promise.all([
    get('feed_events', 'order=creato_il.desc&limit=50&select=*'),
    get('players', 'select=id,nome')
  ]);

  if (state.allPlayers.length === 0) state.allPlayers = players;

  renderFeed(events, container);
  if (events.length > 0) _lastEventId = events[0].id;
  // Rimuovi badge "nuovi eventi" se presente
  document.querySelector('[data-section=feed] ._feedbadge')?.remove();
  subscribeRealtime(container);
}

// =============================================
// RENDER FEED
// =============================================
function renderFeed(events, container) {
  if (events.length === 0) {
    container.innerHTML = `<div class="empty">
      <div class="icon">📡</div>
      <p>Nessun evento ancora — gioca la prima partita!</p>
    </div>`;
    return;
  }

  container.innerHTML = events.map(e => renderFeedEvent(e)).join('');
}

function renderFeedEvent(e) {
  const p1   = state.allPlayers.find(p => p.id === e.player1_id);
  const p2   = state.allPlayers.find(p => p.id === e.player2_id);
  const ago  = timeAgo(e.creato_il);
  const meta = e.metadata || {};

  let icon = '📡', text = '', accent = 'var(--text2)';

  switch(e.tipo) {
    case 'match_confirmed':
      icon   = '🏓';
      accent = 'var(--accent)';
      text   = `<strong style="color:var(--accent)">${p1?.nome || '?'}</strong>
                ha battuto
                <strong>${p2?.nome || '?'}</strong>
                ${meta.score ? `<span class="match-score">${meta.score}</span>` : ''}
                ${meta.elo_delta ? `<span style="color:var(--accent);font-family:var(--font-mono);font-size:12px">+${meta.elo_delta} Elo</span>` : ''}`;
      break;

    case 'challenge_sent':
      icon   = '⚔️';
      accent = 'var(--accent3)';
      text   = `<strong style="color:var(--accent3)">${p1?.nome || '?'}</strong>
                ha sfidato
                <strong>${p2?.nome || '?'}</strong>
                ${meta.messaggio ? `<span style="color:var(--text2);font-style:italic">"${meta.messaggio}"</span>` : ''}`;
      break;

    case 'challenge_accepted':
      icon   = '✅';
      accent = 'var(--accent)';
      text   = `<strong style="color:var(--accent)">${p1?.nome || '?'}</strong>
                ha accettato la sfida di
                <strong>${p2?.nome || '?'}</strong>`;
      break;

    case 'challenge_refused':
      icon   = '😤';
      accent = 'var(--accent2)';
      text   = `<strong style="color:var(--accent2)">${p1?.nome || '?'}</strong>
                ha rifiutato la sfida di
                <strong>${p2?.nome || '?'}</strong>`;
      break;

    case 'tournament_created':
      icon   = '🏅';
      accent = 'var(--gold)';
      text   = `Nuovo torneo creato: <strong style="color:var(--gold)">${meta.nome || '?'}</strong>
                <span class="badge badge-torneo">${meta.tipo || ''}</span>`;
      break;

    case 'tournament_winner':
      icon   = '🏆';
      accent = 'var(--gold)';
      text   = `<strong style="color:var(--gold)">${p1?.nome || '?'}</strong>
                ha vinto il torneo
                <strong>${meta.torneo || '?'}</strong>! 🎉`;
      break;

    case 'elo_milestone':
      icon   = '📈';
      accent = 'var(--accent)';
      text   = `<strong style="color:var(--accent)">${p1?.nome || '?'}</strong>
                ha raggiunto
                <strong style="font-family:var(--font-mono)">${meta.elo}</strong> Elo!`;
      break;

    default:
      text = `Evento: ${e.tipo}`;
  }

  return `<div class="feed-event" style="border-left-color:${accent}">
    <div class="feed-icon">${icon}</div>
    <div class="feed-body">
      <div class="feed-text">${text}</div>
      <div class="feed-time">${ago}</div>
    </div>
  </div>`;
}

// =============================================
// REALTIME — aggiorna feed live
// =============================================
function subscribeRealtime(container) {
  // Disconnetti eventuale canale precedente
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
  }

  realtimeChannel = new EventSource(
    `${SUPABASE_URL}/realtime/v1/sse?apikey=${SUPABASE_KEY}&schema=public&table=feed_events&filter=id=neq.00000000-0000-0000-0000-000000000000`
  );

  // Usiamo Supabase Realtime via fetch + polling leggero come fallback
  // perché EventSource non supporta headers custom su tutti i browser
  startPolling(container);
}

// Polling ogni 15s come fallback robusto per il free tier
let _pollInterval   = null;
let _lastEventId    = null; // Fix #9 — traccia l'ultimo evento visto

function startPolling(container) {
  if (_pollInterval) clearInterval(_pollInterval);

  _pollInterval = setInterval(async () => {
    if (!document.getElementById('sec-feed')?.classList.contains('active')) {
      // Feed non visibile: controlla solo se ci sono nuovi eventi per il badge
      if (_lastEventId) {
        const newest = await get('feed_events', `id=gt.${_lastEventId}&select=id&order=creato_il.desc&limit=10`).catch(() => []);
        if (newest.length > 0) {
          const navFeed = document.querySelector('[data-section=feed]');
          if (navFeed && !navFeed.querySelector('._feedbadge')) {
            const badge = document.createElement('span');
            badge.className = '_feedbadge';
            badge.style.cssText = 'background:var(--accent2);color:#fff;border-radius:100px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:4px;vertical-align:middle';
            badge.textContent = newest.length > 9 ? '9+' : newest.length;
            navFeed.appendChild(badge);
          }
        }
      }
      return;
    }

    // Feed visibile: ricarica e aggiorna
    const events = await get('feed_events', 'order=creato_il.desc&limit=50&select=*');
    if (events.length > 0) _lastEventId = events[0].id;
    renderFeed(events, container);
  }, 15000);
}

export function stopFeedPolling() {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

// =============================================
// HOME FEED — Breaking News in homepage
// =============================================
let _homePollInterval = null;

export async function loadHomeFeed() {
  await _renderHomeFeed();

  // Aggiorna ogni 30s anche se la sezione non è attiva
  if (_homePollInterval) clearInterval(_homePollInterval);
  _homePollInterval = setInterval(_renderHomeFeed, 30000);
}

async function _renderHomeFeed() {
  const ticker = document.getElementById('breakingTicker');
  if (!ticker) return;

  const [events, players] = await Promise.all([
    get('feed_events', 'order=creato_il.desc&limit=20&select=*').catch(() => []),
    state.allPlayers.length > 0
      ? Promise.resolve(state.allPlayers)
      : get('players', 'select=id,nome').catch(() => [])
  ]).catch(() => [[], []]);

  if (state.allPlayers.length === 0 && players.length > 0) state.allPlayers = players;

  if (!events || events.length === 0) {
    ticker.textContent = 'Nessun evento ancora — gioca la prima partita!';
    return;
  }

  // --- Ticker ---
  const tickerItems = events.slice(0, 8).map(e => {
    const p1   = state.allPlayers.find(p => p.id === e.player1_id);
    const p2   = state.allPlayers.find(p => p.id === e.player2_id);
    const meta = e.metadata || {};
    switch(e.tipo) {
      case 'match_confirmed':
        return `<span class="ticker-item">🏓 <strong>${p1?.nome||'?'}</strong> batte ${p2?.nome||'?'} ${meta.score ? meta.score : ''}</span>`;
      case 'challenge_sent':
        return `<span class="ticker-item">⚔️ <strong>${p1?.nome||'?'}</strong> sfida ${p2?.nome||'?'}</span>`;
      case 'tournament_winner':
        return `<span class="ticker-item">🏆 <strong>${p1?.nome||'?'}</strong> vince il torneo!</span>`;
      case 'elo_milestone':
        return `<span class="ticker-item">📈 <strong>${p1?.nome||'?'}</strong> raggiunge ${meta.elo} Elo</span>`;
      default: return null;
    }
  }).filter(Boolean);

  ticker.innerHTML = tickerItems.join('<span class="ticker-sep">·</span>') || 'Live — risultati e sfide in tempo reale';
}



// =============================================
// UTILITY
// =============================================
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs  / 24);

  if (mins < 1)   return 'adesso';
  if (mins < 60)  return `${mins}m fa`;
  if (hrs  < 24)  return `${hrs}h fa`;
  if (days < 7)   return `${days}g fa`;
  return new Date(dateStr).toLocaleDateString('it');
}