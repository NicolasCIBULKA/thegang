# The Gang — version en ligne

Implémentation navigateur du jeu de poker coopératif *The Gang*, pour 3 à 6 joueurs.
React + [boardgame.io](https://boardgame.io) (état partagé, infos cachées, salons).

## Démarrer

```bash
npm install
npm run dev        # serveur (port 8000) + client Vite (port 5173)
```

Ouvrez http://localhost:5173, créez un salon, puis partagez le lien d'invitation.
Pour tester seul, ouvrez plusieurs fenêtres de navigation privée.

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
  game.js          définition boardgame.io : manches, jetons, coffres
  game.test.js     tests (vitest)
src/client/        interface React
  App.jsx          lobby (créer / rejoindre) et connexion au serveur
  Board.jsx        table de jeu
server/index.js    serveur boardgame.io (+ fichiers statiques en production)
```

## Règles implémentées

- Chaque joueur reçoit 2 cartes. 4 manches : pré-flop (jetons blancs), flop (+3 cartes, jaunes), turn (+1, orange), river (+1, rouges).
- À chaque manche, chacun prend un jeton : au centre ou **chez un autre joueur** (il en est privé), et peut rendre le sien.
  Un jeton déjà tenu repart au centre quand on en prend un autre.
- Pas de tours de jeu : tout le monde agit en même temps. La manche avance quand **tous ont un jeton et ont cliqué « Je suis prêt »**.
  Tout mouvement de jeton annule les « prêt » (comme autour d'une vraie table, on peut encore changer d'avis).
- À la fin de la river, les mains sont comparées dans l'ordre des jetons rouges. Les égalités sont acceptées dans les deux sens.
- 3 casses réussis : victoire. 3 alarmes : défaite.
- Chaque joueur ne reçoit du serveur que ses propres cartes (`playerView`), donc impossible de tricher via les outils du navigateur.

Pas encore implémentés : cartes Défi et Spécialiste, chat, variantes à 2 joueurs.

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
