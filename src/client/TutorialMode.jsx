import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { Client as HeadlessClient } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { TheGang, createSetup } from '../game/game.js';
import Board from './Board.jsx';

// ---------------------------------------------------------------------------
// Tutoriel : une partie à 3 avec une donne choisie pour illustrer chaque règle.
// Vous (joueur 0) contre Bob et Chloé, joués automatiquement.
//
//   Vous  : A♥ A♠  → paire d'As (la plus forte)
//   Bob   : 7♣ 2♦  → paire de 2 à la turn (la plus faible)
//   Chloé : R♦ D♦  → paire de rois dès le flop (au milieu)
//   Table : R♠ 9♥ 4♣ | 2♣ | V♦
// ---------------------------------------------------------------------------

const c = (rank, suit) => ({ rank, suit });
const DEAL = {
  hands: { 0: [c(14, 'H'), c(14, 'S')], 1: [c(7, 'C'), c(2, 'D')], 2: [c(13, 'D'), c(12, 'D')] },
  community: [c(13, 'S'), c(9, 'H'), c(4, 'C'), c(2, 'C'), c(11, 'D')],
};

// Seule action permise pendant les étapes « à vous de jouer » : prendre le 3★ au centre, ou voler celui de Bob.
const TAKE_TOP = { takeChip: (stars, from = 'middle') => from === 'middle' && stars === 3 };
const STEAL_FROM_BOB = { takeChip: (stars, from) => from === '1' && stars === 3 };

// Coups des bots au début d'une étape : [joueur, jeton].
const BOTS_LOW = [
  ['1', 1],
  ['2', 2],
];

const STEPS = [
  {
    text: 'Bienvenue dans la bande. Ici, on gagne ensemble : il faut classer nos mains de la plus faible à la plus forte… sans jamais dire quelles cartes on a.',
  },
  {
    focus: 'hand',
    text: 'Voici vos deux cartes. Vous êtes le seul à les voir. Une paire d’As : c’est un excellent départ.',
  },
  {
    focus: 'chips',
    text: 'Au centre, un jeton par joueur, de 1★ à 3★. Prendre le 3★, c’est dire « je pense avoir la meilleure main » ; le 1★, « la plus faible ».',
  },
  {
    focus: 'chips',
    bots: BOTS_LOW,
    text: 'Bob prend le 1★ et Chloé le 2★ : ils pensent être derrière vous. Ils ont raison.',
    task: 'À vous : prenez le jeton 3★ au centre.',
    allow: TAKE_TOP,
    done: (G) => G.round >= 1,
  },
  {
    focus: 'community',
    text: 'Dès que chacun a un jeton, l’étape suivante commence. Voici le flop : trois cartes communes, que chacun combine avec ses deux cartes.',
  },
  {
    focus: 'steal',
    bots: [['1', 3]],
    text: 'Bob s’est jeté sur le 3★… Il se croit peut-être fort avec ce roi sur la table. Mais votre paire d’As vaut mieux.',
    task: 'Volez-lui son jeton : cliquez sur « Voler » à côté de Bob.',
    allow: STEAL_FROM_BOB,
    done: (G) => G.chips['0'].yellow === 3,
  },
  {
    bots: BOTS_LOW,
    text: 'Parfait. Bob, sans jeton, se rabat sur le 1★ ; Chloé prend le 2★. Prendre, voler, rendre : c’est comme ça qu’on discute sans parler de ses cartes.',
  },
  {
    focus: 'community',
    bots: BOTS_LOW,
    text: 'La turn : une quatrième carte commune. Ce 2♣ a peut-être aidé quelqu’un… mais personne ne bat une paire d’As ici.',
    task: 'Gardez votre rang : prenez le 3★.',
    allow: TAKE_TOP,
    done: (G) => G.round >= 3,
  },
  {
    focus: 'chips',
    bots: BOTS_LOW,
    text: 'La river, dernière carte. Les jetons rouges sont les seuls qui comptent : ils fixent l’ordre de l’abattage.',
    task: 'Prenez le 3★ rouge.',
    allow: TAKE_TOP,
    done: (G) => G.phase === 'reveal',
  },
  {
    focus: 'reveal',
    text: 'Abattage ! Les mains sont révélées du 1★ au 3★, et chacune doit battre (ou égaler) la précédente : paire de 2, paire de rois, paire d’As. Le coffre s’ouvre.',
  },
  {
    focus: 'vaults',
    text: 'Pour gagner la partie, il faut ouvrir 3 coffres avant de déclencher 3 alarmes. Une seule main mal placée, et c’est l’alarme.',
  },
  {
    text: 'En vraie partie, parlez de tout… sauf de vos cartes. Les modes Avancé, Pro et Gangster ajoutent des Effractions qui compliquent les casses, et des Complices qui vous aident. Bonne chance, l’équipe.',
    last: true,
  },
];

