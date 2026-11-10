import React, { useEffect, useState } from 'react';
import { mastermindLine } from './mastermind.js';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Affiche le texte lettre par lettre ; un clic l'affiche en entier. */
function useTypewriter(text, key, speed = 28) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (reducedMotion()) {
      setCount(text.length);
      return undefined;
    }
    setCount(0);
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, speed);
    return () => clearInterval(id);
  }, [key, text, speed]);
  return [text.slice(0, count), count >= text.length, () => setCount(text.length)];
}

export function Portrait({ size = 'md' }) {
  return (
    <div className={`portrait portrait-${size}`}>
      <div className="portrait-inner">
        <svg viewBox="0 0 70 78" aria-hidden="true">
          <path d="M8 78c3-19 14-25 27-25s24 6 27 25z" fill="#1a1210" />
          <path d="M28 53l7 8 7-8 2 25H26z" fill="#efe3c8" />
          <path d="M33 58h4l2 18h-8z" fill="#7a1622" />
          <circle cx="35" cy="36" r="13" fill="#d6ad86" />
          <path d="M22 38c4 3 22 3 26 0v-4H22z" fill="rgba(0,0,0,.35)" />
          <path d="M15 29h40c0 3-3 4-6 4H21c-3 0-6-1-6-4z" fill="#2a1712" />
          <path d="M22 29c0-12 4-17 13-17s13 5 13 17z" fill="#2a1712" />
          <path d="M22 25h26v3H22z" fill="#7a1622" />
        </svg>
      </div>
    </div>
  );
}

/**
 * `coach` (tutoriel) remplace la réplique du cerveau : { key, text, step, total, task, next }.
 * - task : ce que le joueur doit faire maintenant (affiché en dessous) ;
 * - next : { label, onClick } pour un bouton « Suivant » quand aucune action de jeu n'est attendue.
 */
export default function Mastermind({ G, ctx, names, coach }) {
  const line = coach ? { key: coach.key, text: coach.text } : mastermindLine(G, ctx, names);
  const { key, text } = line;
  const [shown, done, finish] = useTypewriter(text, key, coach ? 18 : 28);

  const identity = (
    <div className="mm-id">
      <Portrait />
      <div className="mm-name">
        <span className="mm-title">Le Cerveau</span>
        <span className="mm-sub">
          {coach ? `tutoriel · ${coach.step}/${coach.total}` : 'celui qui a tout planifié'}
        </span>
      </div>
    </div>
  );
  // Le texte complet est lu par les lecteurs d'écran ; l'effet machine à écrire est purement visuel.
  const words = (
    <>
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
      <span aria-hidden="true">
        « {shown}
        {done ? ' »' : <span className="caret">▍</span>}
      </span>
    </>
  );

  if (coach) {
    return (
      <aside className="mastermind coaching" aria-label="Le cerveau du braquage, votre guide">
        {identity}
        <div className="mm-note">
          <span className="pin" aria-hidden="true" />
          <span className="mm-step" aria-hidden="true">
            {coach.step}/{coach.total}
          </span>
          {words}
          {done && coach.task && <span className="mm-task">{coach.task}</span>}
          {done && coach.next && (
            <span className="mm-actions">
              {coach.next.map((b) => (
                <button key={b.label} className={`btn small-btn ${b.primary ? 'primary' : ''}`} onClick={b.onClick}>
                  {b.label}
                </button>
              ))}
            </span>
          )}
          {!done && (
            <button className="mm-skip" onClick={finish}>
              Tout afficher
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="mastermind" aria-label="Le cerveau du braquage">
      {identity}
      <button className="mm-note" onClick={finish} title={done ? undefined : 'Afficher toute la réplique'}>
        <span className="pin" aria-hidden="true" />
        {words}
      </button>
    </aside>
  );
}
