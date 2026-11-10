import React, { useState } from 'react';
import { ROUNDS, WINS_NEEDED, ALARMS_TO_LOSE } from '../game/game.js';
import { RANK_LABELS, SUIT_SYMBOLS } from '../game/cards.js';

// ---------- Petits composants ----------

function Card({ card, small, highlight }) {
  if (!card) return <div className={`card back ${small ? 'small' : ''}`} />;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <div className={`card ${red ? 'red' : ''} ${small ? 'small' : ''} ${highlight ? 'hl' : ''}`}>
      <span className="rank">{RANK_LABELS[card.rank]}</span>
      <span className="suit">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}

function Chip({ color, stars, onClick, size = 'md', title, faded }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`chip chip-${color} chip-${size} ${faded ? 'faded' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      title={title}
    >
      {stars != null ? (
        <>
          <span className="chip-num">{stars}</span>
          <span className="chip-star">★</span>
        </>
      ) : null}
    </Tag>
  );
}

function VaultTrack({ vaults }) {
  return (
    <div className="vaults">
      <div className="vault-row" title="Casses réussis">
        {Array.from({ length: WINS_NEEDED }, (_, i) => (
          <span key={i} className={`vault ok ${i < vaults.success ? 'on' : ''}`}>
            ◆
          </span>
        ))}
      </div>
      <div className="vault-row" title="Alarmes">
        {Array.from({ length: ALARMS_TO_LOSE }, (_, i) => (
          <span key={i} className={`vault ko ${i < vaults.alarm ? 'on' : ''}`}>
            ▲
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- Salle d'attente ----------

function WaitingRoom({ matchData, matchID }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}?match=${matchID}`;
  const joined = matchData.filter((p) => p.name).length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible : le lien reste affiché */
    }
  }

  return (
    <div className="waiting">
      <h2>En attente de l'équipe</h2>
      <p className="muted">
        {joined} / {matchData.length} joueurs
      </p>
      <ul className="seat-list">
        {matchData.map((p) => (
          <li key={p.id} className={p.name ? 'filled' : ''}>
            {p.name || 'Place libre'}
          </li>
        ))}
      </ul>
      <div className="share">
        <code>{matchID}</code>
        <button className="btn" onClick={copy}>
          {copied ? 'Lien copié !' : 'Copier le lien d’invitation'}
        </button>
      </div>
    </div>
  );
}

// ---------- Plateau ----------

