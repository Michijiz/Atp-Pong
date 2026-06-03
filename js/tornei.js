import { get, post, patch, del } from './api.js';
import { state } from './state.js';
import { toast, openModal, closeModal, confirmDialog } from './ui.js';
import { avatarEl, getAvatarUrl } from './avatar.js';
import { getKFactor } from './elo.js';
import { isValidScore, isValidScore11 } from './elo.js';
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
// FORMATO ADATTIVO — cuore della logica
// =============================================

/**
 * Determina il formato ottimale in base al numero di iscritti.
 * Restituisce: { modalita, nGironi, roundIniziale }
 *
 * 2        → eliminazione diretta (finale secca)
 * 3        → girone unico round-robin → finale tra 1° e 2°
 * 4–5      → girone unico round-robin → finale
 * 6–9      → 2 gironi → semifinali → finale
 * 10–15    → 2 gironi (grandi) → semifinali → finale
 * 16+      → 4 gironi → quarti → semifinali → finale
 *            (oppure bracket eliminazione se modalita=eliminazione)
 */
function _determinaFormato(n) {
  if (n <= 1)  return null; // impossibile
  if (n === 2) return { nGironi: 0, roundIniziale: 'finale' };
  if (n <= 5)  return { nGironi: 1, roundIniziale: 'semifinale' };
  if (n <= 15) return { nGironi: 2, roundIniziale: 'semifinale' };
  return       { nGironi: 4, roundIniziale: 'quarti' };
}

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
      <div class="form-group">
        <label class="form-label">Modalità</label>
        <select class="form-select" id="t_modalita">
          <option value="girone">🔄 Fase a gironi → Finale</option>
          <option value="eliminazione">⚡ Eliminazione diretta</option>
        </select>
      </div>
      <div class="form-group" id="t_punteggio_gironi_wrap">
        <label class="form-label">Punteggio fase gironi</label>
        <select class="form-select" id="t_punteggio_gironi">
          <option value="21">🎯 Classico a 21 punti</option>
          <option value="11">⚡ Veloce a 11 punti</option>
        </select>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">La fase finale usa sempre il classico a 21</div>
      </div>
      <button class="btn btn-primary" onclick="window._creaTorneo()">Crea Torneo</button>
      <script>document.getElementById('t_modalita')?.addEventListener('change',function(){document.getElementById('t_punteggio_gironi_wrap').style.display=this.value==='girone'?'':'none'});</script>
    </div>`;
  }

  const tornei = await get('tournaments', 'order=data_inizio.desc&select=*');

  if (tornei.length === 0) {
    html += `<div class="empty"><div class="icon">🏅</div><p>Nessun torneo ancora${isAdmin ? ' — creane uno!' : ''}</p></div>`;
  } else {
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
  const nome     = document.getElementById('t_nome').value.trim();
  const tipo     = document.getElementById('t_tipo').value;
  const modalita = document.getElementById('t_modalita')?.value || 'girone';
  const punteggioGironi = modalita === 'girone'
    ? parseInt(document.getElementById('t_punteggio_gironi')?.value || '21')
    : 21;
  if (!nome) return toast('Inserisci il nome del torneo', 'error');

  const faseIniziale = modalita === 'eliminazione' ? 'eliminazione' : 'girone';
  const t = await post('tournaments', {
    nome, tipo, stato: 'in_corso', fase: faseIniziale,
    modalita, punteggio_gironi: punteggioGironi,
    creato_da: state.currentUser.id
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

  const tipoClass  = `tipo-${t.tipo}`;
  const inCorso    = t.stato === 'in_corso';
  const inFaseFinale = t.fase === 'finale' || t.stato === 'chiuso';

  // ---- HEADER TORNEO ----
  let html = `
  <div class="tn-header">
    <div class="tn-header-top">
      <div class="tn-nome">${t.nome}</div>
      <span class="torneo-tipo-badge ${tipoClass}">${t.tipo}</span>
    </div>
    <div class="tn-pills">
      <span class="tn-pill">${t.stato === 'in_corso' ? '🟢 In corso' : '✅ Chiuso'}</span>
      <span class="tn-pill">×${cfg.moltiplicatore} Elo</span>
      ${t.modalita === 'eliminazione' ? '<span class="tn-pill">⚡ Elim. diretta</span>' : `<span class="tn-pill">👥 ${tPlayers.length} iscritti</span>`}
      ${t.punteggio_gironi === 11 ? '<span class="tn-pill tn-pill-accent">Gironi a 11 · Finale a 21</span>' : ''}
    </div>
    ${isAdmin && inCorso
      ? `<button class="btn btn-danger" style="width:auto;padding:8px 16px;font-size:13px;margin-top:12px" onclick="window._chiudiTorneo()">Chiudi e Assegna Punti</button>`
      : ''}
  </div>`;

  // ---- PANNELLO ISCRIZIONI ADMIN (inline nel torneo) ----
  if (isAdmin && inCorso && (t.fase === 'girone' || t.fase === 'eliminazione')) {
    html += await _renderPannelloIscrizioniAdmin(t.id, tPlayers);
  }

  // ---- BOTTONE ISCRIZIONE UTENTE ----
  const iscritto = tPlayers.find(tp => tp.player_id === state.currentUser?.id);
  const faseIscrivibile = t.fase === 'girone' || t.fase === 'eliminazione';
  if (faseIscrivibile && state.currentUser && !iscritto && inCorso && !isAdmin) {
    html += `<div style="margin-bottom:16px">
      <button class="btn btn-primary" onclick="window._iscrivitiTorneo('${t.id}')">🎾 Iscriviti al Torneo</button>
    </div>`;
  }

  if (tPlayers.length === 0) {
    html += `<div class="empty"><div class="icon">👥</div><p>Nessun iscritto ancora</p></div>`;
    document.getElementById('torneoDetailContent').innerHTML = html;
    return;
  }

  // ---- MODALITÀ ELIMINAZIONE DIRETTA ----
  if (t.modalita === 'eliminazione') {
    const hasElimMatches = allMatches.some(m => m.girone?.match(/^(ottavi|quarti|semifinale|finale)/));

    if (!hasElimMatches && t.fase === 'eliminazione') {
      html += _renderIscrittiConFormato(tPlayers, t, isAdmin);
    } else {
      html += renderBracket(allMatches, t, isAdmin);
    }

    document.getElementById('torneoDetailContent').innerHTML = html;
    return;
  }

  // ---- MODALITÀ GIRONE ----
  const gironi = {};
  tPlayers.forEach(tp => {
    const g = tp.girone || '_no_girone';
    if (!gironi[g]) gironi[g] = [];
    gironi[g].push(tp);
  });

  const hasGironi = tPlayers.some(tp => tp.girone);

  if (!hasGironi && t.fase === 'girone') {
    // Lista iscritti pre-generazione con formato consigliato
    html += _renderIscrittiConFormato(tPlayers, t, isAdmin);
  } else if (hasGironi) {
    // Gironi collassabili se in fase finale
    if (inFaseFinale) {
      html += `
      <div class="tn-collapse-wrap" style="margin-bottom:16px">
        <button class="tn-collapse-btn" onclick="
          const c=this.nextElementSibling;
          const open=c.style.display!=='none';
          c.style.display=open?'none':'block';
          this.querySelector('.tn-collapse-icon').textContent=open?'▶':'▼'
        ">
          <span>▶</span>
          <span class="tn-collapse-icon" style="display:none">▶</span>
          ▼ Fase a Gironi
        </button>
        <div style="display:none">`;
    }

    const spareggiBanner = await getSpareggiPendenti(t.id, allMatches);
    if (spareggiBanner) html += spareggiBanner;

    const giorniOrdinati = Object.entries(gironi)
      .filter(([g]) => g !== '_no_girone')
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [gNome, gPlayers] of giorniOrdinati) {
      const gMatchesAll = allMatches.filter(m => m.girone === gNome);
      const gMatchesOk  = gMatchesAll.filter(m => m.confermata);
      const standings   = calcolaStandingsGirone(gPlayers, gMatchesOk);
      const nQualificati = 2;

      html += `<div class="card tn-girone-card" style="margin-bottom:16px">
        <div class="tn-girone-header">
          <div class="girone-title">Girone ${gNome}</div>
          <div style="font-size:11px;color:var(--text2)">${gPlayers.length} giocatori</div>
        </div>
        <table class="girone-table">
          <thead><tr>
            <th>#</th><th>Giocatore</th><th>V</th><th>S</th><th>Pts</th><th>+/-</th>
          </tr></thead>
          <tbody>
            ${standings.map((s, i) => {
              const p = state.allPlayers.find(p => p.id === s.player_id);
              const qualificato = i < nQualificati;
              return `<tr class="${qualificato ? 'qualificato' : ''}">
                <td style="font-family:var(--font-mono);color:${qualificato ? 'var(--accent)' : 'var(--text2)'}">${i+1}</td>
                <td><div style="display:flex;align-items:center;gap:8px">${avatarEl(p?.nome||'?', 24, getAvatarUrl(p?.id))} ${p?.nome||'?'}</div></td>
                <td style="color:var(--accent);font-family:var(--font-mono)">${s.vinte}</td>
                <td style="color:var(--accent2);font-family:var(--font-mono)">${s.perse}</td>
                <td style="font-family:var(--font-mono);font-weight:700">${s.punti}</td>
                <td style="font-family:var(--font-mono);color:var(--text2)">${s.pti_fatti}-${s.pti_subiti}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="sec-label" style="margin-bottom:10px">Partite</div>
        ${renderPartitiGirone(gPlayers, gMatchesAll, t, isAdmin)}
      </div>`;
    }

    // Pulsante avanza a finale
    if (isAdmin && inCorso && t.fase === 'girone') {
      const totaleMatch        = calcolaTotaleMatchGirone(tPlayers);
      const matchCompletati    = allMatches.filter(m =>
        m.tipo === 'torneo' && m.confermata && m.girone &&
        !m.girone.includes('_spareggio') &&
        !m.girone.match(/^(semifinale|quarti|finale|ottavi)/)
      ).length;
      const spareggiosPendenti = allMatches.filter(m => m.girone?.includes('_spareggio') && !m.confermata).length;

      if (matchCompletati >= totaleMatch && spareggiosPendenti === 0) {
        html += `<div class="card" style="border-color:var(--accent);margin-bottom:16px">
          <div class="card-title" style="color:var(--accent)">⚡ Gironi completati!</div>
          <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Tutti i match sono stati giocati. Puoi avanzare alla fase finale.</p>
          <button class="btn btn-primary" onclick="window._avanzaAFinale('${t.id}')">Genera Fase Finale →</button>
        </div>`;
      } else if (isAdmin) {
        const rimasti = totaleMatch - matchCompletati;
        html += `<div style="font-size:11px;color:var(--text2);text-align:center;padding:8px 0;margin-bottom:16px">
          ${rimasti > 0 ? `${rimasti} partite rimanenti nei gironi` : spareggiosPendenti > 0 ? '⏳ Spareggio in corso' : ''}
        </div>`;
      }
    }

    if (inFaseFinale) {
      html += `</div></div>`; // chiude collapsible
    }
  }

  // ---- CAMPIONE HERO (sopra tutto in fase finale/chiuso) ----
  const finaleConfermata = allMatches.find(m => m.girone?.startsWith('finale') && m.confermata && m.winner_id);
  if (finaleConfermata) {
    const vincitore = state.allPlayers.find(p => p.id === finaleConfermata.winner_id);
    const campHtml = `<div class="tn-campione" style="margin-bottom:16px">
      <div class="tn-campione-avatar-wrap">
        ${avatarEl(vincitore?.nome || '?', 80, vincitore ? getAvatarUrl(vincitore.id) : null)}
        <div class="tn-campione-trophy-badge">🏆</div>
      </div>
      <div class="tn-campione-label">CAMPIONE</div>
      <div class="tn-campione-nome">${vincitore?.nome || '?'}</div>
      ${t.stato === 'in_corso' && isAdmin
        ? `<button class="btn btn-primary" style="margin-top:16px;width:auto;padding:8px 20px" onclick="window._chiudiTorneo()">🏅 Assegna Punti e Chiudi</button>`
        : ''}
    </div>`;
    // Inserisci dopo il primo blocco (header torneo)
    const firstDivEnd = html.indexOf('</div>', html.indexOf('class="tn-header"'));
    if (firstDivEnd !== -1) {
      html = html.slice(0, firstDivEnd + 6) + campHtml + html.slice(firstDivEnd + 6);
    }
  }

  // ---- FASE FINALE / BRACKET ----
  if (t.fase === 'finale' || (t.stato === 'chiuso' && allMatches.some(m => m.girone?.match(/^(quarti|semifinale|finale)/)))) {
    const brackMatches = allMatches.filter(m => !m.girone?.includes('_spareggio'));
    html += renderBracket(brackMatches, t, isAdmin);
  }

  document.getElementById('torneoDetailContent').innerHTML = html;
}

