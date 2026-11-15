// Espace d'administration : /admin (connexion par e-mail + mot de passe) et tableau de bord d'utilisation.
//
// Identifiants : variables d'environnement, jamais dans le code.
//   ADMIN_EMAIL          adresse de connexion
//   ADMIN_PASSWORD_HASH  empreinte du mot de passe, générée avec : npm run admin:password -- 'mot de passe'

import crypto from 'node:crypto';
import { CLIENT_EVENTS } from './analytics.js';

const COOKIE = 'tg_admin';
const SESSION_DAYS = 7;
const MAX_ATTEMPTS = 8; // par adresse IP et par quart d'heure
const attempts = new Map();

// ---------- Mots de passe (scrypt) ----------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${salt.toString('base64')}:${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, salt, hash] = stored.split(':');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------- Session (cookie signé) ----------

const b64url = (buf) => Buffer.from(buf).toString('base64url');
// La clé de signature dérive de l'empreinte : changer le mot de passe déconnecte toutes les sessions.
const sign = (data, key) => crypto.createHmac('sha256', key).update(data).digest('base64url');

function makeSession(email, key) {
  const payload = b64url(JSON.stringify({ email, exp: Date.now() + SESSION_DAYS * 86400000 }));
  return `${payload}.${sign(payload, key)}`;
}

