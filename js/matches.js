import { get, post, patch, del } from './api.js';
import { state } from './state.js';
import { toast, scoreInputModal } from './ui.js';
import { avatarEl } from './avatar.js';
import { calcElo, isValidScore } from './elo.js';
import { loadRanking } from './ranking.js';
import { sendPushNotification } from './push.js';
import { addFeedEvent } from './feed.js';
import { openScorekeeper } from './scorekeeper.js';

// =============================================
// PARTITE
// =============================================

export async function loadPartite() {
  const isLogged = !!state.currentUser;
  document.getElementById('pendingSection').style.display = isLogged ? 'block' : 'none';

  if (isLogged) {
    await loadPendingMatches();
    if (state.allPlayers.length === 0) {
      state.allPlayers = await get('players', 'order=nome.asc&select=*');
    }
    const sel = document.getElementById('fab_p2');
    if (sel) {
      sel.innerHTML = '<option value="">Seleziona avversario...</option>' +
        state.allPlayers
          .filter(p => p.id !== state.currentUser.id)
          .map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    }
  }

  await loadMatchHistory();
}

export async function loadPendingMatches() {
  if (!state.currentUser) return;

  const pending = await get('matches',
    `or=(player1_id.eq.${state.currentUser.id},player2_id.eq.${state.currentUser.id})&confermata=eq.false&order=data.desc&select=*`
  );

  const toConfirm = pending.filter(m => m.registrata_da !== state.currentUser.id);

  if (toConfirm.length === 0) {
    document.getElementById('pendingSection').innerHTML = '';
    return;
  }

  const items = toConfirm.map(m => {
    const oppId    = m.player1_id === state.currentUser.id ? m.player2_id : m.player1_id;
    const opp      = state.allPlayers.find(p => p.id === oppId);
    const myScore  = m.player1_id === state.currentUser.id ? m.punteggio1 : m.punteggio2;
    const oppScore = m.player1_id === state.currentUser.id ? m.punteggio2 : m.punteggio1;
    const winnerName = state.allPlayers.find(p => p.id === m.winner_id)?.nome || '?';
    const scoreStr = m.punteggio1 != null ? `${myScore}-${oppScore}` : '';
    const isMyWin  = m.winner_id === state.currentUser.id;

    return `<div class="pending-item" style="flex-direction:column;align-items:flex-start;gap:10px">
      <div style="font-size:13px;width:100%">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">
          ${opp?.nome || '?'} ha registrato una partita
        </div>
        ${scoreStr ? `<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:${isMyWin ? 'var(--accent)' : 'var(--accent2)'};margin:6px 0">
          Tu ${myScore} — ${oppScore} ${opp?.nome || '?'}
        </div>` : ''}
        <div style="font-size:12px;color:var(--text2)">
          Vincitore dichiarato: <span style="color:${isMyWin ? 'var(--accent)' : 'var(--accent2)'}">
            ${winnerName}${isMyWin ? ' (tu)' : ''}
          </span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Il punteggio è corretto?</div>
      </div>
      <div class="pending-btns" style="width:100%;justify-content:flex-end">
        <button class="btn-sm btn-sm-confirm" onclick="window._confirmMatch('${m.id}', true)">✓ Sì, conferma</button>
        <button class="btn-sm btn-sm-deny"    onclick="window._confirmMatch('${m.id}', false)">✗ No, rifiuta</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('pendingSection').innerHTML = `
    <div class="pending-banner">
      <h3>⏳ Partite da confermare (${toConfirm.length})</h3>
      ${items}
    </div>`;
}

export async function confirmMatch(matchId, confirm) {
  if (confirm) {
    const [m]  = await get('matches', `id=eq.${matchId}&select=*`);
    const [p1] = await get('players', `id=eq.${m.player1_id}&select=*`);
    const [p2] = await get('players', `id=eq.${m.player2_id}&select=*`);

    const winnerIsP1 = m.winner_id === m.player1_id;
    const { newEloA, newEloB, deltaA, deltaB } = calcElo(p1.elo, p2.elo, p1.partite_giocate, p2.partite_giocate, winnerIsP1);

    await Promise.all([
      patch('players', `id=eq.${p1.id}`, {
        elo: newEloA, partite_giocate: p1.partite_giocate + 1,
        vinte: p1.vinte + (winnerIsP1 ? 1 : 0), perse: p1.perse + (winnerIsP1 ? 0 : 1)
      }),
      patch('players', `id=eq.${p2.id}`, {
        elo: newEloB, partite_giocate: p2.partite_giocate + 1,
        vinte: p2.vinte + (winnerIsP1 ? 0 : 1), perse: p2.perse + (winnerIsP1 ? 1 : 0)
      }),
      patch('matches', `id=eq.${matchId}`, { confermata: true }),
      post('elo_history', { player_id: p1.id, elo: newEloA, match_id: matchId }),
      post('elo_history', { player_id: p2.id, elo: newEloB, match_id: matchId })
    ]);

    const winnerId    = m.winner_id;
    const loserId     = winnerId === m.player1_id ? m.player2_id : m.player1_id;
    const winnerDelta = winnerId === p1.id ? deltaA : deltaB;
    const loserDelta  = loserId  === p1.id ? deltaA : deltaB;

    if (winnerId !== state.currentUser?.id) {
      await sendPushNotification({
        playerIds: [winnerId], title: '🏆 Vittoria confermata!',
        body: `Il risultato è stato confermato. Elo: +${winnerDelta}`,
        tag: 'match-confirmed', url: '/'
      });
    }
    if (loserId !== state.currentUser?.id) {
      await sendPushNotification({
        playerIds: [loserId], title: '🏓 Partita confermata',
        body: `Il risultato è stato confermato. Elo: ${loserDelta}`,
        tag: 'match-confirmed', url: '/'
      });
    }

    await addFeedEvent({
      tipo: 'match_confirmed', player1_id: winnerId, player2_id: loserId,
      metadata: { score: `${m.punteggio1}-${m.punteggio2}`, elo_delta: winnerDelta }
    });

    const myDelta = state.currentUser?.id === p1.id ? deltaA : deltaB;
    const sign    = myDelta >= 0 ? '+' : '';
    toast(`Partita confermata! Elo: ${sign}${myDelta} → ${state.currentUser?.id === p1.id ? newEloA : newEloB}`);
  } else {
    await del('matches', `id=eq.${matchId}`);
    toast('Partita rifiutata e rimossa.');
  }

  await loadPartite();
  await loadRanking();
}

export async function submitMatch(p1Id, p2Id, s1, s2) {
  if (!isValidScore(s1, s2)) return toast('Punteggio non valido (21 con +2 in caso di parità)', 'error');

  const isAdmin = state.currentUser.ruolo === 'admin';
  if (!isAdmin && state.currentUser.id !== p1Id && state.currentUser.id !== p2Id) {
    return toast('Puoi registrare solo partite in cui sei coinvolto', 'error');
  }

  const winnerId = s1 > s2 ? p1Id : p2Id;

  await post('matches', {
    player1_id: p1Id, player2_id: p2Id,
    punteggio1: s1,   punteggio2: s2,
    winner_id:  winnerId,
    registrata_da: state.currentUser.id,
    confermata: isAdmin,
    tipo: 'libera'
  });

  if (isAdmin) {
    const [p1] = await get('players', `id=eq.${p1Id}&select=*`);
    const [p2] = await get('players', `id=eq.${p2Id}&select=*`);
    const winnerIsP1 = winnerId === p1Id;
    const { newEloA, newEloB } = calcElo(p1.elo, p2.elo, p1.partite_giocate, p2.partite_giocate, winnerIsP1);

    await Promise.all([
      patch('players', `id=eq.${p1Id}`, { elo: newEloA, partite_giocate: p1.partite_giocate+1, vinte: p1.vinte+(winnerIsP1?1:0), perse: p1.perse+(winnerIsP1?0:1) }),
      patch('players', `id=eq.${p2Id}`, { elo: newEloB, partite_giocate: p2.partite_giocate+1, vinte: p2.vinte+(winnerIsP1?0:1), perse: p2.perse+(winnerIsP1?1:0) })
    ]);

    toast('Partita registrata e Elo aggiornato!');
  } else {
    toast("Partita inviata! In attesa di conferma dell'avversario.");
  }

  await loadPartite();
  await loadRanking();
}

export async function loadMatchHistory(filterMine = false) {
  const query = filterMine && state.currentUser
    ? `or=(player1_id.eq.${state.currentUser.id},player2_id.eq.${state.currentUser.id})&order=data.desc&limit=50&select=*`
    : 'order=data.desc&limit=50&select=*';

  const matches = await get('matches', query);
  if (state.allPlayers.length === 0) {
    state.allPlayers = await get('players', 'select=*');
  }

  const filterBar = state.currentUser ? `
    <div style="display:flex;gap:6px;margin-bottom:12px;background:var(--surface2);border-radius:10px;padding:4px">
      <button onclick="window._loadMatchHistory(false)"
        style="flex:1;border:none;border-radius:8px;padding:7px;font-family:var(--font-body);font-size:12px;font-weight:700;cursor:pointer;
               background:${!filterMine ? 'var(--accent)' : 'transparent'};color:${!filterMine ? '#0d1117' : 'var(--text2)'}">
        Tutte
      </button>
      <button onclick="window._loadMatchHistory(true)"
        style="flex:1;border:none;border-radius:8px;padding:7px;font-family:var(--font-body);font-size:12px;font-weight:700;cursor:pointer;
               background:${filterMine ? 'var(--accent)' : 'transparent'};color:${filterMine ? '#0d1117' : 'var(--text2)'}">
        Le mie
      </button>
    </div>` : '';

  if (matches.length === 0) {
    document.getElementById('matchHistory').innerHTML = filterBar +
      '<div class="empty"><div class="icon">🏓</div><p>Nessuna partita ancora</p></div>';
    return;
  }

  document.getElementById('matchHistory').innerHTML = filterBar + matches.map(m => {
    const p1       = state.allPlayers.find(p => p.id === m.player1_id);
    const p2       = state.allPlayers.find(p => p.id === m.player2_id);
    const score    = m.punteggio1 != null ? `${m.punteggio1}-${m.punteggio2}` : '';
    const isAdmin  = state.currentUser?.ruolo === 'admin';
    const isInvolved = state.currentUser && (state.currentUser.id === m.player1_id || state.currentUser.id === m.player2_id);
    const canAddScore = m.punteggio1 == null && (isAdmin || isInvolved);

    return `<div class="match-item">
      <div class="match-item-top">
        <div class="match-players">
          <span class="${m.winner_id === m.player1_id ? 'match-winner' : 'match-loser'}">${p1?.nome || '?'}</span>
          <span class="match-vs">vs</span>
          <span class="${m.winner_id === m.player2_id ? 'match-winner' : 'match-loser'}">${p2?.nome || '?'}</span>
        </div>
        ${score ? `<span class="match-score">${score}</span>` : ''}
      </div>
      <div class="match-item-bottom">
        ${canAddScore ? `<button class="btn-sm btn-sm-confirm" onclick="window._addScoreToMatch('${m.id}','${m.player1_id}','${m.player2_id}','${p1?.nome||'P1'}','${p2?.nome||'P2'}')">+ Score</button>` : ''}
        <span class="badge ${m.tipo === 'torneo' ? 'badge-torneo' : 'badge-libera'}">${m.tipo}</span>
        ${!m.confermata ? '<span class="badge badge-pending">In attesa</span>' : ''}
        <span class="match-date">${new Date(m.data).toLocaleDateString('it')}</span>
      </div>
    </div>`;
  }).join('');
}

export function addScoreToMatch(matchId, p1Id, p2Id, p1Name, p2Name) {
  scoreInputModal({
    p1Name, p2Name,
    validate: isValidScore,
    onSave: async (s1, s2) => {
      const winnerId = s1 > s2 ? p1Id : p2Id;
      await patch('matches', `id=eq.${matchId}`, { punteggio1: s1, punteggio2: s2, winner_id: winnerId });
      toast('Punteggio aggiunto!');
      await loadPartite();
    }
  });
}