// =============================================
// PANNELLO ISCRIZIONI ADMIN INLINE
// =============================================

async function _renderPannelloIscrizioniAdmin(torneoId, tPlayers) {
  if (state.allPlayers.length === 0) {
    state.allPlayers = await get('players', 'select=*');
  }
  const iscrittiIds = new Set(tPlayers.map(tp => tp.player_id));
  const tutti = state.allPlayers.filter(p => p.ruolo !== 'admin' || iscrittiIds.has(p.id));

  const righe = tutti.map(p => {
    const iscritto = iscrittiIds.has(p.id);
    return `<div class="tn-roster-row">
      <div style="display:flex;align-items:center;gap:9px;flex:1;min-width:0">
        ${avatarEl(p.nome, 30, getAvatarUrl(p.id))}
        <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.nome}</span>
        <span style="font-size:11px;color:var(--text2);font-family:var(--font-mono)">${p.elo}</span>
      </div>
      ${iscritto
        ? `<button class="btn-sm btn-sm-deny" onclick="window._adminRimuoviIscritto('${torneoId}','${p.id}')">Rimuovi</button>`
        : `<button class="btn-sm btn-sm-confirm" onclick="window._adminAggiungiIscritto('${torneoId}','${p.id}')">+ Aggiungi</button>`
      }
    </div>`;
  }).join('');

  return `<div class="card tn-roster-panel" style="margin-bottom:16px">
    <div class="card-title">👥 Gestione Iscritti <span style="font-size:12px;color:var(--text2);font-weight:400">(${tPlayers.length} iscritti)</span></div>
    <div class="tn-roster-list">${righe || '<p style="color:var(--text2);font-size:13px">Nessun giocatore disponibile</p>'}</div>
  </div>`;
}

