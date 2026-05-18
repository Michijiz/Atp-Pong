import { get, post, patch } from './api.js';
import { state } from './state.js';
import { toast, openModal, closeModal, confirmDialog } from './ui.js';
import { avatarEl } from './avatar.js';
import { getKFactor } from './elo.js';
import { isValidScore } from './elo.js';
import { TORNEO_CONFIG } from './config.js';
import { loadRanking } from './ranking.js';
import { openScorekeeper } from './Scorekeeper.js';
import { sendPushNotification } from './push.js';

// =============================================
// STATO LOCALE TORNEI
// =============================================
let currentTorneo       = null;
let _torneoMatchPending = null;

// =============================================
// NAVIGAZIONE TORNEI
// =============================================

export function backToTornei() {
  document.getElementById('torneoDetail').style.display = 'none';
  document.getElementById('torneiList').style.display   = 'block';
  currentTorneo = null;
}

export async function loadTornei() {
  document.getElementById('torneoDetail').style.display = 'none';
  document.getElementById('torneiList').style.display   = 'block';

  const isAdmin = state.currentUser?.ruolo === 'admin';
  let html = `<div class="section-title">🏅 <span>Tornei</span></div>`;

  if (isAdmin) {
    html += `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Crea Torneo</div>
      <div class="form-group">
        <label class="form-label">Nome Torneo</label>
        <input type="text" class="form-input" id="t_nome" placeholder="Es. Torneo di Natale">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-select" id="t_tipo">
          <option value="amichevole">🟢 Amichevole — x1 Elo | Vincitore +50pts</option>
          <option value="importante">🔵 Importante — x1.5 Elo | Vincitore +120pts</option>
          <option value="stagionale">🟡 Stagionale — x2 Elo | Vincitore +200pts</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="window._creaTorneo()">Crea Torneo</button>
    </div>`;
  }

  const tornei = await get('tournaments', 'order=data_inizio.desc&select=*');

  if (tornei.length === 0) {
    html += `<div class="empty"><div class="icon">🏅</div><p>Nessun torneo ancora${isAdmin ? ' — creane uno!' : ''}</p></div>`;
  } else {
    // Singola query per tutti i partecipanti — evita N+1
    const allTorneoPlayers = tornei.length > 0
      ? await get('tournament_players', `torneo_id=in.(${tornei.map(t => t.id).join(',')})&select=torneo_id,player_id`)
      : [];
    const countByTorneo = {};
    allTorneoPlayers.forEach(tp => {
      countByTorneo[tp.torneo_id] = (countByTorneo[tp.torneo_id] || 0) + 1;
    });

    for (const t of tornei) {
      const tipoClass    = `tipo-${t.tipo}`;
      const statoLabel   = t.stato === 'in_corso' ? '🟢 In corso' : '✅ Chiuso';
      const nPartecipanti = countByTorneo[t.id] || 0;
      html += `
      <div class="torneo-card" onclick="window._openTorneo('${t.id}')">
        <div class="torneo-card-header">
          <div class="torneo-nome">${t.nome}</div>
          <span class="torneo-tipo-badge ${tipoClass}">${t.tipo}</span>
        </div>
        <div class="torneo-meta">
          <span>${statoLabel}</span>
          <span>👥 ${nPartecipanti} giocatori</span>
          <span>📅 ${new Date(t.data_inizio).toLocaleDateString('it')}</span>
          <span>Fase: ${t.fase}</span>
        </div>
      </div>`;
    }
  }

  document.getElementById('torneiList').innerHTML = html;
}

export async function creaTorneo() {
  const nome = document.getElementById('t_nome').value.trim();
  const tipo = document.getElementById('t_tipo').value;
  if (!nome) return toast('Inserisci il nome del torneo', 'error');

  const t = await post('tournaments', {
    nome, tipo, stato: 'in_corso', fase: 'girone', creato_da: state.currentUser.id
  });

  toast(`Torneo "${nome}" creato!`);
  openTorneo(t[0].id);
}

export async function openTorneo(torneoId) {
  document.getElementById('torneiList').style.display   = 'none';
  document.getElementById('torneoDetail').style.display = 'block';
  document.getElementById('torneoDetailContent').innerHTML =
    '<div class="loading"><div class="spinner"></div> Caricamento...</div>';

  const [torneo] = await get('tournaments', `id=eq.${torneoId}&select=*`);
  currentTorneo  = torneo;
  await renderTorneo();
}

// =============================================
// RENDER TORNEO PRINCIPALE
// =============================================

