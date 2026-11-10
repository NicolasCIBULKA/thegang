import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// boardgame.io/server n'est publié qu'en CommonJS
const require = createRequire(import.meta.url);
const { Server, Origins, FlatFile } = require('boardgame.io/server');
import serve from 'koa-static';
import { TheGang } from '../src/game/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const DIST = path.resolve(__dirname, '../dist');

const origins = [Origins.LOCALHOST];
// Adresse publique du site : PUBLIC_URL, ou celle que Render fournit automatiquement.
const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
if (publicUrl) origins.push(publicUrl.replace(/\/$/, ''));

// Sauvegarde des parties sur disque (optionnelle) : DATA_DIR=~/thegang-data
// Sans elle, les parties vivent en mémoire et disparaissent quand le processus redémarre.
// node-persist regroupe les écritures et ne les fait qu'au bout d'une seconde : un redémarrage juste après
// un coup le perdrait. On écrit donc chaque coup immédiatement.
class DurableFlatFile extends FlatFile {
  async connect() {
    await this.games.init({ dir: this.dir, logging: this.logging, ttl: this.ttl, writeQueue: false });
  }
}

let db;
if (process.env.DATA_DIR) {
  const dir = process.env.DATA_DIR.replace(/^~(?=$|\/)/, os.homedir());
  fs.mkdirSync(dir, { recursive: true });
  db = new DurableFlatFile({ dir, logging: false });
  console.log(`Parties sauvegardées dans ${dir}`);
}

const server = Server({ games: [TheGang], origins, ...(db ? { db } : {}) });

// Certains hébergeurs (préréglage « Express » d'Hostinger) lancent directement ce fichier sans exécuter
// « npm run build ». Dans ce cas on compile l'interface ici, APRÈS avoir ouvert le port : l'hébergeur voit
// tout de suite un serveur qui répond, et les visiteurs voient une page d'attente pendant la compilation.
// Les variables VITE_* (ex. VITE_SOCKET_TRANSPORTS) sont lues dans l'environnement à ce moment-là.
const needsBuild = !fs.existsSync(path.join(DIST, 'index.html')) && process.env.NODE_ENV !== 'development';
let building = false;
let buildError = null;

const WAIT_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="5">
<title>The Gang — préparation</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#22100c;color:#f3e7cf;font-family:Georgia,serif;text-align:center">
<div><div style="font-size:28px;letter-spacing:.3em;color:#c9a24a">THE GANG</div>
<p style="font-style:italic;font-size:19px">Le cerveau prépare la table… La page se recharge toute seule.</p></div></body></html>`;

server.app.use(async (ctx, next) => {
  if ((building || buildError) && ctx.method === 'GET' && !ctx.path.startsWith('/games') && !ctx.path.startsWith('/socket.io')) {
    ctx.status = 503;
    ctx.set('Retry-After', '5');
    ctx.type = 'html';
    ctx.body = buildError ? WAIT_PAGE.replace('Le cerveau prépare la table… La page se recharge toute seule.', 'La compilation a échoué : consultez les journaux du serveur.') : WAIT_PAGE;
    return;
  }
  await next();
});

// Le serveur sert le client compilé (dist/), y compris s'il n'est créé qu'après le démarrage.
server.app.use(serve(DIST));

server.run(PORT, async () => {
  console.log(`Serveur The Gang sur le port ${PORT}`);
  if (!needsBuild) return;
  building = true;
  console.log('Interface non compilée : compilation en cours…');
  try {
    const { build } = await import('vite');
    await build({ root: path.resolve(__dirname, '..'), logLevel: 'warn' });
    console.log('Interface compilée.');
  } catch (err) {
    buildError = err;
    console.error('Échec de la compilation de l’interface :', err);
  } finally {
    building = false;
  }
});