export async function adminAggiungiIscritto(torneoId, playerId) {
  const existing = await get('tournament_players', `torneo_id=eq.${torneoId}&player_id=eq.${playerId}`);
  if (existing.length > 0) return toast('Già iscritto', 'error');
  await post('tournament_players', { torneo_id: torneoId, player_id: playerId });
  const nome = state.allPlayers.find(p => p.id === playerId)?.nome || '?';
  toast(`${nome} aggiunto`);
  await renderTorneo();
}

export async function adminRimuoviIscritto(torneoId, playerId) {
  confirmDialog('Rimuovere questo giocatore dal torneo?', async () => {
    await del('tournament_players', `torneo_id=eq.${torneoId}&player_id=eq.${playerId}`);
    const nome = state.allPlayers.find(p => p.id === playerId)?.nome || '?';
    toast(`${nome} rimosso`);
    await renderTorneo();
  });
}

// =============================================
// RENDER ISCRITTI CON FORMATO CONSIGLIATO
// =============================================

function _renderIscrittiConFormato(tPlayers, t, isAdmin) {
  const n      = tPlayers.length;
  const fmt    = _determinaFormato(n);
  const isElim = t.modalita === 'eliminazione';

  let formatoDesc = '';
  if (fmt) {
    if (isElim) {
      const slots = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
      const bye   = slots - n;
      formatoDesc = `⚡ Bracket eliminazione diretta${bye > 0 ? ` · ${bye} bye ai top seed` : ''}`;
    } else if (fmt.nGironi === 0) {
      formatoDesc = '🏆 Finale diretta (2 giocatori)';
    } else if (fmt.nGironi === 1) {
      formatoDesc = `🔄 1 girone round-robin → Finale`;
    } else {
      formatoDesc = `🔄 ${fmt.nGironi} gironi → ${fmt.roundIniziale === 'quarti' ? 'Quarti → Semifinali → Finale' : 'Semifinali → Finale'}`;
    }
  }

  const righe = tPlayers.map(tp => {
    const p = state.allPlayers.find(p => p.id === tp.player_id);
    return `<div class="match-item" style="padding:10px 0;border-bottom:1px solid var(--b1)">
      <div class="match-players" style="gap:9px">
        ${avatarEl(p?.nome||'?', 32, getAvatarUrl(p?.id))}
        <span style="font-weight:600">${p?.nome||'?'}</span>
        <span style="font-size:11px;color:var(--text2);font-family:var(--font-mono)">${p?.elo || 1000} Elo</span>
      </div>
    </div>`;
  }).join('');

  const canGenerate = isAdmin && t.stato === 'in_corso';
  let btnHtml = '';
  if (canGenerate) {
    if (n < 2) {
      btnHtml = `<p style="color:var(--text2);font-size:13px;margin-top:12px">Servono almeno 2 giocatori</p>`;
    } else if (isElim) {
      btnHtml = `<button class="btn btn-primary" style="margin-top:12px" onclick="window._generaBracketEliminazione('${t.id}')">⚡ Genera Bracket</button>`;
    } else if (fmt?.nGironi === 0) {
      btnHtml = `<button class="btn btn-primary" style="margin-top:12px" onclick="window._generaFinaleDirecta('${t.id}')">🏆 Genera Finale Diretta</button>`;
    } else {
      btnHtml = `<button class="btn btn-primary" style="margin-top:12px" onclick="window._generaGironi('${t.id}')">⚡ Genera Gironi</button>`;
    }
  }

  return `<div class="card" style="margin-bottom:16px">
    <div class="card-title">Iscritti (${n})</div>
    ${formatoDesc ? `<div class="tn-formato-badge">${formatoDesc}</div>` : ''}
    ${righe}
    ${btnHtml}
  </div>`;
}

