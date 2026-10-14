import { createHeadTracker } from './head-tracking.js';

/* ================================================================ constantes */
const INTENS = [
  { id: 'int.forte', l: 'Forte', q: 'C’est une douleur forte ?' },
  { id: 'int.moyenne', l: 'Moyenne', q: 'C’est une douleur moyenne ?' },
  { id: 'int.legere', l: 'Légère', q: 'C’est une douleur légère ?' },
];
const PERSON_FOLLOW = [
  ['Voir', 'Tu veux voir {n} ?'],
  ['Appeler', 'Tu veux appeler {n} ?'],
  ['Message', 'Tu as un message pour {n} ?', 'spell'],
  ['Nouvelles', 'Tu veux des nouvelles de {n} ?'],
  ['Me manque', '{n} te manque ?'],
  ['Bon moment', 'Tu as passé un bon moment avec {n} ?'],
  ['Souci', 'Il y a un souci avec {n} ?'],
  ['Pas maintenant', 'Tu préfères ne pas voir {n} pour l’instant ?'],
];
const KINDS = [['Proches', 'Proche (famille, ami)'], ['Équipe', 'Équipe soignante'], ['Rencontres', 'Personne croisée']];
const GROUPS = [['E', 'S', 'A', 'I', 'N', 'T', 'R', 'U', 'L'], ['O', 'D', 'C', 'M', 'P', 'G', 'B', 'V', 'H'], ['F', 'Q', 'J', 'X', 'Y', 'Z', 'K', 'W', '’'], ['ESPACE', 'EFFACER', 'TERMINER', 'ANNULER']];
const GESTURES = 'Tête à gauche = oui · tête à droite = non · pencher 1 s = parler';

// Pictogramme de chaque question, déduit de son mot-clé (premier motif trouvé), sinon celui du thème.
const ICON_RULES = [
  [/ca va|contente|bien en ce moment|idees|rire/, 'content'], [/eau|boire|jus|boisson|gazeuse/, 'eau'],
  [/manger|collation|repas|sucre|sale|plat/, 'manger'], [/bouche|gorge/, 'bouche'], [/nausee|ventre/, 'nausee'],
  [/gauche/, 'gauche'], [/droit/, 'droite'], [/plus haut|remonter/, 'haut'], [/plus bas/, 'bas'], [/fauteuil/, 'fauteuil'],
  [/coussin/, 'coussin'], [/bras|main|jambe|pied/, 'bras'], [/demangeaison|gratte/, 'gratte'],
  [/drap|vetement|gilet|chaussette/, 'vetement'], [/froid|couverture/, 'froid'], [/chaud|linge frais/, 'journee'],
  [/fenetre|volet|aerer/, 'fenetre'], [/yeux/, 'yeux'], [/dents/, 'dents'], [/change/, 'change'],
  [/aspiration|mouchage|tousser/, 'vent'], [/toilette/, 'toilette'], [/coiffure/, 'coiffure'], [/poitrine/, 'emotions'],
  [/tete/, 'tete'], [/dos|position|dossier|point d.appui/, 'position'], [/fatigue|repos|sieste|reveil|dormi/, 'fatigue'],
  [/inquiet/, 'inquiet'], [/triste/, 'triste'], [/frustr|colere|pas d.accord/, 'colere'], [/solitude|seule/, 'seul'],
  [/peur/, 'peur'], [/reconfort|t.aime|manque/, 'emotions'], [/programme|rendez|visite|prochaine/, 'plan'],
  [/heure|combien de temps|attends/, 'horloge'], [/lumiere/, 'lumiere'], [/tele|ecran|culture|film/, 'tv'],
  [/musique|radio|livre audio|atelier/, 'activites'], [/volume|plus fort|moins fort/, 'voice'], [/couper|calme/, 'calme'],
  [/sortir|jardin|promenade|nature|ville/, 'arbre'], [/jeu|cartes|quiz/, 'jeu'], [/lecture|livre|raconte/, 'livre'],
  [/medecin|infirm|soignant|kine|ergo|psycho|ortho/, 'medecin'], [/materiel|sonnette|tablette/, 'materiel'],
  [/salle commune|compagnie|famille|rencontre/, 'personnes'], [/appeler/, 'tel'], [/message/, 'message'],
  [/photo|video|souvenir|enfance/, 'photo'], [/evenement|fete|anniversaire/, 'fete'], [/nouvelles|actualite|neuf|monde|france/, 'journal'],
  [/sport/, 'sport'], [/voyage|travail/, 'avion'], [/meteo/, 'meteo'], [/spiritu/, 'bougie'], [/argent|demarche/, 'argent'],
  [/prive|intimite|seule/, 'porte'], [/sante|soins/, 'soin'], [/bonjour|au revoir/, 'bras'], [/merci|raison/, 'ok'],
  [/pas maintenant/, 'nok'], [/question|autre/, 'question'],
];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function itemIcon(it, t) {
  const l = norm(it.l);
  for (const [re, icon] of ICON_RULES) if (re.test(l)) return icon;
  return t ? iconFor(t) : 'question';
}

/* ================================================================ stockage local (préférences + file d'attente) */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};
const K_KEY = 'anna-device-key', K_OUTBOX = 'anna-outbox', K_VOICE = 'anna-voice';

// Prototype autonome : le backend de démo est embarqué dans la page (voir scripts/build-prototype.mjs).
const DEMO = globalThis.ANNA_DEMO || null;
if (DEMO) store.set(K_KEY, 'demo');

// Le lien d'installation porte la clé d'appareil (?cle=…) : on la garde puis on la retire de l'adresse.
(() => {
  const u = new URL(location.href), k = u.searchParams.get('cle');
  if (k && !DEMO) { store.set(K_KEY, k); u.searchParams.delete('cle'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
})();

/* ================================================================ API */
async function api(method, path, body) {
  if (DEMO) return DEMO.request(method, path, body);
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-device-key': store.get(K_KEY, '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) { const e = new Error(data?.error || `Erreur ${r.status}`); e.status = r.status; throw e; }
  return data;
}

// File d'attente : chaque écriture est d'abord gardée sur la tablette, puis envoyée dans l'ordre.
// Coupure réseau → rien n'est perdu, l'envoi reprend tout seul.
let outbox = store.get(K_OUTBOX, []), flushing = false;
function enqueue(action, payload) {
  const last = outbox[outbox.length - 1];
  if (action === 'events' && last?.action === 'events' && last.payload.events.length < 100) last.payload.events.push(...payload.events);
  else outbox.push({ action, payload });
  store.set(K_OUTBOX, outbox);
  flush();
}
async function flush() {
  if (flushing || !outbox.length) return;
  flushing = true;
  try {
    while (outbox.length) {
      try { await api('POST', '/api/data?action=' + outbox[0].action, outbox[0].payload); }
      catch (e) {
        // Erreur définitive (donnée refusée) : on l'écarte. Sinon (réseau, serveur) : on réessaiera.
        const permanent = e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);
        if (!permanent) break;
      }
      outbox.shift();
      store.set(K_OUTBOX, outbox);
    }
  } finally { flushing = false; renderSync(); }
}
setInterval(flush, 15000);
addEventListener('online', flush);

/* ================================================================ état */
let S = null;          // données de la personne (banque, personnes, historique, stats)
let F = { mode: 'home' }, undo = [], view = 'patient', topCache = [];
let voice = store.get(K_VOICE, false);

async function reload() { S = await api('GET', '/api/data?action=bootstrap'); }

