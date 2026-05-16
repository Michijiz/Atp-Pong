import { get } from './api.js';
import { state } from './state.js';

// =============================================
// STATISTICHE GLOBALI
// =============================================

export async function loadStats() {
  document.getElementById('statsContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [players, matches] = await Promise.all([
    get('players', 'select=*'),
    get('matches', 'confermata=eq.true&select=*')
  ]);

  if (players.length < 2) {
    document.getElementById('statsContent').innerHTML =
      '<div class="empty"><div class="icon">📊</div><p>Servono almeno 2 giocatori per le statistiche</p></div>';
    return;
  }

  // 1. Giocatore più in forma (ultimi 10 match)
  const recentByPlayer = {};
  const sorted = [...matches].sort((a, b) => new Date(b.data) - new Date(a.data));
  for (const m of sorted) {
    [m.player1_id, m.player2_id].forEach(pid => {
      if (!recentByPlayer[pid]) recentByPlayer[pid] = { v: 0, tot: 0 };
      if (recentByPlayer[pid].tot < 10) {
        recentByPlayer[pid].tot++;
        if (m.winner_id === pid) recentByPlayer[pid].v++;
      }
    });
  }

  let bestForm = null, bestFormPct = -1;
  Object.entries(recentByPlayer).forEach(([pid, rec]) => {
    if (rec.tot >= 3) {
      const pct = rec.v / rec.tot;
      if (pct > bestFormPct) { bestFormPct = pct; bestForm = { pid, ...rec }; }
    }
  });
  const bestFormPlayer = bestForm ? players.find(p => p.id === bestForm.pid) : null;

  // 2. Rivalità più accesa
  const pairs = {};
  matches.forEach(m => {
    const key = [m.player1_id, m.player2_id].sort().join('_');
    pairs[key] = (pairs[key] || 0) + 1;
  });
  const topPair = Object.entries(pairs).sort((a, b) => b[1] - a[1])[0];
  let rivalryHtml = '—';
  if (topPair) {
    const [id1, id2] = topPair[0].split('_');
    const n1 = players.find(p => p.id === id1)?.nome || '?';
    const n2 = players.find(p => p.id === id2)?.nome || '?';
    rivalryHtml = `${n1} vs ${n2} (${topPair[1]} partite)`;
  }

  // 3. Scalata più veloce
  const eloGains = players
    .map(p => ({ nome: p.nome, gain: p.elo - 1000 }))
    .sort((a, b) => b.gain - a.gain);
  const topGain = eloGains[0];

  const myId = state.currentUser?.id;

  // Helper: aggiunge "(tu)" se è il currentUser
  const tag = (nome, playerId) =>
    playerId === myId
      ? `${nome} <span style="color:var(--accent);font-size:11px;font-family:var(--font-mono)">(tu)</span>`
      : nome;

  document.getElementById('statsContent').innerHTML = `
    <div class="global-stat">
      <div class="icon">🔥</div>
      <div class="info">
        <div class="label">Giocatore più in forma</div>
        <div class="value">${bestFormPlayer ? tag(bestFormPlayer.nome, bestFormPlayer.id) : '—'}</div>
        <div class="sub">${bestForm
          ? `${bestForm.v}/${bestForm.tot} negli ultimi match (${Math.round(bestFormPct*100)}%)`
          : 'Servono almeno 3 partite'}</div>
      </div>
    </div>
    <div class="global-stat">
      <div class="icon">⚔️</div>
      <div class="info">
        <div class="label">Rivalità più accesa</div>
        <div class="value">${rivalryHtml}</div>
        <div class="sub">La coppia che si è sfidato di più</div>
      </div>
    </div>
    <div class="global-stat">
      <div class="icon">📈</div>
      <div class="info">
        <div class="label">Scalata più veloce</div>
        <div class="value">${topGain ? tag(topGain.nome, players.find(p => p.nome === topGain.nome)?.id) : '—'}</div>
        <div class="sub">${topGain?.gain > 0 ? '+' + topGain.gain + " Elo dall'inizio" : 'Ancora nessuna partita'}</div>
      </div>
    </div>`;
}