// =============================================
// ISCRIZIONE UTENTE
// =============================================

export async function iscrivitiTorneo(torneoId) {
  const existing = await get('tournament_players', `torneo_id=eq.${torneoId}&player_id=eq.${state.currentUser.id}`);
  if (existing.length > 0) return toast('Sei già iscritto', 'error');
  await post('tournament_players', { torneo_id: torneoId, player_id: state.currentUser.id });
  toast('Iscrizione effettuata!');
  await renderTorneo();
}

// =============================================
// GENERA GIRONI (logica adattiva)
// =============================================

export async function generaGironi(torneoId) {
  const tPlayers = await get('tournament_players', `torneo_id=eq.${torneoId}&select=*`);
  if (state.allPlayers.length === 0) state.allPlayers = await get('players', 'select=*');

  const n   = tPlayers.length;
  const fmt = _determinaFormato(n);
  if (!fmt) return toast('Servono almeno 2 giocatori', 'error');

  // Caso speciale: 2 giocatori → finale diretta
  if (fmt.nGironi === 0) return generaFinaleDirecta(torneoId);

  const nGironi = fmt.nGironi;

  const seeded = tPlayers.map(tp => ({
    ...tp,
    elo: state.allPlayers.find(p => p.id === tp.player_id)?.elo || 1000
  })).sort((a, b) => b.elo - a.elo);

  const giorniNomi = 'ABCDEFGH'.slice(0, nGironi).split('');
  const assegnazioni = {};
  seeded.forEach((tp, i) => {
    // Serpentina: 0→A,B,C,D  poi 1→D,C,B,A  poi 2→A,B...
    const round = Math.floor(i / nGironi);
    const pos   = round % 2 === 0 ? i % nGironi : nGironi - 1 - (i % nGironi);
    assegnazioni[tp.player_id] = giorniNomi[pos];
  });

  await Promise.all(seeded.map(tp =>
    patch('tournament_players', `id=eq.${tp.id}`, { girone: assegnazioni[tp.player_id] })
  ));

  toast(`Gironi generati! (${nGironi} ${nGironi === 1 ? 'girone' : 'gironi'})`);
  await renderTorneo();
}

// =============================================
// FINALE DIRETTA (2 giocatori)
// =============================================

export async function generaFinaleDirecta(torneoId) {
  const tPlayers = await get('tournament_players', `torneo_id=eq.${torneoId}&select=*`);
  if (tPlayers.length < 2) return toast('Servono almeno 2 giocatori', 'error');

  const existing = await get('matches', `torneo_id=eq.${torneoId}&girone=like.finale*&select=id`);
  if (existing.length > 0) return toast('Finale già generata', 'error');

  if (state.allPlayers.length === 0) state.allPlayers = await get('players', 'select=*');
  const seeded = tPlayers.sort((a, b) => {
    const eA = state.allPlayers.find(p => p.id === a.player_id)?.elo || 1000;
    const eB = state.allPlayers.find(p => p.id === b.player_id)?.elo || 1000;
    return eB - eA;
  });

  await post('matches', {
    player1_id: seeded[0].player_id, player2_id: seeded[1].player_id,
    winner_id: null, registrata_da: state.currentUser.id,
    confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: 'finale_1'
  });

  await patch('tournaments', `id=eq.${torneoId}`, { fase: 'finale' });
  currentTorneo.fase = 'finale';

  toast('Finale diretta generata!');
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
    stats[m.player1_id].pti_fatti  += m.punteggio1 || 0;
    stats[m.player1_id].pti_subiti += m.punteggio2 || 0;
    stats[m.player2_id].pti_fatti  += m.punteggio2 || 0;
    stats[m.player2_id].pti_subiti += m.punteggio1 || 0;
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
    // Tiebreak 1: scontro diretto
    const sd = gMatches.find(m =>
      (m.player1_id === a.player_id && m.player2_id === b.player_id) ||
      (m.player1_id === b.player_id && m.player2_id === a.player_id)
    );
    if (sd) return sd.winner_id === b.player_id ? 1 : -1;
    // Tiebreak 2: differenza punti
    return (b.pti_fatti - b.pti_subiti) - (a.pti_fatti - a.pti_subiti);
  });
}

