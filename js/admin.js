import { get, post, patch, del } from './api.js';
import { state } from './state.js';
import { toast, confirmDialog, scoreInputModal } from './ui.js';
import { avatarEl } from './avatar.js';
import { confirmMatch } from './matches.js';
import { loadRanking } from './ranking.js';
import { hashPin, generatePin } from './auth.js';
import { getKFactor } from './elo.js';

// =============================================
// ADMIN — pannello completo
// =============================================

export async function loadAdmin() {
  if (!state.currentUser || state.currentUser.ruolo !== 'admin') return;

  const players = await get('players', 'order=nome.asc&select=*');
  state.allPlayers = players;

  document.getElementById('adminPlayerList').innerHTML = players.map(p => `
    <div class="match-item">
      <div class="match-players">
        ${avatarEl(p.nome)}
        <span style="font-weight:600">${p.nome}</span>
        ${p.ruolo === 'admin' ? '<span class="badge badge-torneo">admin</span>' : ''}
        <span style="font-size:11px;color:var(--text2);font-family:var(--font-mono)">Elo: ${p.elo}</span>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-sm btn-sm-confirm" onclick="window._adminResetElo('${p.id}','${p.nome}')">Reset Elo</button>
        <button class="btn-sm btn-sm-confirm" onclick="window._adminResetPin('${p.id}','${p.nome}')">🔑 PIN</button>
        <button class="btn-sm btn-sm-deny"    onclick="window._adminDeletePlayer('${p.id}','${p.nome}')">Elimina</button>
      </div>
    </div>
  `).join('') || '<div class="empty"><p>Nessun giocatore</p></div>';

  const pending = await get('matches', 'confermata=eq.false&order=data.desc&select=*');
  document.getElementById('adminPendingMatches').innerHTML = pending.length === 0
    ? '<div class="empty"><p>Nessuna partita in sospeso</p></div>'
    : pending.map(m => {
        const p1     = players.find(p => p.id === m.player1_id);
        const p2     = players.find(p => p.id === m.player2_id);
        const winner = players.find(p => p.id === m.winner_id);
        const score  = m.punteggio1 != null ? `${m.punteggio1}-${m.punteggio2}` : 'senza score';
        return `<div class="pending-item">
          <div style="font-size:13px">
            <strong>${p1?.nome||'?'}</strong> vs <strong>${p2?.nome||'?'}</strong>
            — ${score} — Vincitore: <span style="color:var(--accent)">${winner?.nome||'?'}</span>
          </div>
          <div class="pending-btns">
            <button class="btn-sm btn-sm-confirm" onclick="window._confirmMatch('${m.id}', true)">✓ Conferma</button>
            <button class="btn-sm btn-sm-deny"    onclick="window._confirmMatch('${m.id}', false)">✗ Elimina</button>
          </div>
        </div>`;
      }).join('');

  await _renderAdminTornei(players);
  await _populateIscriviSelects(players);
}

// =============================================
// GESTIONE PARTITE
// =============================================