const BOT_DELAY = 700;

function playerName() {
  try {
    return localStorage.getItem('the-gang:name') || 'Recrue';
  } catch {
    return 'Recrue';
  }
}

export default function TutorialMode() {
  const matchID = useMemo(() => `tuto-${Date.now()}`, []);
  const players = useMemo(
    () => [
      { id: 0, name: playerName(), isConnected: true },
      { id: 1, name: 'Bob', isConnected: true },
      { id: 2, name: 'Chloé', isConnected: true },
    ],
    [],
  );

  // Une partie locale partagée : le plateau React pour vous, deux clients sans interface pour les bots.
  const { TutoClient, bots } = useMemo(() => {
    const game = { ...TheGang, setup: createSetup('basique', { deal: DEAL }) };
    const multiplayer = Local();
    const TutoClient = Client({ game, board: Board, numPlayers: 3, multiplayer, debug: false });
    const bots = ['1', '2'].map((pid) => HeadlessClient({ game, numPlayers: 3, playerID: pid, matchID, multiplayer }));
    return { TutoClient, bots };
  }, [matchID]);

  const [G, setG] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  // Rappel affiché quand le joueur tente une action hors scénario (elle est bloquée).
  const [nudge, setNudge] = useState(null);
  useEffect(() => setNudge(null), [stepIndex]);
  const step = STEPS[stepIndex];
  const timers = useRef([]);

  // Les bots suivent l'état de la partie (les jetons sont publics, leurs cartes privées).
  useEffect(() => {
    bots.forEach((b) => b.start());
    const unsubscribe = bots[0].subscribe((state) => state && setG(state.G));
    return () => {
      unsubscribe();
      bots.forEach((b) => b.stop());
    };
  }, [bots]);

  // Coups des bots au début de l'étape, l'un après l'autre pour qu'on les voie.
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = (step.bots || []).map(([pid, stars], i) =>
      setTimeout(() => bots[Number(pid) - 1].moves.takeChip(stars), BOT_DELAY * (i + 1)),
    );
    return () => timers.current.forEach(clearTimeout);
  }, [stepIndex, bots, step.bots]);

  // Étapes « à vous de jouer » : on avance dès que l'action attendue est faite.
  useEffect(() => {
    if (G && step.done?.(G)) {
      const id = setTimeout(() => setStepIndex((i) => i + 1), 500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [G, step]);

  const next = step.last
    ? [
        { label: 'Retour au menu', primary: true, onClick: () => window.location.assign(window.location.pathname) },
        { label: 'Recommencer', onClick: () => window.location.reload() },
      ]
    : step.done
      ? null
      : [{ label: 'Suivant', primary: true, onClick: () => setStepIndex((i) => i + 1) }];

  // Filtre des coups du joueur : le tutoriel suit une donne et des coups de bots prévus à l'avance,
  // donc toute action autre que celle demandée est refusée (sinon la partie sortirait du scénario).
  const guard = (move, args) => {
    const rule = step.allow?.[move];
    if (rule && rule(...args)) return true;
    setNudge({
      id: Date.now(),
      text: step.task
        ? 'Pas cette fois : suivez la consigne ci-dessus.'
        : 'Pas encore : lisez la note, puis cliquez sur « Suivant ».',
    });
    return false;
  };

  const coach = {
    guard,
    nudge,
    key: `tuto-${stepIndex}`,
    text: step.text,
    task: step.task,
    next,
    step: stepIndex + 1,
    total: STEPS.length,
  };

  return (
    <div className="tutorial" data-focus={step.focus || ''}>
      <div className="solo-bar tuto-bar">
        <span className="tuto-title">Tutoriel</span>
        <span className="tuto-progress" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </span>
        <a className="btn solo-quit" href={window.location.pathname}>
          Quitter
        </a>
      </div>
      <TutoClient playerID="0" matchID={matchID} soloPlayers={players} coach={coach} />
    </div>
  );
}
