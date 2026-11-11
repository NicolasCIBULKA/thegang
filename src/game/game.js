// Équivalents de INVALID_MOVE et ActivePlayers.ALL de 'boardgame.io/core',
// inlinés pour que ce fichier reste importable tel quel depuis Node (ESM) et Vite.
const INVALID_MOVE = 'INVALID_MOVE';
const ALL_PLAYERS_ACTIVE = { all: null };

import { createDeck } from './cards.js';
import { bestHand, compareScores, handCategory, CATEGORY_NAMES } from './handEval.js';
import { MODES, COMPLICES, SPECIAL_JACK, EXTENSIONS } from './specialCards.js';

// Les 4 tours d'un casse, la couleur de jetons associée et le nombre de cartes communes visibles.
export const ROUNDS = [
  { key: 'white', label: 'Pré-flop', community: 0 },
  { key: 'yellow', label: 'Flop', community: 3 },
  { key: 'orange', label: 'Turn', community: 4 },
  { key: 'red', label: 'River', community: 5 },
];

export const WINS_NEEDED = 3;
const FACE_RANKS = [11, 12, 13];

// ---------- Utilitaires ----------

const players = (ctx) => ctx.playOrder;
const has = (G, id) => G.challenges.includes(id);
const emptyChips = () => Object.fromEntries(ROUNDS.map((r) => [r.key, null]));
const sameCard = (a, b) => a.rank === b.rank && a.suit === b.suit;

/** Dernier événement marquant : sert au cerveau du braquage pour choisir sa réplique (identique pour tous). */
function emit(G, type, data = {}) {
  G.eventSeq = (G.eventSeq || 0) + 1;
  G.event = { type, seq: G.eventSeq, heist: G.heist, ...data };
}

function say(G, text) {
  G.feed.push({ text });
}

function sortMiddle(G) {
  G.middle.sort((a, b) => a - b);
}

/** Pioche une carte dans une pile cyclique (Effraction / Complice) : la carte revient dessous après usage. */
function drawFromStack(stack, random) {
  if (stack.cards.length === 0) return null;
  const id = stack.cards.shift();
  stack.cards.push(id);
  stack.drawn += 1;
  // Premier passage dans l'ordre ; au bout de la pile, on mélange.
  if (stack.drawn % stack.cards.length === 0) stack.cards = random.Shuffle(stack.cards);
  return id;
}

// ---------- Jetons sombres (Effractions 2 et 6) ----------

export function isDarkChip(G, round, stars, numPlayers) {
  if (round > 2) return false;
  if (has(G, 2) && stars === 1) return true;
  if (has(G, 6) && stars === numPlayers) return true;
  return false;
}

// ---------- Déroulement d'un casse ----------

/**
 * Paquet arrangé pour une donne imposée (tutoriel, tests) : { hands: { pid: [cartes] }, community: [5 cartes] }.
 * Les cartes sont tirées par la fin du tableau : d'abord les mains, joueur par joueur, puis les cartes communes.
 */
function stackedDeck(deal, order, handSize, random) {
  const drawOrder = [...order.flatMap((pid) => deal.hands[pid].slice(0, handSize)), ...deal.community];
  const used = new Set(drawOrder.map((c) => `${c.rank}${c.suit}`));
  const rest = random.Shuffle(createDeck().filter((c) => !used.has(`${c.rank}${c.suit}`)));
  return [...rest, ...drawOrder.reverse()];
}

