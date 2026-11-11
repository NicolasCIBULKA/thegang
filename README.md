# The Gang — version en ligne

Implémentation navigateur du jeu de poker coopératif *The Gang*, pour 3 à 6 joueurs.
React + [boardgame.io](https://boardgame.io) (état partagé, infos cachées, salons).

## Démarrer

```bash
npm install
npm run dev        # serveur (port 8000) + client Vite (port 5173)
```

Ouvrez http://localhost:5173, créez un salon, puis partagez le lien d'invitation.

### Rejouer

À la fin d'une partie en ligne, le dernier abattage reste affiché 8 secondes (ou jusqu'au clic sur « Retour au salon »),
puis chacun revient au salon : résultat, joueurs présents, paramètres. L'hôte (le créateur du salon, ou n'importe qui
s'il est parti) choisit la difficulté et le nombre de joueurs puis relance ; boardgame.io crée la partie suivante
(`playAgain`) et les autres joueurs la rejoignent automatiquement avec leur pseudo.

### Tutoriel

Le menu propose « Apprendre à jouer » (`?tuto`) : une partie guidée à 3 avec une donne choisie à l'avance,
où le cerveau du braquage explique les jetons, le vol et l'abattage pendant que Bob et Chloé jouent automatiquement.
Le scénario (texte, coups des bots, actions attendues) est dans `src/client/TutorialMode.jsx`.

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
chaque joueur sauf la cible vote, voit les votes des autres et peut changer d'avis ; la réponse n'est retenue que
lorsque tous les votes validés sont identiques.

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
- **Tout tient à l'écran, sans défilement** : la table prend la hauteur restante, cartes et jetons s'adaptent à la
  hauteur de la fenêtre ; à 5–6 joueurs, la révélation passe sur deux colonnes.
- **Vue téléphone** (≤ 720 px de large) : cerveau en bandeau, adversaires dans une bande qui défile horizontalement,
  main et bouton d'action en bas, cartes actives et registre dans un panneau « Cartes & registre » qui monte du bas.

## Déploiement

### Gratuit, depuis GitHub : Render

Le dépôt contient un `render.yaml` prêt à l'emploi.

1. Créez un compte sur [render.com](https://render.com) en vous connectant avec GitHub.
2. **New › Blueprint**, choisissez ce dépôt, puis **Apply**.
3. Le jeu est en ligne à l'adresse `https://thegang-xxxx.onrender.com` affichée par Render.
   Chaque `git push` sur `main` le redéploie automatiquement.

Limites de l'offre gratuite : le service s'endort après 15 minutes sans visite et met environ une minute à se
réveiller ; les parties en cours sont perdues à l'endormissement ou au redéploiement (elles sont en mémoire).
Tant que des joueurs sont connectés, il reste éveillé.

### Hostinger (offre Business ou Cloud, « Node.js web app »)

Ces offres n'acceptent pas les WebSocket entrants : le jeu passe alors par des requêtes HTTP (long polling de
Socket.IO), ce qui marche très bien pour un jeu au tour par tour (≈ 0,2 s par coup en test).

Hostinger ne peut pas compiler l'interface lui-même (Vite y plante au démarrage). Une action GitHub
(`.github/workflows/deploy-branch.yml`) s'en charge à chaque push sur `main` et publie le résultat, déjà compilé,
sur la branche **`deploy`** : c'est cette branche qu'Hostinger déploie.

1. hPanel › **Sites web › Ajouter un site web › Node.js web app**, puis **Importer un dépôt Git** et choisir ce dépôt,
   **branche `deploy`**.
2. Réglages :
   - Préréglage de framework : **Express** (pas « Vite », qui ne déploierait que l'interface, sans serveur) ;
   - Version de Node : **22** ;
   - Fichier d'entrée : `server/index.js`.
3. Variable d'environnement : `DATA_DIR` = `~/thegang-data` (les parties sont sauvegardées sur disque et survivent
   aux redémarrages). Le transport HTTP est déjà intégré à la compilation de la branche `deploy`.
4. **Déployer.** Chaque push sur `main` redéploie automatiquement.

En cas de souci : onglets **Deployments** (journal de build) et **Runtime Logs** (journal du serveur) dans hPanel.

### Sur votre propre serveur

N'importe quel hébergeur Node qui accepte les WebSocket (VPS, Fly.io, Railway…) :

```bash
npm install && npm run build
PUBLIC_URL=https://votre-domaine.example npm start
```

`PORT` est lu depuis l'environnement. Les parties sont gardées **en mémoire** : un redémarrage du serveur les efface
(boardgame.io propose des adaptateurs de stockage si besoin).

## Note

*The Gang* est un jeu de John Cooper et Kory Heath, publié par Kosmos. Ce projet n'utilise ni leurs illustrations ni leurs textes.
Pour un usage public, prévoyez un autre nom.