function calcolaTotaleMatchGirone(tPlayers) {
  const counts = {};
  tPlayers.forEach(tp => {
    const g = tp.girone || 'A';
    counts[g] = (counts[g] || 0) + 1;
  });
  return Object.values(counts).reduce((sum, n) => sum + n * (n - 1) / 2, 0);
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
        <div class="torneo-match-player">${avatarEl(p1?.nome||'?',22,getAvatarUrl(p1?.id))} <span>${p1?.nome||'?'}</span></div>
        <div style="text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">vs</div>
          ${canRegister ? `<button class="btn-sm btn-sm-confirm" onclick="window._openRegistraMatchTorneo('${torneo.id}','${p1id}','${p2id}','${gPlayers[0].girone}')">Registra</button>` : ''}
        </div>
        <div class="torneo-match-player right">${avatarEl(p2?.nome||'?',22,getAvatarUrl(p2?.id))} <span>${p2?.nome||'?'}</span></div>
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
        <div class="torneo-match-player" style="color:var(--text2)">${avatarEl(p1?.nome||'?',22,getAvatarUrl(p1?.id))} <span>${p1?.nome||'?'}</span></div>
        <div style="text-align:center">
          <div class="torneo-match-score-big" style="color:var(--text2)">${s1 ?? '?'} — ${s2 ?? '?'}</div>
          ${canConfirm
            ? `<button class="btn-sm btn-sm-confirm" style="margin-top:5px" onclick="window._confirmTorneoMatch('${match.id}')">✓ Conferma</button>`
            : '<div style="font-size:10px;color:var(--gold);margin-top:3px">⏳ in attesa</div>'}
        </div>
        <div class="torneo-match-player right" style="color:var(--text2)">${avatarEl(p2?.nome||'?',22,getAvatarUrl(p2?.id))} <span>${p2?.nome||'?'}</span></div>
      </div>`;
    }

    return `<div class="torneo-match-item">
      <div class="torneo-match-player">${avatarEl(p1?.nome||'?',26,getAvatarUrl(p1?.id))} <span class="${w1 ? 'torneo-match-winner' : 'torneo-match-loser'}">${p1?.nome||'?'}</span></div>
      <div class="torneo-match-score-big">${s1} — ${s2}</div>
      <div class="torneo-match-player right">${avatarEl(p2?.nome||'?',26,getAvatarUrl(p2?.id))} <span class="${w2 ? 'torneo-match-winner' : 'torneo-match-loser'}">${p2?.nome||'?'}</span></div>
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

  // Fase finale usa SEMPRE 21, indipendentemente dalla config del torneo
  const [torneo] = await get('tournaments', `id=eq.${torneoId}&select=punteggio_gironi,fase`);
  const isFaseGirone = girone && !girone.match(/^(semifinale|quarti|finale|ottavi)/);
  const usaPunteggio11 = isFaseGirone && torneo?.punteggio_gironi === 11;

  const scoreOk = usaPunteggio11 ? isValidScore11(s1, s2) : isValidScore(s1, s2);
  if (!scoreOk) {
    _torneoMatchPending = null;
    return toast(usaPunteggio11 ? 'Punteggio non valido (a 11, servono +2)' : 'Punteggio non valido (a 21, servono +2)', 'error');
  }

  // Guard: partita già registrata con vincitore?
  const existing = await get('matches',
    `torneo_id=eq.${torneoId}&girone=eq.${girone}` +
    `&or=(and(player1_id.eq.${p1id},player2_id.eq.${p2id}),and(player1_id.eq.${p2id},player2_id.eq.${p1id}))` +
    `&select=id,winner_id`
  );
  if (existing && existing.some(m => m.winner_id)) {
    _torneoMatchPending = null;
    return toast('Partita già registrata per questo slot', 'error');
  }

  const winnerId    = s1 > s2 ? p1id : p2id;
  const isAdmin     = state.currentUser?.ruolo === 'admin';
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
    await applicaEloTorneo(p1id, p2id, winnerId, torneoId, placeholder?.id);
    if (girone?.startsWith('semifinale')) await _autoGeneraFinaleSePronta(torneoId);
    await _autoAvanzaEliminazione(torneoId, girone || '');
    toast('Partita registrata e Elo aggiornato!');
  } else {
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

export function closeTorneoMatchModal() { _torneoMatchPending = null; }
export async function submitTorneoMatch() {}

// =============================================
// CONFERMA MATCH TORNEO
// =============================================

export async function confirmTorneoMatch(matchId) {
  const [m] = await get('matches', `id=eq.${matchId}&select=*`);

  const isAdmin    = state.currentUser?.ruolo === 'admin';
  const isOpponent = state.currentUser?.id !== m.registrata_da &&
    (state.currentUser?.id === m.player1_id || state.currentUser?.id === m.player2_id);

  if (!isAdmin && !isOpponent) return toast('Solo il tuo avversario può confermare', 'error');

  // Guard: Elo già applicato per questo match?
  const eloGiaApplicato = await get('elo_history', `match_id=eq.${matchId}&select=id`).catch(() => []);
  if (eloGiaApplicato.length > 0) {
    // Aggiorna solo lo stato confermato senza ricalcolare Elo
    await patch('matches', `id=eq.${matchId}`, { confermata: true });
    toast('Partita confermata!');
  } else {
    await patch('matches', `id=eq.${matchId}`, { confermata: true });
    await applicaEloTorneo(m.player1_id, m.player2_id, m.winner_id, m.torneo_id, matchId);
    toast('Partita confermata! Elo aggiornato.');
  }

  if (m.girone?.startsWith('semifinale')) await _autoGeneraFinaleSePronta(m.torneo_id);
  await _autoAvanzaEliminazione(m.torneo_id, m.girone || '');

  await renderTorneo();
}

// =============================================
// AUTO-GENERA FINALE SE SEMIFINALI FINITE
// =============================================

async function _autoGeneraFinaleSePronta(torneoId) {
  const allMatches = await get('matches', `torneo_id=eq.${torneoId}&select=*`);

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

// =============================================
// ELO TORNEO — con guard su elo_history
// =============================================

async function applicaEloTorneo(p1id, p2id, winnerId, torneoId, matchId = null) {
  // Guard: se matchId fornito, verifica che non sia già stato processato
  if (matchId) {
    const existing = await get('elo_history', `match_id=eq.${matchId}&select=id`).catch(() => []);
    if (existing.length > 0) return;
  }

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
  const today   = new Date().toISOString().split('T')[0];

  await Promise.all([
    patch('players', `id=eq.${p1id}`, {
      elo: newEloA, partite_giocate: p1.partite_giocate + 1,
      vinte: p1.vinte + (winnerIsP1 ? 1 : 0),
      perse: p1.perse + (winnerIsP1 ? 0 : 1),
      last_match_date: today
    }),
    patch('players', `id=eq.${p2id}`, {
      elo: newEloB, partite_giocate: p2.partite_giocate + 1,
      vinte: p2.vinte + (winnerIsP1 ? 0 : 1),
      perse: p2.perse + (winnerIsP1 ? 1 : 0),
      last_match_date: today
    })
  ]);

  // Scrivi su elo_history per storico e guard anti-doppio
  if (matchId) {
    await Promise.all([
      post('elo_history', {
        player_id: p1id, match_id: matchId,
        elo_before: p1.elo, elo_after: newEloA,
        delta: newEloA - p1.elo
      }).catch(() => {}),
      post('elo_history', {
        player_id: p2id, match_id: matchId,
        elo_before: p2.elo, elo_after: newEloB,
        delta: newEloB - p2.elo
      }).catch(() => {})
    ]);
  }
}

// =============================================
// SPAREGGI
// =============================================

async function getSpareggiPendenti(torneoId, allMatches) {
  const spareggi = allMatches.filter(m => m.girone?.includes('_spareggio') && !m.confermata);
  if (spareggi.length === 0) return null;

  const items = spareggi.map(m => {
    const p1 = state.allPlayers.find(p => p.id === m.player1_id);
    const p2 = state.allPlayers.find(p => p.id === m.player2_id);
    const isMyMatch = state.currentUser && (
      state.currentUser.id === m.player1_id ||
      state.currentUser.id === m.player2_id ||
      state.currentUser.ruolo === 'admin'
    );
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
  const tPlayers   = await get('tournament_players', `torneo_id=eq.${torneoId}&select=*`);
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
    const gMatches    = gMatchesAll.filter(m => m.confermata);
    const standings   = calcolaStandingsGirone(gPlayers, gMatches);

    // Gestione spareggio: parità tra 2° e 3° (serve solo con 3+ giocatori nel girone)
    if (standings.length >= 3) {
      const secondo = standings[1];
      const terzo   = standings[2];
      if (secondo.punti === terzo.punti) {
        const scontroDiretto = gMatchesAll.find(m =>
          (m.player1_id === secondo.player_id && m.player2_id === terzo.player_id) ||
          (m.player1_id === terzo.player_id   && m.player2_id === secondo.player_id)
        );
        if (!scontroDiretto || !scontroDiretto.winner_id) {
          const spareggioKey = `${gNome}_spareggio`;
          const existingSpar = await get('matches', `torneo_id=eq.${torneoId}&girone=eq.${spareggioKey}`);
          if (existingSpar.length === 0) {
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

    // Anche parità tra 1° e 2° (con stesso punteggio e scontro diretto non disponibile)
    if (standings.length >= 2) {
      const primo   = standings[0];
      const secondo = standings[1];
      if (primo.punti === secondo.punti) {
        const sd = gMatchesAll.find(m =>
          (m.player1_id === primo.player_id && m.player2_id === secondo.player_id) ||
          (m.player1_id === secondo.player_id && m.player2_id === primo.player_id)
        );
        // se c'è scontro diretto è già un tiebreak risolto — altrimenti segna chi ha più punti fatti
        // non blocchiamo per parità 1°-2° se abbiamo lo scontro diretto
        if (!sd) {
          // tiebreak per differenza punti già risolto in calcolaStandingsGirone — proseguiamo
        }
      }
    }

    qualificati.push({ pos: 1, girone: gNome, player_id: standings[0]?.player_id });
    if (standings[1]) qualificati.push({ pos: 2, girone: gNome, player_id: standings[1]?.player_id });
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
  // Guard idempotenza
  const existingFinal = await get('matches', `torneo_id=eq.${torneoId}&tipo=eq.torneo&select=girone`);
  const existingRounds = new Set(
    existingFinal.map(m => m.girone?.split('_')[0]).filter(Boolean)
  );
  if (existingRounds.has('finale') || existingRounds.has('semifinale') || existingRounds.has('quarti')) {
    console.warn('[generaBracketFinale] fase finale già presente, skip');
    return;
  }

  const gironiNomi = [...new Set(qualificati.map(q => q.girone))].sort();
  const nGironi    = gironiNomi.length;

  // 1 girone → finale diretta
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

  // 2+ gironi → semifinali (o quarti se 4 gironi)
  const round = nGironi <= 2 ? 'semifinale' : 'quarti';
  const semifinali = [];

  // Cross-bracket: 1°A vs 2°B, 1°B vs 2°A (e così via per 4 gironi)
  for (let i = 0; i < nGironi; i++) {
    const primo  = qualificati.find(q => q.girone === gironiNomi[i] && q.pos === 1);
    const secondo = qualificati.find(q => q.girone === gironiNomi[(i + 1) % nGironi] && q.pos === 2);
    if (primo && secondo) semifinali.push([primo.player_id, secondo.player_id]);
  }

  await Promise.all(semifinali.map((sf, i) =>
    post('matches', {
      player1_id: sf[0], player2_id: sf[1],
      winner_id: null, registrata_da: state.currentUser.id,
      confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: `${round}_${i+1}`
    })
  ));
}

// =============================================
// ELIMIAZIONE DIRETTA — bracket adattivo
// =============================================

export async function generaBracketEliminazione(torneoId) {
  const tPlayers = await get('tournament_players', `torneo_id=eq.${torneoId}&select=*`);
  if (state.allPlayers.length === 0) state.allPlayers = await get('players', 'select=*');

  const n = tPlayers.length;
  if (n < 2) return toast('Servono almeno 2 giocatori', 'error');

  const slots = Math.pow(2, Math.ceil(Math.log2(n)));
  const nBye  = slots - n;

  const seeded = tPlayers.map(tp => ({
    ...tp,
    elo: state.allPlayers.find(p => p.id === tp.player_id)?.elo || 1000
  })).sort((a, b) => b.elo - a.elo);

  const roundLabels = { 2: 'finale', 4: 'semifinale', 8: 'quarti', 16: 'ottavi' };
  const roundName   = roundLabels[slots] || `r${slots}`;

  const byePlayers   = seeded.slice(0, nBye);
  const matchPlayers = seeded.slice(nBye);

  const matchesToCreate = [];
  for (let i = 0; i < matchPlayers.length; i += 2) {
    const p1 = matchPlayers[i];
    const p2 = matchPlayers[i + 1];
    if (p1 && p2) matchesToCreate.push({ p1: p1.player_id, p2: p2.player_id });
  }

  await Promise.all(matchesToCreate.map((m, i) =>
    post('matches', {
      player1_id: m.p1, player2_id: m.p2,
      winner_id: null, registrata_da: state.currentUser.id,
      confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: `${roundName}_${i+1}`
    })
  ));

  if (nBye > 0 && slots > 2) {
    const nextRoundLabels = { 4: 'semifinale', 8: 'quarti', 16: 'ottavi' };
    const nextLabel = Object.entries(nextRoundLabels).find(([s]) => parseInt(s) === slots / 2)?.[1] || 'semifinale';
    for (let i = 0; i < byePlayers.length; i++) {
      await post('matches', {
        player1_id: byePlayers[i].player_id, player2_id: null,
        winner_id: null, registrata_da: state.currentUser.id,
        confermata: false, tipo: 'torneo', torneo_id: torneoId,
        girone: `${nextLabel}_bye_${i+1}`, note: 'bye'
      });
    }
  }

  await patch('tournaments', `id=eq.${torneoId}`, { fase: 'finale' });
  currentTorneo.fase = 'finale';

  toast(`Bracket generato! (${n} giocatori${nBye > 0 ? `, ${nBye} bye` : ''})`);
  await renderTorneo();
}

// =============================================
// AVANZAMENTO AUTOMATICO ELIMINAZIONE
// =============================================

async function _autoAvanzaEliminazione(torneoId, gironeName) {
  const allMatches = await get('matches', `torneo_id=eq.${torneoId}&select=*`);
  const roundName  = gironeName.split('_')[0];

  const roundOrder = ['ottavi', 'quarti', 'semifinale', 'finale'];
  const currIdx    = roundOrder.indexOf(roundName);
  if (currIdx < 0 || currIdx >= roundOrder.length - 1) return;

  const nextRound   = roundOrder[currIdx + 1];
  const currMatches = allMatches.filter(m => m.girone?.startsWith(roundName) && !m.girone.includes('bye'));
  const allDone     = currMatches.every(m => m.confermata);
  if (!allDone) return;

  const nextExists = allMatches.some(m => m.girone?.startsWith(nextRound) && !m.girone.includes('bye'));
  if (nextExists) return;

  const vincitori    = currMatches.map(m => m.winner_id);
  const byeMatches   = allMatches.filter(m => m.girone?.startsWith(`${nextRound}_bye`));
  const byeVincitori = byeMatches.map(m => m.player1_id);

  const allNextPlayers = [...vincitori, ...byeVincitori].filter(Boolean);
  for (let i = 0; i < allNextPlayers.length; i += 2) {
    const p1 = allNextPlayers[i];
    const p2 = allNextPlayers[i + 1];
    if (p1 && p2) {
      await post('matches', {
        player1_id: p1, player2_id: p2,
        winner_id: null, registrata_da: state.currentUser.id,
        confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: `${nextRound}_${i/2+1}`
      });
    }
  }

  toast(`🏓 ${nextRound.charAt(0).toUpperCase() + nextRound.slice(1)} generati automaticamente!`);
}

// =============================================
// BRACKET FINALE — schema orizzontale classico
// =============================================

function renderBracket(allMatches, torneo, isAdmin) {
  const rounds = {};
  allMatches.forEach(m => {
    if (!m.girone) return;
    if (m.note === 'bye') return;
    const roundName = m.girone.split('_')[0];
    if (!rounds[roundName]) rounds[roundName] = [];
    rounds[roundName].push(m);
  });

  const roundOrder    = ['ottavi', 'quarti', 'semifinale', 'finale'];
  const presentRounds = roundOrder.filter(r => rounds[r]);

  if (presentRounds.length === 0) {
    return '<div class="empty"><p>Nessuna partita finale ancora</p></div>';
  }

  const labelMap = {
    finale:    'FINALE',
    semifinale:'SEMIFINALI',
    quarti:    'QUARTI DI FINALE',
    ottavi:    'OTTAVI DI FINALE'
  };

  // Schema orizzontale: rounds da sinistra (ottavi) a destra (finale)
  let html = `<div class="tn-bracket-wrap"><div class="tn-bracket-schema">`;

  for (const roundName of presentRounds) {
    const rMatches = rounds[roundName];
    const label    = labelMap[roundName] || roundName.toUpperCase();

    html += `<div class="tn-bracket-col">
      <div class="tn-bracket-col-label">${label}</div>
      <div class="tn-bracket-col-matches">`;

    rMatches.forEach(m => {
      const p1 = state.allPlayers.find(p => p.id === m.player1_id);
      const p2 = state.allPlayers.find(p => p.id === m.player2_id);
      const s1 = m.player1_id ? (m.punteggio1 ?? '') : '';
      const s2 = m.player2_id ? (m.punteggio2 ?? '') : '';
      const w1 = m.winner_id === m.player1_id;
      const w2 = m.winner_id === m.player2_id;

      const isMyMatch   = state.currentUser && (state.currentUser.id === m.player1_id || state.currentUser.id === m.player2_id || isAdmin);
      const canRegister = isMyMatch && !m.confermata && torneo.stato === 'in_corso' && m.player1_id && m.player2_id && !m.winner_id;
      const canConfirm  = !m.confermata && m.winner_id && (
        isAdmin ||
        (state.currentUser &&
         state.currentUser.id !== m.registrata_da &&
         (state.currentUser.id === m.player1_id || state.currentUser.id === m.player2_id))
      );

      const statusHtml = canRegister
        ? `<div class="tn-bm-status"><button class="btn-sm btn-sm-confirm" onclick="window._openRegistraMatchTorneo('${torneo.id}','${m.player1_id}','${m.player2_id}','${m.girone}')">Registra</button></div>`
        : canConfirm
          ? `<div class="tn-bm-status"><button class="btn-sm btn-sm-confirm" onclick="window._confirmTorneoMatch('${m.id}')">✓ Conferma</button></div>`
          : !m.confermata && m.winner_id !== null
            ? '<div class="tn-bm-status pending">⏳ In attesa</div>'
            : !m.confermata && !m.winner_id && m.player1_id && m.player2_id
              ? '<div class="tn-bm-status">Da giocare</div>'
              : '';

      html += `<div class="tn-bm-card ${m.confermata ? 'done' : ''}">
        <div class="tn-bm-row ${w1 ? 'winner' : ''} ${!m.player1_id ? 'tbd' : ''}">
          <div class="tn-bm-row-player">
            ${m.player1_id ? avatarEl(p1?.nome||'?', 22, getAvatarUrl(p1?.id)) : '<div class="tn-bm-avatar-ph"></div>'}
            <span class="tn-bm-name">${p1?.nome || 'TBD'}</span>
          </div>
          <span class="tn-bm-score">${s1}</span>
        </div>
        <div class="tn-bm-row ${w2 ? 'winner' : ''} ${!m.player2_id ? 'tbd' : ''}">
          <div class="tn-bm-row-player">
            ${m.player2_id ? avatarEl(p2?.nome||'?', 22, getAvatarUrl(p2?.id)) : '<div class="tn-bm-avatar-ph"></div>'}
            <span class="tn-bm-name">${p2?.nome || 'TBD'}</span>
          </div>
          <span class="tn-bm-score">${s2}</span>
        </div>
        ${statusHtml}
      </div>`;
    });

    html += `</div></div>`;
  }

  html += `</div></div>`;

  // Pulsanti admin
  if (isAdmin && torneo.stato === 'in_corso') {
    if (presentRounds.includes('quarti') && !presentRounds.includes('semifinale')) {
      const quartiDone = rounds['quarti']?.every(m => m.confermata);
      if (quartiDone) html += `<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="window._generaSemiDaQuarti('${torneo.id}')">Genera Semifinali →</button>`;
    }
    if (presentRounds.includes('semifinale') && !presentRounds.includes('finale')) {
      const semiDone = rounds['semifinale']?.every(m => m.confermata);
      if (semiDone) html += `<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="window._generaFinale('${torneo.id}')">Genera Finale →</button>`;
    }
  }

  return html;
}

export async function generaFinale(torneoId) {
  const existing = await get('matches', `torneo_id=eq.${torneoId}&girone=like.finale*&select=id`);
  if (existing.length > 0) return toast('Finale già generata', 'error');

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

export async function generaSemiDaQuarti(torneoId) {
  const allMatches = await get('matches', `torneo_id=eq.${torneoId}&select=*`);

  const existing = allMatches.filter(m => m.girone?.startsWith('semifinale'));
  if (existing.length > 0) return toast('Semifinali già esistenti', 'error');

  const quarti   = allMatches.filter(m => m.girone?.startsWith('quarti') && m.confermata);
  const vincitori = quarti.map(m => m.winner_id).filter(Boolean);

  if (vincitori.length < 2) return toast('Servono i vincitori dei quarti', 'error');

  for (let i = 0; i < vincitori.length; i += 2) {
    const p1 = vincitori[i];
    const p2 = vincitori[i + 1];
    if (p1 && p2) {
      await post('matches', {
        player1_id: p1, player2_id: p2,
        winner_id: null, registrata_da: state.currentUser.id,
        confermata: false, tipo: 'torneo', torneo_id: torneoId, girone: `semifinale_${i/2+1}`
      });
    }
  }

  toast('Semifinali generate!');
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
  const t   = currentTorneo;
  const cfg = TORNEO_CONFIG[t.tipo];

  const allTorneoMatches = await get('matches', `torneo_id=eq.${t.id}&select=*`);

  // Verifica partite pendenti — esclude i bye (player2_id null)
  const pending = allTorneoMatches.filter(m =>
    !m.confermata && m.player1_id && m.player2_id && m.note !== 'bye'
  );
  if (pending.length > 0) {
    return toast(`Ci sono ancora ${pending.length} partite da confermare`, 'error');
  }

  const confirmedMatches = allTorneoMatches.filter(m => m.confermata);
  const tPlayers         = await get('tournament_players', `torneo_id=eq.${t.id}&select=*`);

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
