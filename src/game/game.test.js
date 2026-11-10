import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { bestHand, compareScores } from './handEval.js';
import { TheGang, resolveVault } from './game.js';

const c = (s) => {
  const map = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const r = map[s[0]] ?? Number(s[0]);
  return { rank: r, suit: s[1] };
};
const cards = (str) => str.split(' ').map(c);

describe('évaluation des mains', () => {
  const cases = [
    ['AS KS QS JS TS 2H 3D', 'Quinte flush'],
    ['9H 9S 9D 9C 2H 3D 4C', 'Carré'],
    ['9H 9S 9D 4C 4H 2D 3C', 'Full'],
    ['2H 7H 9H JH KH 3D 4C', 'Couleur'],
    ['5H 6S 7D 8C 9H 2D 2C', 'Quinte'],
    ['AH 2S 3D 4C 5H 9D KC', 'Quinte'],
    ['7H 7S 7D 2C 9H JD KC', 'Brelan'],
    ['7H 7S 2D 2C 9H JD KC', 'Double paire'],
    ['7H 7S 3D 2C 9H JD KC', 'Paire'],
    ['7H 4S 3D 2C 9H JD KC', 'Carte haute'],
  ];
  for (const [hand, name] of cases) {
    it(`${hand} → ${name}`, () => expect(bestHand(cards(hand)).name).toBe(name));
  }

  it('la quinte blanche est la plus petite quinte', () => {
    const wheel = bestHand(cards('AH 2S 3D 4C 5H 9D 9C'));
    const six = bestHand(cards('2H 3S 4D 5C 6H 9D 9C'));
    expect(compareScores(wheel.score, six.score)).toBeLessThan(0);
  });

  it('départage au kicker', () => {
    const a = bestHand(cards('AH AS KD 2C 3H 7D 8C'));
    const b = bestHand(cards('AD AC QD 2C 3H 7D 8C'));
    expect(compareScores(a.score, b.score)).toBeGreaterThan(0);
  });
});

describe('résolution du coffre', () => {
  const community = cards('2C 7D 9S JH 4D');
  const hands = { 0: cards('3H 5S'), 1: cards('9H 3D'), 2: cards('AS AD') };

  it('ordre correct → succès', () => {
    expect(resolveVault(hands, community, { 0: 1, 1: 2, 2: 3 }).success).toBe(true);
  });
  it('ordre inversé → alarme', () => {
    expect(resolveVault(hands, community, { 0: 3, 1: 2, 2: 1 }).success).toBe(false);
  });
  it('les égalités sont acceptées dans les deux sens', () => {
    const tied = { 0: cards('3H 5S'), 1: cards('3D 5C') };
    expect(resolveVault(tied, community, { 0: 1, 1: 2 }).success).toBe(true);
    expect(resolveVault(tied, community, { 0: 2, 1: 1 }).success).toBe(true);
  });
});

