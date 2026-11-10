import React, { useState } from 'react';
import { EFFRACTIONS, COMPLICES } from '../game/specialCards.js';
import { CATEGORY_NAMES } from '../game/handEval.js';
import { RANK_LABELS } from '../game/cards.js';
import { Card, formatFeed } from './parts.jsx';

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

// ---------- Cartes actives ----------

export function ActiveCards({ G, ctx, playerID, names, moves, canAct }) {
  const { challenges, specialist } = G;
  if (!challenges.length && !specialist) return null;
  return (
    <section className="active-cards">
      {challenges.map((id) => (
        <div key={`e${id}`} className="special-card effraction">
          <div className="sc-head">
            <span className="sc-kind">Effraction {id}</span>
            {G.permanent.includes(id) && <span className="sc-tag">permanente</span>}
          </div>
          <div className="sc-name">{EFFRACTIONS[id].name}</div>
          <div className="sc-text">{EFFRACTIONS[id].text}</div>
        </div>
      ))}
      {specialist && (
        <SpecialistCard
          G={G}
          ctx={ctx}
          playerID={playerID}
          names={names}
          moves={moves}
          canAct={canAct}
          specialist={specialist}
        />
      )}
    </section>
  );
}

function SpecialistCard({ G, ctx, playerID, names, moves, canAct, specialist }) {
  const [open, setOpen] = useState(false);
  const info = COMPLICES[specialist.id];
  const usable = canAct && info.kind === 'action' && !specialist.used;

  return (
    <div className={`special-card complice ${specialist.used ? 'used' : ''}`}>
      <div className="sc-head">
        <span className="sc-kind">Complice {specialist.id}</span>
        {specialist.used && (
          <span className="sc-tag">
            {info.kind === 'auto' ? 'appliqué' : `utilisé${specialist.by ? ` par ${names[specialist.by]}` : ''}`}
          </span>
        )}
      </div>
      <div className="sc-name">{info.name}</div>
      <div className="sc-text">{info.text}</div>
      {usable && !open && (
        <button className="btn small-btn" onClick={() => setOpen(true)}>
          Utiliser (moi)
        </button>
      )}
      {usable && open && (
        <SpecialistForm
          id={specialist.id}
          G={G}
          ctx={ctx}
          playerID={playerID}
          names={names}
          onCancel={() => setOpen(false)}
          onUse={(payload) => {
            moves.useSpecialist(payload);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SpecialistForm({ id, G, ctx, playerID, names, onUse, onCancel }) {
  const others = ctx.playOrder.filter((p) => p !== playerID);
  const [to, setTo] = useState(others[0]);
  const [cardIndex, setCardIndex] = useState(0);
  const [target, setTarget] = useState(others[0]);
  const [rank, setRank] = useState(14);
  const myHand = G.hands[playerID] || [];

  const confirmTexts = {
    2: 'Annoncer ma combinaison actuelle à tous',
    5: 'Piocher une carte (je défausserai ensuite)',
    7: 'Prendre le Valet spécial (je défausserai ensuite)',
    9: 'Mélanger et redistribuer toutes les cartes',
    10: 'Prendre le Gros bras pour moi',
  };

  return (
    <div className="sc-form">
      {id === 1 && (
        <>
          <span>Montrer cette carte :</span>
          <div className="pick-cards">
            {myHand.map((c, i) => (
              <Card key={i} card={c} small selected={i === cardIndex} onClick={() => setCardIndex(i)} />
            ))}
          </div>
          <label>
            à{' '}
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((p) => (
                <option key={p} value={p}>
                  {names[p]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary small-btn" onClick={() => onUse({ to, cardIndex })}>
            Montrer en secret
          </button>
        </>
      )}
      {id === 4 && (
        <>
          <label>
            Combien de{' '}
            <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {RANK_LABELS[r]}
                </option>
              ))}
            </select>{' '}
            a{' '}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {ctx.playOrder.map((p) => (
                <option key={p} value={p}>
                  {names[p]}
                </option>
              ))}
            </select>{' '}
            ?
          </label>
          <button className="btn primary small-btn" onClick={() => onUse({ target, rank })}>
            Demander
          </button>
        </>
      )}
      {confirmTexts[id] && (
        <button className="btn primary small-btn" onClick={() => onUse({})}>
          {confirmTexts[id]}
        </button>
      )}
      <button className="btn ghost small-btn" onClick={onCancel}>
        Annuler
      </button>
    </div>
  );
}

// ---------- Devinette (Scan rétinien / Lecteur d'empreintes) ----------

export function GuessPanel({ G, playerID, names, moves }) {
  const { target, needRank, needCategory } = G.guess;
  const [rank, setRank] = useState(14);
  const [category, setCategory] = useState(1);
  const isTarget = playerID === target;

  return (
    <div className="guess-panel">
      <h3>Contrôle de sécurité</h3>
      {isTarget ? (
        <p>
          Vous avez le plus haut jeton rouge : l’équipe doit deviner {needRank && 'une valeur de vos cartes'}
          {needRank && needCategory && ' et '}
          {needCategory && 'votre combinaison'}. Vous ne pouvez pas répondre.
        </p>
      ) : (
        <>
          <p>
            Mettez-vous d’accord, puis l’un de vous valide pour <strong>{names[target]}</strong> :
          </p>
          <div className="guess-fields">
            {needRank && (
              <label>
                Il a au moins un{' '}
                <select value={rank} onChange={(e) => setRank(Number(e.target.value))}>
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {RANK_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needCategory && (
              <label>
                Sa combinaison :{' '}
                <select value={category} onChange={(e) => setCategory(Number(e.target.value))}>
                  {CATEGORY_NAMES.map((n, i) => (
                    <option key={i} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button className="btn primary" onClick={() => moves.submitGuess({ rank, category })}>
            Valider la réponse de l’équipe
          </button>
        </>
      )}
    </div>
  );
}

export function GuessResult({ guess, names }) {
  if (!guess?.answer) return null;
  const parts = [];
  if (guess.needRank) parts.push(`une carte ${RANK_LABELS[guess.answer.rank]}`);
  if (guess.needCategory) parts.push(`« ${CATEGORY_NAMES[guess.answer.category]} »`);
  return (
    <p className={`guess-result ${guess.correct ? 'ok' : 'ko'}`}>
      Devinette pour {names[guess.target]} : {parts.join(' et ')} —{' '}
      {guess.correct ? 'correct !' : 'raté, l’alarme se déclenche.'}
    </p>
  );
}

// ---------- Journal ----------

export function Feed({ G, names }) {
  const { feed, secrets } = G;
  if (!feed.length && !secrets.length) return null;
  return (
    <section className="feed">
      {secrets.map((s, i) => (
        <div key={`s${i}`} className="feed-item secret">
          <span>🤫 {names[s.from]} vous montre en secret :</span>
          <Card card={s.card} small />
        </div>
      ))}
      {feed.map((f, i) => (
        <div key={i} className="feed-item">
          {formatFeed(f.text, names)}
        </div>
      ))}
    </section>
  );
}

// ---------- Cartes du prochain casse ----------

export function Upcoming({ G }) {
  const { challenges, specialist } = G.upcoming;
  const fresh = challenges.filter((id) => !G.permanent.includes(id));
  if (!fresh.length && !specialist) return null;
  return (
    <div className="upcoming">
      <span className="muted">Au prochain casse :</span>
      {fresh.map((id) => (
        <span key={id} className="pill effraction">
          Effraction · {EFFRACTIONS[id].name}
        </span>
      ))}
      {specialist && <span className="pill complice">Complice · {COMPLICES[specialist].name}</span>}
    </div>
  );
}
