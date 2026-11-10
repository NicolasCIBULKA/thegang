import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { TheGang, createSetup, resolveVault } from './game.js';
import { bestHand } from './handEval.js';

let matchCount = 0;
function play(n = 3, { mode = 'basique', challenges, specialist, deal } = {}) {
  const forced = challenges || specialist || deal ? { challenges, specialist, deal } : null;
  const game = { ...TheGang, setup: createSetup(mode, forced) };
  const multiplayer = Local();
  const matchID = `special-${++matchCount}`;
  const clients = Array.from({ length: n }, (_, i) =>
    Client({ game, numPlayers: n, playerID: String(i), matchID, multiplayer }),
  );
  clients.forEach((c) => c.start());
  return clients;
}
const G = (c) => c.getState().G;
/** Chaque joueur i prend le jeton i+1 au centre. */
const takeRound = (clients) => clients.forEach((c, i) => c.moves.takeChip(i + 1));
const FACES = [11, 12, 13];

describe('cartes Effraction', () => {
  it('1 · Ouverture facile : on commence directement au flop', () => {
    const [p0] = play(3, { challenges: [1] });
    expect(G(p0).round).toBe(1);
    expect(G(p0).community).toHaveLength(3);
  });

  it('5 · Fuite précipitée : turn et river arrivent ensemble', () => {
    const clients = play(3, { challenges: [5] });
    takeRound(clients);
    takeRound(clients);
    expect(G(clients[0]).round).toBe(3);
    expect(G(clients[0]).community).toHaveLength(5);
  });

  it('10 · Caméras : 3 cartes personnelles', () => {
    const clients = play(4, { challenges: [10] });
    clients.forEach((c, i) => expect(G(c).hands[String(i)]).toHaveLength(3));
  });

  it('2 · Capteurs de bruit : le jeton 1★ pris ne bouge plus', () => {
    const [p0, p1] = play(3, { challenges: [2] });
    p0.moves.takeChip(1);
    p1.moves.takeChip(1, '0'); // vol refusé
    p0.moves.returnChip(); // rendre refusé
    p0.moves.takeChip(2); // changer refusé
    expect(G(p0).chips['0'].white).toBe(1);
    expect(G(p0).chips['1'].white).toBeNull();
    // Le jeton 2★ reste volable
    p1.moves.takeChip(2);
    p0.moves.takeChip(3);
    expect(G(p0).chips['0'].white).toBe(1);
  });

  it('6 · Grille d’aération : le jeton le plus étoilé est sombre', () => {
    const [p0, p1] = play(4, { challenges: [6] });
    p0.moves.takeChip(4);
    p1.moves.takeChip(4, '0');
    expect(G(p0).chips['0'].white).toBe(4);
  });

  it('8 · Panne d’électricité : les jetons des tours précédents sont cachés', () => {
    const clients = play(3, { challenges: [8] });
    takeRound(clients);
    const g = G(clients[0]);
    expect(g.round).toBe(1);
    expect(g.chips['0'].white).toBeNull();
    expect(g.chips['1'].white).toBeNull();
  });

  it('3 et 7 · repioche selon les têtes du flop', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const clients = play(3, { challenges: [3, 7] });
      const before = clients.map((c, i) => JSON.stringify(G(c).hands[String(i)]));
      takeRound(clients); // joueur 0 : 1★ blanc, joueur 2 : 3★ blanc
      const g = G(clients[0]);
      const faceOnFlop = g.community.slice(0, 3).some((c) => FACES.includes(c.rank));
      const after = clients.map((c, i) => JSON.stringify(G(c).hands[String(i)]));
      const redrawn = faceOnFlop ? 0 : 2;
      const untouched = faceOnFlop ? 2 : 0;
      expect(after[redrawn]).not.toBe(before[redrawn]);
      expect(after[untouched]).toBe(before[untouched]);
      expect(after[1]).toBe(before[1]);
      expect(g.feed.some((f) => /repioche/.test(f.text))).toBe(true);
    }
  });

  it('4 · Scan rétinien : bonne valeur devinée → la devinette est validée', () => {
    const clients = play(3, { challenges: [4] });
    for (let r = 0; r < 4; r++) takeRound(clients);
    expect(G(clients[0]).phase).toBe('guess');
    expect(G(clients[0]).guess.target).toBe('2'); // 3★ rouge
    clients[2].moves.submitGuess({ rank: 2 }); // la cible ne peut pas deviner
    expect(G(clients[0]).phase).toBe('guess');
    const rank = G(clients[2]).hands['2'][0].rank;
    clients[0].moves.submitGuess({ rank });
    const g = G(clients[0]);
    expect(g.phase).toBe('reveal');
    expect(g.result.guess.correct).toBe(true);
  });

  it('4 · Scan rétinien : mauvaise valeur → alarme quoi qu’il arrive', () => {
    const clients = play(3, { challenges: [4] });
    for (let r = 0; r < 4; r++) takeRound(clients);
    const ranks = G(clients[2]).hands['2'].map((c) => c.rank);
    const wrong = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].find((r) => !ranks.includes(r));
    clients[1].moves.submitGuess({ rank: wrong });
    const g = G(clients[0]);
    expect(g.result.success).toBe(false);
    expect(g.vaults.alarm).toBe(1);
  });

  it('9 · Lecteur d’empreintes : on devine le type de combinaison', () => {
    const clients = play(3, { challenges: [9] });
    for (let r = 0; r < 4; r++) takeRound(clients);
    const g0 = G(clients[2]);
    const category = bestHand([...g0.hands['2'], ...g0.community]).score[0];
    clients[0].moves.submitGuess({ category });
    expect(G(clients[0]).result.guess.correct).toBe(true);
  });
});

