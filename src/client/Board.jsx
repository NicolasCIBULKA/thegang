import React, { useEffect, useState } from 'react';
import { ROUNDS, WINS_NEEDED, isDarkChip } from '../game/game.js';
import { MODES } from '../game/specialCards.js';
import { Card, CardRow, Chip } from './parts.jsx';
import { ActiveCards, GuessPanel, GuessResult, Feed, Upcoming } from './Specials.jsx';
import Mastermind from './Mastermind.jsx';

// ---------- Petits composants ----------

function VaultTrack({ vaults, alarmsToLose }) {
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
        {Array.from({ length: alarmsToLose }, (_, i) => (
          <span key={i} className={`vault ko ${i < vaults.alarm ? 'on' : ''}`}>
            ▲
          </span>
        ))}
      </div>
    </div>
  );
}

function WaitingRoom({ matchData: liveData, matchID, onLeave, fetchPlayers }) {
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Le serveur ne prévient pas quand un joueur quitte le salon : on relit la liste des places toutes les 2 s.
  const [polled, setPolled] = useState(null);
  useEffect(() => {
    if (!fetchPlayers) return undefined;
    let alive = true;
    const refresh = () =>
      fetchPlayers()
        .then((players) => alive && setPolled(players))
        .catch(() => {});
    refresh();
    const id = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetchPlayers ? matchID : null]);
  const matchData = polled || liveData;
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
      {onLeave && (
        <button
          className="btn ghost leave-btn"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            onLeave();
          }}
        >
          {leaving ? 'Départ…' : 'Quitter le salon'}
        </button>
      )}
    </div>
  );
}

// ---------- Plateau ----------