function startHeist(G, ctx, random) {
  G.heist += 1;
  G.feed = [];
  G.secrets = [];
  G.result = null;
  G.guess = null;
  G.lastSteal = null;
  G.muscle = null;
  G.pendingDiscard = {};
  G.passChoices = {};
  G.ready = {};

  // Cartes actives pour ce casse (préparées à la fin du casse précédent)
  G.challenges = [...G.upcoming.challenges];
  G.specialist = G.upcoming.specialist ? { id: G.upcoming.specialist, used: false } : null;
  G.upcoming = { challenges: [], specialist: null };

  const handSize = has(G, 10) ? 3 : 2;
  const deck = G.forcedDeal ? stackedDeck(G.forcedDeal, players(ctx), handSize, random) : random.Shuffle(createDeck());
  delete G.forcedDeal; // une donne imposée ne sert qu'au premier casse
  G.hands = {};
  G.chips = {};
  for (const pid of players(ctx)) {
    G.hands[pid] = Array.from({ length: handSize }, () => deck.pop());
    G.chips[pid] = emptyChips();
    G.ready[pid] = false;
  }
  G.deck = deck;
  G.community = [];
  G.middle = [];
  G.round = 0;

  // Complices automatiques
  const spec = G.specialist?.id;
  if (spec === 3) {
    for (const pid of players(ctx)) {
      const n = G.hands[pid].filter((c) => FACE_RANKS.includes(c.rank)).length;
      say(G, `Actionnaire : {${pid}} a ${n} tête${n > 1 ? 's' : ''}.`);
    }
    G.specialist.used = true;
  }
  if (spec === 8) {
    for (const pid of players(ctx)) {
      const sum = G.hands[pid].reduce((s, c) => s + (c.rank === 14 ? 11 : Math.min(c.rank, 10)), 0);
      say(G, `Génie des chiffres : les cartes de {${pid}} font ${sum}.`);
    }
    G.specialist.used = true;
  }
  if (spec === 6) {
    G.phase = 'pass';
    emit(G, 'pass');
    G.specialist.used = true;
    return;
  }
  G.phase = 'bidding';
  enterRound(G, ctx, 0);
}

/** Entre dans un tour : révèle les cartes communes manquantes, gère les tours sautés et les effets du flop. */
function enterRound(G, ctx, r) {
  G.round = r;
  while (G.community.length < ROUNDS[r].community) G.community.push(G.deck.pop());

  // Tours sautés
  if (r === 0 && has(G, 1)) {
    say(G, 'Ouverture facile : pas de jetons blancs, le flop est révélé.');
    return enterRound(G, ctx, 1);
  }
  if (r === 2 && has(G, 5)) {
    say(G, 'Fuite précipitée : pas de jetons orange, turn et river sont révélés.');
    return enterRound(G, ctx, 3);
  }

  // Effets déclenchés par le flop (nécessitent que les jetons blancs aient été joués)
  const whitePlayed = players(ctx).some((p) => G.chips[p].white != null);
  if (r === 1 && whitePlayed) {
    const faceOnFlop = G.community.slice(0, 3).some((c) => FACE_RANKS.includes(c.rank));
    const n = players(ctx).length;
    if (has(G, 3) && faceOnFlop) redraw(G, ctx, (p) => G.chips[p].white === 1, 'Détecteurs de mouvement');
    if (has(G, 7) && !faceOnFlop) redraw(G, ctx, (p) => G.chips[p].white === n, 'Barrières photoélectriques');
  }

  if (has(G, 8) && r > 0) say(G, `Panne d’électricité : les jetons du tour précédent sont défaussés.`);
  G.middle = players(ctx).map((_, i) => i + 1);
  G.lastSteal = null;
  emit(G, 'round', { round: r });
}

function redraw(G, ctx, predicate, cardName) {
  const pid = players(ctx).find(predicate);
  if (pid == null) return;
  const n = G.hands[pid].length;
  G.hands[pid] = Array.from({ length: n }, () => G.deck.pop());
  say(G, `${cardName} : {${pid}} défausse ses cartes et en repioche ${n}.`);
}

function roundComplete(G, ctx) {
  const color = ROUNDS[G.round].key;
  return (
    players(ctx).every((pid) => G.chips[pid][color] != null) && Object.keys(G.pendingDiscard).length === 0
  );
}

