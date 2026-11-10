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