/* ================================================================ utilitaires */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = id => `<svg class="i"><use href="#i-${id}"/></svg>`;
const theme = id => S.themes.find(t => t.id === id);
const hue = s => [...String(s)].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
const typeOf = id => S.types.find(t => t.id === id) || { id, name: id, short: id, icon: 'autre', h: hue(id) };
const iconFor = t => t.private ? 'intime' : document.getElementById('i-' + t.icon) ? t.icon : 'autre';
const fmtT = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtD = ts => {
  const d = new Date(ts), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Auj.';
  if (d.toDateString() === y.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const avatar = p => p.photo ? `<img class="av" src="${esc(p.photo)}" alt="">` : `<span class="av" style="background:hsl(${hue(p.name)} 38% 42%)">${esc(p.name.replace(/^Dr\.? /, '').slice(0, 1))}</span>`;
const name = () => S?.patientName || 'Anna';
function personTheme(p) { return (S.themes.find(t => t.dynamic && t.peopleKinds.includes(p.kind)) || S.themes.find(t => t.dynamic))?.id; }
function toast(msg) { const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2800); }

// Le « Oui » / « Non » d'Anna est toujours dit à voix haute : c'est sa voix pour les personnes autour d'elle.
// La phrase suivante (question, résumé) attend la fin du mot au lieu de le couper.
let answerSaidAt = 0, frVoice = null;
const canSpeak = 'speechSynthesis' in window;
function pickVoice() { const vs = speechSynthesis.getVoices(); frVoice = vs.find(v => /^fr[-_]FR/i.test(v.lang) && v.localService) || vs.find(v => /^fr/i.test(v.lang)) || null; }
if (canSpeak) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
function utter(t) { const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; if (frVoice) u.voice = frVoice; u.rate = 0.95; u.volume = 1; return u; }
// iPhone / Safari : la voix doit être « débloquée » par un premier toucher de l'écran.
addEventListener('pointerdown', () => { try { if (canSpeak) speechSynthesis.speak(utter(' ')); } catch { /* voix indisponible */ } }, { once: true });
function sayAnswer(a) {
  if (!canSpeak) return;
  try { speechSynthesis.cancel(); speechSynthesis.speak(utter(a === 'oui' ? 'Oui' : 'Non')); answerSaidAt = Date.now(); } catch { /* voix indisponible */ }
}
function speak(t, force) {
  if ((!voice && !force) || !canSpeak) return;
  try { if (Date.now() - answerSaidAt > 1500) speechSynthesis.cancel(); speechSynthesis.speak(utter(t)); } catch { /* voix indisponible */ }
}
function chime() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + i * 0.22;
      o.frequency.value = f; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0); o.stop(t0 + 0.4);
    });
  } catch { /* son indisponible */ }
}

/* ================================================================ moteur de recommandation */
function st(id) { return S.stats[id] || (S.stats[id] = { a: 0, y: 0, n: 0, p: 0, rt: 0 }); }
// Score = 50 % taux de « oui » (la question trouve le besoin) + 30 % usage + 20 % rapidité de réponse.
function scoreOf(id) {
  const x = S.stats[id];
  if (!x || !x.a) return { score: 0.3, hit: 0, a: 0, avg: 0 };
  const maxA = Math.max(1, ...Object.values(S.stats).map(v => v.a));
  const hit = (x.y + 1) / (x.a + 2), use = x.a / maxA, avg = x.rt / x.a, speed = Math.max(0, Math.min(1, 1 - avg / 8000));
  return { score: 0.5 * hit + 0.3 * use + 0.2 * speed, hit, a: x.a, avg };
}
function ordered(list) {
  if (!S.settings.reco || !Array.isArray(list)) return list;
  return list.map((it, i) => ({ it, i, s: scoreOf(it.id).score }))
    .sort((a, b) => (b.it.urgent ? 1 : 0) - (a.it.urgent ? 1 : 0) || (a.it.action === 'spell') - (b.it.action === 'spell') || b.s - a.s || a.i - b.i)
    .map(o => o.it);
}
const peopleOf = t => S.people.filter(p => personTheme(p) === t.id);
function personItem(t, p) {
  return {
    id: `${t.id}.${p.id}`, l: p.name, q: `C’est à propos de ${p.name}${p.role ? ` (${p.role})` : ''} ?`, person: p.id,
    then: PERSON_FOLLOW.map(([l, q, a]) => ({ id: `${t.id}.${p.id}.${l.toLowerCase().replace(/[^a-z]+/g, '-')}`, l, q: q.replace('{n}', p.name), action: a })),
  };
}
function themeItems(t) {
  if (!t.dynamic) return ordered(t.items);
  return [...ordered(peopleOf(t).map(p => personItem(t, p))), ...t.items];
}
function suggestions() {
  const now = Date.now(), hr = new Date().getHours(), map = new Map();
  S.history.filter(e => e.result === 'resolu' && e.path.length > 1 && theme(e.theme) && !theme(e.theme).private).forEach(e => {
    const k = e.theme + '|' + e.path.join('|'), dh = Math.abs(new Date(e.ts).getHours() - hr);
    const w = (Math.min(dh, 24 - dh) <= 2 ? 2 : 1) * Math.exp(-(now - e.ts) / (7 * 864e5));
    const m = map.get(k) || { theme: e.theme, path: e.path, w: 0 }; m.w += w; map.set(k, m);
  });
  return [...map.values()].sort((a, b) => b.w - a.w);
}
// Réponse au « Ça va ? » de l'ouverture : elle met en tête les thèmes les plus utiles.
//   ça ne va pas → douleur, émotions, confort, besoins essentiels
//   ça va        → échanger, proches, activités, la journée
let mood = null;
const MOOD = {
  ko: { themes: ['douleur', 'emotions', 'position', 'temp', 'soif', 'hygiene'], note: 'Ça ne va pas : on commence par la douleur et le confort.' },
  ok: { themes: ['interaction', 'dire', 'proches', 'activites', 'journee', 'autre'], note: 'Ça va : envie d’échanger ou de faire quelque chose ?' },
};
const prio = () => MOOD[mood]?.themes || [];
function themesInOrder() {
  const p = prio(), rank = t => { const i = p.indexOf(t.id); return i < 0 ? p.length : i; };
  return S.themes.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map(o => o.t);
}
// Top 3 : les besoins habituels à cette heure (d'abord dans les thèmes prioritaires), complétés par les questions au meilleur score.
function top3() {
  const p = prio(), pr = th => (p.includes(th) ? 0 : 1);
  if (p.length) {
    // Après « Ça va ? » : le pictogramme le plus important de chacun des thèmes prioritaires, dans l'ordre
    // (ça ne va pas → douleur, émotions, position). Besoin habituel du thème s'il existe, sinon sa meilleure question.
    const sugg = suggestions(), out = [];
    for (const id of p) {
      const t = theme(id); if (!t || out.length >= 3) continue;
      const sg = sugg.find(x => x.theme === id);
      if (sg) { out.push({ kind: 'sugg', sg }); continue; }
      const it = ordered(t.items).find(x => !x.action);
      if (it) out.push({ kind: 'item', t, it });
    }
    if (out.length === 3) return out;
  }
  const out = suggestions().map((sg, i) => ({ sg, i })).sort((a, b) => pr(a.sg.theme) - pr(b.sg.theme) || a.i - b.i).slice(0, 3).map(({ sg }) => ({ kind: 'sugg', sg }));
  if (out.length < 3) {
    const cands = [];
    S.themes.filter(t => !t.private && !t.dynamic).forEach(t => t.items.forEach(it => { if (!it.action) cands.push({ t, it, s: scoreOf(it.id).score - pr(t.id) }); }));
    cands.sort((a, b) => b.s - a.s);
    for (const c of cands) {
      if (out.length >= 3) break;
      if (out.some(o => o.kind === 'sugg' ? o.sg.theme === c.t.id && o.sg.path[1] === c.it.l : o.it.id === c.it.id)) continue;
      out.push({ kind: 'item', t: c.t, it: c.it });
    }
  }
  return out;
}

/* ================================================================ déroulé des questions */
const cur = () => { const top = F.stack[F.stack.length - 1]; return top.list[top.idx]; };
function goHome() { F = { mode: 'home' }; undo = []; render(); }
function startTheme(id, pre) {
  const t = theme(id); if (!t) return;
  const list = themeItems(t);
  if (!list.length) { toast(`« ${t.label} » n’a pas encore de questions : ajoute-les dans l’espace admin.`); return goHome(); }
  F = { mode: 'q', theme: id, stack: [{ list, idx: 0 }], path: [t.label], asked: [], t0: Date.now(), priv: !!t.private, urgent: false };
  undo = [];
  if (pre) { const it = F.stack[0].list.find(x => x.id === pre); if (it) { F.path.push(it.l); F.stack.push({ list: ordered(it.then), idx: 0 }); } }
  showQ();
}
// Toucher un pictogramme : on pose directement cette question (non → retour à la grille).
function startItem(themeId, itemId) {
  const t = theme(themeId); if (!t) return;
  const it = themeItems(t).find(x => x.id === itemId); if (!it) return;
  F = { mode: 'q', theme: themeId, stack: [{ list: [it], idx: 0 }], path: [t.label], asked: [], t0: Date.now(), priv: !!t.private || !!it.private, urgent: false, single: true };
  undo = []; showQ();
}
function startScan() {
  const p = prio(), rank = t => { const i = p.indexOf(t.id); return i < 0 ? p.length : i; };
  const list = S.themes.filter(t => themeItems(t).length).map(t => ({ t, u: S.history.filter(e => e.theme === t.id).length })).sort((a, b) => rank(a.t) - rank(b.t) || b.u - a.u)
    .map(({ t }) => ({ id: 'scan.' + t.id, l: t.label, q: `C’est à propos de : ${t.label} ?`, goto: t.id }));
  F = { mode: 'q', theme: 'scan', stack: [{ list, idx: 0 }], path: ['Choix du thème'], asked: [], t0: Date.now(), priv: false };
  undo = []; showQ();
}
function quickQ(sg) {
  const t = theme(sg.theme), first = t?.items.find(x => x.l === sg.path[1]), rest = sg.path.slice(2).join(', ').toLowerCase();
  if (first?.ask) return first.q;
  if (first) return rest ? first.q.replace(/\s*\?$/, '') + ' : ' + rest + ' ?' : first.q;
  return 'Encore : ' + sg.path.slice(1).join(', ').toLowerCase() + ' ?';
}
function startQuick(sg) {
  F = { mode: 'q', theme: sg.theme, stack: [{ list: [{ id: 'quick', l: sg.path[sg.path.length - 1], q: quickQ(sg) }], idx: 0 }], path: sg.path.slice(0, -1), asked: [], t0: Date.now(), priv: false, quick: true };
  undo = []; showQ();
}
function showPlan() { F = { mode: 'done', theme: 'journee', path: ['Ma journée', 'Programme du jour'], result: 'resolu', action: 'planning', entryNotes: [], priv: false, quick: true }; render(); speak('Voici le programme de ta journée.'); }
function showQ() { F.qTs = Date.now(); render(); speak(cur().q); }

