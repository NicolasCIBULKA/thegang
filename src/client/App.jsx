import React, { useState } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { TheGang } from '../game/game.js';
import Board from './Board.jsx';
import SoloMode from './SoloMode.jsx';
import { MODES } from '../game/specialCards.js';

// En dev, le serveur tourne à part sur le port 8000 ; en prod il sert aussi le client.
export const SERVER = import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin;
const lobby = new LobbyClient({ server: SERVER });

const STORAGE_KEY = 'the-gang:seats';

function loadSeats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}
function saveSeat(matchID, seat) {
  try {
    const seats = loadSeats();
    seats[matchID] = seat;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seats));
  } catch {
    /* stockage indisponible : la place ne sera simplement pas mémorisée */
  }
}
function removeSeat(matchID) {
  try {
    const seats = loadSeats();
    delete seats[matchID];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seats));
  } catch {
    /* stockage indisponible : rien à nettoyer */
  }
}
function setUrlMatch(matchID) {
  const url = new URL(window.location.href);
  if (matchID) url.searchParams.set('match', matchID);
  else url.searchParams.delete('match');
  window.history.replaceState(null, '', url);
}

// Par défaut, Socket.IO commence en HTTP (long polling) puis passe en WebSocket si l'hébergeur l'accepte ;
// sinon il reste en HTTP (cas d'Hostinger). VITE_SOCKET_TRANSPORTS=polling force le HTTP dès le départ.
const transports = import.meta.env.VITE_SOCKET_TRANSPORTS?.split(',').map((t) => t.trim());

const GangClient = Client({
  game: TheGang,
  board: Board,
  multiplayer: SocketIO({ server: SERVER, socketOpts: transports ? { transports } : undefined }),
  debug: false,
});

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const urlMatch = params.get('match') || '';
  const solo = params.get('solo');
  const [seat, setSeat] = useState(() => (urlMatch ? loadSeats()[urlMatch] : null) || null);

  if (solo !== null) {
    // Test d'une carte précise : ?solo=3&effractions=4,8&complice=5
    const list = (key) =>
      (params.get(key) || '')
        .split(',')
        .map(Number)
        .filter((x) => x >= 1 && x <= 10);
    const forced =
      params.has('effractions') || params.has('complice')
        ? { challenges: list('effractions'), specialist: list('complice')[0] || null }
        : null;
    return <SoloMode numPlayers={Number(solo)} mode={params.get('mode') || 'basique'} forced={forced} />;
  }

  // Quitter le salon (salle d'attente) : libère la place côté serveur puis revient au lobby.
  async function leave() {
    try {
      await lobby.leaveMatch('the-gang', seat.matchID, { playerID: seat.playerID, credentials: seat.credentials });
    } catch {
      /* place déjà libérée ou serveur injoignable : on quitte quand même */
    }
    removeSeat(seat.matchID);
    setUrlMatch(null);
    setSeat(null);
  }

  if (seat) {
    return (
      <GangClient
        matchID={seat.matchID}
        playerID={seat.playerID}
        credentials={seat.credentials}
        onLeave={leave}
        fetchPlayers={() => lobby.getMatch('the-gang', seat.matchID).then((m) => m.players)}
      />
    );
  }
  return <Lobby key={urlMatch} initialCode={urlMatch} onSeated={setSeat} />;
}

function Lobby({ initialCode, onSeated }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('the-gang:name') || '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(initialCode);
  const [numPlayers, setNumPlayers] = useState(4);
  const [mode, setMode] = useState('basique');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim().length > 0 && !busy;

  async function join(matchID) {
    const { playerID, playerCredentials } = await lobby.joinMatch('the-gang', matchID, {
      playerName: name.trim(),
    });
    const seat = { matchID, playerID, credentials: playerCredentials };
    saveSeat(matchID, seat);
    try {
      localStorage.setItem('the-gang:name', name.trim());
    } catch {
      /* ignoré */
    }
    setUrlMatch(matchID);
    onSeated(seat);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { matchID } = await lobby.createMatch('the-gang', { numPlayers, setupData: { mode } });
      await join(matchID);
    } catch (err) {
      setError('Impossible de créer la partie. Le serveur est-il lancé ?');
      setBusy(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await join(code.trim());
    } catch (err) {
      setError('Impossible de rejoindre : code inconnu ou partie complète.');
      setBusy(false);
    }
  }

  return (
    <div className="lobby">
      <header className="lobby-title">
        <h1>The Gang</h1>
        <p>Poker coopératif — classez vos mains sans jamais les dévoiler.</p>
      </header>

      <label className="field">
        <span>Votre pseudo</span>
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. Le Professeur"
          autoFocus
        />
      </label>

      <div className="lobby-panels">
        <form className="panel" onSubmit={handleCreate}>
          <h2>Nouvelle partie</h2>
          <label className="field">
            <span>Nombre de joueurs</span>
            <div className="seg">
              {[3, 4, 5, 6].map((n) => (
                <button type="button" key={n} className={n === numPlayers ? 'on' : ''} onClick={() => setNumPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </label>
          <div className="field">
            <span>Difficulté</span>
            <div className="mode-list">
              {Object.entries(MODES).map(([key, m]) => (
                <button
                  type="button"
                  key={key}
                  className={`mode-option ${key === mode ? 'on' : ''}`}
                  onClick={() => setMode(key)}
                >
                  <span>
                    <strong>{m.label}</strong>
                    <small>{m.text}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button className="btn primary" disabled={!canSubmit}>
            Créer le salon
          </button>
        </form>

        <form className="panel" onSubmit={handleJoin}>
          <h2>Rejoindre</h2>
          <label className="field">
            <span>Code du salon</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex. oDteOzwpoWw" />
          </label>
          <button className="btn" disabled={!canSubmit || !code.trim()}>
            Rejoindre
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <p className="solo-hint muted">
        Seul pour tester ?{' '}
        <a href={`?solo=${numPlayers}&mode=${mode}`}>
          Jouer en mode solo à {numPlayers} joueurs ({MODES[mode].label})
        </a>
        , en contrôlant tout le monde depuis cette page, sans serveur.
      </p>
    </div>
  );
}
