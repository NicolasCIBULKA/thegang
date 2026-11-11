import React, { useEffect, useRef, useState } from 'react';
import { WINS_NEEDED } from '../game/game.js';
import MatchSettings, { SettingsForm } from './MatchSettings.jsx';

/**
 * Salon après la fin d'une partie : résultat, joueurs, paramètres de la prochaine partie.
 * L'hôte (créateur du salon, ou n'importe qui s'il est parti) choisit les paramètres et relance ;
 * les autres rejoignent automatiquement la nouvelle partie (relue toutes les 2 s sur le serveur).
 */
export default function PostGameRoom({ G, ctx, playerID, matchData, room, onLeave }) {
  const names = Object.fromEntries(matchData.map((p) => [String(p.id), p.name]));
  const connected = Object.fromEntries(matchData.map((p) => [String(p.id), p.isConnected]));
  const hostID = '0';
  const isHost = playerID === hostID || !connected[hostID];
  const myName = names[playerID];

  const [mode, setMode] = useState(G.mode);
  const [numPlayers, setNumPlayers] = useState(matchData.length);
  const [status, setStatus] = useState('idle'); // idle | launching | joining | error
  const [error, setError] = useState('');
  const joined = useRef(false);

  async function joinNext(nextMatchID) {
    if (joined.current) return;
    joined.current = true;
    setStatus('joining');
    try {
      await room.joinNext(nextMatchID, myName);
    } catch {
      joined.current = false;
      setStatus('error');
      setError('La nouvelle partie est complète : il n’y a plus de place pour vous.');
    }
  }

  // Tout le monde surveille l'ancienne partie : dès qu'une suivante existe, on la rejoint.
  useEffect(() => {
    let alive = true;
    const check = () =>
      room
        .getMatch()
        .then((m) => alive && m.nextMatchID && joinNext(m.nextMatchID))
        .catch(() => {});
    check();
    const id = setInterval(check, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function launch() {
    setStatus('launching');
    setError('');
    try {
      const nextMatchID = await room.playAgain({ mode, numPlayers });
      await joinNext(nextMatchID);
    } catch {
      setStatus('error');
      setError('Impossible de créer la nouvelle partie. Réessayez dans un instant.');
    }
  }

  const win = ctx.gameover?.winner;
  const tooFew = numPlayers < matchData.length;

  return (
    <div className="post-room">
      <header className={`post-result ${win ? 'win' : 'lose'}`}>
        <h2>{win ? 'Le gang a réussi son coup' : 'Le gang s’est fait prendre'}</h2>
        <p>
          {G.vaults.success} coffre{G.vaults.success > 1 ? 's' : ''} ouvert{G.vaults.success > 1 ? 's' : ''} sur{' '}
          {WINS_NEEDED} · {G.vaults.alarm} alarme{G.vaults.alarm > 1 ? 's' : ''} · {G.heist} casse
          {G.heist > 1 ? 's' : ''}
        </p>
      </header>

      <section className="post-panel">
        <h3>Le salon</h3>
        <ul className="seat-list">
          {matchData.map((p) => (
            <li key={p.id} className="filled">
              <span className={`dot ${p.isConnected ? 'on' : ''}`} aria-hidden="true" />
              {p.name}
              {String(p.id) === hostID && <span className="pill complice">hôte</span>}
              {String(p.id) === playerID && <span className="post-you">(vous)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="post-panel">
        <h3>Prochaine partie</h3>
        {isHost ? (
          <>
            <SettingsForm mode={mode} setMode={setMode} numPlayers={numPlayers} setNumPlayers={setNumPlayers} />
            {tooFew && (
              <p className="post-warn">
                {matchData.length - numPlayers} joueur{matchData.length - numPlayers > 1 ? 's' : ''} n’aura pas de place
                : les premiers arrivés prennent les places.
              </p>
            )}
            <button className="btn primary" disabled={status !== 'idle' && status !== 'error'} onClick={launch}>
              {status === 'launching' || status === 'joining' ? 'Lancement…' : 'Lancer la nouvelle partie'}
            </button>
          </>
        ) : (
          <>
            <p className="post-wait">
              {status === 'joining'
                ? 'Nouvelle partie trouvée, vous la rejoignez…'
                : `${names[hostID]} choisit les paramètres de la prochaine partie. Vous la rejoindrez automatiquement.`}
            </p>
            <MatchSettings mode={G.mode} numPlayers={matchData.length} extensions={G.extensions} />
            <p className="muted small">Paramètres de la partie qui vient de se terminer.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <button className="btn ghost leave-btn" onClick={onLeave}>
        Quitter le salon
      </button>
    </div>
  );
}
