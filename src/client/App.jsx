import React, { useEffect, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LobbyClient } from 'boardgame.io/client';
import { TheGang } from '../game/game.js';
import Board from './Board.jsx';
import SoloMode from './SoloMode.jsx';
import TutorialMode from './TutorialMode.jsx';
import { MODES } from '../game/specialCards.js';
import MatchSettings, { SettingsForm } from './MatchSettings.jsx';

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

  if (params.has('tuto')) return <TutorialMode />;

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

  // Après une partie : l'hôte crée la suivante avec ses paramètres, chacun y rejoint avec son pseudo.
  const room = seat && {
    getMatch: () => lobby.getMatch('the-gang', seat.matchID),
    playAgain: ({ mode, numPlayers }) =>
      lobby
        .playAgain('the-gang', seat.matchID, {
          playerID: seat.playerID,
          credentials: seat.credentials,
          numPlayers,
          setupData: { mode, extensions: [] },
        })
        .then((r) => r.nextMatchID),
    joinNext: async (nextMatchID, playerName) => {
      const { playerID, playerCredentials } = await lobby.joinMatch('the-gang', nextMatchID, { playerName });
      const next = { matchID: nextMatchID, playerID, credentials: playerCredentials };
      removeSeat(seat.matchID);
      saveSeat(nextMatchID, next);
      setUrlMatch(nextMatchID);
      setSeat(next);
    },
  };

  if (seat) {
    return (
      <GangClient
        key={seat.matchID}
        room={room}
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
  // Aperçu du salon visé (paramètres, places libres) dès qu'un code est saisi ou reçu par lien.
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const id = code.trim();
    if (!id) {
      setPreview(null);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      lobby
        .getMatch('the-gang', id)
        .then((m) => alive && setPreview({ ok: true, match: m }))
        .catch(() => alive && setPreview({ ok: false }));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [code]);
  const previewSeated = preview?.ok ? preview.match.players.filter((p) => p.name).length : 0;
  const previewFull = preview?.ok && previewSeated >= preview.match.players.length;
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
      const { matchID } = await lobby.createMatch('the-gang', { numPlayers, setupData: { mode, extensions: [] } });
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

      <section className="panel tuto-panel">
        <div>
          <h2>Apprendre à jouer</h2>
          <p>
            Première fois ? Une partie guidée de quelques minutes : le cerveau du braquage vous explique les jetons, les
            vols et l’abattage, pendant que vous jouez contre deux complices.
          </p>
        </div>
        <a className="btn primary" href="?tuto">
          Lancer le tutoriel
        </a>
      </section>

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
          <SettingsForm mode={mode} setMode={setMode} numPlayers={numPlayers} setNumPlayers={setNumPlayers} />
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
          {preview?.ok && (
            <div className="join-preview">
              <MatchSettings
                mode={preview.match.setupData?.mode}
                numPlayers={preview.match.players.length}
                seated={previewSeated}
                extensions={preview.match.setupData?.extensions}
              />
              {previewSeated > 0 && (
                <p className="join-who">
                  Déjà là :{' '}
                  {preview.match.players
                    .filter((p) => p.name)
                    .map((p) => p.name)
                    .join(', ')}
                </p>
              )}
            </div>
          )}
          {preview && !preview.ok && <p className="error small">Aucun salon ne correspond à ce code.</p>}
          <button className="btn" disabled={!canSubmit || !code.trim() || previewFull || preview?.ok === false}>
            Rejoindre
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <footer className="credits">
        <p className="credits-original">
          <em>The Gang</em> est un jeu de John Cooper et Kory Heath, édité par{' '}
          <a href="https://www.kosmos.de/en/products/the-gang" target="_blank" rel="noopener noreferrer">
            KOSMOS
          </a>{' '}
          et publié en France par{' '}
          <a href="https://iello.fr/jeux/the-gang/" target="_blank" rel="noopener noreferrer">
            IELLO
          </a>
          . Cette version en ligne est un projet de fan non officiel.
        </p>
        <p>
          Créé par <strong>Nicolas CIBULKA</strong>
        </p>
        <p className="credits-links">
          <a href="mailto:nico.cibulka@gmail.com">nico.cibulka@gmail.com</a>
          <span aria-hidden="true">·</span>
          <a href="https://www.linkedin.com/in/nicolas-cibulka-642143194/" target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
        </p>
        <p className="app-version">version {(import.meta.env.VITE_APP_VERSION || 'dev').slice(0, 7)}</p>
      </footer>

      {/* Lien vers le mode solo : affiché seulement en développement (npm run dev), pas sur le site déployé. */}
      {import.meta.env.DEV && (
        <p className="solo-hint muted">
          Seul pour tester ?{' '}
          <a href={`?solo=${numPlayers}&mode=${mode}`}>
            Jouer en mode solo à {numPlayers} joueurs ({MODES[mode].label})
          </a>
          , en contrôlant tout le monde depuis cette page, sans serveur.
        </p>
      )}
    </div>
  );
}
