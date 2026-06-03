// =============================================
// ELO — Calcoli e validazione
// =============================================

export function getKFactor(partite) {
  if (partite < 10) return 40;
  if (partite > 30) return 24;
  return 32;
}

export function calcElo(eloA, eloB, partiteA, partiteB, winnerIsA) {
  const EA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const EB = 1 - EA;
  const KA = getKFactor(partiteA);
  const KB = getKFactor(partiteB);
  const SA = winnerIsA ? 1 : 0;
  const SB = winnerIsA ? 0 : 1;

  const newEloA = Math.round(eloA + KA * (SA - EA));
  const newEloB = Math.round(eloB + KB * (SB - EB));

  return { newEloA, newEloB, deltaA: newEloA - eloA, deltaB: newEloB - eloB };
}

// Valida punteggio ping pong: vince a 21 con +2, o overtime con +2
export function isValidScore(s1, s2) {
  if (s1 < 0 || s2 < 0) return false;
  const max = Math.max(s1, s2);
  const min = Math.min(s1, s2);
  if (max < 21) return false;
  if (max === 21 && min <= 19) return true;
  if (max > 21 && max - min === 2) return true;
  return false;
}

// Valida punteggio a 11: vince a 11 con +2, o overtime con +2
export function isValidScore11(s1, s2) {
  if (s1 < 0 || s2 < 0) return false;
  const max = Math.max(s1, s2);
  const min = Math.min(s1, s2);
  if (max < 11) return false;
  if (max === 11 && min <= 9) return true;
  if (max > 11 && max - min === 2) return true;
  return false;
}