// Ouverture en deux questions : « Coucou, est-ce que tu veux parler ? » puis « Ça va ? ».
const INTRO = ['hello', 'welcome', 'rest'];
function showHello() { F = { mode: 'hello' }; undo = []; render(); speak('Coucou, est-ce que tu veux parler ?'); }
function showWelcome() { F = { mode: 'welcome' }; undo = []; render(); speak(`${name()}, ça va ?`); }
function answer(a) {
  // Sur l'accueil, ni boutons ni caméra : oui / non / parler ne servent qu'à répondre aux questions.
  if (F.mode === 'home') return;
  if (INTRO.includes(F.mode) && a !== 'parler') {
    if (view !== 'patient') return;
    flash(a); sayAnswer(a);
    if (F.mode === 'rest') { if (a === 'oui') showHello(); return; }
    if (F.mode === 'hello') {
      record(newEntry('accueil', ['Tu veux parler ?', a === 'oui' ? 'Oui' : 'Non'], 'resolu'));
      if (a === 'oui') return showWelcome();
      F = { mode: 'rest' }; return render();
    }
    mood = a === 'oui' ? 'ok' : 'ko';
    record(newEntry('accueil', ['Ça va ?', a === 'oui' ? 'Oui' : 'Non'], 'resolu'));
    boardPage = 0; boardTheme = null;
    return goHome();
  }
  flash(a);
  if ($('#ovRoot').firstChild) { if (a === 'parler') return; closeOv(); }
  if (a === 'parler') return talk();
  if (view !== 'patient') return;
  sayAnswer(a);
  if (F.mode === 'spell') return spellAnswer(a);
  if (F.mode === 'deeper') {
    F.entryNotes.push([F.dq, a]);
    if (F.entry) { F.entry.notes.push([F.dq, a]); enqueue('note', { conversationId: F.entry.id, question: F.dq, answer: a }); }
    F.mode = 'done'; render(); return;
  }
  if (F.mode === 'done') { if (a === 'oui') { (F.theme === 'scan' || F.theme === 'parler' || F.quick) ? startScan() : startTheme(F.theme); } else goHome(); return; }
  if (F.mode !== 'q') return;
  undo.push(JSON.stringify(F));
  const it = cur(), rt = Date.now() - F.qTs;
  if (!F.priv && !it.private && it.id !== 'quick' && !it.id.startsWith('scan.')) {
    const x = st(it.id); x.a++; x[a === 'oui' ? 'y' : 'n']++; x.rt += rt;
    enqueue('events', { events: [{ key: it.id, theme: F.theme, answer: a, ms: rt, at: Date.now() }] });
  }
  F.asked.push(it.id);
  if (a === 'oui') {
    if (it.goto) return startTheme(it.goto);
    F.path.push(it.l); if (it.private) F.priv = true; if (it.urgent) F.urgent = true;
    if (it.action === 'spell') return startSpell(F.path.slice());
    const th = it.then === '@i' ? INTENS : it.then;
    if (th && th.length) { F.stack.push({ list: th === INTENS ? INTENS : ordered(th), idx: 0 }); return showQ(); }
    return conclude('resolu', it);
  }
  const top = F.stack[F.stack.length - 1]; top.idx++;
  if (top.idx >= top.list.length) {
    if (F.quick || (F.single && F.stack.length === 1)) return goHome();
    return conclude(F.stack.length > 1 ? 'resolu' : 'non-trouve');
  }
  showQ();
}
function record(entry) {
  S.history.unshift(entry);
  enqueue('conversation', { id: entry.id, theme: entry.theme, path: entry.path, result: entry.result, n: entry.n, dur: entry.dur, urgent: entry.urgent, at: entry.ts });
}
function newEntry(theme, path, result, extra = {}) {
  const id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
  return { id, ts: Date.now(), theme, path, result, n: 0, dur: 0, urgent: false, notes: [], ...extra };
}
function conclude(result, it) {
  Object.assign(F, { mode: 'done', result, action: it?.action, ask: it?.ask, say: it?.say, entryNotes: [] });
  F.entry = null;
  if (!F.priv && F.theme !== 'scan') {
    F.entry = newEntry(F.theme, F.path.slice(), result, { n: F.asked.length, dur: Date.now() - F.t0, urgent: !!F.urgent });
    record(F.entry);
  }
  render();
  if (F.ask) return speak(F.ask, true);
  speak((result === 'non-trouve' ? 'Je n’ai pas trouvé. Tu veux épeler ?' : 'Compris : ' + F.path.slice(1).join(', ') + '.') + ' Autre chose ?');
  if (F.urgent) chime();
}
function back() {
  if (F.mode === 'spell' || F.mode === 'home') return goHome();
  if (F.mode === 'deeper') { F.mode = 'done'; return render(); }
  const s = undo.pop(); if (!s) return goHome();
  F = JSON.parse(s); showQ();
}

/* épellation lettre par lettre */
function startSpell(ctx) { F = { mode: 'spell', ctx: ctx || ['Message'], g: 0, l: null, text: '', priv: !!F.priv, theme: (F.theme && F.theme !== 'scan') ? F.theme : 'parler' }; render(); speak('On épelle. ' + spellQ()); }
const spellQ = () => F.l === null ? `Lettre dans : ${GROUPS[F.g].join(' ')} ?` : `« ${GROUPS[F.g][F.l]} » ?`;
function spellPick(g, l) {
  const v = GROUPS[g][l];
  if (v === 'ESPACE') F.text += ' ';
  else if (v === 'EFFACER') F.text = F.text.slice(0, -1);
  else if (v === 'ANNULER') return goHome();
  else if (v === 'TERMINER') {
    if (!F.text.trim()) return goHome();
    const path = [...F.ctx, F.text.trim()], th = F.theme, priv = F.priv, isAsk = th === 'interaction' || th === 'dire';
    F = { mode: 'done', theme: th, path, result: 'message', entryNotes: [], priv, ask: isAsk ? path[path.length - 1] : undefined, say: th === 'dire' };
    F.entry = priv ? null : newEntry(th, path, 'message');
    if (F.entry) record(F.entry);
    render(); speak((F.ask ? '' : 'Message : ') + path[path.length - 1], !!F.ask); return;
  } else F.text += v;
  F.g = 0; F.l = null; render(); speak(spellQ());
}
function spellAnswer(a) {
  if (F.l === null) { if (a === 'oui') F.l = 0; else F.g = (F.g + 1) % GROUPS.length; }
  else { if (a === 'oui') return spellPick(F.g, F.l); F.l++; if (F.l >= GROUPS[F.g].length) { F.l = null; F.g = (F.g + 1) % GROUPS.length; } }
  render(); speak(spellQ());
}

