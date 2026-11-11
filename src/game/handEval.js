// Évaluation des mains de poker (meilleure combinaison de 5 cartes parmi 7).
// Un score est un tableau [catégorie, ...départages] comparé lexicographiquement.

export const CATEGORY_NAMES = [
  'Carte haute',
  'Paire',
  'Double paire',
  'Brelan',
  'Quinte',
  'Couleur',
  'Full',
  'Carré',
  'Quinte flush',
];

function evaluateFive(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    // Quinte blanche : A-2-3-4-5
    else if (unique[0] === 14 && unique[1] === 5) straightHigh = 5;
  }

  if (straightHigh && isFlush) return [8, straightHigh];

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // Groupes triés par taille puis par hauteur
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const groupRanks = groups.map(([r]) => r);
  const shape = groups.map(([, n]) => n).join('');

  if (shape === '41') return [7, ...groupRanks];
  if (shape === '32') return [6, ...groupRanks];
  if (isFlush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (shape === '311') return [3, ...groupRanks];
  if (shape === '221') return [2, ...groupRanks];
  if (shape === '2111') return [1, ...groupRanks];
  return [0, ...ranks];
}

export function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    yield* combinations(arr, k, i + 1, [...acc, arr[i]]);
  }
}

/** Meilleure main parmi 5 à 7 cartes. Renvoie { score, name, cards }. */
export function bestHand(cards) {
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const score = evaluateFive(combo);
    if (!best || compareScores(score, best.score) > 0) best = { score, cards: combo };
  }
  return { ...best, name: CATEGORY_NAMES[best.score[0]] };
}

/** Type de combinaison (indice dans CATEGORY_NAMES), même avec moins de 5 cartes (ex. avant le flop). */
export function handCategory(cards) {
  if (cards.length >= 5) return bestHand(cards).score[0];
  const counts = new Map();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  if (sizes[0] === 4) return 7;
  if (sizes[0] === 3) return 3;
  if (sizes[0] === 2 && sizes[1] === 2) return 2;
  if (sizes[0] === 2) return 1;
  return 0;
}

// ---------- Description lisible de la combinaison (affichage pendant la partie) ----------

const RANK_PLURAL = { 11: 'valets', 12: 'dames', 13: 'rois', 14: 'As' };
const RANK_SINGULAR = { 11: 'valet', 12: 'dame', 13: 'roi', 14: 'As' };
const SUIT_NAMES = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const plural = (r) => RANK_PLURAL[r] || String(r);
const single = (r) => RANK_SINGULAR[r] || String(r);
const de = (word) => (/^[aeiouyâàéèêAEIOUY]/.test(word) ? `d’${word}` : `de ${word}`);

/**
 * Combinaison actuelle d'un ensemble de 2 à 7 cartes.
 * Renvoie { category, name, label, core } : `core` = les cartes qui forment la combinaison
 * (sans les cartes d'appoint), pour les mettre en valeur.
 */
export function describeHand(cards) {
  if (!cards?.length) return null;
  const pool = cards.length >= 5 ? bestHand(cards).cards : cards;
  const category = cards.length >= 5 ? bestHand(cards).score[0] : handCategory(cards);

  const counts = new Map();
  for (const c of pool) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  const groups = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const high = [...pool].sort((a, b) => b.rank - a.rank)[0];

  let core;
  if ([4, 5, 8].includes(category)) core = pool;
  else if (category === 0) core = [high];
  else {
    const ranks = new Set(groups.map(([r]) => r));
    core = pool.filter((c) => ranks.has(c.rank));
  }

  // Hauteur d'une quinte (la quinte blanche A-2-3-4-5 est « au 5 »)
  const straightHigh = () => {
    const rs = [...new Set(pool.map((c) => c.rank))].sort((a, b) => b - a);
    return rs[0] === 14 && rs[1] === 5 ? 5 : rs[0];
  };
  const [g1, g2] = groups.map(([r]) => r);
  const labels = {
    0: () => `Carte haute : ${single(high.rank)}`,
    1: () => `Paire ${de(plural(g1))}`,
    2: () => `Double paire : ${plural(g1)} et ${plural(g2)}`,
    3: () => `Brelan ${de(plural(g1))}`,
    4: () => `Quinte, hauteur ${single(straightHigh())}`,
    5: () => `Couleur à ${SUIT_NAMES[pool[0].suit] || 'la même couleur'}`,
    6: () => `Full aux ${plural(g1)} par les ${plural(g2)}`,
    7: () => `Carré ${de(plural(g1))}`,
    8: () => `Quinte flush, hauteur ${single(straightHigh())}`,
  };
  return { category, name: CATEGORY_NAMES[category], label: labels[category](), core };
}
