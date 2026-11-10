// Équivalents de INVALID_MOVE et ActivePlayers.ALL de 'boardgame.io/core',
// inlinés pour que ce fichier reste importable tel quel depuis Node (ESM) et Vite.
const INVALID_MOVE = 'INVALID_MOVE';
const ALL_PLAYERS_ACTIVE = { all: null };
import { createDeck } from './cards.js';
import { bestHand, compareScores } from './handEval.js';

// Les 4 manches d'un casse et la couleur de jetons associée
export const ROUNDS = [
  { key: 'white', label: 'Pré-flop', reveal: 0 },
  { key: 'yellow', label: 'Flop', reveal: 3 },
  { key: 'orange', label: 'Turn', reveal: 1 },
  { key: 'red', label: 'River', reveal: 1 },
];

export const WINS_NEEDED = 3;
export const ALARMS_TO_LOSE = 3;

function emptyChips() {
  return Object.fromEntries(ROUNDS.map((r) => [r.key, null]));
}

function allPlayers(ctx) {
  return ctx.playOrder;
}

/** Démarre un nouveau casse : mélange, distribue 2 cartes, remet les jetons blancs au centre. */
function startHeist(G, ctx, random) {
  const deck = random.Shuffle(createDeck());
  G.hands = {};
  G.chips = {};
  G.ready = {};
  for (const pid of allPlayers(ctx)) {
    G.hands[pid] = [deck.pop(), deck.pop()];
    G.chips[pid] = emptyChips();
    G.ready[pid] = false;
  }
  G.deck = deck;
  G.community = [];
  G.round = 0;
  G.phase = 'bidding';
  G.middle = allPlayers(ctx).map((_, i) => i + 1);
  G.result = null;
  G.lastSteal = null;
  G.heist += 1;
}

function resetReady(G) {
  for (const pid of Object.keys(G.ready)) G.ready[pid] = false;
}

function currentColor(G) {
  return ROUNDS[G.round].key;
}

/** Vérifie le coffre : les mains doivent être dans l'ordre des jetons rouges (égalités tolérées). */
export function resolveVault(hands, community, redChips) {
  const players = Object.keys(hands)
    .map((pid) => ({
      pid,
      stars: redChips[pid],
      hand: bestHand([...hands[pid], ...community]),
    }))
    .sort((a, b) => a.stars - b.stars);

  let success = true;
  for (let i = 0; i < players.length - 1; i++) {
    const cmp = compareScores(players[i].hand.score, players[i + 1].hand.score);
    players[i + 1].ok = cmp <= 0;
    if (cmp > 0) success = false;
  }
  if (players.length) players[0].ok = true;

  return {
    success,
    order: players.map((p) => ({
      pid: p.pid,
      stars: p.stars,
      handName: p.hand.name,
      bestCards: p.hand.cards,
      ok: p.ok,
    })),
  };
}

function advance(G, ctx) {
  if (G.round < ROUNDS.length - 1) {
    G.round += 1;
    const n = ROUNDS[G.round].reveal;
    for (let i = 0; i < n; i++) G.community.push(G.deck.pop());
    G.middle = allPlayers(ctx).map((_, i) => i + 1);
    resetReady(G);
    G.lastSteal = null;
    G.log.push(`${ROUNDS[G.round].label} : nouvelles cartes révélées.`);
    return;
  }
  // Fin de la river : on ouvre le coffre
  const red = Object.fromEntries(Object.entries(G.chips).map(([pid, c]) => [pid, c.red]));
  const result = resolveVault(G.hands, G.community, red);
  G.result = result;
  G.phase = 'reveal';
  if (result.success) G.vaults.success += 1;
  else G.vaults.alarm += 1;
  resetReady(G);
  G.log.push(result.success ? `Casse n°${G.heist} réussi !` : `Casse n°${G.heist} raté : une alarme se déclenche.`);
}

// ---------- Coups ----------

function takeChip({ G, ctx, playerID }, stars, from = 'middle') {
  if (G.phase !== 'bidding') return INVALID_MOVE;
  const color = currentColor(G);
  const mine = G.chips[playerID][color];

  if (from === 'middle') {
    const idx = G.middle.indexOf(stars);
    if (idx === -1) return INVALID_MOVE;
    G.middle.splice(idx, 1);
    G.lastSteal = null;
  } else {
    // Vol : le jeton passe chez le voleur, la victime n'a plus rien.
    if (from === playerID || !G.chips[from]) return INVALID_MOVE;
    if (G.chips[from][color] !== stars) return INVALID_MOVE;
    G.chips[from][color] = null;
    G.lastSteal = { thief: playerID, victim: from, stars, color, id: (G.lastSteal?.id || 0) + 1 };
  }
  // L'ancien jeton du joueur retourne au centre.
  if (mine != null) G.middle.push(mine);
  G.middle.sort((a, b) => a - b);
  G.chips[playerID][color] = stars;

  // Dès que tout le monde a un jeton de la couleur en cours, on passe à l'étape suivante.
  if (allPlayers(ctx).every((pid) => G.chips[pid][color] != null)) advance(G, ctx);
}

function returnChip({ G, playerID }) {
  if (G.phase !== 'bidding') return INVALID_MOVE;
  const color = currentColor(G);
  const mine = G.chips[playerID][color];
  if (mine == null) return INVALID_MOVE;
  G.chips[playerID][color] = null;
  G.middle.push(mine);
  G.middle.sort((a, b) => a - b);
}

// « Prêt » ne sert plus qu'à enchaîner le casse suivant après la révélation.
function setReady({ G, playerID }, value = true) {
  if (G.phase === 'reveal') {
    G.ready[playerID] = value;
    // endIf termine la partie avant ce point si elle est gagnée/perdue
    return;
  }
  return INVALID_MOVE;
}

export const TheGang = {
  name: 'the-gang',
  minPlayers: 3,
  maxPlayers: 6,

  setup: ({ ctx, random }) => {
    const G = {
      heist: 0,
      vaults: { success: 0, alarm: 0 },
      log: [],
    };
    startHeist(G, ctx, random);
    G.log.push('Casse n°1 : les cartes sont distribuées.');
    return G;
  },

  turn: {
    activePlayers: ALL_PLAYERS_ACTIVE,
    // Après la révélation, quand tout le monde est prêt, on enchaîne le casse suivant.
    onMove: ({ G, ctx, random }) => {
      if (G.phase === 'reveal' && allPlayers(ctx).every((pid) => G.ready[pid])) {
        startHeist(G, ctx, random);
        G.log.push(`Casse n°${G.heist} : les cartes sont distribuées.`);
      }
    },
  },

  moves: {
    takeChip: { move: takeChip, client: false },
    returnChip: { move: returnChip, client: false },
    setReady: { move: setReady, client: false },
  },

  endIf: ({ G }) => {
    if (G.vaults.success >= WINS_NEEDED) return { winner: true };
    if (G.vaults.alarm >= ALARMS_TO_LOSE) return { winner: false };
  },

  // Infos cachées : chacun ne voit que ses cartes, sauf à la révélation.
  playerView: ({ G, playerID }) => {
    const { deck, ...rest } = G;
    if (G.phase === 'reveal') return rest;
    const hands = {};
    for (const pid of Object.keys(G.hands)) {
      hands[pid] = pid === playerID ? G.hands[pid] : null;
    }
    return { ...rest, hands };
  },
};
