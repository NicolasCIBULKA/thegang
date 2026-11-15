// Suivi d'utilisation, anonyme, sans service externe.
// Chaque événement est une ligne JSON ajoutée à DATA_DIR/events.jsonl (ou ./data/events.jsonl).
// Aucune adresse IP ni pseudo n'est enregistré : les visiteurs sont comptés par un identifiant aléatoire
// tiré par leur navigateur.

import fs from 'node:fs';
import path from 'node:path';

const TZ = 'Europe/Paris';
const dayKey = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: TZ }); // AAAA-MM-JJ

export function createAnalytics(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'events.jsonl');
  let cache = null; // { mtimeMs, events }

  function log(type, data = {}) {
    try {
      fs.appendFileSync(file, `${JSON.stringify({ t: Date.now(), type, ...data })}\n`);
      cache = null;
    } catch (err) {
      console.error('Suivi : écriture impossible', err.message);
    }
  }

  function readAll() {
    if (!fs.existsSync(file)) return [];
    const { mtimeMs } = fs.statSync(file);
    if (cache && cache.mtimeMs === mtimeMs) return cache.events;
    const events = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        /* ligne abîmée : ignorée */
      }
    }
    cache = { mtimeMs, events };
    return events;
  }

  /** Statistiques sur les `days` derniers jours (0 = depuis le début). */
  function stats(days = 30) {
    const all = readAll();
    const now = Date.now();
    const since = days > 0 ? now - days * 86400000 : 0;
    const events = all.filter((e) => e.t >= since);
    const of = (type) => events.filter((e) => e.type === type);

    const visits = of('visit');
    const created = [...of('match_created'), ...of('rematch')];
    const ended = of('game_end');
    const heists = of('heist_end');
    const visitorsAll = new Set(all.filter((e) => e.type === 'visit').map((e) => e.vid));

    // Série quotidienne (jours vides inclus, à partir du premier jour suivi si « depuis le début »)
    const firstTs = days > 0 ? since : all[0]?.t ?? now;
    const series = [];
    const byDay = new Map();
    for (let ts = firstTs; dayKey(ts) <= dayKey(now); ts += 86400000) {
      const k = dayKey(ts);
      if (byDay.has(k)) continue;
      const row = { day: k, visitors: new Set(), created: 0, ended: 0 };
      byDay.set(k, row);
      series.push(row);
      if (series.length > 400) break;
    }
    for (const e of events) {
      const row = byDay.get(dayKey(e.t));
      if (!row) continue;
      if (e.type === 'visit') row.visitors.add(e.vid);
      if (e.type === 'match_created' || e.type === 'rematch') row.created += 1;
      if (e.type === 'game_end') row.ended += 1;
    }

    const count = (list, key) => {
      const m = {};
      for (const e of list) m[e[key] ?? '?'] = (m[e[key] ?? '?'] || 0) + 1;
      return m;
    };
    const wins = ended.filter((e) => e.winner).length;

    return {
      days,
      generatedAt: now,
      tracking: { since: all[0]?.t ?? null, events: all.length },
      kpi: {
        visitors: new Set(visits.map((e) => e.vid)).size,
        visitorsAllTime: visitorsAll.size,
        visits: visits.length,
        matchesCreated: created.length,
        rematches: of('rematch').length,
        playersJoined: of('player_joined').length,
        gamesFinished: ended.length,
        heists: heists.length,
        winRate: ended.length ? wins / ended.length : null,
        heistSuccessRate: heists.length ? heists.filter((e) => e.success).length / heists.length : null,
        tutorialsStarted: of('tutorial').length,
        tutorialsFinished: of('tutorial_done').length,
        soloGames: of('solo').length,
      },
      series: series.map((r) => ({ day: r.day, visitors: r.visitors.size, created: r.created, ended: r.ended })),
      byMode: count(created, 'mode'),
      byPlayers: count(created, 'numPlayers'),
      recentGames: ended
        .slice(-15)
        .reverse()
        .map((e) => ({ t: e.t, mode: e.mode, numPlayers: e.numPlayers, winner: e.winner, heists: e.heists, minutes: e.minutes })),
    };
  }

  return { log, stats, file };
}

/**
 * Enveloppe la base de parties de boardgame.io pour repérer, à chaque sauvegarde d'état,
 * la fin d'un casse (un coffre de plus, ouvert ou en alarme) et la fin d'une partie.
 */
export function withGameTracking(db, analytics) {
  const seen = new Map(); // matchID → { vaults, over }
  const originalSetState = db.setState.bind(db);

  db.setState = async (matchID, state, deltalog) => {
    let before = seen.get(matchID);
    if (!before) {
      try {
        const { state: prev } = await db.fetch(matchID, { state: true });
        before = prev ? snapshot(prev) : { vaults: 0, over: false, success: 0 };
      } catch {
        before = { vaults: 0, over: false, success: 0 };
      }
    }
    await originalSetState(matchID, state, deltalog);

    const after = snapshot(state);
    seen.set(matchID, after);
    const G = state.G || {};
    if (after.vaults > before.vaults) {
      analytics.log('heist_end', { matchID, success: after.success > before.success, heist: G.heist, mode: G.mode });
    }
    if (after.over && !before.over) {
      let minutes = null;
      try {
        const { metadata } = await db.fetch(matchID, { metadata: true });
        if (metadata?.createdAt) minutes = Math.round((Date.now() - metadata.createdAt) / 60000);
      } catch {
        /* durée inconnue */
      }
      analytics.log('game_end', {
        matchID,
        winner: !!state.ctx.gameover.winner,
        heists: G.heist,
        mode: G.mode,
        numPlayers: state.ctx.numPlayers,
        minutes,
      });
    }
  };
  return db;
}

function snapshot(state) {
  const v = state?.G?.vaults || { success: 0, alarm: 0 };
  return { vaults: v.success + v.alarm, success: v.success, over: !!state?.ctx?.gameover };
}

// Événements envoyés par les navigateurs (le reste est enregistré par le serveur lui-même).
export const CLIENT_EVENTS = new Set(['visit', 'tutorial', 'tutorial_done', 'solo']);