export default function Board(props) {
  const { G, ctx, moves, playerID, matchID, isConnected } = props;
  // Téléphone : les cartes actives et le registre sont rangés dans un panneau qu'on ouvre à la demande.
  const [sheetOpen, setSheetOpen] = useState(false);
  // En mode solo (sans serveur), boardgame.io ne fournit pas matchData : SoloMode passe soloPlayers.
  const matchData = props.soloPlayers || props.matchData || [];
  const names = Object.fromEntries(matchData.map((p) => [String(p.id), p.name || `Joueur ${p.id + 1}`]));
  const allSeated = matchData.length > 0 && matchData.every((p) => p.name);

  if (!allSeated)
    return (
      <WaitingRoom matchData={matchData} matchID={matchID} onLeave={props.onLeave} fetchPlayers={props.fetchPlayers} />
    );

  const n = ctx.playOrder.length;
  const round = ROUNDS[G.round];
  const color = round.key;
  const over = !!ctx.gameover;
  const bidding = G.phase === 'bidding' && !over;
  const reveal = G.phase === 'reveal';
  const myChip = G.chips[playerID]?.[color];
  const myChipLocked = myChip != null && isDarkChip(G, G.round, myChip, n);
  const others = ctx.playOrder.filter((pid) => pid !== playerID);
  const connected = Object.fromEntries(matchData.map((p) => [String(p.id), p.isConnected]));
  const pendingDiscard = G.pendingDiscard?.[playerID];
  const passing = G.phase === 'pass';
  const myPassChoice = G.passChoices?.[playerID];
  const myHand = G.hands[playerID] || [];
  const leftNeighbor = ctx.playOrder[(ctx.playOrder.indexOf(playerID) + 1) % n];

  // Actions sur mes cartes : défausse (Hackeuse / Valet) ou passe (Coordinateur)
  let cardAction = null;
  if (pendingDiscard) {
    cardAction = {
      hint:
        pendingDiscard === 'jack'
          ? 'Valet : cliquez sur la carte à défausser (pas le Valet spécial).'
          : 'Hackeuse : cliquez sur la carte à défausser.',
      onPick: (i) => moves.discardCard(i),
    };
  } else if (passing && myPassChoice == null) {
    cardAction = {
      hint: `Coordinateur : cliquez sur la carte à passer à ${names[leftNeighbor]}.`,
      onPick: (i) => moves.passCard(i),
    };
  }

  return (
    <div className={`board ${sheetOpen ? 'sheet-open' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">The Gang</span>
          <span className="brand-sub">Cercle privé · entrée par la cave · {MODES[G.mode]?.label}</span>
        </div>
        <div className="lamp" aria-hidden="true" />
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
        <VaultTrack vaults={G.vaults} alarmsToLose={G.alarmsToLose} />
        <button
          className="sheet-toggle"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          aria-controls="side-extras"
        >
          Cartes & registre
          {G.challenges.length + (G.specialist ? 1 : 0) > 0 && (
            <span className="sheet-badge">{G.challenges.length + (G.specialist ? 1 : 0)}</span>
          )}
        </button>
      </header>

      {!isConnected && <div className="banner warn">Connexion au serveur perdue… reconnexion en cours.</div>}

      <div className="main">
        <aside className="side">
          <Mastermind G={G} ctx={ctx} names={names} />
          <div className="side-extras" id="side-extras">
            <div className="sheet-head">
              <span>Cartes & registre</span>
              <button className="btn small-btn" onClick={() => setSheetOpen(false)}>
                Fermer
              </button>
            </div>
            <ActiveCards G={G} ctx={ctx} playerID={playerID} names={names} moves={moves} canAct={bidding} />
            <Feed G={G} names={names} />
          </div>
        </aside>
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />
        <div className="table-area">
          <section className="others">
            {others.map((pid) => (
              <Seat
                key={pid}
                pid={pid}
                name={names[pid]}
                online={connected[pid]}
                G={G}
                n={n}
                color={color}
                bidding={bidding}
                reveal={reveal}
                onSteal={() => moves.takeChip(G.chips[pid][color], pid)}
              />
            ))}
          </section>

          <section className="table">
            <div className="table-felt">
              <div className="community">
                {Array.from({ length: 5 }, (_, i) => {
                  const card = G.community[i];
                  // Les cartes révélées ensemble (flop) arrivent l'une après l'autre.
                  const firstNew = ROUNDS[G.round].community - (G.round === 1 ? 3 : 1);
                  const delay = card ? Math.max(0, i - firstNew) * 180 : 0;
                  return (
                    <Card key={`${G.heist}-${i}-${card ? card.rank + card.suit : 'empty'}`} card={card} delay={delay} />
                  );
                })}
              </div>

              {passing && (
                <div className="phase-note">
                  Coordinateur : chacun choisit une carte à passer à son voisin.{' '}
                  {ctx.playOrder.filter((p) => G.passChoices?.[p] != null).length > 0 && myPassChoice != null
                    ? 'En attente des autres…'
                    : ''}
                </div>
              )}

              {bidding && G.lastSteal?.victim === playerID && (
                <StealNotice steal={G.lastSteal} names={names} me={playerID} />
              )}

              {bidding && (
                <div className="middle">
                  <div className="middle-label">
                    Jetons du {round.label.toLowerCase()} — prenez-en un, ou subtilisez celui d’un complice
                  </div>
                  <div className="middle-chips">
                    {G.middle.map((s) => (
                      <Chip
                        key={s}
                        color={color}
                        stars={s}
                        size="lg"
                        dark={isDarkChip(G, G.round, s, n)}
                        title={
                          isDarkChip(G, G.round, s, n) ? 'Jeton sombre : une fois pris, il ne bouge plus' : undefined
                        }
                        onClick={myChipLocked ? undefined : () => moves.takeChip(s)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {G.phase === 'guess' && !over && <GuessPanel G={G} playerID={playerID} names={names} moves={moves} />}
              {reveal && <RevealPanel G={G} names={names} />}
              {over && <GameOver gameover={ctx.gameover} />}
            </div>
          </section>
        </div>
      </div>

      <section className="me">
        <div className="me-cards-wrap">
          {cardAction && <div className="card-action-hint">{cardAction.hint}</div>}
          <div className={`me-cards ${cardAction ? 'pickable' : ''}`}>
            <CardRow
              cards={myHand}
              stagger={150}
              keyPrefix={G.heist}
              onPick={cardAction?.onPick}
              title={cardAction ? (pendingDiscard ? 'Défausser cette carte' : 'Passer cette carte') : undefined}
            />
          </div>
        </div>

        <div className="me-info">
          <div className="me-name">
            {names[playerID]} (vous){G.muscle === playerID && <span className="pill complice">Gros bras</span>}
          </div>
          <ChipHistory chips={G.chips[playerID]} upTo={reveal ? 4 : G.round} />
          {bidding && (
            <div className="me-current">
              <span>Votre jeton :</span>
              {myChip != null ? (
                <Chip key={`${color}-${myChip}`} color={color} stars={myChip} size="lg" dark={myChipLocked} />
              ) : (
                <span className="muted">aucun</span>
              )}
            </div>
          )}
        </div>

        <div className="me-actions">
          {bidding && (
            <>
              <button className="btn" disabled={myChip == null || myChipLocked} onClick={() => moves.returnChip()}>
                Rendre mon jeton
              </button>
              {myChipLocked && <span className="muted small hint">Jeton sombre : il reste à vous pour ce tour.</span>}
              <RoundHint G={G} ctx={ctx} color={color} />
            </>
          )}
          {reveal && !over && (
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

function RoundHint({ G, ctx, color }) {
  const holding = ctx.playOrder.filter((pid) => G.chips[pid][color] != null).length;
  const waiting = Object.keys(G.pendingDiscard || {}).length > 0;
  return (
    <span className="muted small hint">
      {holding}/{ctx.playOrder.length} jetons pris
      <span className="hint-long">
        . L'étape suivante démarre dès que chacun en a un{waiting ? ' (et que les défausses en cours sont faites)' : ''}
      </span>
      .
    </span>
  );
}

function StealNotice({ steal, names, me }) {
  const chip = `${steal.stars}★`;
  let text;
  if (steal.victim === me) text = `${names[steal.thief]} vous a volé votre jeton ${chip} ! Reprenez-en un.`;
  else if (steal.thief === me) text = `Vous avez volé le jeton ${chip} de ${names[steal.victim]}.`;
  else text = `${names[steal.thief]} a volé le jeton ${chip} de ${names[steal.victim]}.`;
  return (
    <div key={steal.id} className={`steal-notice ${steal.victim === me ? 'victim' : ''}`}>
      {text}
    </div>
  );
}

function ChipHistory({ chips, upTo }) {
  if (!chips) return null;
  return (
    <div className="history">
      {ROUNDS.slice(0, upTo).map((r) =>
        chips[r.key] != null ? <Chip key={r.key} color={r.key} stars={chips[r.key]} size="sm" title={r.label} /> : null,
      )}
    </div>
  );
}

function Seat({ pid, name, online, G, n, color, bidding, reveal, onSteal }) {
  const chip = G.chips[pid]?.[color];
  const locked = chip != null && isDarkChip(G, G.round, chip, n);
  const hand = G.hands[pid] || Array.from({ length: G.handSizes?.[pid] ?? 2 }, () => null);
  const pending = G.pendingDiscard?.[pid];
  return (
    <div className={`seat ${G.ready[pid] && reveal ? 'is-ready' : ''}`}>
      <div className="seat-head">
        <span className={`dot ${online ? 'on' : ''}`} title={online ? 'Connecté' : 'Déconnecté'} />
        <span className="seat-name">{name}</span>
        {G.muscle === pid && <span className="pill complice">Gros bras</span>}
        {G.ready[pid] && reveal && <span className="tag">prêt</span>}
      </div>
      <div className="seat-cards">
        <CardRow cards={hand} small stagger={100} baseDelay={reveal ? 300 : 0} keyPrefix={G.heist} />
      </div>
      {pending && <span className="muted small">doit défausser une carte…</span>}
      <ChipHistory chips={G.chips[pid]} upTo={reveal ? 4 : G.round} />
      {bidding && (
        <div className="seat-current">
          {chip != null && !locked ? (
            <button
              key={`${color}-${chip}`}
              className="steal-btn"
              onClick={onSteal}
              title={`Voler le jeton de ${name}`}
            >
              <Chip color={color} stars={chip} size="md" />
              <span className="steal-label">Voler</span>
            </button>
          ) : chip != null ? (
            <Chip color={color} stars={chip} size="md" dark title="Jeton sombre : impossible à voler" />
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
    result.order.find((o) => o.pid === pid)?.bestCards.some((b) => b.rank === card.rank && b.suit === card.suit);

  return (
    <div className={`reveal ${result.success ? 'success' : 'fail'}`}>
      <h2>{result.success ? 'Coffre ouvert !' : 'Alarme !'}</h2>
      <GuessResult guess={result.guess} names={names} />
      <p className="muted">Mains révélées de la plus faible (1★ rouge) à la plus forte.</p>
      <ol
        className={`reveal-list ${result.order.length > 4 ? 'two-cols' : ''}`}
        style={{ '--rows': Math.ceil(result.order.length / 2) }}
      >
        {result.order.map((o, idx) => (
          <li key={o.pid} className={`${o.ok ? 'ok' : 'ko'} reveal-row`} style={{ '--row-delay': `${idx * 350}ms` }}>
            <Chip color="red" stars={o.stars} size="sm" />
            <span className="r-name">
              {names[o.pid]}
              {o.muscle && <span className="pill complice">Gros bras</span>}
            </span>
            <span className="r-cards">
              <CardRow
                cards={G.hands[o.pid]}
                small
                stagger={90}
                baseDelay={idx * 350}
                highlight={(c) => used(o.pid, c)}
              />
            </span>
            <span className="r-hand">{o.handName}</span>
            <span className="r-mark">{o.ok ? '✓' : '✗'}</span>
          </li>
        ))}
      </ol>
      <Upcoming G={G} />
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
