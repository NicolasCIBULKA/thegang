import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// boardgame.io/server n'est publié qu'en CommonJS
const require = createRequire(import.meta.url);
const { Server, Origins } = require('boardgame.io/server');
import serve from 'koa-static';
import { TheGang } from '../src/game/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8000;

const origins = [Origins.LOCALHOST];
if (process.env.PUBLIC_URL) origins.push(process.env.PUBLIC_URL);

const server = Server({ games: [TheGang], origins });

// En production, le serveur sert aussi le client compilé (dist/)
if (process.env.NODE_ENV === 'production') {
  server.app.use(serve(path.resolve(__dirname, '../dist')));
}

server.run(PORT, () => {
  console.log(`Serveur The Gang sur http://localhost:${PORT}`);
});
