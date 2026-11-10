import React from 'react';
import { MODES, EXTENSIONS } from '../game/specialCards.js';

/**
 * Paramètres d'une partie : difficulté, nombre de joueurs, extensions.
 * Utilisé dans la salle d'attente et dans le menu quand on s'apprête à rejoindre un salon.
 */
export default function MatchSettings({ mode, numPlayers, seated, extensions = [] }) {
  const m = MODES[mode] || MODES.basique;
  const free = seated != null ? numPlayers - seated : null;
  const ext = extensions.filter((id) => EXTENSIONS[id]);

  return (
    <dl className="match-settings">
      <div>
        <dt>Difficulté</dt>
        <dd>
          <strong>{m.label}</strong>
          <span>{m.text}</span>
        </dd>
      </div>
      <div>
        <dt>Joueurs</dt>
        <dd>
          <strong>{numPlayers} prévus</strong>
          {free != null && (
            <span>
              {free === 0 ? 'Salon complet' : `${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}`}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>Extensions</dt>
        <dd>
          {ext.length ? (
            ext.map((id) => (
              <span key={id}>
                <strong>{EXTENSIONS[id].label}</strong> — {EXTENSIONS[id].text}
              </span>
            ))
          ) : (
            <strong>Aucune</strong>
          )}
        </dd>
      </div>
    </dl>
  );
}