describe('cartes Complice', () => {
  it('3 · Actionnaire et 8 · Génie : annonces automatiques', () => {
    const [a] = play(3, { specialist: 3 });
    expect(G(a).feed.filter((f) => /Actionnaire/.test(f.text))).toHaveLength(3);
    const [b] = play(3, { specialist: 8 });
    expect(G(b).feed.filter((f) => /Génie/.test(f.text))).toHaveLength(3);
  });

  it('6 · Coordinateur : chaque joueur passe une carte au suivant', () => {
    const clients = play(3, { specialist: 6 });
    expect(G(clients[0]).phase).toBe('pass');
    const given = clients.map((c, i) => G(c).hands[String(i)][0]);
    clients.forEach((c) => c.moves.passCard(0));
    expect(G(clients[0]).phase).toBe('bidding');
    clients.forEach((c, i) => {
      const fromPrev = given[(i + 2) % 3];
      expect(G(c).hands[String(i)]).toContainEqual(fromPrev);
      expect(G(c).hands[String(i)]).toHaveLength(2);
    });
  });

  it('1 · Informateur : seul le destinataire voit la carte', () => {
    const [p0, p1, p2] = play(3, { specialist: 1 });
    const card = G(p0).hands['0'][1];
    p0.moves.useSpecialist({ to: '1', cardIndex: 1 });
    expect(G(p1).secrets).toEqual([{ to: '1', from: '0', card }]);
    expect(G(p2).secrets).toEqual([]);
    expect(G(p0).specialist.used).toBe(true);
  });

  it('2 · Conductrice et 4 · Cerveau : annonces publiques', () => {
    const [a] = play(3, { specialist: 2 });
    a.moves.useSpecialist();
    expect(G(a).feed.at(-1).text).toMatch(/Conductrice/);

    const [b, c] = play(3, { specialist: 4 });
    const rank = G(c).hands['1'][0].rank;
    b.moves.useSpecialist({ target: '1', rank });
    expect(G(b).feed.at(-1).text).toMatch(/a [12] cartes?/);
  });

  it('5 · Hackeuse : pioche, puis la manche attend la défausse', () => {
    const clients = play(3, { specialist: 5 });
    clients[0].moves.useSpecialist();
    expect(G(clients[0]).hands['0']).toHaveLength(3);
    takeRound(clients);
    expect(G(clients[0]).round).toBe(0); // bloqué tant que la défausse n'est pas faite
    clients[0].moves.discardCard(2);
    expect(G(clients[0]).hands['0']).toHaveLength(2);
    expect(G(clients[0]).round).toBe(1);
  });

  it('7 · Valet : on ne peut pas défausser le Valet spécial', () => {
    const [p0] = play(3, { specialist: 7 });
    p0.moves.useSpecialist();
    const hand = G(p0).hands['0'];
    expect(hand.at(-1)).toEqual({ rank: 11, suit: 'X' });
    p0.moves.discardCard(2);
    expect(G(p0).hands['0']).toHaveLength(3);
    p0.moves.discardCard(0);
    expect(G(p0).hands['0']).toHaveLength(2);
    expect(G(p0).hands['0']).toContainEqual({ rank: 11, suit: 'X' });
  });

  it('9 · Arnaqueuse : redistribution sans perte de cartes', () => {
    const clients = play(4, { specialist: 9 });
    clients[3].moves.useSpecialist();
    const all = clients.flatMap((c, i) => G(c).hands[String(i)]);
    expect(all).toHaveLength(8);
    expect(new Set(all.map((c) => c.rank + c.suit)).size).toBe(8);
  });

  it('10 · Gros bras : bat une main du même type', () => {
    const c = (r, s) => ({ rank: r, suit: s });
    const community = [c(2, 'C'), c(7, 'D'), c(9, 'S'), c(11, 'H'), c(4, 'D')];
    const hands = { 0: [c(14, 'S'), c(14, 'D')], 1: [c(3, 'S'), c(3, 'D')] };
    // Sans Gros bras : paire de 3 (1★) < paire d'As (2★) : OK ; inversé : alarme
    expect(resolveVault(hands, community, { 0: 1, 1: 2 }).success).toBe(false);
    // Avec Gros bras pour le joueur 1 : sa paire de 3 bat la paire d'As
    expect(resolveVault(hands, community, { 0: 1, 1: 2 }, '1').success).toBe(true);
  });
});

