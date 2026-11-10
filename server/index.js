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
// « npm run build » : si l'interface n'est pas encore compilée, on la compile ici, une fois, au démarrage.
// Les variables VITE_* (ex. VITE_SOCKET_TRANSPORTS) sont lues dans l'environnement à ce moment-là.
if (!fs.existsSync(path.join(DIST, 'index.html')) && process.env.NODE_ENV !== 'development') {
  console.log('Interface non compilée : compilation en cours…');
  try {
    const { build } = await import('vite');
    await build({ root: path.resolve(__dirname, '..'), logLevel: 'warn' });
    console.log('Interface compilée.');
  } catch (err) {
    console.error('Échec de la compilation de l’interface :', err);
  }
}

// Le serveur sert aussi le client compilé (dist/) :
// c'est le cas en production, quel que soit l'hébergeur et la façon dont il lance le serveur.
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  server.app.use(serve(DIST));
}

server.run(PORT, () => {
  console.log(`Serveur The Gang sur le port ${PORT}`);
});