export default function Board(props) {
  const { G, ctx, moves, playerID, matchID, isConnected } = props;
  // En mode solo (sans serveur), boardgame.io ne fournit pas matchData : SoloMode passe soloPlayers.
  const matchData = props.soloPlayers || props.matchData || [];
  const names = Object.fromEntries(matchData.map((p) => [String(p.id), p.name || `Joueur ${p.id + 1}`]));
  const allSeated = matchData.length > 0 && matchData.every((p) => p.name);

  if (!allSeated) return <WaitingRoom matchData={matchData} matchID={matchID} />;

  const round = ROUNDS[G.round];
  const color = round.key;
  const bidding = G.phase === 'bidding' && !ctx.gameover;
  const reveal = G.phase === 'reveal';
  const myChip = G.chips[playerID]?.[color];
  const others = ctx.playOrder.filter((pid) => pid !== playerID);
  const connected = Object.fromEntries(matchData.map((p) => [String(p.id), p.isConnected]));

  return (
    <div className="board">
      <header className="topbar">
        <div className="brand">The Gang</div>
        <div className="round-info">
          <span className="heist">Casse n°{G.heist}</span>
          <span className="round-steps">
            {ROUNDS.map((r, i) => (
              <span
                key={r.key}
                className={`step chip-${r.key}-text ${!reveal && i === G.round ? 'current' : ''} ${
                  reveal || i < G.round ? 'done' : ''
                }`}
              >
                {r.label}
              </span>
            ))}
          </span>
        </div>
        <VaultTrack vaults={G.vaults} />
      </header>

      {!isConnected && <div className="banner warn">Connexion au serveur perdue… reconnexion en cours.</div>}

      <section className="others">
        {others.map((pid) => (
          <Seat
            key={pid}
            pid={pid}
            name={names[pid]}
            online={connected[pid]}
            G={G}
            color={color}
            bidding={bidding}
            onSteal={() => moves.takeChip(G.chips[pid][color], pid)}
          />
        ))}
      </section>

      <section className="table">
        <div className="community">
          {Array.from({ length: 5 }, (_, i) => (
            <Card key={i} card={G.community[i]} />
          ))}
        </div>

        {bidding && (
          <div className="middle">
            <div className="middle-label">
              Jetons {round.label.toLowerCase()} — {G.middle.length ? 'cliquez pour prendre' : 'tous distribués'}
            </div>
            <div className="middle-chips">
              {G.middle.map((s) => (
                <Chip key={s} color={color} stars={s} size="lg" onClick={() => moves.takeChip(s)} />
              ))}
            </div>
          </div>
        )}

        {reveal && <RevealPanel G={G} names={names} />}
        {ctx.gameover && <GameOver gameover={ctx.gameover} />}
      </section>

      <section className="me">
        <div className="me-cards">
          {(G.hands[playerID] || []).map((c, i) => (
            <Card key={i} card={c} />
          ))}
        </div>

        <div className="me-info">
          <div className="me-name">{names[playerID]} (vous)</div>
          <ChipHistory chips={G.chips[playerID]} upTo={reveal ? 4 : G.round} />
          {bidding && (
            <div className="me-current">
              <span>Votre jeton :</span>
              {myChip != null ? (
                <Chip color={color} stars={myChip} size="lg" />
              ) : (
                <span className="muted">aucun</span>
              )}
            </div>
          )}
        </div>

        <div className="me-actions">
          {bidding && (
            <>
              <button className="btn" disabled={myChip == null} onClick={() => moves.returnChip()}>
                Rendre mon jeton
              </button>
              <button
                className={`btn primary ${G.ready[playerID] ? 'pressed' : ''}`}
                disabled={myChip == null}
                onClick={() => moves.setReady(!G.ready[playerID])}
              >
                {G.ready[playerID] ? 'Prêt ✓ (annuler)' : 'Je suis prêt'}
              </button>
              <ReadyHint G={G} ctx={ctx} />
            </>
          )}
          {reveal && !ctx.gameover && (
            <button
              className={`btn primary ${G.ready[playerID] ? 'pressed' : ''}`}
              onClick={() => moves.setReady(!G.ready[playerID])}
            >
              {G.ready[playerID] ? 'En attente des autres…' : 'Casse suivant'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ReadyHint({ G, ctx }) {
  const ready = ctx.playOrder.filter((pid) => G.ready[pid]).length;
  return (
    <span className="muted small">
      {ready}/{ctx.playOrder.length} prêts — la manche avance quand tout le monde a un jeton et est prêt.
    </span>
  );
}

function ChipHistory({ chips, upTo }) {
  if (!chips) return null;
  return (
    <div className="history">
      {ROUNDS.slice(0, upTo).map((r) => (
        <Chip key={r.key} color={r.key} stars={chips[r.key]} size="sm" title={r.label} />
      ))}
    </div>
  );
}

function Seat({ pid, name, online, G, color, bidding, onSteal }) {
  const chip = G.chips[pid]?.[color];
  const reveal = G.phase === 'reveal';
  return (
    <div className={`seat ${G.ready[pid] ? 'is-ready' : ''}`}>
      <div className="seat-head">
        <span className={`dot ${online ? 'on' : ''}`} title={online ? 'Connecté' : 'Déconnecté'} />
        <span className="seat-name">{name}</span>
        {G.ready[pid] && <span className="tag">prêt</span>}
      </div>
      <div className="seat-cards">
        {(G.hands[pid] || [null, null]).map((c, i) => (
          <Card key={i} card={c} small />
        ))}
      </div>
      <ChipHistory chips={G.chips[pid]} upTo={reveal ? 4 : G.round} />
      {bidding && (
        <div className="seat-current">
          {chip != null ? (
            <Chip color={color} stars={chip} size="md" onClick={onSteal} title="Prendre ce jeton" />
          ) : (
            <Chip color={color} faded size="md" title="Pas encore de jeton" />
          )}
        </div>
      )}
    </div>
  );
}

function RevealPanel({ G, names }) {
  const { result } = G;
  if (!result) return null;
  const used = (pid, card) =>
    result.order
      .find((o) => o.pid === pid)
      ?.bestCards.some((b) => b.rank === card.rank && b.suit === card.suit);

  return (
    <div className={`reveal ${result.success ? 'success' : 'fail'}`}>
      <h2>{result.success ? 'Coffre ouvert !' : 'Alarme !'}</h2>
      <p className="muted">Mains révélées de la plus faible (1★ rouge) à la plus forte.</p>
      <ol className="reveal-list">
        {result.order.map((o) => (
          <li key={o.pid} className={o.ok ? 'ok' : 'ko'}>
            <Chip color="red" stars={o.stars} size="sm" />
            <span className="r-name">{names[o.pid]}</span>
            <span className="r-cards">
              {G.hands[o.pid].map((c, i) => (
                <Card key={i} card={c} small highlight={used(o.pid, c)} />
              ))}
            </span>
            <span className="r-hand">{o.handName}</span>
            <span className="r-mark">{o.ok ? '✓' : '✗'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function GameOver({ gameover }) {
  return (
    <div className={`gameover ${gameover.winner ? 'win' : 'lose'}`}>
      <h2>{gameover.winner ? 'Le gang a réussi son coup !' : 'Le gang s’est fait prendre…'}</h2>
      <a className="btn primary" href={window.location.pathname}>
        Nouvelle partie
      </a>
    </div>
  );
}