async function renderTorneo() {
  const t       = currentTorneo;
  const isAdmin = state.currentUser?.ruolo === 'admin';
  const cfg     = TORNEO_CONFIG[t.tipo];

  const [tPlayers, allMatches] = await Promise.all([
    get('tournament_players', `torneo_id=eq.${t.id}&select=*`),
    get('matches', `torneo_id=eq.${t.id}&select=*`)
  ]);

  if (state.allPlayers.length === 0) {
    state.allPlayers = await get('players', 'select=*');
  }

  const tipoClass = `tipo-${t.tipo}`;

  let html = `
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">
    <div>
      <div style="font-family:var(--font-display);font-size:32px;letter-spacing:2px">${t.nome}</div>
      <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap">
        <span class="torneo-tipo-badge ${tipoClass}">${t.tipo}</span>
        <span class="pill">Fase: <strong>${t.fase}</strong></span>
        <span class="pill">Stato: <strong>${t.stato === 'in_corso' ? '🟢 In corso' : '✅ Chiuso'}</strong></span>
        <span class="pill">Molt. Elo: <strong>x${cfg.moltiplicatore}</strong></span>
      </div>
    </div>
    ${isAdmin && t.stato === 'in_corso'
      ? `<button class="btn btn-danger" style="width:auto;padding:8px 16px;font-size:13px" onclick="window._chiudiTorneo()">Chiudi Torneo</button>`
      : ''}
  </div>`;

  // ---- SEZIONE GIRONI (sempre visibile se esistono dati) ----
  const iscritto = tPlayers.find(tp => tp.player_id === state.currentUser?.id);
  if (t.fase === 'girone' && state.currentUser && !iscritto && t.stato === 'in_corso') {
    html += `<div class="card" style="margin-bottom:16px">
      <button class="btn btn-primary" onclick="window._iscrivitiTorneo('${t.id}')">🎾 Iscriviti al Torneo</button>
    </div>`;
  }

  if (tPlayers.length === 0 && t.fase === 'girone') {
    html += `<div class="empty"><div class="icon">👥</div><p>Nessun iscritto ancora</p></div>`;
    document.getElementById('torneoDetailContent').innerHTML = html;
    return;
  }

  const gironi = {};
  tPlayers.forEach(tp => {
    const g = tp.girone || 'A';
    if (!gironi[g]) gironi[g] = [];
    gironi[g].push(tp);
  });

  const hasGironi = tPlayers.some(tp => tp.girone);

  // Se siamo in fase finale o chiuso, i gironi diventano una sezione collassabile
  const inFaseFinale = t.fase === 'finale' || t.stato === 'chiuso';

  if (!hasGironi && t.fase === 'girone') {
    // Nessun girone generato ancora — lista iscritti visibile a tutti
    html += `<div class="card" style="margin-bottom:16px">
      <div class="card-title">Iscritti (${tPlayers.length})</div>
      ${tPlayers.map(tp => {
        const p = state.allPlayers.find(p => p.id === tp.player_id);
        return `<div class="match-item"><div class="match-players">${avatarEl(p?.nome||'?')} <span>${p?.nome||'?'}</span></div></div>`;
      }).join('')}
      ${isAdmin && t.stato === 'in_corso' ? (tPlayers.length >= 4
        ? `<button class="btn btn-primary" style="margin-top:12px" onclick="window._generaGironi('${t.id}')">⚡ Genera Gironi</button>`
        : `<p style="color:var(--text2);font-size:13px;margin-top:12px">Servono almeno 4 giocatori per generare i gironi</p>`) : ''}
    </div>`;
  } else if (hasGironi) {
    // Render gironi — collassabili se siamo in fase finale
    if (inFaseFinale) {
      html += `
      <div style="margin-bottom:16px">
        <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.textContent.includes('▼')?'▶ Fase a Gironi':'▼ Fase a Gironi'"
          style="display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--border);color:var(--text2);font-size:13px;cursor:pointer;padding:8px 14px;border-radius:var(--radius);letter-spacing:0.5px;width:100%">
          ▶ Fase a Gironi
        </button>
        <div style="display:none">`;
    }

    const spareggiBanner = await getSpareggiPendenti(t.id, allMatches);
    if (spareggiBanner) html += spareggiBanner;

    for (const [gNome, gPlayers] of Object.entries(gironi).sort()) {
      // Includi TUTTI i match del girone (confermati e non) per mostrare lo stato corretto
      const gMatchesAll = allMatches.filter(m => m.girone === gNome);
      const gMatchesOk  = gMatchesAll.filter(m => m.confermata);
      const standings   = calcolaStandingsGirone(gPlayers, gMatchesOk);
      const nQualificati = 2;

      html += `<div class="card" style="margin-bottom:16px">
        <div class="girone-title">Girone ${gNome}</div>
        <table class="girone-table">
          <thead><tr>
            <th>#</th><th>Giocatore</th><th>V</th><th>S</th><th>Pts</th><th>+/-</th>
          </tr></thead>
          <tbody>
            ${standings.map((s, i) => {
              const p           = state.allPlayers.find(p => p.id === s.player_id);
              const qualificato = i < nQualificati;
              return `<tr class="${qualificato ? 'qualificato' : ''}">
                <td style="font-family:var(--font-mono);color:${qualificato ? 'var(--accent)' : 'var(--text2)'}">${i+1}</td>
                <td><div style="display:flex;align-items:center;gap:8px">${avatarEl(p?.nome||'?',24)} ${p?.nome||'?'}</div></td>
                <td style="color:var(--accent);font-family:var(--font-mono)">${s.vinte}</td>
                <td style="color:var(--accent2);font-family:var(--font-mono)">${s.perse}</td>
                <td style="font-family:var(--font-mono);font-weight:700">${s.punti}</td>
                <td style="font-family:var(--font-mono);color:var(--text2)">${s.pti_fatti}-${s.pti_subiti}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Partite</div>
        ${renderPartitiGirone(gPlayers, gMatchesAll, t, isAdmin)}
      </div>`;
    }

    if (isAdmin && t.stato === 'in_corso' && t.fase === 'girone') {
      const totaleMatch        = calcolaTotaleMatchGirone(tPlayers, Object.keys(gironi).length);
      const matchCompletati    = allMatches.filter(m => m.tipo === 'torneo' && m.confermata && m.girone && !m.girone.includes('_spareggio')).length;
      const spareggiosPendenti = allMatches.filter(m => m.girone?.includes('_spareggio') && !m.confermata).length;

      if (matchCompletati >= totaleMatch && spareggiosPendenti === 0) {
        html += `<div class="card" style="border-color:var(--accent)">
          <div class="card-title" style="color:var(--accent)">⚡ Gironi completati!</div>
          <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Tutti i match sono stati giocati. Puoi avanzare alla fase finale.</p>
          <button class="btn btn-primary" onclick="window._avanzaAFinale('${t.id}')">Genera Fase Finale →</button>
        </div>`;
      }
    }

    if (inFaseFinale) {
      html += `</div></div>`; // chiude il collapsible
    }
  }

  // ---- FASE FINALE ----
  if (t.fase === 'finale' || (t.stato === 'chiuso' && allMatches.some(m => m.girone?.match(/^(quarti|semifinale|finale)/)))) {
    const brackMatches = allMatches.filter(m => !m.girone || !m.girone.includes('_spareggio'));
    html += renderBracket(brackMatches, t, isAdmin);
  }

  document.getElementById('torneoDetailContent').innerHTML = html;
}

// =============================================
// ISCRIZIONE
// =============================================

export async function iscrivitiTorneo(torneoId) {
  const existing = await get('tournament_players', `torneo_id=eq.${torneoId}&player_id=eq.${state.currentUser.id}`);
  if (existing.length > 0) return toast('Sei già iscritto', 'error');

  await post('tournament_players', { torneo_id: torneoId, player_id: state.currentUser.id });
  toast('Iscrizione effettuata!');
  await renderTorneo();
}

// =============================================
// GENERA GIRONI
// =============================================

export async function generaGironi(torneoId) {
  const tPlayers = await get('tournament_players', `torneo_id=eq.${torneoId}&select=*`);
  if (state.allPlayers.length === 0) state.allPlayers = await get('players', 'select=*');

  const n = tPlayers.length;
  let nGironi = n <= 8 ? 2 : n <= 12 ? Math.ceil(n / 4) : 4;

  const seeded = tPlayers.map(tp => ({
    ...tp,
    elo: state.allPlayers.find(p => p.id === tp.player_id)?.elo || 1000
  })).sort((a, b) => b.elo - a.elo);

  const giorniNomi = 'ABCDEFGH'.slice(0, nGironi).split('');
  const assegnazioni = {};
  seeded.forEach((tp, i) => {
    const round = Math.floor(i / nGironi);
    const pos   = round % 2 === 0 ? i % nGironi : nGironi - 1 - (i % nGironi);
    assegnazioni[tp.player_id] = giorniNomi[pos];
  });

  await Promise.all(seeded.map(tp =>
    patch('tournament_players', `id=eq.${tp.id}`, { girone: assegnazioni[tp.player_id] })
  ));

  toast('Gironi generati!');
  await renderTorneo();
}

// =============================================
// STANDINGS GIRONE
// =============================================

function calcolaStandingsGirone(gPlayers, gMatches) {
  const stats = {};
  gPlayers.forEach(tp => {
    stats[tp.player_id] = { player_id: tp.player_id, vinte: 0, perse: 0, punti: 0, pti_fatti: 0, pti_subiti: 0 };
  });

  gMatches.forEach(m => {
    if (!stats[m.player1_id] || !stats[m.player2_id]) return;
    const winnerIsP1 = m.winner_id === m.player1_id;
    stats[m.player1_id].pti_fatti   += m.punteggio1 || 0;
    stats[m.player1_id].pti_subiti  += m.punteggio2 || 0;
    stats[m.player2_id].pti_fatti   += m.punteggio2 || 0;
    stats[m.player2_id].pti_subiti  += m.punteggio1 || 0;
    if (winnerIsP1) {
      stats[m.player1_id].vinte++;
      stats[m.player1_id].punti += 3;
      stats[m.player2_id].perse++;
    } else {
      stats[m.player2_id].vinte++;
      stats[m.player2_id].punti += 3;
      stats[m.player1_id].perse++;
    }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.punti !== a.punti) return b.punti - a.punti;
    const sd = gMatches.find(m =>
      (m.player1_id === a.player_id && m.player2_id === b.player_id) ||
      (m.player1_id === b.player_id && m.player2_id === a.player_id)
    );
    if (sd) return sd.winner_id === b.player_id ? 1 : -1;
    return (b.pti_fatti - b.pti_subiti) - (a.pti_fatti - a.pti_subiti);
  });
}

function calcolaTotaleMatchGirone(tPlayers, nGironi) {
  const perGirone = Math.ceil(tPlayers.length / nGironi);
  return nGironi * (perGirone * (perGirone - 1) / 2);
}

// =============================================
// RENDER PARTITE GIRONE
// =============================================

function renderPartitiGirone(gPlayers, gMatchesAll, torneo, isAdmin) {
  const playerIds = gPlayers.map(tp => tp.player_id);
  const coppie    = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      coppie.push([playerIds[i], playerIds[j]]);
    }
  }

  return coppie.map(([p1id, p2id]) => {
    const p1    = state.allPlayers.find(p => p.id === p1id);
    const p2    = state.allPlayers.find(p => p.id === p2id);
    const match = gMatchesAll.find(m =>
      (m.player1_id === p1id && m.player2_id === p2id) ||
      (m.player1_id === p2id && m.player2_id === p1id)
    );

    const isMyMatch   = state.currentUser && (state.currentUser.id === p1id || state.currentUser.id === p2id || isAdmin);
    const canRegister = isMyMatch && torneo.stato === 'in_corso';

    if (!match) {
      return `<div class="torneo-match-item pending">
        <div class="torneo-match-player">${avatarEl(p1?.nome||'?',22)} <span>${p1?.nome||'?'}</span></div>
        <div style="text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">vs</div>
          ${canRegister ? `<button class="btn-sm btn-sm-confirm" onclick="window._openRegistraMatchTorneo('${torneo.id}','${p1id}','${p2id}','${gPlayers[0].girone}')">Registra</button>` : ''}
        </div>
        <div class="torneo-match-player right">${avatarEl(p2?.nome||'?',22)} <span>${p2?.nome||'?'}</span></div>
      </div>`;
    }

    const s1 = match.player1_id === p1id ? match.punteggio1 : match.punteggio2;
    const s2 = match.player1_id === p1id ? match.punteggio2 : match.punteggio1;
    const w1 = match.winner_id === p1id;
    const w2 = match.winner_id === p2id;

    if (!match.confermata) {
      const canConfirm = isAdmin ||
        (state.currentUser &&
         state.currentUser.id !== match.registrata_da &&
         (state.currentUser.id === p1id || state.currentUser.id === p2id));
      return `<div class="torneo-match-item pending" style="opacity:0.85">
        <div class="torneo-match-player" style="color:var(--text2)">${avatarEl(p1?.nome||'?',22)} <span>${p1?.nome||'?'}</span></div>
        <div style="text-align:center">
          <div class="torneo-match-score-big" style="color:var(--text2)">${s1 ?? '?'} — ${s2 ?? '?'}</div>
          ${canConfirm ? `<button class="btn-sm btn-sm-confirm" style="margin-top:5px" onclick="window._confirmTorneoMatch('${match.id}')">✓ Conferma</button>` : '<div style="font-size:10px;color:var(--gold);margin-top:3px">⏳ in attesa</div>'}
        </div>
        <div class="torneo-match-player right" style="color:var(--text2)">${avatarEl(p2?.nome||'?',22)} <span>${p2?.nome||'?'}</span></div>
      </div>`;
    }

    return `<div class="torneo-match-item">
      <div class="torneo-match-player">${avatarEl(p1?.nome||'?',26)} <span class="${w1 ? 'torneo-match-winner' : 'torneo-match-loser'}">${p1?.nome||'?'}</span></div>
      <div class="torneo-match-score-big">${s1} — ${s2}</div>
      <div class="torneo-match-player right">${avatarEl(p2?.nome||'?',26)} <span class="${w2 ? 'torneo-match-winner' : 'torneo-match-loser'}">${p2?.nome||'?'}</span></div>
    </div>`;
  }).join('');
}

// =============================================
// REGISTRA MATCH TORNEO — via Scorekeeper
// =============================================

export function openRegistraMatchTorneo(torneoId, p1id, p2id, girone) {
  const p1 = state.allPlayers.find(p => p.id === p1id);
  const p2 = state.allPlayers.find(p => p.id === p2id);
  _torneoMatchPending = { torneoId, p1id, p2id, girone };

  openScorekeeper({
    p1Name: p1?.nome || 'P1',
    p2Name: p2?.nome || 'P2',
    onConfirm: (s1, s2) => _doSubmitTorneoMatch(s1, s2),
    onCancel:  () => { _torneoMatchPending = null; }
  });
}

async function _doSubmitTorneoMatch(s1, s2) {
  if (!_torneoMatchPending) return;
  const { torneoId, p1id, p2id, girone } = _torneoMatchPending;

  if (!isValidScore(s1, s2)) return toast('Punteggio non valido (21 con +2)', 'error');

  // Guard: esiste già un match tra questi due giocatori specifici con un vincitore?
  const existing = await get('matches',
    `torneo_id=eq.${torneoId}&girone=eq.${girone}` +
    `&or=(and(player1_id.eq.${p1id},player2_id.eq.${p2id}),and(player1_id.eq.${p2id},player2_id.eq.${p1id}))` +
    `&select=id,winner_id`
  );
  if (existing && existing.some(m => m.winner_id)) {
    _torneoMatchPending = null;
    return toast('Partita già registrata per questo slot', 'error');
  }

  // Se esiste già il placeholder (winner_id null), aggiornalo — altrimenti crea nuovo
  const winnerId = s1 > s2 ? p1id : p2id;
  const isAdmin  = state.currentUser?.ruolo === 'admin';
  const avversarioId = state.currentUser.id === p1id ? p2id : p1id;

  const placeholder = existing?.[0];
  if (placeholder) {
    await patch('matches', `id=eq.${placeholder.id}`, {
      punteggio1: s1, punteggio2: s2,
      winner_id: winnerId,
      registrata_da: state.currentUser.id,
      confermata: isAdmin
    });
  } else {
    await post('matches', {
      player1_id: p1id, player2_id: p2id,
      punteggio1: s1,   punteggio2: s2,
      winner_id:  winnerId,
      registrata_da: state.currentUser.id,
      confermata: isAdmin,
      tipo: 'torneo', torneo_id: torneoId, girone
    });
  }

  if (isAdmin) {
    await applicaEloTorneo(p1id, p2id, winnerId, torneoId);
    // Auto-genera finale se siamo in semifinale e tutte sono concluse
    if (girone?.startsWith('semifinale')) {
      await _autoGeneraFinaleSePronta(torneoId);
    }
    toast('Partita registrata e Elo aggiornato!');
  } else {
    // Notifica push all'avversario come nelle partite libere
    await sendPushNotification({
      playerIds: [avversarioId],
      title:     '🏓 Risultato da confermare',
      body:      `${state.currentUser.nome} ha registrato il risultato del torneo. Conferma!`,
      tag:       'match-pending',
      url:       '/'
    });
    toast("Risultato inviato! L'avversario deve confermare.");
  }

  _torneoMatchPending = null;
  await renderTorneo();
}

// Tenuto per compatibilità con eventuali chiamate residue — non più usato
export function closeTorneoMatchModal() { _torneoMatchPending = null; }
export async function submitTorneoMatch() {}



export async function confirmTorneoMatch(matchId) {
  const [m] = await get('matches', `id=eq.${matchId}&select=*`);

  const isAdmin    = state.currentUser?.ruolo === 'admin';
  const isOpponent = state.currentUser?.id !== m.registrata_da &&
    (state.currentUser?.id === m.player1_id || state.currentUser?.id === m.player2_id);

  if (!isAdmin && !isOpponent) return toast('Solo il tuo avversario può confermare', 'error');

  await patch('matches', `id=eq.${matchId}`, { confermata: true });
  await applicaEloTorneo(m.player1_id, m.player2_id, m.winner_id, m.torneo_id);
  toast('Partita confermata! Elo aggiornato.');

  // Auto-genera la finale se tutte le semifinali sono concluse
  if (m.girone?.startsWith('semifinale')) {
    await _autoGeneraFinaleSePronta(m.torneo_id);
  }

  await renderTorneo();
}

async function _autoGeneraFinaleSePronta(torneoId) {
  const allMatches = await get('matches', `torneo_id=eq.${torneoId}&select=*`);

  // Finale già esistente? Skip
  if (allMatches.some(m => m.girone?.startsWith('finale'))) return;

  const semis = allMatches.filter(m => m.girone?.startsWith('semifinale'));
  if (semis.length === 0) return;

  const tutteConfermate = semis.every(m => m.confermata);
  if (!tutteConfermate) return;

  const vincitori = semis.map(m => m.winner_id).filter(Boolean);
  if (vincitori.length < 2) return;

  await post('matches', {
    player1_id: vincitori[0], player2_id: vincitori[1],
    winner_id: null, registrata_da: state.currentUser.id,
    confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: 'finale_1'
  });

  toast('🏆 Finale generata automaticamente!');
}

async function applicaEloTorneo(p1id, p2id, winnerId, torneoId) {
  const [torneo] = await get('tournaments', `id=eq.${torneoId}&select=tipo`);
  const molt     = TORNEO_CONFIG[torneo.tipo].moltiplicatore;
  const [p1]     = await get('players', `id=eq.${p1id}&select=*`);
  const [p2]     = await get('players', `id=eq.${p2id}&select=*`);
  const winnerIsP1 = winnerId === p1id;
  const KA = Math.round(getKFactor(p1.partite_giocate) * molt);
  const KB = Math.round(getKFactor(p2.partite_giocate) * molt);
  const EA = 1 / (1 + Math.pow(10, (p2.elo - p1.elo) / 400));
  const newEloA = Math.round(p1.elo + KA * ((winnerIsP1 ? 1 : 0) - EA));
  const newEloB = Math.round(p2.elo + KB * ((winnerIsP1 ? 0 : 1) - (1 - EA)));

  await Promise.all([
    patch('players', `id=eq.${p1id}`, {
      elo: newEloA, partite_giocate: p1.partite_giocate+1,
      vinte: p1.vinte+(winnerIsP1?1:0), perse: p1.perse+(winnerIsP1?0:1)
    }),
    patch('players', `id=eq.${p2id}`, {
      elo: newEloB, partite_giocate: p2.partite_giocate+1,
      vinte: p2.vinte+(winnerIsP1?0:1), perse: p2.perse+(winnerIsP1?1:0)
    })
  ]);
}

// =============================================
// SPAREGGI
// =============================================

async function getSpareggiPendenti(torneoId, allMatches) {
  const spareggi = allMatches.filter(m => m.girone?.includes('_spareggio') && !m.confermata);
  if (spareggi.length === 0) return null;

  const items = spareggi.map(m => {
    const p1       = state.allPlayers.find(p => p.id === m.player1_id);
    const p2       = state.allPlayers.find(p => p.id === m.player2_id);
    const isMyMatch = state.currentUser && (state.currentUser.id === m.player1_id || state.currentUser.id === m.player2_id || state.currentUser.ruolo === 'admin');
    return `<div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <span><strong>${p1?.nome}</strong> vs <strong>${p2?.nome}</strong></span>
      ${isMyMatch ? `<button class="btn-sm btn-sm-confirm" onclick="window._openRegistraMatchTorneo('${torneoId}','${m.player1_id}','${m.player2_id}','${m.girone}')">Registra spareggio</button>` : ''}
    </div>`;
  }).join('');

  return `<div class="spareggio-banner">⚠️ <strong>Spareggio in corso</strong> — parità nel girone, serve una partita di spareggio!${items}</div>`;
}

// =============================================
// AVANZA A FINALE
// =============================================

export async function avanzaAFinale(torneoId) {
  const tPlayers  = await get('tournament_players', `torneo_id=eq.${torneoId}&select=*`);
  // Prende TUTTI i match (inclusi pending) così lo spareggio non-ancora-confermato viene rilevato
  const allMatches = await get('matches', `torneo_id=eq.${torneoId}&select=*`);

  const gironi = {};
  tPlayers.forEach(tp => {
    const g = tp.girone || 'A';
    if (!gironi[g]) gironi[g] = [];
    gironi[g].push(tp);
  });

  const qualificati = [];
  for (const [gNome, gPlayers] of Object.entries(gironi)) {
    const gMatchesAll = allMatches.filter(m => m.girone === gNome);
    const gMatches    = gMatchesAll.filter(m => m.confermata); // standings solo su confermati
    const standings   = calcolaStandingsGirone(gPlayers, gMatches);

    if (standings.length >= 3) {
      const secondo = standings[1];
      const terzo   = standings[2];
      if (secondo.punti === terzo.punti) {
        const sd = gMatchesAll.find(m =>
          (m.player1_id === secondo.player_id && m.player2_id === terzo.player_id) ||
          (m.player1_id === terzo.player_id   && m.player2_id === secondo.player_id)
        );
        if (!sd) {
          const spareggioKey = `${gNome}_spareggio`;
          const existing     = await get('matches', `torneo_id=eq.${torneoId}&girone=eq.${spareggioKey}`);
          if (existing.length === 0) {
            await post('matches', {
              player1_id: secondo.player_id, player2_id: terzo.player_id,
              winner_id: null, registrata_da: state.currentUser.id,
              confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: spareggioKey
            });
            toast(`Spareggio generato per il Girone ${gNome}!`);
            await renderTorneo();
            return;
          }
        }
      }
    }

    qualificati.push({ pos: 1, girone: gNome, player_id: standings[0]?.player_id });
    qualificati.push({ pos: 2, girone: gNome, player_id: standings[1]?.player_id });
  }

  await Promise.all(qualificati.filter(q => q.player_id).map(q =>
    patch('tournament_players', `torneo_id=eq.${torneoId}&player_id=eq.${q.player_id}`, { posizione_finale: q.pos })
  ));

  await patch('tournaments', `id=eq.${torneoId}`, { fase: 'finale' });
  currentTorneo.fase = 'finale';

  await generaBracketFinale(torneoId, qualificati);
  toast('Fase finale generata!');
  await renderTorneo();
}

async function generaBracketFinale(torneoId, qualificati) {
  // Guard idempotenza: se semifinali/quarti/finale esistono già, non ricreare nulla
  const existingFinal = await get('matches',
    `torneo_id=eq.${torneoId}&tipo=eq.torneo&select=girone`
  );
  const existingRounds = new Set(
    existingFinal.map(m => m.girone?.split('_')[0]).filter(Boolean)
  );
  if (existingRounds.has('finale') || existingRounds.has('semifinale') || existingRounds.has('quarti')) {
    console.warn('[generaBracketFinale] fase finale già presente, skip creazione duplicati');
    return;
  }

  const gironiNomi = [...new Set(qualificati.map(q => q.girone))].sort();
  const nGironi    = gironiNomi.length;
  const semifinali = [];

  // Fix #16 — con un solo girone i 2 qualificati vanno direttamente in finale
  if (nGironi === 1) {
    const primo   = qualificati.find(q => q.pos === 1);
    const secondo = qualificati.find(q => q.pos === 2);
    if (primo && secondo) {
      await post('matches', {
        player1_id: primo.player_id, player2_id: secondo.player_id,
        winner_id: null, registrata_da: state.currentUser.id,
        confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: 'finale_1'
      });
    }
    return;
  }

  for (let i = 0; i < nGironi; i++) {
    const primo  = qualificati.find(q => q.girone === gironiNomi[i] && q.pos === 1);
    const secondo = qualificati.find(q => q.girone === gironiNomi[(i + 1) % nGironi] && q.pos === 2);
    if (primo && secondo) semifinali.push([primo.player_id, secondo.player_id]);
  }

  const round = nGironi <= 2 ? 'semifinale' : 'quarti';
  await Promise.all(semifinali.map((sf, i) =>
    post('matches', {
      player1_id: sf[0], player2_id: sf[1],
      winner_id: null, registrata_da: state.currentUser.id,
      confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: `${round}_${i+1}`
    })
  ));
}

// =============================================
// BRACKET FINALE
// =============================================

function renderBracket(allMatches, torneo, isAdmin) {
  const rounds = {};
  allMatches.forEach(m => {
    if (!m.girone) return;
    const roundName = m.girone.split('_')[0];
    if (!rounds[roundName]) rounds[roundName] = [];
    rounds[roundName].push(m);
  });

  const roundOrder   = ['quarti', 'semifinale', 'finale'];
  const presentRounds = roundOrder.filter(r => rounds[r]);

  if (presentRounds.length === 0) {
    return '<div class="empty"><p>Nessuna partita finale ancora</p></div>';
  }

  let html = `<div class="bracket-container"><div class="bracket">`;

  for (const roundName of presentRounds) {
    const rMatches = rounds[roundName];
    const label    = roundName === 'finale' ? 'FINALE' : roundName === 'semifinale' ? 'SEMIFINALI' : 'QUARTI';
    html += `<div class="bracket-round"><div class="bracket-round-title">${label}</div>`;

    rMatches.forEach(m => {
      const p1  = state.allPlayers.find(p => p.id === m.player1_id);
      const p2  = state.allPlayers.find(p => p.id === m.player2_id);
      const s1  = m.player1_id ? (m.punteggio1 ?? '') : '';
      const s2  = m.player2_id ? (m.punteggio2 ?? '') : '';
      const isMyMatch   = state.currentUser && (state.currentUser.id === m.player1_id || state.currentUser.id === m.player2_id || isAdmin);
      const canRegister = isMyMatch && !m.confermata && torneo.stato === 'in_corso' && m.player1_id && m.player2_id && !m.winner_id;
      const canConfirm  = !m.confermata && m.winner_id && (
        isAdmin ||
        (state.currentUser &&
         state.currentUser.id !== m.registrata_da &&
         (state.currentUser.id === m.player1_id || state.currentUser.id === m.player2_id))
      );

      html += `<div style="margin-bottom:16px">
        <div class="bracket-match">
          <div class="bracket-player ${m.winner_id === m.player1_id ? 'winner' : ''} ${!m.player1_id ? 'tbd' : ''}">
            <span>${p1?.nome || 'TBD'}</span><span class="bracket-score">${s1}</span>
          </div>
          <div class="bracket-player ${m.winner_id === m.player2_id ? 'winner' : ''} ${!m.player2_id ? 'tbd' : ''}">
            <span>${p2?.nome || 'TBD'}</span><span class="bracket-score">${s2}</span>
          </div>
        </div>
        ${canRegister ? `<button class="btn-sm btn-sm-confirm" style="width:160px;margin-top:4px" onclick="window._openRegistraMatchTorneo('${torneo.id}','${m.player1_id}','${m.player2_id}','${m.girone}')">Registra</button>` : ''}
        ${canConfirm  ? `<button class="btn-sm btn-sm-confirm" style="width:160px;margin-top:4px" onclick="window._confirmTorneoMatch('${m.id}')">✓ Conferma risultato</button>` : ''}
        ${!m.confermata && m.winner_id === null && m.player1_id && m.player2_id ? '<span style="font-size:11px;color:var(--text2)">Da giocare</span>' : ''}
        ${!m.confermata && m.winner_id !== null && !canConfirm ? '<span style="font-size:11px;color:var(--gold)">⏳ In attesa conferma</span>' : ''}
      </div>`;
    });

    html += `</div>`;
  }

  html += `</div></div>`;

  const finaleMatch = rounds['finale']?.[0];
  if (finaleMatch?.confermata && finaleMatch?.winner_id) {
    const vincitore = state.allPlayers.find(p => p.id === finaleMatch.winner_id);
    html += `<div style="text-align:center;padding:30px;background:linear-gradient(135deg,rgba(255,215,0,0.08),rgba(0,255,136,0.08));border:1px solid var(--gold);border-radius:var(--radius);margin-top:16px">
      <div style="font-size:40px">🏆</div>
      <div style="font-family:var(--font-display);font-size:36px;letter-spacing:3px;color:var(--gold);margin-top:8px">${vincitore?.nome || '?'}</div>
      <div style="color:var(--text2);font-size:13px;margin-top:4px">Campione del torneo</div>
    </div>`;

    if (torneo.stato === 'in_corso' && isAdmin) {
      html += `<button class="btn btn-primary" style="margin-top:16px" onclick="window._chiudiTorneo()">🏅 Assegna Punti e Chiudi Torneo</button>`;
    }
  } else {
    const semifinaliDone = rounds['semifinale']?.every(m => m.confermata) || false;
    if (semifinaliDone && !rounds['finale'] && isAdmin) {
      html += `<button class="btn btn-primary" style="margin-top:16px" onclick="window._generaFinale('${torneo.id}')">Genera Finale →</button>`;
    }
  }

  return html;
}

export async function generaFinale(torneoId) {
  // Guard: finale già esistente?
  const existingFinale = await get('matches',
    `torneo_id=eq.${torneoId}&girone=like.finale*&select=id`
  );
  if (existingFinale.length > 0) return toast('Finale già generata', 'error');

  const semifinali = await get('matches', `torneo_id=eq.${torneoId}&confermata=eq.true&select=*`);
  const semis      = semifinali.filter(m => m.girone?.startsWith('semifinale'));
  const vincitori  = semis.map(m => m.winner_id).filter(Boolean);

  if (vincitori.length < 2) return toast('Servono 2 vincitori delle semifinali', 'error');

  await post('matches', {
    player1_id: vincitori[0], player2_id: vincitori[1],
    winner_id: null, registrata_da: state.currentUser.id,
    confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: 'finale_1'
  });

  toast('Finale generata!');
  await renderTorneo();
}

// =============================================
// CHIUDI TORNEO
// =============================================

export async function chiudiTorneo() {
  confirmDialog(
    'Chiudere il torneo e assegnare i punti bonus? Questa azione non è reversibile.',
    _doChiudiTorneo
  );
}

async function _doChiudiTorneo() {

  const t         = currentTorneo;
  const cfg       = TORNEO_CONFIG[t.tipo];
  const allTorneoMatches = await get('matches', `torneo_id=eq.${t.id}&select=*`);

  // #17 — verifica che non ci siano partite pendenti
  const pending = allTorneoMatches.filter(m => !m.confermata && m.player1_id && m.player2_id);
  if (pending.length > 0) {
    return toast(`Ci sono ancora ${pending.length} partite da confermare`, 'error');
  }

  const confirmedMatches = allTorneoMatches.filter(m => m.confermata);
  const tPlayers  = await get('tournament_players', `torneo_id=eq.${t.id}&select=*`);

  let classificati = {};

  if (t.fase === 'finale') {
    const finale = confirmedMatches.find(m => m.girone?.startsWith('finale'));
    if (finale?.winner_id) {
      classificati[finale.winner_id] = 1;
      const perdente = finale.player1_id === finale.winner_id ? finale.player2_id : finale.player1_id;
      classificati[perdente] = 2;
    }
    confirmedMatches.filter(m => m.girone?.startsWith('semifinale')).forEach(m => {
      const perdente = m.player1_id === m.winner_id ? m.player2_id : m.player1_id;
      if (!classificati[perdente]) classificati[perdente] = 3;
    });
    confirmedMatches.filter(m => m.girone?.startsWith('quarti')).forEach(m => {
      const perdente = m.player1_id === m.winner_id ? m.player2_id : m.player1_id;
      if (!classificati[perdente]) classificati[perdente] = 4;
    });
  }

  tPlayers.forEach(tp => {
    if (!classificati[tp.player_id]) classificati[tp.player_id] = 5;
  });

  const ptsAssign = Object.entries(classificati).map(([pid, pos]) => ({
    player_id: pid, torneo_id: t.id, punti: cfg.punti[Math.min(pos, 4)] || 0
  }));

  await Promise.all(ptsAssign.map(p => post('tournament_points', p)));
  await Promise.all(Object.entries(classificati).map(([pid, pos]) =>
    patch('tournament_players', `torneo_id=eq.${t.id}&player_id=eq.${pid}`, { posizione_finale: pos })
  ));
  await patch('tournaments', `id=eq.${t.id}`, { stato: 'chiuso' });

  currentTorneo.stato = 'chiuso';
  toast('Torneo chiuso! Punti assegnati.');
  await renderTorneo();
  await loadRanking();
}