/* « je veux parler » */
function talk() {
  chime(); speak(`${name()} veut parler`);
  if (F.mode === 'q' && !F.priv && cur().id !== 'quick' && !cur().id.startsWith('scan.')) {
    st(cur().id).p++;
    enqueue('events', { events: [{ key: cur().id, theme: F.theme, answer: 'parler', ms: Date.now() - F.qTs, at: Date.now() }] });
  }
  if (!F.priv) record(newEntry('parler', ['Demande de parole'], 'parole'));
  $('#ovRoot').innerHTML = `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="ovT"><div class="ovc">
    <h2 id="ovT">${esc(name())} veut parler</h2>
    <p class="muted" style="margin:0">Approche-toi et choisis avec elle comment continuer.</p>
    <div class="row">
      <button class="btn primary" data-ov="spell">${ic('spell')} Épeler</button>
      <button class="btn" data-ov="scan">${ic('scan')} Les thèmes</button>
      <button class="btn" data-ov="proches">${ic('proches')} Un proche</button>
      <button class="btn" data-ov="close">Fermer</button>
    </div></div></div>`;
}
function closeOv() { $('#ovRoot').innerHTML = ''; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ov]'); if (!b) return;
  const k = b.dataset.ov; closeOv();
  if (k === 'close') return render();
  view = 'patient';
  if (k === 'spell') startSpell(['Message']); else if (k === 'scan') startScan(); else if (k === 'proches') startTheme('proches');
});

/* ================================================================ rendu : vue d'Anna */
function render() {
  if (!S) return;
  renderTop();
  const m = $('#main');
  $('#bar').hidden = view !== 'patient' || F.mode === 'home' || INTRO.includes(F.mode);
  m.classList.toggle('board-mode', view === 'patient' && F.mode === 'home');
  if (view === 'admin') { m.innerHTML = renderAdmin(); bindAdmin(); return; }
  m.innerHTML = F.mode === 'hello' ? renderHello() : F.mode === 'rest' ? renderRest() : F.mode === 'welcome' ? renderWelcome() : F.mode === 'home' ? renderBoard() : F.mode === 'q' ? renderQ() : F.mode === 'done' ? renderDone() : F.mode === 'deeper' ? renderDeeper() : renderSpell();
  m.scrollTop = 0;
}
function renderTop() {
  const now = new Date(), nav = view === 'patient' && F.mode !== 'home';
  $('#top').innerHTML = `
    <div class="who"><b>${esc(name())}</b><span class="clock">${now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtT(now)}</span><span id="sync"></span></div>
    ${nav && !INTRO.includes(F.mode) ? `<button class="ib nav-b" id="tBack" aria-label="Retour">${ic('back')}<span class="lb">Retour</span></button>` : ''}
    ${view === 'patient' && F.mode !== 'hello' ? `<button class="ib nav-b" id="tHome" aria-label="Accueil : Coucou, est-ce que tu veux parler ?">${ic('home')}<span class="lb">Accueil</span></button>` : ''}
    <button class="ib ${tracker.running ? 'on' : ''}" id="tCam" aria-label="Caméra" title="${GESTURES}">${ic('cam')}<span class="lb">${tracker.running ? 'Tête active' : 'Caméra'}</span></button>
    <button class="ib ${voice ? 'on' : ''}" id="tVoice" aria-label="Voix" title="Lire les questions à voix haute">${ic('voice')}<span class="lb">Voix</span></button>
    <button class="ib ${view === 'admin' ? 'on' : ''}" id="tView" aria-label="${view === 'admin' ? 'Retour à la vue patient' : 'Espace admin'}">${view === 'admin' ? ic('home') : ic('gear')}<span class="lb">${view === 'admin' ? 'Vue ' + esc(name()) : 'Admin'}</span></button>`;
  $('#tBack')?.addEventListener('click', back);
  // Accueil = retour au tout premier écran « Coucou, est-ce que tu veux parler ? »
  $('#tHome')?.addEventListener('click', () => { boardTheme = null; boardPage = 0; showHello(); });
  $('#tCam').onclick = toggleCam;
  $('#tVoice').onclick = () => { voice = !voice; store.set(K_VOICE, voice); renderTop(); if (voice) speak('Lecture à voix haute activée'); };
  $('#tView').onclick = () => view === 'admin' ? leaveAdmin() : openAdmin();
  renderSync();
}
function renderSync() {
  const el = $('#sync'); if (!el) return;
  el.innerHTML = outbox.length && !DEMO ? `<span class="sync" title="Réponses gardées sur la tablette, envoyées dès le retour du réseau">${ic('cloud')} ${outbox.length} en attente</span>` : '';
}

// Accueil pensé pour le téléphone, sans surcharge et sans défilement :
// une ligne par thème = le thème, ses 3 pictogrammes les plus importants (moteur de recommandation)
// et « + » pour le reste. Autant de lignes que l'écran en permet, puis Page suivante / Page précédente.
let boardPage = 0, boardTheme = null, themePage = 0;
const pic = (attrs, icon, label, h, extra = '') => `<button class="pic ${extra}" style="--h:${h}" ${attrs}>${icon}<span>${esc(label)}</span></button>`;
const pager = (page, pages, prev, next) => pages > 1 ? `<nav class="pager" aria-label="Pages">
    <button class="btn" data-act="${prev}" ${page === 0 ? 'disabled' : ''}>${ic('gauche')} Précédente</button>
    <span>Page ${page + 1} / ${pages}</span>
    <button class="btn" data-act="${next}" ${page >= pages - 1 ? 'disabled' : ''}>Suivante ${ic('droite')}</button></nav>` : '';
