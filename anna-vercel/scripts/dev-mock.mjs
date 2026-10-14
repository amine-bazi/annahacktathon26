// Serveur local de démonstration, sans Vercel ni base : sert public/ et imite l'API en mémoire.
// Pratique pour travailler l'interface. Les données repartent de zéro à chaque redémarrage.
// Usage : npm run dev:mock  →  http://localhost:3000/?cle=demo
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { flattenDefaults, buildBootstrap, slug, PEOPLE_KINDS } from '../lib/content.js';
import { TYPES, THEMES, DEMO_PEOPLE, DEFAULT_PLAN } from '../lib/defaults.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = new URL('../public/', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

let deviceKey = 'demo';
const rows = flattenDefaults(TYPES, THEMES);
const db = {
  patient: { id: 'p1', display_name: 'Anna', admin_pin: null, daily_plan: DEFAULT_PLAN, settings: { reco: true, sens: 1 } },
  types: rows.types, themes: rows.themes, questions: rows.questions,
  followups: rows.followups.map((f, i) => ({ ...f, id: i + 1 })),
  people: DEMO_PEOPLE.map(p => ({ ...p, id: slug(p.name) })),
  events: [], conversations: [], notes: [],
};
let session = null, nextId = 1000;
const sfx = () => Math.random().toString(16).slice(2, 8);

function stats() {
  const m = new Map();
  for (const e of db.events) {
    const s = m.get(e.key) || { question_key: e.key, asked: 0, yes: 0, no: 0, talk: 0, rt_sum: 0 };
    if (e.answer === 'parler') s.talk++; else { s.asked++; s[e.answer === 'oui' ? 'yes' : 'no']++; s.rt_sum += e.ms; }
    m.set(e.key, s);
  }
  return [...m.values()];
}
const isPrivateTheme = id => db.themes.find(t => t.id === id)?.is_private;
const isPrivateKey = key => db.questions.some(q => q.is_private && (key === q.id || key.startsWith(q.id + '.')));

const handlers = {
  'GET data/bootstrap': (req) => buildBootstrap({
    patient: { ...db.patient, admin_pin_hash: db.patient.admin_pin }, types: db.types, themes: db.themes,
    questions: db.questions, followups: db.followups, people: db.people, stats: stats(), isAdmin: req.admin,
    history: db.conversations.map(c => ({ ...c, notes: db.notes.filter(n => n.cid === c.id).map(n => [n.question, n.answer]) })).reverse(),
  }),
  'POST data/events': (req, b) => {
    const evs = (b.events || []).filter(e => !isPrivateTheme(e.theme) && !isPrivateKey(e.key));
    db.events.push(...evs); return { saved: evs.length };
  },
  'POST data/conversation': (req, b) => {
    if (isPrivateTheme(b.theme) || db.conversations.some(c => c.id === b.id)) return { saved: 0 };
    db.conversations.push({ id: b.id, theme_id: b.theme, path: b.path, result: b.result, questions_count: b.n, duration_ms: b.dur, is_urgent: !!b.urgent, created_at: new Date(b.at || Date.now()).toISOString() });
    return { saved: 1 };
  },
  'POST data/note': (req, b) => { if (!db.conversations.some(c => c.id === b.conversationId)) return { saved: 0 }; db.notes.push({ cid: b.conversationId, question: b.question, answer: b.answer }); return { saved: 1 }; },
  'GET auth/status': req => ({ hasPin: !!db.patient.admin_pin, isAdmin: req.admin }),
  'POST auth/setup': (req, b, res) => { if (db.patient.admin_pin) throw [409, 'Un code existe déjà']; if ((b.pin || '').length < 4) throw [400, 'Au moins 4 caractères']; db.patient.admin_pin = b.pin; return login(res); },
  'POST auth/login': (req, b, res) => { if (b.pin !== db.patient.admin_pin) throw [401, 'Code incorrect']; return login(res); },
  'POST auth/logout': (req, b, res) => { session = null; res.setHeader('Set-Cookie', 'anna_admin=; Path=/; Max-Age=0'); return { ok: true }; },
};
function login(res) { session = randomUUID(); res.setHeader('Set-Cookie', `anna_admin=${session}; Path=/; HttpOnly; SameSite=Strict`); return { ok: true }; }

