# The Gang — version en ligne

Implémentation navigateur du jeu de poker coopératif *The Gang*, pour 3 à 6 joueurs.
React + [boardgame.io](https://boardgame.io) (état partagé, infos cachées, salons).

## Démarrer

```bash
npm install
npm run dev        # serveur (port 8000) + client Vite (port 5173)
```

Ouvrez http://localhost:5173, créez un salon, puis partagez le lien d'invitation.

### Tester seul : le mode solo

Ouvrez http://localhost:5173/?solo=4 (de 3 à 6 joueurs), ou cliquez sur le lien en bas du lobby.
Toute la partie tourne dans la page, sans serveur, et une barre en haut permet de jouer chaque joueur à tour de rôle.
Chaque vue ne montre que les cartes du joueur sélectionné, comme en vrai.
Le client seul suffit : `npm run dev:client`.

Options d'URL du mode solo :
- `&mode=avance` (ou `pro`, `gangster`) : choisir la difficulté ;
- `&effractions=4,8&complice=5` : imposer des cartes au premier casse pour tester un effet précis.

```bash
npm test           # tests du moteur de règles
npm run build      # compile le client dans dist/
npm start          # production : un seul port sert le jeu et le client
```

## Structure

```
src/game/          moteur de règles, sans interface (testable seul)
  cards.js         paquet de 52 cartes
  handEval.js      évaluation des mains de poker (meilleures 5 sur 7)
  game.js          définition boardgame.io : tours, jetons, coffres, effets des cartes
  specialCards.js  cartes Effraction, cartes Complice, modes de difficulté
  *.test.js        tests (vitest) : règles de base + une vérification par carte et par mode
src/client/        interface React
  App.jsx          lobby (créer / rejoindre, difficulté) et connexion au serveur
  SoloMode.jsx     mode solo (tous les joueurs dans une page)
  Board.jsx        table de jeu
  Mastermind.jsx   le cerveau du braquage (portrait + réplique épinglée)
  mastermind.js    banque de répliques, choisies d'après le dernier événement de la partie
  Specials.jsx     cartes actives, actions des Complices, devinettes, journal
  parts.jsx        cartes animées, jetons
  styles.css       thème « salon feutré × tripot » (boiseries, velours bordeaux, dorures)
server/index.js    serveur boardgame.io (+ fichiers statiques en production)
```

## Règles implémentées

- Chaque joueur reçoit 2 cartes. 4 manches : pré-flop (jetons blancs), flop (+3 cartes, jaunes), turn (+1, orange), river (+1, rouges).
- À chaque manche, chacun prend un jeton : au centre, ou en le **volant à un autre joueur** (bouton « Voler »).
  La victime se retrouve sans jeton et en est prévenue. Un jeton déjà tenu repart au centre quand on en prend un autre.
- Pas de tours de jeu : tout le monde agit en même temps. **Dès que chaque joueur a un jeton, l'étape suivante démarre**.
- À la fin de la river, les mains sont comparées dans l'ordre des jetons rouges. Les égalités sont acceptées dans les deux sens.
- 3 casses réussis : victoire. 3 alarmes : défaite.
- Chaque joueur ne reçoit du serveur que ses propres cartes (`playerView`), donc impossible de tricher via les outils du navigateur.

### Difficultés

| Mode | Règle |
|---|---|
| Basique | Sans cartes spéciales. |
| Avancé | Premier casse normal. Après un succès : une Effraction pour le casse suivant. Après un échec : un Complice. Les piles sont d'abord tirées dans l'ordre 1 à 10, puis mélangées. |
| Pro | Comme Avancé, sans l'Effraction 1, plus une Effraction tirée au hasard et active toute la partie. |
| Gangster | Sans l'Effraction 1 ni Complices, défaite à 2 alarmes. Deux Effractions actives ; à chaque casse, on retire la plus petite et on en tire une nouvelle. |

### Cartes Effraction

Toutes sont gérées automatiquement : tours sautés (1, 5), jetons sombres impossibles à voler ou rendre (2, 6),
repioches selon le flop (3, 7), jetons des tours précédents cachés (8), 3 cartes en main (10).
Pour le Scan rétinien (4) et le Lecteur d'empreintes (9), une étape « Contrôle de sécurité » apparaît avant l'abattage :
l'équipe se met d'accord, puis un joueur (pas la cible) valide la réponse.

### Cartes Complice

- **Automatiques en début de casse** : Actionnaire (3) et Génie des chiffres (8) publient les annonces dans le journal ;
  le Coordinateur (6) demande à chacun de choisir une carte à passer au joueur suivant.
- **À déclencher** (bouton « Utiliser » quand l'équipe le décide, jusqu'à la fin de la river) : Informateur (1, la carte
  n'est visible que du destinataire), Conductrice (2), Cerveau de la bande (4), Hackeuse (5), Valet (7, carte V sans couleur),
  Arnaqueuse (9), Gros bras (10, appliqué automatiquement à l'abattage).

Pas encore implémentés : chat intégré (prévu pour jouer en appel vocal), variantes à 2 joueurs.

## Ambiance

- Décor de cercle de jeu clandestin : boiseries, lampe suspendue, table en velours bordeaux à rebord doré,
  cartes ivoire légèrement inclinées, jetons de casino, notes épinglées sur papier.
- **Le cerveau du braquage** commente la partie : distribution, flop, turn, river, vols de jetons, Complices utilisés,
  contrôles de sécurité, coffre ouvert ou alarme, victoire, défaite. Le moteur publie le dernier événement (`G.event`)
  et la réplique en découle : tous les joueurs voient la même. Pour ajouter des répliques : `src/client/mastermind.js`.
- Polices embarquées via `@fontsource` (Cinzel, Cormorant Garamond, Inter) : aucune dépendance à Google Fonts.
- Animations désactivées si le système demande de réduire les mouvements.

## Déploiement

N'importe quel hébergeur Node (Render, Fly.io, Railway…) :

```bash
npm install && npm run build
PUBLIC_URL=https://votre-domaine.example npm start
```

`PORT` est lu depuis l'environnement. Les parties sont gardées **en mémoire** : un redémarrage du serveur les efface
(boardgame.io propose des adaptateurs de stockage si besoin).

## Note

*The Gang* est un jeu publié par Kosmos. Ce projet n'utilise ni leurs illustrations ni leurs textes.
Pour un usage public, prévoyez un autre nom.
