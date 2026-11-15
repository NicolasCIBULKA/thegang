// Suivi d'utilisation anonyme : un identifiant aléatoire par navigateur, aucune donnée personnelle.
// Les parties en ligne sont comptées par le serveur ; ici on ne signale que les visites, le tutoriel et le solo.

const SERVER = import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin;

function visitorId() {
  try {
    let id = localStorage.getItem('the-gang:vid');
    if (!id) {
      id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('the-gang:vid', id);
    }
    return id;
  } catch {
    return null; // stockage bloqué : pas de suivi
  }
}

export function track(type) {
  const vid = visitorId();
  if (!vid) return;
  try {
    // text/plain : requête « simple », sans pré-vérification CORS
    const body = new Blob([JSON.stringify({ type, vid })], { type: 'text/plain' });
    if (!navigator.sendBeacon?.(`${SERVER}/api/track`, body)) {
      fetch(`${SERVER}/api/track`, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* suivi indisponible : sans conséquence pour le jeu */
  }
}

/** Une visite par session de navigation. */
export function trackVisit() {
  try {
    if (sessionStorage.getItem('the-gang:visited')) return;
    sessionStorage.setItem('the-gang:visited', '1');
  } catch {
    /* sans sessionStorage : on compte quand même */
  }
  track('visit');
}
