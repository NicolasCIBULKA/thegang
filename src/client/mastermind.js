// Répliques du cerveau du braquage.
// La réplique dépend uniquement de G.event (identique pour tous les joueurs) : même événement → même phrase.
// Variables : {thief} {victim} {stars} {target} {by} {heist}

const LINES = {
  firstDeal: [
    'Bienvenue dans la bande. Le plan est simple : chacun sait ce qu’il vaut, personne ne le dit. Deux cartes chacun.',
    'Messieurs, mesdames : trois coffres à ouvrir. On commence. Regardez vos cartes, et pas de grimaces.',
    'Asseyez-vous. Ici on ne parle pas de ses cartes, on parle avec ses jetons. Au travail.',
  ],
  deal: [
    'Casse n°{heist}. Nouvelles cartes, nouveau coffre. Même discipline.',
    'On remet ça. Deux cartes chacun. Mémorisez-les et oubliez que vous les avez vues.',
    'Casse n°{heist}. Prenez vos jetons blancs avec mesure : c’est encore une intuition, pas une certitude.',
    'Les cartes sont données. Un regard, pas plus. La table a des yeux.',
  ],
  dealHard: [
    'Casse n°{heist}, et la sécurité s’est renforcée. Lisez bien les consignes avant de bouger.',
    'Ils ont changé le dispositif. Ça ne change rien au plan, juste à votre marge d’erreur.',
    'Nouvelle sécurité ce soir. Restez concentrés, je ne veux pas d’improvisation.',
  ],
  flop: [
    'Trois cartes sur le tapis. Pas un mot de trop, l’équipe : laissez parler les jetons.',
    'Le flop. C’est maintenant que les bons se distinguent des chanceux.',
    'Trois indices sur la table. Réfléchissez avant de tendre la main.',
    'Le flop est tombé. Si votre main a changé de valeur, vos jetons doivent le dire.',
  ],
  turn: [
    'Le turn. Une carte de plus, et vous savez déjà presque tout.',
    'Quatrième carte. Si quelqu’un hésite encore, c’est le moment de se décider.',
    'Le turn. Regardez qui prend quoi : tout ce que vous devez savoir est dans leurs jetons.',
  ],
  river: [
    'La river. Dernière carte, derniers jetons. Ce sont eux qui ouvriront le coffre.',
    'Plus rien à découvrir. Les jetons rouges, et on ne se trompe pas.',
    'Dernière carte. Je veux un classement parfait. Pas de héros, pas de modestie.',
  ],
  steal: [
    '{thief} reprend le jeton {stars}★ de {victim}. J’espère que tu sais ce que tu fais, {thief}.',
    '{thief} se sert chez {victim}. Audacieux. {victim}, à toi de répondre.',
    'Le {stars}★ change de main : {thief} le prend à {victim}. Voilà une affirmation.',
    '{victim} se fait souffler son {stars}★ par {thief}. Dans cette bande, la confiance se mérite.',
  ],
  pass: ['Le Coordinateur est avec nous : chacun passe une carte à son voisin. Choisissez bien ce que vous donnez.'],
  guess: [
    'Contrôle de sécurité sur {target}. L’équipe doit voir juste du premier coup.',
    'Un scanner devant le coffre. {target}, pas un mot. Les autres : mettez-vous d’accord.',
  ],
  vaultOk: [
    'Le coffre est ouvert. Exactement comme prévu… enfin, presque.',
    'Clic. Vous entendez ? C’est le plus beau son du monde.',
    'Propre, net, sans bavure. On ramasse et on file.',
    'Coffre ouvert. Je retire tout ce que j’ai pu penser de vous.',
  ],
  vaultFail: [
    'Les sirènes. On se disperse, rendez-vous à la planque. Et on en reparlera.',
    'Alarme. Quelqu’un s’est surestimé… ou sous-estimé. On fera le point plus tard.',
    'Ce n’était pas l’ordre. Tout le monde dehors, par la cave.',
  ],
  guessFail: [
    'Le scanner ne nous a pas reconnus. Retraite immédiate.',
    'Mauvaise réponse au contrôle : la porte reste fermée et l’alarme hurle. Dehors.',
  ],
  victory: [
    'Trois coffres. Je n’ai jamais douté de vous. Bon, presque jamais.',
    'Le plan était parfait, et vous aussi. Partageons le butin… selon le plan.',
  ],
  defeat: [
    'On s’est fait prendre. Pas un mot sur moi, compris ?',
    'C’est fini pour ce soir. Je reprendrai le plan, et peut-être l’équipe.',
  ],
  special: {
    1: ['L’Informateur nous rend service : {by} montre discrètement une carte. Profitez-en.'],
    2: ['{by} nous fait un rapport sur sa main. Écoutez bien.'],
    3: ['Notre Actionnaire veut savoir combien de têtes vous avez. Répondez-lui.'],
    4: ['Le Cerveau de la bande… c’est moi. Je pose une question, {by} l’a choisie.'],
    5: ['La Hackeuse est en ligne : {by} pioche une carte de plus. Une seule doit rester.'],
    6: ['Le Coordinateur fait circuler les cartes.'],
    7: ['{by} sort le Valet de sa manche. Élégant.'],
    8: ['Notre Génie des chiffres a fait ses calculs. Lisez-les.'],
    9: ['L’Arnaqueuse a mélangé toutes les cartes. Tout est à refaire, et vite.'],
    10: ['{by} prend le Gros bras. À l’abattage, personne de même rang ne lui résiste.'],
  },
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

/**
 * Réplique à afficher. `names` traduit les identifiants de joueurs en pseudos.
 * Renvoie { key, text } : `key` change à chaque nouvel événement (relance l'effet machine à écrire).
 */
export function mastermindLine(G, ctx, names) {
  const ev = G.event || { type: 'round', round: 0, seq: 0, heist: G.heist };
  let pool;
  let key = `${ev.type}-${ev.seq}`;

  if (ctx.gameover) {
    pool = ctx.gameover.winner ? LINES.victory : LINES.defeat;
    key = `end-${ctx.gameover.winner}`;
  } else if (ev.type === 'round') {
    if (ev.round === 0) {
      if (ev.heist === 1 && !G.challenges?.length) pool = LINES.firstDeal;
      else if (G.challenges?.length) pool = LINES.dealHard;
      else pool = LINES.deal;
    } else pool = [null, LINES.flop, LINES.turn, LINES.river][ev.round];
  } else if (ev.type === 'steal') pool = LINES.steal;
  else if (ev.type === 'pass') pool = LINES.pass;
  else if (ev.type === 'guess') pool = LINES.guess;
  else if (ev.type === 'vault') pool = ev.guessFailed ? LINES.guessFail : ev.success ? LINES.vaultOk : LINES.vaultFail;
  else if (ev.type === 'special') pool = LINES.special[ev.id];

  if (!pool?.length) pool = LINES.deal;
  const line = pool[hash(key) % pool.length];
  const vars = {
    heist: ev.heist ?? G.heist,
    stars: ev.stars,
    thief: names[ev.thief],
    victim: names[ev.victim],
    target: names[ev.target],
    by: names[ev.by],
  };
  return { key, text: fill(line, vars) };
}