describe('déroulement de la partie', () => {
  let matchCount = 0;
  function setup(n = 3) {
    const multiplayer = Local();
    // Identifiant unique : les parties locales de boardgame.io sont partagées par matchID.
    const matchID = `test-${++matchCount}`;
    const clients = Array.from({ length: n }, (_, i) =>
      Client({ game: TheGang, numPlayers: n, playerID: String(i), matchID, multiplayer }),
    );
    clients.forEach((cl) => cl.start());
    return clients;
  }

  it('chaque joueur ne voit que ses propres cartes', () => {
    const [p0] = setup();
    const { G } = p0.getState();
    expect(G.hands['0']).toHaveLength(2);
    expect(G.hands['1']).toBeNull();
    expect(G.deck).toBeUndefined();
  });

  it('prendre un jeton à un autre joueur le lui retire', () => {
    const [p0, p1] = setup();
    p0.moves.takeChip(3);
    p1.moves.takeChip(3, '0');
    const { G } = p0.getState();
    expect(G.chips['0'].white).toBeNull();
    expect(G.chips['1'].white).toBe(3);
    expect(G.middle).toEqual([1, 2]);
    expect(G.lastSteal).toMatchObject({ thief: '1', victim: '0', stars: 3 });
  });

  it('voler en ayant déjà un jeton remet l’ancien au centre', () => {
    const [p0, p1] = setup();
    p0.moves.takeChip(3);
    p1.moves.takeChip(1);
    p1.moves.takeChip(3, '0');
    const { G } = p0.getState();
    expect(G.chips['1'].white).toBe(3);
    expect(G.chips['0'].white).toBeNull();
    expect(G.middle).toEqual([1, 2]);
  });

  it('la manche passe automatiquement quand tous les jetons sont pris', () => {
    const [p0, p1, p2] = setup();
    p0.moves.takeChip(1);
    p1.moves.takeChip(2);
    expect(p0.getState().G.round).toBe(0);
    p2.moves.takeChip(3);
    const { G } = p0.getState();
    expect(G.round).toBe(1);
    expect(G.community).toHaveLength(3);
    expect(G.middle).toEqual([1, 2, 3]);
  });

  it('« prêt » est refusé pendant les enchères', () => {
    const [p0] = setup();
    p0.moves.takeChip(1);
    p0.moves.setReady(true);
    expect(p0.getState().G.ready['0']).toBe(false);
  });

  it('un casse complet passe par les 4 manches puis la révélation', () => {
    const clients = setup();
    for (let round = 0; round < 4; round++) {
      clients.forEach((cl, i) => cl.moves.takeChip(i + 1));
    }
    const { G } = clients[0].getState();
    expect(G.phase).toBe('reveal');
    expect(G.community).toHaveLength(5);
    expect(G.result.order).toHaveLength(3);
    expect(G.vaults.success + G.vaults.alarm).toBe(1);
    // Révélation : les mains de tous sont visibles
    expect(G.hands['1']).toHaveLength(2);

    clients.forEach((cl) => cl.moves.setReady(true));
    const next = clients[0].getState().G;
    expect(next.heist).toBe(2);
    expect(next.phase).toBe('bidding');
    expect(next.community).toHaveLength(0);
  });

  it('la partie se termine après 3 succès ou 3 alarmes', () => {
    const clients = setup();
    let guard = 0;
    while (!clients[0].getState().ctx.gameover && guard++ < 10) {
      for (let round = 0; round < 4; round++) {
        clients.forEach((cl, i) => cl.moves.takeChip(i + 1));
      }
      if (!clients[0].getState().ctx.gameover) clients.forEach((cl) => cl.moves.setReady(true));
    }
    const { G, ctx } = clients[0].getState();
    expect(ctx.gameover).toBeDefined();
    expect(Math.max(G.vaults.success, G.vaults.alarm)).toBe(3);
  });
});

describe('événements pour le cerveau', () => {
  it('chaque étape émet un événement numéroté', async () => {
    const { Client } = await import('boardgame.io/client');
    const { Local } = await import('boardgame.io/multiplayer');
    const multiplayer = Local();
    const clients = [0, 1, 2].map((i) =>
      Client({ game: TheGang, numPlayers: 3, playerID: String(i), matchID: 'events', multiplayer }),
    );
    clients.forEach((c) => c.start());
    const ev = () => clients[0].getState().G.event;
    expect(ev()).toMatchObject({ type: 'round', round: 0, heist: 1 });
    clients[0].moves.takeChip(1);
    clients[1].moves.takeChip(1, '0');
    expect(ev()).toMatchObject({ type: 'steal', thief: '1', victim: '0', stars: 1 });
    const seq = ev().seq;
    clients[0].moves.takeChip(2);
    clients[2].moves.takeChip(3);
    expect(ev()).toMatchObject({ type: 'round', round: 1 });
    expect(ev().seq).toBeGreaterThan(seq);
    for (let r = 1; r < 4; r++) clients.forEach((c, i) => c.moves.takeChip(i + 1));
    expect(ev().type).toBe('vault');
  });
});