function maybeAdvance(G, ctx, random) {
  if (G.phase !== 'bidding' || !roundComplete(G, ctx)) return;
  if (G.round < 3) {
    enterRound(G, ctx, G.round + 1);
    return;
  }
  // Fin de la river : devinettes éventuelles, sinon ouverture du coffre
  const needRank = has(G, 4);
  const needCategory = has(G, 9);
  if (needRank || needCategory) {
    const n = players(ctx).length;
    const target = players(ctx).find((p) => G.chips[p].red === n);
    G.guess = { target, needRank, needCategory, answer: null, votes: {} };
    G.phase = 'guess';
    emit(G, 'guess', { target, needRank, needCategory });
    return;
  }
  openVault(G, ctx, random);
}

/** Compare deux joueurs à l'abattage, en tenant compte du Gros bras. */
function compareAtShowdown(a, b, muscle) {
  if (a.hand.score[0] === b.hand.score[0] && muscle != null && (a.pid === muscle || b.pid === muscle)) {
    return a.pid === muscle ? 1 : -1;
  }
  return compareScores(a.hand.score, b.hand.score);
}

/** Vérifie le coffre : les mains doivent être dans l'ordre des jetons rouges (égalités tolérées). */
export function resolveVault(hands, community, redChips, muscle = null) {
  const list = Object.keys(hands)
    .map((pid) => ({ pid, stars: redChips[pid], hand: bestHand([...hands[pid], ...community]) }))
    .sort((a, b) => a.stars - b.stars);

  let success = true;
  if (list.length) list[0].ok = true;
  for (let i = 0; i < list.length - 1; i++) {
    const cmp = compareAtShowdown(list[i], list[i + 1], muscle);
    list[i + 1].ok = cmp <= 0;
    if (cmp > 0) success = false;
  }
  return {
    success,
    order: list.map((p) => ({
      pid: p.pid,
      stars: p.stars,
      handName: p.hand.name,
      bestCards: p.hand.cards,
      ok: p.ok,
      muscle: p.pid === muscle,
    })),
  };
}

function openVault(G, ctx, random) {
  const red = Object.fromEntries(players(ctx).map((pid) => [pid, G.chips[pid].red]));
  const result = resolveVault(G.hands, G.community, red, G.muscle);
  if (G.guess && !G.guess.correct) result.success = false;
  result.guess = G.guess;
  G.result = result;
  G.phase = 'reveal';
  emit(G, 'vault', { success: result.success, guessFailed: !!(G.guess && !G.guess.correct) });
  if (result.success) G.vaults.success += 1;
  else G.vaults.alarm += 1;
  prepareUpcoming(G, random, result.success);
}

/** Prépare les cartes spéciales du casse suivant, selon le mode. */
function prepareUpcoming(G, random, success) {
  const up = { challenges: [...G.permanent], specialist: null };
  if (G.mode === 'avance' || G.mode === 'pro') {
    if (success) {
      const id = drawFromStack(G.stacks.effraction, random);
      if (id) up.challenges.push(id);
    } else {
      up.specialist = drawFromStack(G.stacks.complice, random);
    }
  }
  if (G.mode === 'gangster') {
    // On défausse l'Effraction au plus petit numéro et on en révèle une nouvelle.
    const kept = [...G.challenges].sort((a, b) => a - b).slice(1);
    let id = drawFromStack(G.stacks.effraction, random);
    // Évite un doublon avec la carte conservée
    for (let tries = 0; kept.includes(id) && tries < 10; tries++) id = drawFromStack(G.stacks.effraction, random);
    up.challenges = [...kept, id];
  }
  G.upcoming = up;
}

// ---------- Coups : jetons ----------