describe('modes de difficulté', () => {
  it('Avancé : premier casse normal, puis Effraction après succès ou Complice après échec', () => {
    const clients = play(3, { mode: 'avance' });
    expect(G(clients[0]).challenges).toEqual([]);
    for (let r = 0; r < 4; r++) takeRound(clients);
    const g = G(clients[0]);
    if (g.result.success) expect(g.upcoming).toEqual({ challenges: [1], specialist: null });
    else expect(g.upcoming).toEqual({ challenges: [], specialist: 1 });
    clients.forEach((c) => c.moves.setReady(true));
    const next = G(clients[0]);
    expect(next.heist).toBe(2);
    if (g.result.success) expect(next.challenges).toEqual([1]);
    else expect(next.specialist).toEqual({ id: 1, used: false });
  });

  it('Pro : une Effraction permanente dès le premier casse (jamais la n°1)', () => {
    const clients = play(3, { mode: 'pro' });
    const g = G(clients[0]);
    expect(g.challenges).toHaveLength(1);
    expect(g.challenges[0]).not.toBe(1);
    expect(g.permanent).toEqual(g.challenges);
  });

  it('Gangster : 2 alarmes, 2 Effractions, on garde la plus haute', () => {
    const clients = play(3, { mode: 'gangster' });
    const g = G(clients[0]);
    expect(g.alarmsToLose).toBe(2);
    expect(g.challenges).toHaveLength(2);
    expect(g.challenges).not.toContain(1);
    expect(g.specialist).toBeNull();
    for (let r = 0; r < 4; r++) {
      takeRound(clients);
      if (G(clients[0]).phase === 'guess') clients[0].moves.submitGuess({ rank: 2, category: 0 });
    }
    const after = G(clients[0]);
    expect(after.upcoming.challenges).toHaveLength(2);
    expect(after.upcoming.challenges).toContain(Math.max(...g.challenges));
    expect(after.upcoming.specialist).toBeNull();
  });
});

describe('donne imposée (tutoriel)', () => {
  it('distribue exactement les cartes demandées, puis les cartes communes dans l’ordre', () => {
    const c = (rank, suit) => ({ rank, suit });
    const deal = {
      hands: { 0: [c(14, 'H'), c(14, 'S')], 1: [c(7, 'C'), c(2, 'D')], 2: [c(13, 'D'), c(12, 'D')] },
      community: [c(13, 'S'), c(9, 'H'), c(4, 'C'), c(2, 'C'), c(11, 'D')],
    };
    const clients = play(3, { deal });
    clients.forEach((cl, i) => expect(G(cl).hands[String(i)]).toEqual(deal.hands[i]));
    for (let r = 0; r < 4; r++) takeRound(clients);
    expect(G(clients[0]).community).toEqual(deal.community);
    // Le casse suivant est de nouveau tiré au hasard
    clients.forEach((cl) => cl.moves.setReady(true));
    expect(G(clients[0]).hands['0']).not.toEqual(deal.hands[0]);
  });
});
