import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { get, post } from './api.js';
import { state } from './state.js';
import { timeAgo } from './ui.js';

// =============================================
// LIVE FEED
// =============================================

// =============================================
// AGGIUNGE EVENTO AL FEED
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
  document.querySelector('[data-section=feed] ._feedbadge')?.remove();
  startPolling(container);
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
  container.innerHTML = events.map(renderFeedEvent).join('');
}

function renderFeedEvent(e) {
  const p1   = state.allPlayers.find(p => p.id === e.player1_id);
  const p2   = state.allPlayers.find(p => p.id === e.player2_id);
  const ago  = timeAgo(e.creato_il);
  const meta = e.metadata || {};

  let icon = '📡', text = '', accent = 'var(--text2)';

  switch(e.tipo) {
    case 'match_confirmed':
      icon = '🏓'; accent = 'var(--accent)';
      text = `<strong style="color:var(--accent)">${p1?.nome||'?'}</strong> ha battuto <strong>${p2?.nome||'?'}</strong>
              ${meta.score ? `<span class="match-score">${meta.score}</span>` : ''}
              ${meta.elo_delta ? `<span style="color:var(--accent);font-family:var(--font-mono);font-size:12px">+${meta.elo_delta} Elo</span>` : ''}`;
      break;
    case 'challenge_sent':
      icon = '⚔️'; accent = 'var(--accent3)';
      text = `<strong style="color:var(--accent3)">${p1?.nome||'?'}</strong> ha sfidato <strong>${p2?.nome||'?'}</strong>
              ${meta.messaggio ? `<span style="color:var(--text2);font-style:italic">"${meta.messaggio}"</span>` : ''}`;
      break;
    case 'challenge_accepted':
      icon = '✅'; accent = 'var(--accent)';
      text = `<strong style="color:var(--accent)">${p1?.nome||'?'}</strong> ha accettato la sfida di <strong>${p2?.nome||'?'}</strong>`;
      break;
    case 'challenge_refused':
      icon = '😤'; accent = 'var(--accent2)';
      text = `<strong style="color:var(--accent2)">${p1?.nome||'?'}</strong> ha rifiutato la sfida di <strong>${p2?.nome||'?'}</strong>`;
      break;
    case 'tournament_created':
      icon = '🏅'; accent = 'var(--gold)';
      text = `Nuovo torneo creato: <strong style="color:var(--gold)">${meta.nome||'?'}</strong>
              <span class="badge badge-torneo">${meta.tipo||''}</span>`;
      break;
    case 'tournament_winner':
      icon = '🏆'; accent = 'var(--gold)';
      text = `<strong style="color:var(--gold)">${p1?.nome||'?'}</strong> ha vinto il torneo <strong>${meta.torneo||'?'}</strong>! 🎉`;
      break;
    case 'elo_milestone':
      icon = '📈'; accent = 'var(--accent)';
      text = `<strong style="color:var(--accent)">${p1?.nome||'?'}</strong> ha raggiunto <strong style="font-family:var(--font-mono)">${meta.elo}</strong> Elo!`;
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
// POLLING — aggiorna feed ogni 15s
// =============================================
let _pollInterval = null;
let _lastEventId  = null;

function startPolling(container) {
  if (_pollInterval) clearInterval(_pollInterval);

  _pollInterval = setInterval(async () => {
    if (!document.getElementById('sec-feed')?.classList.contains('active')) {
      // Feed non visibile: controlla solo badge
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

    const events = await get('feed_events', 'order=creato_il.desc&limit=50&select=*');
    if (events.length > 0) _lastEventId = events[0].id;
    renderFeed(events, container);
  }, 15000);
}

export function stopFeedPolling() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}

// =============================================
// HOME FEED — ticker breaking news
// =============================================
let _homePollInterval = null;

export async function loadHomeFeed() {
  await _renderHomeFeed();
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

  const tickerItems = events.slice(0, 8).map(e => {
    const p1   = state.allPlayers.find(p => p.id === e.player1_id);
    const p2   = state.allPlayers.find(p => p.id === e.player2_id);
    const meta = e.metadata || {};
    switch(e.tipo) {
      case 'match_confirmed':   return `<span class="ticker-item">🏓 <strong>${p1?.nome||'?'}</strong> batte ${p2?.nome||'?'} ${meta.score||''}</span>`;
      case 'challenge_sent':    return `<span class="ticker-item">⚔️ <strong>${p1?.nome||'?'}</strong> sfida ${p2?.nome||'?'}</span>`;
      case 'tournament_winner': return `<span class="ticker-item">🏆 <strong>${p1?.nome||'?'}</strong> vince il torneo!</span>`;
      case 'elo_milestone':     return `<span class="ticker-item">📈 <strong>${p1?.nome||'?'}</strong> raggiunge ${meta.elo} Elo</span>`;
      default: return null;
    }
  }).filter(Boolean);

  ticker.innerHTML = tickerItems.join('<span class="ticker-sep">·</span>') || 'Live — risultati e sfide in tempo reale';
}