export async function adminLoadMatches(filter) {
  if (state.allPlayers.length === 0) {
    state.allPlayers = await get('players', 'order=nome.asc&select=*');
  }

  const queries = {
    pending: 'confermata=eq.false&order=data.desc&select=*',
    libera:  'tipo=eq.libera&order=data.desc&limit=100&select=*',
    torneo:  'tipo=eq.torneo&order=data.desc&limit=100&select=*',
  };
  const matches = await get('matches', queries[filter] || 'order=data.desc&limit=100&select=*');
  const el = document.getElementById('adminMatchList');

  if (matches.length === 0) {
    el.innerHTML = '<div class="empty"><p>Nessuna partita</p></div>';
    return;
  }

  el.innerHTML = matches.map(m => {
    const p1    = state.allPlayers.find(p => p.id === m.player1_id);
    const p2    = state.allPlayers.find(p => p.id === m.player2_id);
    const score = m.punteggio1 != null ? `${m.punteggio1}-${m.punteggio2}` : '?-?';
    return `<div class="match-item" style="flex-wrap:wrap;gap:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${p1?.nome||'?'} vs ${p2?.nome||'?'}</div>
        <div style="font-size:12px;color:var(--text2);font-family:var(--font-mono)">${score} · ${m.tipo} · ${new Date(m.data).toLocaleDateString('it')} · ${m.confermata ? '✓' : '⏳'}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-sm btn-sm-confirm" onclick="window._adminEditMatch('${m.id}','${m.player1_id}','${m.player2_id}','${p1?.nome||'P1'}','${p2?.nome||'P2'}',${m.punteggio1??0},${m.punteggio2??0})">✏️</button>
        <button class="btn-sm btn-sm-deny"    onclick="window._adminDeleteMatch('${m.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

export async function adminDeleteMatch(matchId) {
  confirmDialog('Eliminare questa partita? Le statistiche dei giocatori verranno ricalcolate.', async () => {
    const [m] = await get('matches', `id=eq.${matchId}&select=*`);
    await del('matches', `id=eq.${matchId}`);
    if (m?.confermata) await recalcAllElo();
    toast('Partita eliminata e statistiche aggiornate');
    await adminLoadMatches('all');
    await loadRanking();
  });
}

export function adminEditMatch(matchId, p1Id, p2Id, p1Name, p2Name, s1cur, s2cur) {
  scoreInputModal({
    title: 'MODIFICA',
    p1Name, p2Name,
    s1: s1cur, s2: s2cur,
    onSave: async (s1, s2) => {
      const winnerId = s1 > s2 ? p1Id : p2Id;
      await patch('matches', `id=eq.${matchId}`, { punteggio1: s1, punteggio2: s2, winner_id: winnerId });
      await recalcAllElo();
      toast('Partita aggiornata e statistiche ricalcolate');
      await adminLoadMatches('all');
    }
  });
}

// =============================================
// GESTIONE TORNEI
// =============================================

async function _renderAdminTornei(players) {
  const tornei = await get('tournaments', 'order=data_inizio.desc&select=*');
  const el = document.getElementById('adminTorneoList');
  if (!tornei || tornei.length === 0) {
    el.innerHTML = '<div class="empty"><p>Nessun torneo</p></div>';
    return;
  }
  el.innerHTML = tornei.map(t => `
    <div class="match-item" style="flex-wrap:wrap;gap:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${t.nome}</div>
        <div style="font-size:12px;color:var(--text2)">${t.tipo} · ${t.fase} · ${t.stato}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-sm btn-sm-deny" onclick="window._adminDeleteTorneo('${t.id}','${t.nome}')">🗑 Elimina</button>
      </div>
    </div>
  `).join('');
}

export async function adminDeleteTorneo(torneoId, nome) {
  confirmDialog(`Eliminare il torneo "${nome}"? Le statistiche dei giocatori verranno ricalcolate.`, async () => {
    await del('matches', `torneo_id=eq.${torneoId}`);
    await del('tournament_players', `torneo_id=eq.${torneoId}`);
    await del('tournaments', `id=eq.${torneoId}`);
    await recalcAllElo();
    toast(`Torneo "${nome}" eliminato e statistiche aggiornate`);
    await loadAdmin();
  });
}

// =============================================
// ISCRIZIONE ADMIN A TORNEO
// =============================================

async function _populateIscriviSelects(players) {
  const tornei = await get('tournaments', 'stato=eq.in_corso&order=data_inizio.desc&select=*');

  document.getElementById('admin_iscriviTorneo').innerHTML =
    '<option value="">Seleziona torneo...</option>' +
    (tornei||[]).map(t => `<option value="${t.id}">${t.nome}</option>`).join('');

  document.getElementById('admin_iscriviPlayer').innerHTML =
    '<option value="">Seleziona giocatore...</option>' +
    players.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
}

export async function adminIscriviTorneo() {
  const torneoId = document.getElementById('admin_iscriviTorneo').value;
  const playerId = document.getElementById('admin_iscriviPlayer').value;
  if (!torneoId || !playerId) return toast('Seleziona torneo e giocatore', 'error');

  const existing = await get('tournament_players', `torneo_id=eq.${torneoId}&player_id=eq.${playerId}`);
  if (existing && existing.length > 0) return toast('Giocatore già iscritto', 'error');

  await post('tournament_players', { torneo_id: torneoId, player_id: playerId });
  const nome = state.allPlayers.find(p => p.id === playerId)?.nome || '?';
  toast(`${nome} iscritto al torneo`);
  await loadAdmin();
}

// =============================================
// GIOCATORI
// =============================================

export async function adminAddPlayer() {
  const nome = document.getElementById('admin_newName').value.trim();
  if (!nome) return toast('Inserisci un nome', 'error');

  const existing = await get('players', `nome=ilike.${encodeURIComponent(nome)}`);
  if (existing && existing.length > 0) return toast('Nome già esistente', 'error');

  const pin      = generatePin();
  const pin_hash = await hashPin(pin);

  await post('players', { nome, pin_hash, ruolo: 'player', elo: 1000 });
  document.getElementById('admin_newName').value = '';
  toast(`Giocatore "${nome}" aggiunto! PIN: ${pin}`);
  await loadAdmin();
  await loadRanking();
}

export async function adminDeletePlayer(id, nome) {
  confirmDialog(`Eliminare ${nome}? Lo storico partite rimarrà anonimizzato.`, async () => {
    await patch('players', `id=eq.${id}`, { nome: '[Eliminato]' });
    toast(`${nome} rimosso`);
    await loadAdmin();
    await loadRanking();
  });
}

export async function adminResetElo(id, nome) {
  confirmDialog(`Resettare l'Elo di ${nome} a 1000?`, async () => {
    await patch('players', `id=eq.${id}`, { elo: 1000, vinte: 0, perse: 0, partite_giocate: 0 });
    toast(`Elo di ${nome} resettato`);
    await loadAdmin();
    await loadRanking();
  });
}

