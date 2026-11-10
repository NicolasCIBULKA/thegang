import React, { useMemo, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { TheGang } from '../game/game.js';
import Board from './Board.jsx';

// Mode solo : toute la partie tourne dans le navigateur (pas de serveur),
// et on bascule d'un joueur à l'autre pour tester les règles et l'interface.

const NAMES = ['Alice', 'Bob', 'Chloé', 'David', 'Emma', 'Farid'];

export default function SoloMode({ numPlayers }) {
  const n = Math.min(6, Math.max(3, numPlayers || 4));
  const [active, setActive] = useState('0');

  const SoloClient = useMemo(
    () =>
      Client({
        game: TheGang,
        board: Board,
        numPlayers: n,
        multiplayer: Local(),
        debug: false,
      }),
    [n],
  );

  const matchData = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ id: i, name: NAMES[i], isConnected: true })),
    [n],
  );

  return (
    <div className="solo">
      <div className="solo-bar">
        <span className="solo-label">Mode solo — vous jouez :</span>
        <div className="seg solo-seg">
          {matchData.map((p) => (
            <button
              key={p.id}
              className={String(p.id) === active ? 'on' : ''}
              onClick={() => setActive(String(p.id))}
            >
              {p.name}
            </button>
          ))}
        </div>
        <a className="btn solo-quit" href={window.location.pathname}>
          Quitter
        </a>
      </div>
      {/* Tous les joueurs restent montés pour partager le même état local ; seul l'actif est visible. */}
      {matchData.map((p) => (
        <div key={p.id} hidden={String(p.id) !== active}>
          <SoloClient playerID={String(p.id)} matchID="solo" soloPlayers={matchData} />
        </div>
      ))}
    </div>
  );
}
