import React from 'react';
import { RANK_LABELS, SUIT_SYMBOLS } from '../game/cards.js';

// ---------- Cartes ----------

const cardKey = (card) => (card ? `${card.rank}${card.suit}` : 'back');

/**
 * Carte animée : chaque nouvelle carte (nouvelle clé React) glisse sur la table puis se retourne.
 * `delay` (en ms) échelonne les animations, ex. les 3 cartes du flop.
 */
export function Card({ card, small, highlight, glow, delay = 0, onClick, selected, title }) {
  const style = { '--deal-delay': `${delay}ms` };
  const Tag = onClick ? 'button' : 'div';
  const base = `card ${small ? 'small' : ''} ${onClick ? 'clickable' : ''} ${selected ? 'selected' : ''}`;
  if (!card) return <Tag className={`${base} back deal-back`} style={style} onClick={onClick} title={title} />;
  const red = card.suit === 'H' || card.suit === 'D';
  const special = card.suit === 'X';
  return (
    <Tag
      className={`${base} deal-flip ${red ? 'red' : ''} ${special ? 'special' : ''} ${highlight ? 'hl' : ''} ${glow ? 'glow' : ''}`}
      style={style}
      onClick={onClick}
      title={title}
    >
      <span className="rank">{RANK_LABELS[card.rank]}</span>
      <span className="suit">{SUIT_SYMBOLS[card.suit]}</span>
    </Tag>
  );
}

/** Rangée de cartes ; la clé suit l'identité de la carte pour rejouer l'animation quand elle change. */
export function CardRow({
  cards,
  small,
  stagger = 120,
  baseDelay = 0,
  highlight,
  glow,
  onPick,
  title,
  keyPrefix = '',
}) {
  return cards.map((c, i) => (
    <Card
      key={`${keyPrefix}-${c ? cardKey(c) : `back-${i}`}`}
      card={c}
      small={small}
      delay={baseDelay + i * stagger}
      highlight={highlight?.(c)}
      glow={glow?.(c)}
      onClick={onPick ? () => onPick(i) : undefined}
      title={title}
    />
  ));
}

// ---------- Jetons ----------

export function Chip({ color, stars, onClick, size = 'md', title, faded, dark }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`chip chip-${color} chip-${size} ${faded ? 'faded' : ''} ${dark ? 'dark' : ''} ${
        onClick ? 'clickable' : ''
      }`}
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

/** Remplace {pid} par le nom du joueur et [rang] par la valeur lisible. */
export function formatFeed(text, names) {
  return text
    .replace(/\{(\d+)\}/g, (_, pid) => names[pid] || `Joueur ${Number(pid) + 1}`)
    .replace(/\[(\d+)\]/g, (_, r) => RANK_LABELS[r] || r);
}