// Pictogrammes d'un thème, les plus importants d'abord : personnes (thèmes Proches / Personnes) puis questions.
function themePics(t, h) {
  const people = t.dynamic ? ordered(peopleOf(t).map(p => personItem(t, p))).map(it => { const p = S.people.find(x => x.id === it.person); return pic(`data-person="${esc(p.id)}"`, avatar(p), p.name, h); }) : [];
  const items = ordered(t.items).map(it => pic(`data-item="${esc(it.id)}" data-th="${esc(t.id)}"`, ic(itemIcon(it, t)), it.l, h, it.urgent ? 'urg' : ''));
  return [...people, ...items];
}
function boardSpace() { return Math.max(320, ($('#main')?.clientHeight || 600) - 24); }
function renderBoard() {
  if (boardTheme && theme(boardTheme)) return renderThemePage();
  boardTheme = null;
  const avail = boardSpace(), rowH = avail > 700 ? 124 : 104;   // lignes hautes : lisibles par la personne qui tient le téléphone
  const note = MOOD[mood]?.note && boardPage === 0 ? `<p class="moodnote ${mood}">${ic(mood === 'ko' ? 'douleur' : 'content')} ${esc(MOOD[mood].note)}</p>` : '';
  const perPage = Math.max(3, Math.floor((avail - 64 - (note ? 40 : 0)) / rowH));   // 64 = barre de pages
  topCache = top3();
  const topRow = `<div class="trow toprow" style="--h:40"><div class="tlab">${ic('star')}<span>Top 3</span></div>${topCache.map((o, i) => {
    if (o.kind === 'sugg') {
      // Libellé court et lisible : le dernier mot-clé (« Côté gauche »), ou « Dos · Forte » pour une intensité.
      const t = theme(o.sg.theme), p = o.sg.path, leaf = p[p.length - 1];
      const label = INTENS.some(x => x.l === leaf) && p.length > 2 ? `${p[p.length - 2]} · ${leaf}` : leaf;
      return pic(`data-top="${i}"`, ic(itemIcon({ l: leaf }, t)), label, typeOf(t.group).h, 'hot');
    }
    return pic(`data-top="${i}"`, ic(itemIcon(o.it, o.t)), o.it.l, typeOf(o.t.group).h, 'hot');
  }).join('')}${pic('data-act="scan"', ic('scan'), 'Tout parcourir', 40)}</div>`;
  const rows = [topRow, ...themesInOrder().map(t => {
    const h = typeOf(t.group).h, all = themePics(t, h);
    const more = all.length > 3 ? pic(`data-act="openTheme" data-th="${esc(t.id)}"`, `<b class="plus">+${all.length - 3}</b>`, 'Voir plus', h, 'more') : '<span></span>';
    return `<div class="trow" style="--h:${h}">
      <button class="tlab" data-act="openTheme" data-th="${esc(t.id)}">${ic(iconFor(t))}<span>${esc(t.label)}</span></button>
      ${all.slice(0, 3).join('')}${'<span></span>'.repeat(Math.max(0, 3 - all.length))}${more}</div>`;
  }), `<div class="trow" style="--h:40"><div class="tlab">${ic('spell')}<span>Autres</span></div>${pic('data-act="spell"', ic('spell'), 'Épeler', 40)}${pic('data-act="plan"', ic('plan'), 'Ma journée', 95)}${pic('data-act="scan"', ic('scan'), 'Tout parcourir', 40)}<span></span></div>`];
  const pages = Math.ceil(rows.length / perPage);
  boardPage = Math.min(boardPage, pages - 1);
  const shown = rows.slice(boardPage * perPage, (boardPage + 1) * perPage);
  return `<div class="page">${note}<div class="prows" style="grid-template-rows:repeat(${perPage},minmax(0,1fr))">${shown.join('')}</div>${pager(boardPage, pages, 'prevPage', 'nextPage')}</div>`;
}
// Tout premier écran : « Coucou, est-ce que tu veux parler ? » en oui / non.
function renderHello() {
  return `<div class="welcome">
    <p class="tag">${esc(name())}</p>
    <h1 class="q hello">Coucou, est-ce que tu veux parler ?</h1>
    <p class="muted">${GESTURES}</p>
    <div class="wbtns">
      <button class="wb no" data-act="hNon">${ic('calme')}<span>Non, pas maintenant</span></button>
      <button class="wb yes" data-act="hOui">${ic('talk')}<span>Oui, je veux parler</span></button>
    </div>
    <button class="btn" data-act="wSkip">Passer, voir les thèmes ${ic('droite')}</button>
  </div>`;
}
// Si Anna ne veut pas parler : écran calme, on reprend quand elle le souhaite (bouton ou « oui » de la tête).
function renderRest() {
  return `<div class="welcome">
    <h1 class="q hello">D’accord, pas maintenant.</h1>
    <p class="muted" style="font-size:16px">On reste là. Touche « Reprendre » ou fais oui de la tête quand tu veux.</p>
    <button class="btn primary" data-act="hello" style="font-size:18px;padding:14px 22px">${ic('talk')} Reprendre</button>
  </div>`;
}
// Écran d'ouverture : « Ça va ? » en oui / non (boutons, clavier ou tête), avant les thèmes.
function renderWelcome() {
  return `<div class="welcome">
    <p class="tag">${esc(name())}</p>
    <h1 class="q">Ça va ?</h1>
    <p class="muted">${GESTURES}</p>
    <div class="wbtns">
      <button class="wb no" data-act="wNon">${ic('triste')}<span>Non, ça ne va pas</span></button>
      <button class="wb yes" data-act="wOui">${ic('content')}<span>Oui, ça va</span></button>
    </div>
    <button class="btn" data-act="wSkip">Passer, voir les thèmes ${ic('droite')}</button>
  </div>`;
}
// Page d'un thème : tous ses pictogrammes, en pages si besoin.
function renderThemePage() {
  const t = theme(boardTheme), h = typeOf(t.group).h, all = themePics(t, h);
  const avail = boardSpace(), w = $('#main')?.clientWidth || 360;
  const cols = w >= 900 ? 5 : w >= 560 ? 4 : 3, rows = Math.max(2, Math.floor((avail - 64 - 56) / (avail > 700 ? 130 : 112)));
  const per = cols * rows, pages = Math.max(1, Math.ceil(all.length / per));
  themePage = Math.min(themePage, pages - 1);
  return `<div class="page">
    <div class="phead" style="--h:${h}"><button class="btn" data-act="closeTheme">${ic('back')} Thèmes</button><h2>${ic(iconFor(t))} ${esc(t.label)}</h2>
      <button class="btn sm" data-act="themeScan" data-th="${esc(t.id)}">${ic('scan')} Oui / non</button></div>
    ${t.private ? `<span class="lockn">${ic('intime')} Rien n’est enregistré</span>` : ''}
    ${all.length ? `<div class="pgrid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr))">${all.slice(themePage * per, (themePage + 1) * per).join('')}</div>`
      : '<p class="empty">Pas encore de questions dans ce thème. Ajoute-les dans l’espace admin, onglet « Ajouter ».</p>'}
    ${pager(themePage, pages, 'prevTheme', 'nextTheme')}</div>`;
}
addEventListener('resize', () => { if (view === 'patient' && F.mode === 'home' && S) render(); });
const crumbs = () => `<div class="crumbs">${F.path.map(p => `<span class="c">${esc(p)}</span>`).join('<span>›</span>')}${F.priv ? `<span class="c lockb">${ic('intime')} Non enregistré</span>` : ''}</div>`;
function renderQ() {
  const it = cur(), top = F.stack[F.stack.length - 1];
  return `<div class="qv">${crumbs()}
    <h1 class="q">${esc(it.q)}</h1>
    <div class="qmeta">${top.list.length > 1 ? `<span>${top.idx + 1} / ${top.list.length}</span>` : ''}${it.urgent ? '<span class="pill u">Prioritaire</span>' : ''}<span>${GESTURES}</span></div>
  </div>`;
}
const deeperList = () => (theme(F.theme)?.deeper || []).map(d => d.text);
const parsePlan = () => (S.plan || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const m = l.match(/^(\d{1,2})[:h](\d{2})\s+(.*)$/); return m ? { t: m[1].padStart(2, '0') + ':' + m[2], label: m[3] } : null;
}).filter(Boolean);
function renderDone() {
  const plan = F.action === 'planning' ? `<ul class="plist">${parsePlan().map(p => `<li><time>${p.t}</time>${esc(p.label)}</li>`).join('') || '<li class="muted">Aucun programme saisi.</li>'}</ul>` : '';
  const time = F.action === 'heure' ? `<p class="big" style="font-size:26px">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtT(Date.now())}</p>` : '';
  const title = F.result === 'non-trouve' ? 'Besoin non trouvé' : F.result === 'message' ? '« ' + F.path[F.path.length - 1] + ' »' : (F.path.slice(1).join(' › ') || F.path[0]);
  const asked = new Set(F.entryNotes.map(n => n[0])), dl = deeperList();
  const main = F.ask
    ? `<span class="tag">${esc(name())} ${F.say ? 'te dit' : 'te demande'}</span><p class="big ask">${esc(F.ask)}</p><div><button class="btn" data-act="reread">${ic('voice')} Relire à voix haute</button></div>`
    : `<span class="tag">${F.result === 'non-trouve' ? 'Pas dans la liste' : F.result === 'message' ? 'Message de ' + esc(name()) : esc(name()) + ' a exprimé'}</span><p class="big">${esc(title)}</p>`;
  return `<div class="done"><div class="result ${F.urgent ? 'urgent' : ''}">
      ${crumbs()}${main}
      ${F.urgent ? '<p class="urg">Prioritaire : préviens l’équipe soignante maintenant.</p>' : ''}
      ${plan}${time}
      ${F.result === 'non-trouve' ? `<div><button class="btn primary" data-act="spellctx">${ic('spell')} Épeler avec ${esc(name())}</button></div>` : ''}
      ${F.entryNotes.length ? `<ul class="notes">${F.entryNotes.map(([q, a]) => `<li><span>${esc(q)}</span><span class="${a === 'oui' ? 'ans-y' : 'ans-n'}">${a === 'oui' ? 'Oui' : 'Non'}</span></li>`).join('')}</ul>` : ''}
      <p class="next">Autre chose, ${esc(name())} ?</p>
      <span class="muted" style="font-size:13.5px">Oui : continuer dans ce thème · Non : accueil</span>
    </div>
    ${dl.length ? `<div class="deeper"><h3>${ic('deeper')} Pour aller plus loin</h3>
      <p>Pour l’entourage : touche une question pour la poser à ${esc(name())}.</p>
      <div class="dlist">${dl.map((q, i) => `<button data-deep="${i}" class="${asked.has(q) ? 'asked' : ''}">${esc(q)}</button>`).join('')}</div></div>` : ''}
  </div>`;
}
const renderDeeper = () => `<div class="qv">${crumbs()}<span class="pill t" style="align-self:flex-start">Pour aller plus loin</span><h1 class="q">${esc(F.dq)}</h1></div>`;
function renderSpell() {
  return `<div class="spell">
    <div class="typed">${esc(F.text)}<span class="caret"></span></div>
    <h1 class="q" style="font-size:clamp(22px,5vw,36px)">${esc(spellQ())}</h1>
    <div>${GROUPS.map((g, gi) => `<div class="lg ${gi === F.g ? 'cur' : ''}">${g.map((c, li) => `<button class="${c.length > 1 ? 'act' : ''} ${gi === F.g && li === F.l ? 'cur' : ''}" data-pick="${gi},${li}">${c}</button>`).join('')}</div>`).join('')}</div>
    <p class="muted" style="margin:0;font-size:13.5px">Oui choisit le groupe puis la lettre, non passe au suivant. Tu peux aussi toucher une lettre.</p></div>`;
}