const admin = {
  'add-question': b => {
    const id = `${b.parentId || b.themeId}.${slug(b.label) || 'q'}-${sfx()}`;
    const kind = ['ask', 'say'].includes(b.kind) ? b.kind : 'question';
    db.questions.push({ id, theme_id: b.themeId, parent_id: b.parentId || null, label: b.label, text: kind === 'ask' ? `Demander : « ${b.text} »` : kind === 'say' ? `Dire : « ${b.text} »` : b.text,
      kind, ask_text: kind === 'question' ? null : b.text, action: null, is_urgent: !!b.urgent, is_private: false, has_intensity: kind === 'question' && !!b.intensity, position: 999 });
    return { id };
  },
  'delete-question': b => { const gone = new Set([b.id]); let grew = true; while (grew) { grew = false; for (const q of db.questions) if (q.parent_id && gone.has(q.parent_id) && !gone.has(q.id)) { gone.add(q.id); grew = true; } } db.questions = db.questions.filter(q => !gone.has(q.id)); },
  'add-theme': b => { const id = `${slug(b.label)}-${sfx()}`; db.themes.push({ id, type_id: b.typeId, label: b.label, subtitle: '', icon: 'autre', is_private: !!b.private, people_kinds: null, position: 999 }); return { id }; },
  'add-type': b => { const id = `${slug(b.name)}-${sfx()}`; db.types.push({ id, name: b.name, short_label: b.name.slice(0, 14), icon: 'autre', hue: [...b.name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360, position: 999 }); return { id }; },
  'delete-type': b => { if (db.themes.some(t => t.type_id === b.id)) throw [409, 'Ce type contient encore des thèmes']; db.types = db.types.filter(t => t.id !== b.id); },
  'add-followup': b => { db.followups.push({ id: nextId++, theme_id: b.themeId, text: b.text, position: 999 }); },
  'delete-followup': b => { db.followups = db.followups.filter(f => String(f.id) !== String(b.id)); },
  'add-person': b => { const id = `${slug(b.name)}-${sfx()}`; db.people.push({ id, name: b.name, role: b.role || '', kind: PEOPLE_KINDS.includes(b.kind) ? b.kind : 'Famille' }); return { id }; },
  'delete-person': b => { db.people = db.people.filter(p => p.id !== b.id); },
  'save-plan': b => { db.patient.daily_plan = b.plan || ''; },
  'save-settings': b => { db.patient.settings = { reco: b.reco !== false, sens: Number(b.sens) || 1 }; },
  'change-pin': b => { db.patient.admin_pin = b.pin; },
  'rotate-device-key': () => { deviceKey = randomUUID().slice(0, 12); return { key: deviceKey }; },
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? JSON.parse(await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d || '{}')); })) : {};
      if (req.headers['x-device-key'] !== deviceKey) throw [401, 'Appareil non reconnu'];
      req.admin = !!session && (req.headers.cookie || '').includes(`anna_admin=${session}`);
      const fn = url.pathname.slice(5);
      const action = url.searchParams.get('action');
      let out;
      if (fn === 'admin') {
        if (!req.admin) throw [403, 'Session soignant requise'];
        if (!admin[action]) throw [404, 'Action inconnue'];
        out = { ok: true, ...(admin[action](body) || {}) };
      } else {
        const h = handlers[`${req.method} ${fn}/${action}`];
        if (!h) throw [404, 'Action inconnue'];
        out = await h(req, body, res);
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      return;
    }
    const file = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(ROOT)) throw [403, 'Interdit'];
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(data);
  } catch (e) {
    const [status, msg] = Array.isArray(e) ? e : e.code === 'ENOENT' ? [404, 'Introuvable'] : [500, String(e.message || e)];
    if (status === 500) console.error(e);
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: msg }));
  }
}).listen(PORT, () => console.log(`Démo locale : http://localhost:${PORT}/?cle=${deviceKey}`));