function readSession(token, key) {
  if (!token || !key) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const good = sign(payload, key);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// ---------- Utilitaires HTTP ----------

async function readBody(ctx, limit = 4096) {
  let size = 0;
  const chunks = [];
  for await (const chunk of ctx.req) {
    size += chunk.length;
    if (size > limit) ctx.throw(413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60000);
  attempts.set(ip, list);
  return list.length >= MAX_ATTEMPTS;
}

// ---------- Middleware ----------

export function adminMiddleware({ analytics, gameName }) {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const passwordHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  const configured = !!(email && passwordHash);
  const lobbyPath = new RegExp(`^/games/${gameName}/(create|[^/]+/join|[^/]+/playAgain)$`);

  return async (ctx, next) => {
    const { path: p, method } = ctx;

    // Événements envoyés par les navigateurs (visite, tutoriel, solo)
    if (p === '/api/track' && method === 'POST') {
      try {
        const { type, vid } = JSON.parse(await readBody(ctx, 512));
        if (CLIENT_EVENTS.has(type) && /^[a-z0-9-]{8,40}$/i.test(vid || '')) analytics.log(type, { vid });
      } catch {
        /* événement ignoré */
      }
      ctx.status = 204;
      return;
    }

    if (p === '/admin' || p.startsWith('/admin/')) {
      ctx.set('Cache-Control', 'no-store');
      ctx.set('X-Robots-Tag', 'noindex, nofollow');
      ctx.set('X-Frame-Options', 'DENY');
      ctx.set('Referrer-Policy', 'same-origin');
      const session = configured ? readSession(ctx.cookies.get(COOKIE), passwordHash) : null;

      if (p === '/admin/login' && method === 'POST') {
        if (!configured) return void (ctx.redirect('/admin'));
        if (tooManyAttempts(ctx.ip)) {
          ctx.status = 429;
          ctx.type = 'html';
          ctx.body = loginPage('Trop de tentatives. Réessayez dans un quart d’heure.');
          return;
        }
        const form = new URLSearchParams(await readBody(ctx));
        const okEmail = (form.get('email') || '').trim().toLowerCase() === email;
        const okPassword = verifyPassword(form.get('password') || '', passwordHash);
        if (!okEmail || !okPassword) {
          attempts.get(ctx.ip).push(Date.now());
          ctx.status = 401;
          ctx.type = 'html';
          ctx.body = loginPage('E-mail ou mot de passe incorrect.', form.get('email'));
          return;
        }
        attempts.delete(ctx.ip);
        ctx.cookies.set(COOKIE, makeSession(email, passwordHash), {
          httpOnly: true,
          sameSite: 'strict',
          secure: ctx.secure,
          maxAge: SESSION_DAYS * 86400000,
          path: '/admin',
          overwrite: true,
        });
        ctx.redirect('/admin');
        return;
      }

      if (p === '/admin/logout' && method === 'POST') {
        ctx.cookies.set(COOKIE, '', { path: '/admin', maxAge: 0, overwrite: true });
        ctx.redirect('/admin');
        return;
      }

      if (p === '/admin/api/stats' && method === 'GET') {
        if (!session) ctx.throw(401);
        const days = Math.max(0, Math.min(3650, Number(ctx.query.days) || 0));
        ctx.body = analytics.stats(days);
        return;
      }

      if ((p === '/admin' || p === '/admin/') && method === 'GET') {
        ctx.type = 'html';
        ctx.body = !configured ? notConfiguredPage() : session ? dashboardPage(session.email) : loginPage();
        return;
      }
      ctx.throw(404);
    }

    // Lobby : on note les créations de parties, les arrivées de joueurs et les revanches.
    await next();
    if (method === 'POST' && ctx.status === 200 && lobbyPath.test(p)) {
      const body = ctx.request.body || {};
      const kind = p.endsWith('/create') ? 'create' : p.endsWith('/join') ? 'join' : 'again';
      if (kind === 'create') {
        analytics.log('match_created', {
          matchID: ctx.body?.matchID,
          numPlayers: Number(body.numPlayers) || null,
          mode: body.setupData?.mode || 'basique',
        });
      } else if (kind === 'join') {
        analytics.log('player_joined', { matchID: p.split('/')[3] });
      } else if (ctx.body?.nextMatchID) {
        analytics.log('rematch', {
          matchID: ctx.body.nextMatchID,
          numPlayers: Number(body.numPlayers) || null,
          mode: body.setupData?.mode || 'basique',
        });
      }
    }
  };
}

// ---------- Pages ----------

const BASE_CSS = `
:root{--bg:#1c0d0a;--panel:#2a1410;--line:rgba(201,162,74,.28);--text:#f3e7cf;--muted:#c8b391;--faint:#9a8a72;
--gold:#c9a24a;--gold-hi:#e6c271;--s1:#c98500;--s2:#9085e9;--ko:#ff8a7e;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
h1,h2{font-family:Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:.14em;text-transform:uppercase;margin:0}
h1{color:var(--gold);font-size:22px}h2{font-size:13px;color:var(--muted)}
a{color:var(--gold-hi)}
.btn{font:inherit;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-hi);background:transparent;
border:1.5px solid var(--gold);border-radius:6px;padding:9px 14px;cursor:pointer}
.btn:hover{background:rgba(201,162,74,.14)}.btn.primary{background:#6a1020;color:var(--text)}
.btn[aria-pressed=true]{background:#6a1020;color:var(--text)}
input{font:inherit;width:100%;background:#140806;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:10px 12px}
input:focus{outline:2px solid var(--gold-hi);outline-offset:1px}
`;

function loginPage(error = '', emailValue = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>The Gang — administration</title><style>${BASE_CSS}
main{max-width:360px;margin:12vh auto;padding:0 16px}
form{display:grid;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:22px;margin-top:18px}
label{display:grid;gap:5px;font-size:13px;color:var(--muted)}.err{color:var(--ko);margin:0}
</style></head><body><main><h1>The Gang</h1><h2>Administration</h2>
<form method="post" action="/admin/login">
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<label>E-mail<input type="email" name="email" autocomplete="username" required value="${esc(emailValue || '')}" autofocus></label>
<label>Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
<button class="btn primary" type="submit">Se connecter</button></form>
<p style="margin-top:16px"><a href="/">← Retour au jeu</a></p></main></body></html>`;
}

function notConfiguredPage() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>The Gang — administration</title><style>${BASE_CSS}
main{max-width:520px;margin:12vh auto;padding:0 16px}</style></head><body><main><h1>The Gang</h1><h2>Administration</h2>
<p>L’espace d’administration n’est pas encore configuré : définissez les variables d’environnement
<code>ADMIN_EMAIL</code> et <code>ADMIN_PASSWORD_HASH</code> sur le serveur, puis redémarrez-le.</p></main></body></html>`;
}

function dashboardPage(email) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>The Gang — suivi d’utilisation</title><style>${BASE_CSS}
main{max-width:1180px;margin:0 auto;padding:18px 16px 40px;display:grid;gap:18px}
header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:12px}
.who{display:flex;align-items:center;gap:12px;color:var(--faint);font-size:13px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.filters span{color:var(--faint);font-size:13px;margin-right:4px}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi b{display:block;font:400 30px/1.1 Georgia,serif;color:var(--text);margin-top:4px}
.kpi span{font-size:12px;color:var(--muted);letter-spacing:.04em}.kpi small{display:block;color:var(--faint);font-size:12px;margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0}
.card h2{margin-bottom:10px}
.legend{display:flex;gap:16px;font-size:13px;color:var(--muted);margin:-4px 0 6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.chart{position:relative}.chart svg{display:block;width:100%;height:auto;overflow:visible}
.tip{position:absolute;pointer-events:none;background:#140806;border:1px solid var(--line);border-radius:6px;padding:6px 9px;
font-size:12px;white-space:nowrap;transform:translate(-50%,-110%);display:none;z-index:2}
.tip b{color:var(--text)}.tip div{color:var(--muted)}
.axis{fill:var(--faint);font-size:11px}.grid-line{stroke:rgba(243,231,207,.08)}
.hbars{display:grid;gap:8px}.hbar{display:grid;grid-template-columns:110px 1fr 40px;gap:10px;align-items:center;font-size:13px}
.hbar .track{height:12px;background:rgba(243,231,207,.06);border-radius:0 4px 4px 0}
.hbar .fill{height:100%;background:var(--s1);border-radius:0 4px 4px 0;min-width:2px}.hbar .v{text-align:right;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid rgba(243,231,207,.07)}
th{color:var(--faint);font-weight:500;white-space:nowrap}td{white-space:nowrap}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}td.win{color:#9fe0b4}td.lose{color:var(--ko)}
details summary{cursor:pointer;color:var(--muted);font-size:13px;margin-top:8px}
.empty{color:var(--faint);font-style:italic}.note{color:var(--faint);font-size:12px}
@media (max-width:560px){.hbar{grid-template-columns:90px 1fr 32px}.kpi b{font-size:24px}}
</style></head><body><main>
<header><div><h1>The Gang</h1><h2>Suivi d’utilisation</h2></div>
<div class="who">${esc(email)}<form method="post" action="/admin/logout"><button class="btn" type="submit">Déconnexion</button></form></div></header>
<div class="filters" role="group" aria-label="Période"><span>Période</span>
<button class="btn" data-days="7">7 jours</button><button class="btn" data-days="30">30 jours</button>
<button class="btn" data-days="90">90 jours</button><button class="btn" data-days="0">Depuis le début</button></div>
<section class="kpis" id="kpis" aria-live="polite"></section>
<div class="grid">
<section class="card"><h2>Visiteurs uniques par jour</h2><div class="chart" id="c-visitors"></div></section>
<section class="card"><h2>Parties créées et terminées par jour</h2>
<div class="legend"><span><i style="background:var(--s1)"></i>Créées</span><span><i style="background:var(--s2)"></i>Terminées</span></div>
<div class="chart" id="c-games"></div></section>
</div>
<div class="grid">
<section class="card"><h2>Parties par difficulté</h2><div class="hbars" id="by-mode"></div></section>
<section class="card"><h2>Parties par nombre de joueurs</h2><div class="hbars" id="by-players"></div></section>
</div>
<section class="card"><h2>Dernières parties terminées</h2><div id="recent"></div>
<details><summary>Données quotidiennes (tableau)</summary><div id="daily"></div></details></section>
<p class="note" id="note"></p>
</main>
<script>
const MODES={basique:'Basique',avance:'Avancé',pro:'Pro',gangster:'Gangster'};
const nf=new Intl.NumberFormat('fr-FR');const pct=v=>v==null?'—':Math.round(v*100)+' %';
const fmtDay=d=>new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
const fmtDate=t=>new Date(t).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const el=(tag,attrs={},html='')=>{const e=document.createElement(tag);for(const k in attrs)e.setAttribute(k,attrs[k]);e.innerHTML=html;return e;};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
let days=30;try{const v=localStorage.getItem('tg-admin-days');if(v!==null)days=Number(v);}catch{}

function kpis(k){
  const tiles=[
    ['Visiteurs uniques',nf.format(k.visitors),nf.format(k.visitorsAllTime)+' depuis le début'],
    ['Visites',nf.format(k.visits),''],
    ['Parties créées',nf.format(k.matchesCreated),k.rematches?nf.format(k.rematches)+(k.rematches>1?' revanches':' revanche'):''],
    ['Parties terminées',nf.format(k.gamesFinished),'victoires : '+pct(k.winRate)],
    ['Casses joués',nf.format(k.heists),'coffres ouverts : '+pct(k.heistSuccessRate)],
    ['Joueurs connectés',nf.format(k.playersJoined),'arrivées dans un salon'],
    ['Tutoriels',nf.format(k.tutorialsStarted),nf.format(k.tutorialsFinished)+(k.tutorialsFinished>1?' terminés':' terminé')],
    ['Parties solo',nf.format(k.soloGames),'mode test'],
  ];
  const box=document.getElementById('kpis');box.innerHTML='';
  for(const [l,v,s] of tiles)box.append(el('div',{class:'kpi'},'<span>'+l+'</span><b>'+v+'</b>'+(s?'<small>'+s+'</small>':'')));
}

// Graphique SVG : 'line' (une série) ou 'bars' (séries groupées), axe Y à partir de 0, info-bulle au survol.
function chart(id,rows,series,kind){
  const host=document.getElementById(id);host.innerHTML='';
  if(!rows.length){host.append(el('p',{class:'empty'},'Pas encore de données.'));return;}
  const W=Math.max(280,Math.round(host.clientWidth||560)),H=W<420?190:220,L=30,R=8,T=10,B=26,iw=W-L-R,ih=H-T-B;
  const max=Math.max(1,...rows.flatMap(r=>series.map(s=>r[s.key])));
  const step=max<=5?1:Math.ceil(max/4/ (max>50?10:1))*(max>50?10:1);
  const top=Math.ceil(max/step)*step;
  const y=v=>T+ih-(v/top)*ih,band=iw/rows.length,x=i=>L+band*i+band/2;
  let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+series.map(s=>s.label).join(' et ')+' par jour">';
  for(let v=0;v<=top;v+=step)s+='<line class="grid-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="axis" x="'+(L-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>';
  const every=Math.ceil(rows.length/(W<420?4:7));
  // Libellés espacés régulièrement en partant du dernier jour (toujours affiché), sans chevauchement
  rows.forEach((r,i)=>{if((rows.length-1-i)%every===0)s+='<text class="axis" x="'+x(i)+'" y="'+(H-6)+'" text-anchor="middle">'+fmtDay(r.day)+'</text>';});
  if(kind==='line'){
    const sr=series[0],pts=rows.map((r,i)=>x(i)+','+y(r[sr.key])).join(' ');
    s+='<polyline fill="none" stroke="'+sr.color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="'+pts+'"/>';
    if(rows.length<=45)rows.forEach((r,i)=>{s+='<circle cx="'+x(i)+'" cy="'+y(r[sr.key])+'" r="4" fill="'+sr.color+'" stroke="#2a1410" stroke-width="2"/>';});
    s+='<line id="'+id+'-x" stroke="rgba(243,231,207,.35)" y1="'+T+'" y2="'+(T+ih)+'" visibility="hidden"/>';
  }else{
    const gap=2,bw=Math.max(2,Math.min(18,(band-6)/series.length-gap));
    rows.forEach((r,i)=>series.forEach((sr,j)=>{const v=r[sr.key];if(!v)return;
      const bx=x(i)-(series.length*(bw+gap)-gap)/2+j*(bw+gap),by=y(v),h=T+ih-by,rad=Math.min(4,bw/2,h);
      s+='<path fill="'+sr.color+'" d="M'+bx+','+(T+ih)+'V'+(by+rad)+'Q'+bx+','+by+' '+(bx+rad)+','+by+'H'+(bx+bw-rad)+'Q'+(bx+bw)+','+by+' '+(bx+bw)+','+(by+rad)+'V'+(T+ih)+'Z"/>';}));
  }
  rows.forEach((r,i)=>{s+='<rect data-i="'+i+'" x="'+(L+band*i)+'" y="'+T+'" width="'+band+'" height="'+ih+'" fill="transparent"/>';});
  s+='</svg>';host.innerHTML=s;
  const tip=el('div',{class:'tip'});host.append(tip);const svg=host.querySelector('svg');
  svg.addEventListener('mousemove',e=>{const t=e.target.closest('rect[data-i]');if(!t){tip.style.display='none';return;}
    const i=Number(t.dataset.i),r=rows[i],box=svg.getBoundingClientRect(),sx=box.width/W;
    tip.innerHTML='<b>'+fmtDay(r.day)+'</b>'+series.map(sr=>'<div>'+sr.label+' : <b>'+r[sr.key]+'</b></div>').join('');
    tip.style.left=(x(i)*sx)+'px';tip.style.top=(Math.min(...series.map(sr=>y(r[sr.key])))*sx)+'px';tip.style.display='block';
    const xl=document.getElementById(id+'-x');if(xl){xl.setAttribute('x1',x(i));xl.setAttribute('x2',x(i));xl.setAttribute('visibility','visible');}});
  svg.addEventListener('mouseleave',()=>{tip.style.display='none';const xl=document.getElementById(id+'-x');if(xl)xl.setAttribute('visibility','hidden');});
}

function hbars(id,obj,label){
  const host=document.getElementById(id);host.innerHTML='';const entries=Object.entries(obj).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){host.append(el('p',{class:'empty'},'Pas encore de données.'));return;}
  const max=Math.max(...entries.map(e=>e[1]));
  for(const [k,v] of entries)host.append(el('div',{class:'hbar'},'<span>'+esc(label(k))+'</span><div class="track"><div class="fill" style="width:'+(v/max*100)+'%"></div></div><span class="v">'+v+'</span>'));
}

let last=null;
function render(d){
  last=d;
  kpis(d.kpi);
  chart('c-visitors',d.series,[{key:'visitors',label:'Visiteurs',color:'var(--s1)'}],'line');
  chart('c-games',d.series,[{key:'created',label:'Créées',color:'var(--s1)'},{key:'ended',label:'Terminées',color:'var(--s2)'}],'bars');
  hbars('by-mode',d.byMode,k=>MODES[k]||k);
  hbars('by-players',d.byPlayers,k=>k==='?'?'Inconnu':k+' joueurs');
  const rec=document.getElementById('recent');
  rec.innerHTML=d.recentGames.length?'<div class="scroll"><table><thead><tr><th>Fin</th><th>Difficulté</th><th>Joueurs</th><th>Casses</th><th>Durée</th><th>Résultat</th></tr></thead><tbody>'+
    d.recentGames.map(g=>'<tr><td>'+fmtDate(g.t)+'</td><td>'+(MODES[g.mode]||g.mode||'—')+'</td><td>'+(g.numPlayers??'—')+'</td><td>'+(g.heists??'—')+'</td><td>'+(g.minutes!=null?g.minutes+' min':'—')+'</td><td class="'+(g.winner?'win':'lose')+'">'+(g.winner?'Victoire':'Défaite')+'</td></tr>').join('')+'</tbody></table></div>'
    :'<p class="empty">Aucune partie terminée sur cette période.</p>';
  document.getElementById('daily').innerHTML='<div class="scroll"><table><thead><tr><th>Jour</th><th>Visiteurs</th><th>Parties créées</th><th>Parties terminées</th></tr></thead><tbody>'+
    d.series.slice().reverse().map(r=>'<tr><td>'+fmtDay(r.day)+'</td><td>'+r.visitors+'</td><td>'+r.created+'</td><td>'+r.ended+'</td></tr>').join('')+'</tbody></table></div>';
  document.getElementById('note').textContent=d.tracking.since?'Suivi actif depuis le '+fmtDate(d.tracking.since)+' · '+nf.format(d.tracking.events)+' événements enregistrés · mis à jour à '+new Date(d.generatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Aucun événement enregistré pour l’instant.';
}

async function load(){
  document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days)));
  const r=await fetch('/admin/api/stats?days='+days,{credentials:'same-origin'});
  if(r.status===401){location.reload();return;}
  render(await r.json());
}
document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{days=Number(b.dataset.days);try{localStorage.setItem('tg-admin-days',days);}catch{}load();}));
load();setInterval(load,60000);
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>last&&render(last),150);});
</script></body></html>`;
}