$('#main').addEventListener('click', e => {
  if (view !== 'patient' || !S) return;
  const g = x => e.target.closest(x);
  let b;
  if ((b = g('[data-item]'))) return startItem(b.dataset.th, b.dataset.item);
  if ((b = g('[data-person]'))) { const p = S.people.find(x => x.id === b.dataset.person), th = personTheme(p); return startTheme(th, `${th}.${p.id}`); }
  if ((b = g('[data-top]'))) { const o = topCache[+b.dataset.top]; return o.kind === 'sugg' ? startQuick(o.sg) : startItem(o.t.id, o.it.id); }
  if ((b = g('[data-deep]'))) { F.dq = deeperList()[+b.dataset.deep]; F.mode = 'deeper'; render(); speak(F.dq); return; }
  if ((b = g('[data-pick]'))) { const [x, y] = b.dataset.pick.split(',').map(Number); return spellPick(x, y); }
  if ((b = g('[data-act]'))) {
    const a = b.dataset.act;
    if (a === 'scan') startScan(); else if (a === 'spell') startSpell(['Message']); else if (a === 'plan') showPlan();
    else if (a === 'themeScan') startTheme(b.dataset.th);
    else if (a === 'wOui' || a === 'hOui') answer('oui'); else if (a === 'wNon' || a === 'hNon') answer('non'); else if (a === 'wSkip') { mood = null; goHome(); }
    else if (a === 'hello') showHello();
    else if (a === 'openTheme') { boardTheme = b.dataset.th; themePage = 0; render(); }
    else if (a === 'closeTheme') { boardTheme = null; render(); }
    else if (a === 'nextPage') { boardPage++; render(); } else if (a === 'prevPage') { boardPage = Math.max(0, boardPage - 1); render(); }
    else if (a === 'nextTheme') { themePage++; render(); } else if (a === 'prevTheme') { themePage = Math.max(0, themePage - 1); render(); }
    else if (a === 'spellctx') startSpell([...F.path]); else if (a === 'reread') speak(F.ask, true);
  }
});
$('#bYes').onclick = () => answer('oui');
$('#bNo').onclick = () => answer('non');
$('#bTalk').onclick = () => answer('parler');
document.addEventListener('keydown', e => {
  if (!S || e.target.closest?.('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if (k === 'o' || k === 'arrowleft') answer('oui');
  else if (k === 'n' || k === 'arrowright') answer('non');
  else if (k === 'p' || k === ' ') { e.preventDefault(); answer('parler'); }
  else if (k === 'backspace' || k === 'escape') { if ($('#ovRoot').firstChild) closeOv(); else if (view === 'patient') back(); }
});
function flash(a) { const el = $({ oui: '#bYes', non: '#bNo', parler: '#bTalk' }[a]); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 350); }

/* ================================================================ espace admin */
let tab = 'resume', addTheme = '', qSearch = '', histF = '', armed = '', newKey = '', pendingPhoto = null;

// Photo d'un contact : recadrée en carré et réduite à 192 px (JPEG ≈ 15 Ko) avant d'être enregistrée.
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 192, c = document.createElement('canvas'), k = Math.min(img.width, img.height);
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, size, size);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible, réessaie.')); };
    img.src = url;
  });
}

function openAdmin() {
  if (S.isAdmin) { view = 'admin'; return render(); }
  const create = !S.hasPin;
  $('#ovRoot').innerHTML = `<div class="ov" role="dialog" aria-modal="true" aria-labelledby="lkT"><form class="ovc lock" id="lockF">
    <h2 id="lkT" style="font-size:26px">${ic('intime')} ${create ? 'Créer le code admin' : 'Espace admin'}</h2>
    <p class="muted" style="margin:0">${create ? 'Choisis un code d’au moins 4 caractères. Il sera demandé à chaque accès.' : 'Entre le code admin pour continuer.'}</p>
    <input type="password" id="pin1" inputmode="numeric" autocomplete="off" placeholder="Code" aria-label="Code" required minlength="4">
    ${create ? '<input type="password" id="pin2" inputmode="numeric" autocomplete="off" placeholder="Confirmer le code" aria-label="Confirmer le code" required minlength="4">' : ''}
    <p class="err" id="pinErr" role="alert"></p>
    <div class="row"><button class="btn primary">${create ? 'Créer et entrer' : 'Déverrouiller'}</button><button class="btn" type="button" data-ov="close">Annuler</button></div>
  </form></div>`;
  $('#pin1').focus();
  $('#lockF').onsubmit = async e => {
    e.preventDefault();
    const pin = $('#pin1').value, err = $('#pinErr');
    if (create && pin !== $('#pin2').value) { err.textContent = 'Les deux codes sont différents.'; return; }
    try {
      await api('POST', `/api/auth?action=${create ? 'setup' : 'login'}`, { pin });
      S.isAdmin = true; S.hasPin = true; closeOv(); view = 'admin'; render();
    } catch (x) {
      err.textContent = x.message;
      $('#pin1').value = ''; $('#pin1').focus();
    }
  };
}
async function leaveAdmin() {
  view = 'patient'; S.isAdmin = false; newKey = ''; render();
  try { await api('POST', '/api/auth?action=logout'); toast('Espace admin verrouillé'); } catch { /* la session expirera d'elle-même */ }
}
async function adm(action, payload, okMsg) {
  try {
    const r = await api('POST', '/api/admin?action=' + action, payload);
    await reload(); armed = ''; render();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { S.isAdmin = false; view = 'patient'; render(); toast('Session expirée : entre à nouveau le code.'); }
    else toast(e.message);
  }
}
const walkItems = (list, d, out, t) => { (list || []).forEach(it => { out.push({ it, t, d }); if (Array.isArray(it.then)) walkItems(it.then, d + 1, out, t); }); return out; };