export async function adminResetPin(id, nome) {
  confirmDialog(`Resettare il PIN di ${nome}? Verrà generato un nuovo PIN da comunicare al giocatore.`, async () => {
    const pin      = generatePin();
    const pin_hash = await hashPin(pin);
    await patch('players', `id=eq.${id}`, { pin_hash });
    toast(`Nuovo PIN di ${nome}: ${pin} — comunicaglielo!`, 'success');
  });
}

export async function downloadPinBackup() {
  const players = await get('players', 'select=id,nome,pin_hash,creato_il&order=nome.asc');
  const data = JSON.stringify(players.map(p => ({
    nome: p.nome, id: p.id,
    nota: 'Il pin_hash è cifrato. Usare il reset admin per rigenerare il PIN.',
    creato_il: p.creato_il
  })), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `pongatp_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  toast('Backup scaricato');
}

// =============================================
// RICALCOLO COMPLETO ELO
// =============================================
export async function recalcAllElo() {
  const [players, matches] = await Promise.all([
    get('players', 'select=*'),
    get('matches', 'confermata=eq.true&order=data.asc&select=*')
  ]);

  const elo = {}, partite = {}, vinte = {}, perse = {};
  players.forEach(p => {
    elo[p.id] = 1000; partite[p.id] = 0; vinte[p.id] = 0; perse[p.id] = 0;
  });

  for (const m of matches) {
    const { player1_id: p1id, player2_id: p2id, winner_id } = m;
    if (!p1id || !p2id || !winner_id) continue;
    if (elo[p1id] === undefined || elo[p2id] === undefined) continue;

    const winnerIsP1 = winner_id === p1id;
    const EA  = 1 / (1 + Math.pow(10, (elo[p2id] - elo[p1id]) / 400));
    const KA  = getKFactor(partite[p1id]);
    const KB  = getKFactor(partite[p2id]);
    const molt = (m.tipo === 'torneo' && m._molt) ? m._molt : 1;

    elo[p1id] = Math.round(elo[p1id] + KA * molt * ((winnerIsP1 ? 1 : 0) - EA));
    elo[p2id] = Math.round(elo[p2id] + KB * molt * ((winnerIsP1 ? 0 : 1) - (1 - EA)));
    partite[p1id]++; partite[p2id]++;
    if (winnerIsP1) { vinte[p1id]++; perse[p2id]++; }
    else            { vinte[p2id]++; perse[p1id]++; }
  }

  await Promise.all(players.map(p =>
    patch('players', `id=eq.${p.id}`, {
      elo:             elo[p.id]     ?? 1000,
      partite_giocate: partite[p.id] ?? 0,
      vinte:           vinte[p.id]   ?? 0,
      perse:           perse[p.id]   ?? 0,
    })
  ));
}
