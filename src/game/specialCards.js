// Cartes Effraction (malus), cartes Complice (aides) et modes de difficulté.
// Les textes sont des résumés des effets, pas les textes officiels des cartes.

export const EFFRACTIONS = {
  1: { name: 'Ouverture facile', text: 'Pas de jetons blancs : le flop est révélé tout de suite et on commence au tour 2.' },
  2: { name: 'Capteurs de bruit', text: 'Aux tours 1 à 3, le jeton 1★ est sombre : une fois pris, il ne change plus de propriétaire.' },
  3: { name: 'Détecteurs de mouvement', text: 'Si le flop contient un V, une D ou un R, le joueur au jeton blanc 1★ repioche ses cartes.' },
  4: { name: 'Scan rétinien', text: 'Avant l’abattage, l’équipe doit deviner une valeur de carte que possède le joueur au plus haut jeton rouge. Erreur = alarme.' },
  5: { name: 'Fuite précipitée', text: 'Pas de jetons orange : turn et river sont révélés ensemble, puis on passe au tour 4.' },
  6: { name: 'Grille d’aération', text: 'Aux tours 1 à 3, le jeton le plus étoilé est sombre : une fois pris, il ne change plus de propriétaire.' },
  7: { name: 'Barrières photoélectriques', text: 'Si le flop ne contient ni V, ni D, ni R, le joueur au plus haut jeton blanc repioche ses cartes.' },
  8: { name: 'Panne d’électricité', text: 'À chaque nouveau tour, les jetons du tour précédent sont défaussés : on ne les voit plus.' },
  9: { name: 'Lecteur d’empreintes', text: 'Avant l’abattage, l’équipe doit deviner la combinaison du joueur au plus haut jeton rouge. Erreur = alarme.' },
  10: { name: 'Caméras de surveillance', text: 'Chaque joueur reçoit 3 cartes personnelles au lieu de 2.' },
};

// auto : s'applique tout seul au début du casse ; action : un joueur la déclenche quand l'équipe le décide.
export const COMPLICES = {
  1: { name: 'Informateur', kind: 'action', text: 'Un joueur montre secrètement une de ses cartes à un autre joueur.' },
  2: { name: 'Conductrice', kind: 'action', text: 'Un joueur annonce le type de sa meilleure combinaison actuelle.' },
  3: { name: 'Actionnaire', kind: 'auto', text: 'Après la distribution, chacun annonce combien il a de têtes (V, D, R).' },
  4: { name: 'Cerveau de la bande', kind: 'action', text: 'L’équipe choisit une valeur ; un joueur désigné annonce combien il en a en main.' },
  5: { name: 'Hackeuse', kind: 'action', text: 'Un joueur pioche une carte, puis en défausse une de sa main (éventuellement celle piochée).' },
  6: { name: 'Coordinateur', kind: 'auto', text: 'Après la distribution, chacun passe une carte à son voisin, tous en même temps.' },
  7: { name: 'Valet', kind: 'action', text: 'Un joueur prend le Valet spécial (un V sans couleur) et défausse une autre carte.' },
  8: { name: 'Génie des chiffres', kind: 'auto', text: 'Après la distribution, chacun annonce la somme de ses cartes (têtes = 10, As = 11).' },
  9: { name: 'Arnaqueuse', kind: 'action', text: 'Toutes les cartes personnelles sont ramassées, mélangées et redistribuées.' },
  10: { name: 'Gros bras', kind: 'action', text: 'Un joueur prend cette carte : à l’abattage, il bat toute main du même type.' },
};

export const MODES = {
  basique: {
    label: 'Basique',
    text: 'Le jeu de base, sans cartes spéciales.',
  },
  avance: {
    label: 'Avancé',
    text: 'Après un casse réussi, une Effraction complique le suivant ; après un échec, un Complice aide le suivant.',
  },
  pro: {
    label: 'Pro',
    text: 'Comme Avancé, plus une Effraction tirée au hasard active pendant toute la partie.',
  },
  gangster: {
    label: 'Gangster',
    text: 'Deux Effractions toujours actives (renouvelées à chaque casse), aucun Complice, défaite à 2 alarmes.',
  },
};

// Valet spécial du Complice n°7 : compte comme un V, sans couleur.
export const SPECIAL_JACK = { rank: 11, suit: 'X' };