function renderAdmin() {
  return `<div class="adm">
    <div class="seg" role="tablist">${[['resume', 'Résumé'], ['ajouter', 'Ajouter'], ['reglages', 'Réglages']].map(([k, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'cur' : ''}">${l}</button>`).join('')}</div>
    ${tab === 'resume' ? admResume() : tab === 'ajouter' ? admAdd() : admSettings()}
  </div>`;
}
function admResume() {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const today = S.history.filter(e => e.ts >= day.getTime());
  const pain = today.filter(e => e.theme === 'douleur'), urg = today.filter(e => e.urgent), talks = today.filter(e => e.result === 'parole'), nf = today.filter(e => e.result === 'non-trouve');
  const list = S.history.filter(e => !histF || e.theme === histF).slice(0, 60);
  const pill = r => ({ resolu: '<span class="pill ok">compris</span>', 'non-trouve': '<span class="pill ko">non trouvé</span>', parole: '<span class="pill t">veut parler</span>', message: '<span class="pill ok">message</span>' }[r] || '');
  return `${DEMO ? '<p class="muted" style="margin:0;font-size:13.5px">Démonstration : données d’exemple, gardées dans ce navigateur.</p>' : ''}
    <div class="stats">
      <div class="stat"><span class="n">${today.length}</span><span class="l">échanges aujourd’hui</span></div>
      <div class="stat ${pain.length >= 2 ? 'warn' : ''}"><span class="n">${pain.length}</span><span class="l">douleurs${pain[0] ? ' · ' + esc(pain[0].path.slice(1).join(' › ')) : ''}</span></div>
      <div class="stat ${urg.length ? 'warn' : ''}"><span class="n">${urg.length}</span><span class="l">prioritaires</span></div>
      <div class="stat"><span class="n">${talks.length}</span><span class="l">demandes de parole</span></div>
    </div>
    ${nf.length ? `<p class="muted" style="margin:0;font-size:14px">${nf.length} besoin(s) non trouvé(s) aujourd’hui : pense à ajouter une question (onglet « Ajouter »).</p>` : ''}
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px"><h3 style="margin:0">Historique (60 jours)</h3>
      <select id="histF" style="width:auto" aria-label="Filtrer l’historique">${[['', 'Tout'], ...S.themes.filter(t => !t.private).map(t => [t.id, t.label]), ['parler', 'Parole']].map(([v, l]) => `<option value="${esc(v)}" ${histF === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <ul class="rows">${list.map(e => `<li><time>${fmtD(e.ts)}<br>${fmtT(e.ts)}</time><div class="t"><b>${esc(e.path.join(' › '))}</b>
        ${e.notes?.length ? `<small>${e.notes.map(([q, a]) => esc(q) + ' → ' + (a === 'oui' ? 'oui' : 'non')).join(' · ')}</small>` : ''}</div>
        <div>${e.urgent ? '<span class="pill u">prioritaire</span> ' : ''}${pill(e.result)}</div></li>`).join('') || '<li class="muted">Aucun échange pour l’instant.</li>'}</ul>
      <p class="muted" style="font-size:13px;margin:10px 0 0">${ic('intime')} Les échanges « Vie privée » ne sont jamais enregistrés.</p></div>`;
}
// Onglet « Ajouter » : ajout de questions et ajout d'un contact, au même endroit.
function admAdd() {
  if (!theme(addTheme)) addTheme = S.themes.find(t => !t.dynamic)?.id || S.themes[0]?.id || '';
  const t = theme(addTheme), q = qSearch.trim().toLowerCase();
  const parents = t ? walkItems(t.items, 0, [], t).filter(r => r.it.then !== '@i' && !r.it.action) : [];
  let rows;
  if (q) {
    rows = []; S.themes.forEach(th => walkItems(th.items, 0, rows, th));
    rows = rows.filter(r => norm(r.it.q + ' ' + r.it.l).includes(norm(q))).map(r => ({ ...r, d: 0 })).sort((a, b) => scoreOf(b.it.id).score - scoreOf(a.it.id).score);
  } else rows = t ? walkItems(t.items, 0, [], t) : [];
  const row = ({ it, t: th, d }) => {
    const s = scoreOf(it.id);
    return `<li class="l${Math.min(d, 2)}">${ic(itemIcon(it, th))}<div class="t">${esc(it.q)}<small>${q ? esc(th.label) + ' · ' : ''}${s.a} usages · ${s.a ? Math.round(s.hit * 100) + ' % oui' : 'nouvelle'}${it.urgent ? ' · prioritaire' : ''}</small></div>
      <span class="sbar" title="Score de recommandation"><b style="width:${Math.round(s.score * 100)}%"></b></span>
      <button class="btn sm danger" data-del="${esc(it.id)}">${armed === it.id ? 'Confirmer' : 'Suppr.'}</button></li>`;
  };
  const themeOptions = S.types.map(ty => {
    const ts = S.themes.filter(x => x.group === ty.id); if (!ts.length) return '';
    return `<optgroup label="${esc(ty.name)}">${ts.map(x => `<option value="${esc(x.id)}" ${x.id === addTheme ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</optgroup>`;
  }).join('');
  return `<div class="card">
      <h3>${ic('question')} Ajout de questions</h3>
      <form class="fgrid c2" id="fQ">
        <label class="fl">Thème<select id="qTheme">${themeOptions}</select></label>
        <label class="fl">Placer sous<select id="qParent"><option value="">Directement dans le thème</option>${parents.map(({ it, d }) => `<option value="${esc(it.id)}">${'— '.repeat(d + 1)}${esc(it.l)}</option>`).join('')}</select></label>
        <label class="fl">Qui parle ?<select id="qKind"><option value="question">Question posée à ${esc(name())}</option><option value="ask">${esc(name())} demande…</option><option value="say">${esc(name())} dit…</option></select></label>
        <label class="fl">Texte (tutoiement)<input type="text" id="qText" placeholder="Tu veux… ?" required maxlength="300"></label>
        <label class="fl">Mot-clé (affiché sur le pictogramme)<input type="text" id="qLabel" placeholder="ex. Lunettes" required maxlength="60"></label>
        <div class="fgrid"><label class="ck"><input type="checkbox" id="qUrg"> Prioritaire</label><label class="ck"><input type="checkbox" id="qInt"> Demander ensuite l’intensité</label></div>
        <button class="btn primary">Ajouter la question</button>
      </form>
      <details ${q ? 'open' : ''}><summary>Questions existantes ${t && !q ? `dans « ${esc(t.label)} » (${rows.length})` : ''}</summary>
        <input type="search" id="qSearch" placeholder="Chercher dans toute la banque…" aria-label="Chercher une question" value="${esc(qSearch)}">
        <ul class="rows">${rows.map(row).join('') || '<li class="muted">Aucune question.</li>'}</ul>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">La barre = score de recommandation (50 % taux de oui, 30 % usage, 20 % rapidité). Les meilleures questions passent en premier.</p>
      </details>
      ${t ? `<details><summary>Pour aller plus loin dans « ${esc(t.label)} » (${t.deeper.length})</summary>
        <ul class="rows">${t.deeper.map(d => `<li><div class="t">${esc(d.text)}</div><button class="btn sm danger" data-ddel="${esc(d.id)}">Retirer</button></li>`).join('')}</ul>
        <form class="fgrid c2" id="fD" style="margin-top:8px"><input type="text" id="dText" placeholder="Question pour l’entourage" aria-label="Question pour l’entourage" required maxlength="300"><button class="btn primary">Ajouter</button></form>
      </details>` : ''}
    </div>
    <div class="card">
      <h3>${ic('personnes')} Ajout d’un contact</h3>
      <form class="fgrid c2" id="fP">
        <label class="fl">Prénom<input type="text" id="pName" required maxlength="60"></label>
        <label class="fl">Lien avec ${esc(name())}<input type="text" id="pRole" placeholder="ex. sœur, ami, kiné" maxlength="80"></label>
        <label class="fl">Catégorie<select id="pKind">${KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <div class="fl">Photo (facultatif)
          <div class="photo-row"><img id="pPrev" class="av big" alt="" ${pendingPhoto ? `src="${pendingPhoto}"` : 'hidden'}>
            <label class="btn">${ic('cam')} ${pendingPhoto ? 'Reprendre la photo' : 'Prendre une photo'}<input type="file" id="pPhoto" accept="image/*" capture="environment" hidden></label></div></div>
        <button class="btn primary">Ajouter le contact</button>
      </form>
      <details ${S.people.length ? '' : 'open'}><summary>Contacts (${S.people.length})</summary>
        <ul class="rows">${S.people.map(p => `<li>${avatar(p)}<div class="t"><b>${esc(p.name)}</b><small>${esc(p.role)} · ${esc((KINDS.find(k => k[0] === p.kind) || [, p.kind])[1])}</small></div><label class="btn sm" title="Photo de ${esc(p.name)}">${ic('cam')}<span class="lb2">Photo</span><input type="file" accept="image/*" capture="environment" data-pphoto="${esc(p.id)}" hidden></label><button class="btn sm danger" data-pdel="${esc(p.id)}">${armed === p.id ? 'Confirmer' : 'Retirer'}</button></li>`).join('') || '<li class="muted">Aucun contact pour l’instant.</li>'}</ul>
      </details>
    </div>`;
}
function admSettings() {
  return `<div class="card"><h3>Programme du jour</h3>
      <textarea id="plan" aria-label="Programme du jour" maxlength="4000">${esc(S.plan)}</textarea>
      <div style="margin-top:8px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span class="muted" style="font-size:13px">Une ligne par moment : HH:MM activité</span><button class="btn primary" id="savePlan">Enregistrer</button></div></div>
    <div class="card"><h3>Mouvements de tête</h3>
      <div class="fgrid">
        <p class="muted" style="margin:0;font-size:14px">${GESTURES}.</p>
        <label class="fl">Amplitude du mouvement : <b id="sensV">${Math.round(S.settings.sens * 100)} %</b><input type="range" id="sens" min="0.5" max="1.6" step="0.05" value="${S.settings.sens}"></label>
        <label class="fl">Caméra utilisée<select id="camSel">
          <option value="environment" ${S.settings.cam !== 'user' ? 'selected' : ''}>Arrière : téléphone tenu par la personne en face de ${esc(name())}</option>
          <option value="user" ${S.settings.cam === 'user' ? 'selected' : ''}>Avant : écran tourné vers ${esc(name())} (tablette posée)</option></select></label>
        <label class="ck"><input type="checkbox" id="swap" ${S.settings.swap ? 'checked' : ''}> Inverser gauche et droite (si la caméra de l’appareil inverse l’image)</label>
      </div></div>
    <div class="card"><h3>Options</h3>
      <div class="fgrid">
        <label class="ck"><input type="checkbox" id="reco" ${S.settings.reco ? 'checked' : ''}> Poser d’abord les questions les plus efficaces</label>
        <form class="fgrid c2" id="fPin"><label class="fl">Nouveau code admin<input type="password" id="newPin" autocomplete="new-password" minlength="4" required></label><button class="btn">Changer le code</button></form>
      </div>
      <details><summary>Thèmes et catégories</summary>
        <form class="fgrid c2" id="fT">
          <label class="fl">Nouveau thème<input type="text" id="tName" required maxlength="60"></label>
          <label class="fl">Dans la catégorie<select id="tGroup">${S.types.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label>
          <label class="ck"><input type="checkbox" id="tPriv"> Sans historique (vie privée)</label>
          <button class="btn primary">Créer le thème</button>
        </form>
        <form class="fgrid c2" id="fTy" style="margin-top:12px"><label class="fl">Nouvelle catégorie<input type="text" id="tyName" placeholder="ex. Santé" required maxlength="40"></label><button class="btn">Créer la catégorie</button></form>
        ${S.types.filter(ty => !S.themes.some(t => t.group === ty.id)).map(ty => `<button class="btn sm danger" style="margin-top:10px" data-tydel="${esc(ty.id)}">Supprimer la catégorie vide « ${esc(ty.name)} »</button>`).join(' ')}
      </details></div>
    ${DEMO ? `<div class="card"><h3>Démonstration</h3><p class="muted" style="margin-top:0;font-size:14px">Les données sont gardées dans ce navigateur.</p>
      <button class="btn danger" id="demoReset">${armed === 'reset' ? 'Confirmer la remise à zéro' : 'Remettre les données d’exemple'}</button></div>`
    : `<div class="card"><h3>Appareils reliés</h3>
      <p class="muted" style="margin-top:0;font-size:14px">Générer un nouveau lien déconnecte toutes les tablettes et téléphones reliés (à faire si un appareil est perdu). Cet appareil-ci reste relié.</p>
      ${newKey ? `<p style="margin:0 0 6px;font-size:14px"><b>Nouveau lien d’installation</b> (à ouvrir sur chaque appareil) :</p><code class="key">${esc(location.origin)}/?cle=${esc(newKey)}</code>` : ''}
      <button class="btn danger" id="rotate" style="margin-top:8px">${armed === 'rotate' ? 'Confirmer : déconnecter les autres appareils' : 'Générer un nouveau lien'}</button></div>`}`;
}
function bindAdmin() {
  const m = $('#main'), on = (sel, ev, fn) => m.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
  const confirmOr = (id, fn) => { if (armed !== id) { armed = id; return render(); } fn(); };
  on('[data-tab]', 'click', e => { tab = e.currentTarget.dataset.tab; armed = ''; render(); });
  on('#histF', 'change', e => { histF = e.target.value; render(); });
  on('#qTheme', 'change', e => { addTheme = e.target.value; render(); });
  on('#qSearch', 'input', e => { qSearch = e.target.value; const pos = e.target.selectionStart; render(); const s = $('#qSearch'); s.focus(); s.setSelectionRange(pos, pos); });
  on('[data-del]', 'click', e => { const id = e.currentTarget.dataset.del; confirmOr(id, () => adm('delete-question', { id }, 'Question supprimée')); });
  on('[data-ddel]', 'click', e => adm('delete-followup', { id: e.currentTarget.dataset.ddel }));
  on('[data-tydel]', 'click', e => adm('delete-type', { id: e.currentTarget.dataset.tydel }, 'Catégorie supprimée'));
  on('[data-pdel]', 'click', e => { const id = e.currentTarget.dataset.pdel; confirmOr(id, () => adm('delete-person', { id }, 'Contact retiré')); });
  on('#fQ', 'submit', e => { e.preventDefault(); adm('add-question', { themeId: $('#qTheme').value, parentId: $('#qParent').value, label: $('#qLabel').value, text: $('#qText').value, kind: $('#qKind').value, urgent: $('#qUrg').checked, intensity: $('#qInt').checked }, 'Question ajoutée'); });
  on('#fD', 'submit', e => { e.preventDefault(); adm('add-followup', { themeId: addTheme, text: $('#dText').value }); });
  on('#fP', 'submit', async e => { e.preventDefault(); const photo = pendingPhoto; const r = await adm('add-person', { name: $('#pName').value, role: $('#pRole').value, kind: $('#pKind').value, photo }, 'Contact ajouté'); if (r) { pendingPhoto = null; render(); } });
  on('#pPhoto', 'change', async e => { const f = e.target.files[0]; if (!f) return; try { pendingPhoto = await readPhoto(f); render(); } catch (x) { toast(x.message); } });
  on('[data-pphoto]', 'change', async e => { const f = e.target.files[0]; if (!f) return; try { adm('set-person-photo', { id: e.target.dataset.pphoto, photo: await readPhoto(f) }, 'Photo enregistrée'); } catch (x) { toast(x.message); } });
  on('#fT', 'submit', async e => { e.preventDefault(); const r = await adm('add-theme', { label: $('#tName').value, typeId: $('#tGroup').value, private: $('#tPriv').checked }, 'Thème créé : ajoute-lui des questions dans « Ajouter »'); if (r?.id) addTheme = r.id; });
  on('#fTy', 'submit', e => { e.preventDefault(); adm('add-type', { name: $('#tyName').value }, 'Catégorie créée : ajoute-lui un thème'); });
  on('#savePlan', 'click', () => adm('save-plan', { plan: $('#plan').value }, 'Programme enregistré'));
  on('#reco', 'change', e => adm('save-settings', { ...S.settings, reco: e.target.checked }));
  on('#camSel', 'change', async e => { await adm('save-settings', { ...S.settings, cam: e.target.value }, 'Caméra enregistrée'); if (tracker.running) { tracker.stop(); toggleCam(); } });
  on('#swap', 'change', e => adm('save-settings', { ...S.settings, swap: e.target.checked }, e.target.checked ? 'Gauche et droite inversées' : 'Sens normal'));
  on('#sens', 'input', e => { $('#sensV').textContent = Math.round(e.target.value * 100) + ' %'; });
  on('#sens', 'change', e => adm('save-settings', { ...S.settings, sens: +e.target.value }, 'Amplitude enregistrée'));
  on('#fPin', 'submit', e => { e.preventDefault(); adm('change-pin', { pin: $('#newPin').value }, 'Code modifié'); });
  on('#demoReset', 'click', () => confirmOr('reset', async () => { DEMO.reset(); armed = ''; await reload(); S.isAdmin = false; view = 'patient'; F = { mode: 'home' }; render(); toast('Données d’exemple remises'); }));
  on('#rotate', 'click', () => confirmOr('rotate', async () => {
    // La clé change côté serveur : on la garde tout de suite, avant de relire les données avec.
    try {
      const r = await api('POST', '/api/admin?action=rotate-device-key', {});
      store.set(K_KEY, r.key); newKey = r.key; armed = '';
      await reload(); render(); toast('Nouveau lien généré');
    } catch (e) { toast(e.message); }
  }));
}

/* ================================================================ caméra (MediaPipe) */
const tracker = createHeadTracker({
  video: $('#vid'),
  getSensitivity: () => S?.settings.sens || 1,
  getSwap: () => !!S?.settings.swap,
  getFacing: () => S?.settings.cam || 'environment',
  onStatus: msg => { $('#camMsg').textContent = msg; },
  onMeters: (yes, no, talk) => { $('#mP').style.width = Math.min(100, yes * 100) + '%'; $('#mY').style.width = Math.min(100, no * 100) + '%'; $('#mR').style.width = Math.min(100, talk * 100) + '%'; },
  onGesture: g => { $('#camLast').textContent = { oui: 'Oui', non: 'Non', parler: 'Parler' }[g]; answer(g); },
});
async function toggleCam() {
  if (tracker.running) { tracker.stop(); $('#cam').hidden = true; return renderTop(); }
  $('#cam').hidden = false;
  try { await tracker.start(); }
  catch (e) {
    tracker.stop(); $('#cam').hidden = true;
    toast(e?.name === 'NotAllowedError' ? 'Accès à la caméra refusé : autorise-le dans les réglages du navigateur.' : 'Caméra indisponible. Utilise les boutons ou les touches O / N / P.');
  }
  renderTop();
}
$('#recal').onclick = () => tracker.recalibrate();

/* ================================================================ démarrage */
function renderSetup(msg) {
  $('#top').innerHTML = '<div class="who"><b>Parler avec Anna</b></div>';
  $('#bar').hidden = true;
  $('#main').innerHTML = `<div class="setup"><h1>Relier cet appareil</h1>
    <p>${esc(msg)}</p>
    <p class="muted">Ouvre sur cet appareil le lien d’installation fourni par l’équipe (il se termine par <code>?cle=…</code>). Il n’est demandé qu’une fois.</p></div>`;
}
async function boot() {
  if (!DEMO && !store.get(K_KEY, '')) return renderSetup('Cet appareil n’est pas encore relié.');
  try {
    await reload();
  } catch (e) {
    if (e.status === 401) return renderSetup('Ce lien n’est plus valide (il a peut-être été renouvelé).');
    $('#main').innerHTML = `<div class="setup"><h1>Connexion impossible</h1><p>${esc(e.message)}</p><button class="btn primary" id="retry">Réessayer</button></div>`;
    $('#retry').onclick = () => location.reload();
    return;
  }
  document.title = `Parler avec ${name()}`;
  showHello();
  flush();
  setInterval(() => { const c = document.querySelector('.clock'); if (c) { const now = new Date(); c.textContent = now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + fmtT(now); } }, 30000);
}
boot();