function takeChip({ G, ctx, playerID, random }, stars, from = 'middle') {
  if (G.phase !== 'bidding') return INVALID_MOVE;
  const color = ROUNDS[G.round].key;
  const n = players(ctx).length;
  const mine = G.chips[playerID][color];
  // Un jeton sombre déjà pris ne change plus de propriétaire.
  if (mine != null && isDarkChip(G, G.round, mine, n)) return INVALID_MOVE;

  if (from === 'middle') {
    const idx = G.middle.indexOf(stars);
    if (idx === -1) return INVALID_MOVE;
    G.middle.splice(idx, 1);
    G.lastSteal = null;
  } else {
    if (from === playerID || !G.chips[from]) return INVALID_MOVE;
    if (G.chips[from][color] !== stars) return INVALID_MOVE;
    if (isDarkChip(G, G.round, stars, n)) return INVALID_MOVE;
    G.chips[from][color] = null;
    G.lastSteal = { thief: playerID, victim: from, stars, color, id: (G.lastSteal?.id || 0) + 1 };
    emit(G, 'steal', { thief: playerID, victim: from, stars });
  }
  if (mine != null) G.middle.push(mine);
  sortMiddle(G);
  G.chips[playerID][color] = stars;
  maybeAdvance(G, ctx, random);
}

function returnChip({ G, ctx, playerID }) {
  if (G.phase !== 'bidding') return INVALID_MOVE;
  const color = ROUNDS[G.round].key;
  const mine = G.chips[playerID][color];
  if (mine == null || isDarkChip(G, G.round, mine, players(ctx).length)) return INVALID_MOVE;
  G.chips[playerID][color] = null;
  G.middle.push(mine);
  sortMiddle(G);
}

// ---------- Coups : Complices ----------

function useSpecialist({ G, ctx, playerID, random }, payload = {}) {
  const spec = G.specialist;
  if (!spec || spec.used || G.phase !== 'bidding') return INVALID_MOVE;
  if (COMPLICES[spec.id].kind !== 'action') return INVALID_MOVE;
  if (Object.keys(G.pendingDiscard).length) return INVALID_MOVE;
  const hand = G.hands[playerID];

  switch (spec.id) {
    case 1: {
      // Informateur : le joueur montre une de SES cartes à un autre
      const { to, cardIndex } = payload;
      if (!G.hands[to] || to === playerID || !hand[cardIndex]) return INVALID_MOVE;
      G.secrets.push({ to, from: playerID, card: hand[cardIndex] });
      say(G, `Informateur : {${playerID}} a montré une carte à {${to}}.`);
      break;
    }
    case 2: {
      const cat = handCategory([...hand, ...G.community]);
      say(G, `Conductrice : la meilleure combinaison actuelle de {${playerID}} est « ${CATEGORY_NAMES[cat]} ».`);
      break;
    }
    case 4: {
      const { target, rank } = payload;
      if (!G.hands[target] || !(rank >= 2 && rank <= 14)) return INVALID_MOVE;
      const count = G.hands[target].filter((c) => c.rank === rank).length;
      say(G, `Cerveau de la bande : {${target}} a ${count} carte${count > 1 ? 's' : ''} de valeur [${rank}].`);
      break;
    }
    case 5: {
      hand.push(G.deck.pop());
      G.pendingDiscard[playerID] = 'hacker';
      say(G, `Hackeuse : {${playerID}} pioche une carte et va en défausser une.`);
      break;
    }
    case 7: {
      hand.push({ ...SPECIAL_JACK });
      G.pendingDiscard[playerID] = 'jack';
      say(G, `Valet : {${playerID}} prend le Valet spécial et va défausser une autre carte.`);
      break;
    }
    case 9: {
      const pool = random.Shuffle(players(ctx).flatMap((pid) => G.hands[pid]));
      for (const pid of players(ctx)) G.hands[pid] = pool.splice(0, G.hands[pid].length);
      say(G, `Arnaqueuse : toutes les cartes personnelles ont été mélangées et redistribuées.`);
      break;
    }
    case 10: {
      G.muscle = playerID;
      say(G, `Gros bras : {${playerID}} bat toute main du même type à l’abattage.`);
      break;
    }
    default:
      return INVALID_MOVE;
  }
  spec.used = true;
  spec.by = playerID;
  emit(G, 'special', { id: spec.id, by: playerID });
}

