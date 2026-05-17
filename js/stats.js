import { get } from './api.js';
import { state } from './state.js';
import { renderTorneoTabellone } from './tornei.js';

// =============================================
// ALBO D'ORO
// =============================================

export async function loadStats() {
  document.getElementById('statsContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [tornei, players, matches] = await Promise.all([
    get('tournaments', 'stato=eq.chiuso&order=data_inizio.desc&select=*'),
    get('players', 'select=*'),
    get('matches', 'confermata=eq.true&select=*')
  ]);

  let html = '';

  // ---- ALBO D'ORO ----
  if (tornei.length === 0) {
    html += `<div class="empty" style="margin-bottom:24px">
      <div class="icon">🏆</div>
      <p>Nessun torneo concluso ancora</p>
    </div>`;
  } else {
    html += `<div class="albo-grid">`;

    for (const t of tornei) {
      // Trova il vincitore dal match finale
      const finaleMatch = matches.find(m =>
        m.torneo_id === t.id && m.girone?.startsWith('finale') && m.confermata && m.winner_id
      );
      const vincitore = finaleMatch ? players.find(p => p.id === finaleMatch.winner_id) : null;

      const tipoEmoji = { amichevole: '🟢', importante: '🔵', stagionale: '🟡' }[t.tipo] || '🏅';
      const tipoColor = { amichevole: '#4ade80', importante: '#60a5fa', stagionale: 'var(--gold)' }[t.tipo] || 'var(--gold)';
      const anno = new Date(t.data_inizio).getFullYear();

      html += `
      <div class="albo-card" onclick="window._openTrofeo('${t.id}')" title="Vedi tabellone">
        <div class="albo-trophy-wrap">
          <div class="albo-trophy">🏆</div>
          <div class="albo-tipo-dot" style="background:${tipoColor}">${tipoEmoji}</div>
        </div>
        <div class="albo-torneo-nome">${t.nome}</div>
        <div class="albo-anno">${anno}</div>
        <div class="albo-vincitore">
          ${vincitore
            ? `<span class="albo-crown">👑</span><span class="albo-vincitore-nome">${vincitore.nome}</span>`
            : `<span style="color:var(--text2);font-size:12px">—</span>`
          }
        </div>
        <div class="albo-cta">Tabellone →</div>
      </div>`;
    }

    html += `</div>`;
  }

  // ---- STATISTICHE GLOBALI (sezione secondaria) ----
  if (players.length >= 2) {
    html += `<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:1.5px;margin:28px 0 12px;display:flex;align-items:center;gap:8px">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      Curiosità
    </div>`;

    // Giocatore più in forma (ultimi 10 match)
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

    // Rivalità più accesa
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
      rivalryHtml = `${n1} vs ${n2} <span style="color:var(--text2);font-size:11px">(${topPair[1]} partite)</span>`;
    }

    // Scalata più veloce
    const eloGains = players.map(p => ({ nome: p.nome, id: p.id, gain: p.elo - 1000 }))
      .sort((a, b) => b.gain - a.gain);
    const topGain = eloGains[0];

    const myId = state.currentUser?.id;
    const tag = (nome, pid) => pid === myId
      ? `${nome} <span style="color:var(--accent);font-size:11px;font-family:var(--font-mono)">(tu)</span>`
      : nome;

    html += `
    <div class="global-stat">
      <div class="icon">🔥</div>
      <div class="info">
        <div class="label">Più in forma</div>
        <div class="value">${bestFormPlayer ? tag(bestFormPlayer.nome, bestFormPlayer.id) : '—'}</div>
        <div class="sub">${bestForm ? `${bestForm.v}/${bestForm.tot} negli ultimi match (${Math.round(bestFormPct*100)}%)` : 'Servono almeno 3 partite'}</div>
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
        <div class="value">${topGain ? tag(topGain.nome, topGain.id) : '—'}</div>
        <div class="sub">${topGain?.gain > 0 ? '+' + topGain.gain + " Elo dall'inizio" : 'Ancora nessuna partita'}</div>
      </div>
    </div>`;
  }

  document.getElementById('statsContent').innerHTML = html;
}

// =============================================
// MODAL TABELLONE TROFEO
// =============================================

export async function openTrofeo(torneoId) {
  const modal = document.getElementById('trofeoModal');
  const body  = document.getElementById('trofeoModalBody');
  modal.style.display = 'flex';
  body.innerHTML = '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  try {
    const html = await renderTorneoTabellone(torneoId);
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div class="empty"><p>Errore nel caricamento del tabellone</p></div>';
  }
}

export function closeTrofeoModal() {
  document.getElementById('trofeoModal').style.display = 'none';
}