function discardCard({ G, ctx, playerID, random }, cardIndex) {
  const reason = G.pendingDiscard[playerID];
  const hand = G.hands[playerID];
  if (!reason || !hand[cardIndex]) return INVALID_MOVE;
  if (reason === 'jack' && hand[cardIndex].suit === SPECIAL_JACK.suit) return INVALID_MOVE;
  hand.splice(cardIndex, 1);
  delete G.pendingDiscard[playerID];
  maybeAdvance(G, ctx, random);
}

/** Coordinateur : chacun choisit une carte à passer au voisin suivant. */
function passCard({ G, ctx, playerID }, cardIndex) {
  if (G.phase !== 'pass' || !G.hands[playerID][cardIndex]) return INVALID_MOVE;
  G.passChoices[playerID] = cardIndex;
  const order = players(ctx);
  if (!order.every((pid) => G.passChoices[pid] != null)) return;

  const given = Object.fromEntries(order.map((pid) => [pid, G.hands[pid][G.passChoices[pid]]]));
  order.forEach((pid, i) => {
    const giver = order[(i - 1 + order.length) % order.length];
    G.hands[pid] = G.hands[pid].filter((_, idx) => idx !== G.passChoices[pid]);
    G.hands[pid].push(given[giver]);
  });
  G.passChoices = {};
  say(G, 'Coordinateur : chacun a passé une carte à son voisin.');
  G.phase = 'bidding';
  enterRound(G, ctx, 0);
}

// ---------- Coups : devinettes (Effractions 4 et 9) et fin de casse ----------

// Contrôle de sécurité (Effractions 4 et 9) : tous les joueurs sauf la cible votent.
// La réponse n'est retenue que lorsque chacun a validé exactement le même choix.
export function guessVoters(G, ctx) {
  return players(ctx).filter((pid) => pid !== G.guess.target);
}

const sameVote = (a, b, guess) =>
  (!guess.needRank || a.rank === b.rank) && (!guess.needCategory || a.category === b.category);

function voteGuess({ G, ctx, playerID, random }, { rank, category } = {}) {
  if (G.phase !== 'guess' || playerID === G.guess.target) return INVALID_MOVE;
  if (G.guess.needRank && !(rank >= 2 && rank <= 14)) return INVALID_MOVE;
  if (G.guess.needCategory && !(category >= 0 && category < CATEGORY_NAMES.length)) return INVALID_MOVE;

  G.guess.votes[playerID] = {
    ...(G.guess.needRank ? { rank } : {}),
    ...(G.guess.needCategory ? { category } : {}),
  };

  const voters = guessVoters(G, ctx);
  const votes = voters.map((pid) => G.guess.votes[pid]);
  if (votes.some((v) => !v)) return;
  if (!votes.every((v) => sameVote(v, votes[0], G.guess))) return; // désaccord : on attend que l'équipe converge

  const target = G.guess.target;
  const answer = votes[0];
  let correct = true;
  if (G.guess.needRank) correct &&= G.hands[target].some((c) => c.rank === answer.rank);
  if (G.guess.needCategory) correct &&= bestHand([...G.hands[target], ...G.community]).score[0] === answer.category;
  G.guess.answer = answer;
  G.guess.correct = correct;
  openVault(G, ctx, random);
}

/** Retire son vote (pour changer d'avis pendant la discussion). */
function cancelVote({ G, playerID }) {
  if (G.phase !== 'guess' || !G.guess.votes[playerID]) return INVALID_MOVE;
  delete G.guess.votes[playerID];
}

function setReady({ G, playerID }, value = true) {
  if (G.phase !== 'reveal') return INVALID_MOVE;
  G.ready[playerID] = value;
}

// ---------- Définition du jeu ----------

// forced (tests uniquement) : impose les cartes spéciales du premier casse.
export function createSetup(mode = 'basique', forced = null, extensions = []) {
  return ({ ctx, random }) => {
    const m = MODES[mode] ? mode : 'basique';
    // Extensions choisies à la création (seules celles qui existent sont gardées)
    const ext = (Array.isArray(extensions) ? extensions : []).filter((id) => EXTENSIONS[id]);
    const effractionIds = m === 'avance' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const G = {
      mode: m,
      alarmsToLose: m === 'gangster' ? 2 : 3,
      extensions: ext,
      heist: 0,
      vaults: { success: 0, alarm: 0 },
      permanent: [],
      stacks: {
        effraction: { cards: effractionIds, drawn: 0 },
        complice: { cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], drawn: 0 },
      },
      upcoming: { challenges: [], specialist: null },
    };
    if (m === 'pro' || m === 'gangster') {
      G.stacks.effraction.cards = random.Shuffle(G.stacks.effraction.cards);
    }
    if (m === 'pro') {
      // Une Effraction permanente, retirée de la pile
      G.permanent = [G.stacks.effraction.cards.shift()];
      G.stacks.effraction.cards.sort((a, b) => a - b);
      G.upcoming.challenges = [...G.permanent];
    }
    if (m === 'gangster') {
      G.upcoming.challenges = [drawFromStack(G.stacks.effraction, random), drawFromStack(G.stacks.effraction, random)];
    }
    if (forced) G.upcoming = { challenges: forced.challenges || [], specialist: forced.specialist || null };
    if (forced?.deal) G.forcedDeal = forced.deal;
    startHeist(G, ctx, random);
    return G;
  };
}

export const TheGang = {
  name: 'the-gang',
  minPlayers: 3,
  maxPlayers: 6,

  // setupData vient du lobby : { mode }
  setup: (context, setupData) => createSetup(setupData?.mode, null, setupData?.extensions)(context),

  turn: {
    activePlayers: ALL_PLAYERS_ACTIVE,
    // Après la révélation, quand tout le monde est prêt, on enchaîne le casse suivant.
    onMove: ({ G, ctx, random }) => {
      if (G.phase === 'reveal' && players(ctx).every((pid) => G.ready[pid])) startHeist(G, ctx, random);
    },
  },

  moves: {
    takeChip: { move: takeChip, client: false },
    returnChip: { move: returnChip, client: false },
    useSpecialist: { move: useSpecialist, client: false },
    discardCard: { move: discardCard, client: false },
    passCard: { move: passCard, client: false },
    voteGuess: { move: voteGuess, client: false },
    cancelVote: { move: cancelVote, client: false },
    setReady: { move: setReady, client: false },
  },

  endIf: ({ G }) => {
    if (G.vaults.success >= WINS_NEEDED) return { winner: true };
    if (G.vaults.alarm >= G.alarmsToLose) return { winner: false };
  },

  // Infos cachées : chacun ne voit que ses cartes (sauf à la révélation) et ses secrets.
  playerView: ({ G, playerID }) => {
    const { deck, stacks, ...rest } = G;
    const view = { ...rest, secrets: G.secrets.filter((s) => s.to === playerID) };
    if (G.phase !== 'reveal') {
      view.hands = Object.fromEntries(
        Object.keys(G.hands).map((pid) => [pid, pid === playerID ? G.hands[pid] : null]),
      );
      view.handSizes = Object.fromEntries(Object.keys(G.hands).map((pid) => [pid, G.hands[pid].length]));
      view.passChoices = { [playerID]: G.passChoices[playerID] };
    }
    // Panne d'électricité : les jetons des tours précédents ont été défaussés.
    if (G.challenges.includes(8)) {
      const visibleFrom = G.phase === 'reveal' ? 3 : G.round;
      view.chips = Object.fromEntries(
        Object.entries(G.chips).map(([pid, chips]) => [
          pid,
          Object.fromEntries(ROUNDS.map((r, i) => [r.key, i >= visibleFrom ? chips[r.key] : null])),
        ]),
      );
    }
    return view;
  },
};
