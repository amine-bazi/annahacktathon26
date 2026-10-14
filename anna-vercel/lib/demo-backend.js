// Imitation complète de l'API, sans base : même contrat que api/*.js, données gardées en mémoire
// (et, dans le navigateur, dans localStorage). Sert au serveur local (scripts/dev-mock.mjs)
// et au prototype autonome en un fichier (scripts/build-prototype.mjs).
// Aucune sécurité réelle ici : c'est un outil de démonstration.
import { flattenDefaults, buildBootstrap, slug, PEOPLE_KINDS } from './content.js';
import { TYPES, THEMES, DEMO_PEOPLE, DEFAULT_PLAN } from './defaults.js';

class DemoError extends Error { constructor(status, message) { super(message); this.status = status; } }
const sfx = () => Math.random().toString(16).slice(2, 8);
const uuid = () => (globalThis.crypto?.randomUUID?.() || `${sfx()}${sfx()}-0000-4000-8000-${sfx()}${sfx()}`);

/** Historique et statistiques d'exemple, datés par rapport à maintenant, pour que la démo ne soit pas vide. */
function exampleData(questions) {
  const now = Date.now(), H = 3600e3;
  const h = (off, theme, path, extra = {}) => ({ id: uuid(), theme_id: theme, path, result: 'resolu', questions_count: path.length + 1,
    duration_ms: 15000 + Math.round(off * 900 % 40000), is_urgent: false, created_at: new Date(now - off * H).toISOString(), notes: [], ...extra });
  const history = [
    h(0.4, 'soif', ['Boire / manger', 'Boire', 'Eau']),
    h(1.6, 'position', ['Position', 'Changer de position', 'Côté gauche']),
    h(2.9, 'douleur', ['Douleur', 'Dos', 'Moyenne'], { notes: [['Changer de position pourrait soulager ?', 'oui']] }),
    h(4.2, 'proches', ['Proches', 'Léa', 'Voir']),
    h(5.1, 'hygiene', ['Toilette', 'Aspiration']),
    h(6.3, 'emotions', ['Émotions', 'Fatigue'], { notes: [['Tu as bien dormi ?', 'non']] }),
    h(20.5, 'douleur', ['Douleur', 'Dos', 'Forte'], { notes: [['Tu veux un antidouleur ?', 'oui']] }),
    h(22.1, 'soif', ['Boire / manger', 'Boire', 'Eau']),
    h(23.4, 'activites', ['Loisirs', 'Atelier', 'Musique'], { notes: [['Tu as aimé cette activité ?', 'oui']] }),
    h(25.2, 'passerelle', ['La Passerelle', 'Voir un soignant', 'Kiné']),
    h(26.4, 'position', ['Position', 'Remonter']),
    h(27.0, 'autre', ['Autre sujet', 'Souvenirs', 'Voyage'], { notes: [['C’est un souvenir heureux ?', 'oui']] }),
    h(29.8, 'emotions', ['Émotions', 'Inquiétude', 'Mes proches']),
    h(30.5, 'personnes', ['Personnes', 'Paul', 'Bon moment']),
    h(43.7, 'soif', ['Boire / manger', 'Boire', 'Boisson chaude']),
    h(45.9, 'douleur', ['Douleur', 'Jambes / pieds', 'Légère']),
    h(47.2, 'proches', ['Proches', 'Claire', 'Appeler']),
    h(47.9, 'parler', ['Message', 'LUNETTES'], { result: 'message' }),
  ];
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const base = {};
  for (const q of questions) {
    const a = 3 + Math.floor(rnd() * 26), y = Math.floor(a * (0.08 + rnd() * 0.5));
    base[q.id] = { asked: a, yes: y, no: a - y, talk: 0, rt_sum: a * (1400 + Math.floor(rnd() * 4200)) };
  }
  Object.assign(base, {
    'douleur.dos': { asked: 31, yes: 19, no: 12, talk: 0, rt_sum: 31 * 1900 },
    'soif.boire': { asked: 40, yes: 29, no: 11, talk: 0, rt_sum: 40 * 1500 },
    'soif.boire.eau': { asked: 29, yes: 21, no: 8, talk: 0, rt_sum: 29 * 1300 },
    'hygiene.aspiration': { asked: 22, yes: 14, no: 8, talk: 0, rt_sum: 22 * 1600 },
    'position.changer-de-position': { asked: 27, yes: 17, no: 10, talk: 0, rt_sum: 27 * 2100 },
    'interaction.ca-va': { asked: 34, yes: 26, no: 8, talk: 0, rt_sum: 34 * 1200 },
  });
  return { history, base };
}

function freshDb(withExamples) {
  const rows = flattenDefaults(TYPES, THEMES);
  const ex = withExamples ? exampleData(rows.questions) : { history: [], base: {} };
  return {
    v: 3,
    patient: { id: 'demo', display_name: 'Anna', admin_pin: null, daily_plan: DEFAULT_PLAN, settings: { reco: true, sens: 1 } },
    types: rows.types, themes: rows.themes, questions: rows.questions,
    followups: rows.followups.map((f, i) => ({ ...f, id: i + 1 })),
    people: DEMO_PEOPLE.map((p, i) => ({ ...p, id: slug(p.name), position: i })),
    baseStats: ex.base, events: [], conversations: ex.history, nextId: 1000,
  };
}

export function createDemoBackend({ load = () => null, save = () => {}, withExamples = true } = {}) {
  let db = load();
  if (!db || db.v !== 3) db = freshDb(withExamples);
  let session = false;
  let deviceKey = 'demo';
  const persist = () => save(db);

  function stats() {
    const m = new Map(Object.entries(db.baseStats).map(([k, v]) => [k, { question_key: k, ...v }]));
    for (const e of db.events) {
      const s = m.get(e.key) || { question_key: e.key, asked: 0, yes: 0, no: 0, talk: 0, rt_sum: 0 };
      if (e.answer === 'parler') s.talk++; else { s.asked++; s[e.answer === 'oui' ? 'yes' : 'no']++; s.rt_sum += e.ms; }
      m.set(e.key, s);
    }
    return [...m.values()];
  }
  const privateTheme = id => db.themes.find(t => t.id === id)?.is_private;
  const privateKey = key => db.questions.some(q => q.is_private && (key === q.id || key.startsWith(q.id + '.')));
  const need = (v, msg = 'Champ manquant') => { if (!String(v ?? '').trim()) throw new DemoError(400, msg); return String(v).trim(); };
  const byPos = list => [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const routes = {
    'GET data/bootstrap': () => buildBootstrap({
      patient: { ...db.patient, admin_pin_hash: db.patient.admin_pin }, isAdmin: session,
      types: byPos(db.types), themes: byPos(db.themes), questions: byPos(db.questions), followups: byPos(db.followups),
      people: byPos(db.people), stats: stats(),
      history: [...db.conversations].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 400),
    }),
    'POST data/events': b => {
      const evs = (b.events || []).filter(e => !privateTheme(e.theme) && !privateKey(e.key));
      db.events.push(...evs); return { saved: evs.length };
    },
    'POST data/conversation': b => {
      if (privateTheme(b.theme) || db.conversations.some(c => c.id === b.id)) return { saved: 0 };
      db.conversations.push({ id: b.id, theme_id: b.theme, path: b.path, result: b.result, questions_count: b.n || 0, duration_ms: b.dur || 0,
        is_urgent: !!b.urgent, created_at: new Date(b.at || Date.now()).toISOString(), notes: [] });
      return { saved: 1 };
    },
    'POST data/note': b => {
      const c = db.conversations.find(x => x.id === b.conversationId); if (!c) return { saved: 0 };
      c.notes.push([b.question, b.answer]); return { saved: 1 };
    },
    'GET auth/status': () => ({ hasPin: !!db.patient.admin_pin, isAdmin: session }),
    'POST auth/setup': b => {
      if (db.patient.admin_pin) throw new DemoError(409, 'Un code existe déjà');
      if ((b.pin || '').length < 4) throw new DemoError(400, 'Au moins 4 caractères');
      db.patient.admin_pin = b.pin; session = true; return { ok: true };
    },
    'POST auth/login': b => { if (b.pin !== db.patient.admin_pin) throw new DemoError(401, 'Code incorrect'); session = true; return { ok: true }; },
    'POST auth/logout': () => { session = false; return { ok: true }; },
  };

  const admin = {
    'add-question': b => {
      const themeId = need(b.themeId), label = need(b.label, 'Mot-clé manquant'), raw = need(b.text, 'Texte manquant');
      if (!db.themes.some(t => t.id === themeId)) throw new DemoError(404, 'Thème introuvable');
      const parentId = b.parentId || null, kind = ['ask', 'say'].includes(b.kind) ? b.kind : 'question';
      const id = `${parentId || themeId}.${slug(label) || 'q'}-${sfx()}`;
      const siblings = db.questions.filter(q => q.theme_id === themeId && (q.parent_id || null) === parentId);
      db.questions.push({ id, theme_id: themeId, parent_id: parentId, label,
        text: kind === 'ask' ? `Demander : « ${raw} »` : kind === 'say' ? `Dire : « ${raw} »` : raw,
        kind, ask_text: kind === 'question' ? null : raw, action: null, is_urgent: !!b.urgent, is_private: false,
        has_intensity: kind === 'question' && !!b.intensity, position: Math.max(-1, ...siblings.map(q => q.position ?? 0)) + 1 });
      return { id };
    },
    'delete-question': b => {
      const gone = new Set([b.id]); let grew = true;
      while (grew) { grew = false; for (const q of db.questions) if (q.parent_id && gone.has(q.parent_id) && !gone.has(q.id)) { gone.add(q.id); grew = true; } }
      db.questions = db.questions.filter(q => !gone.has(q.id));
    },
    'add-theme': b => {
      const label = need(b.label), id = `${slug(label) || 'theme'}-${sfx()}`;
      db.themes.push({ id, type_id: need(b.typeId), label, subtitle: '', icon: 'autre', is_private: !!b.private, people_kinds: null, position: db.themes.length });
      return { id };
    },
    'add-type': b => {
      const name = need(b.name), id = `${slug(name) || 'type'}-${sfx()}`;
      db.types.push({ id, name, short_label: name.slice(0, 14), icon: 'autre', hue: [...name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360, position: db.types.length });
      return { id };
    },
    'delete-type': b => {
      if (db.themes.some(t => t.type_id === b.id)) throw new DemoError(409, 'Ce type contient encore des thèmes');
      db.types = db.types.filter(t => t.id !== b.id);
    },
    'add-followup': b => { db.followups.push({ id: db.nextId++, theme_id: need(b.themeId), text: need(b.text), position: 999 }); },
    'delete-followup': b => { db.followups = db.followups.filter(f => String(f.id) !== String(b.id)); },
    'add-person': b => {
      const name = need(b.name, 'Prénom manquant'), id = `${slug(name) || 'p'}-${sfx()}`;
      db.people.push({ id, name, role: String(b.role || '').trim(), kind: PEOPLE_KINDS.includes(b.kind) ? b.kind : 'Proches', position: db.people.length });
      return { id };
    },
    'delete-person': b => { db.people = db.people.filter(p => p.id !== b.id); },
    'save-plan': b => { db.patient.daily_plan = String(b.plan || ''); },
    'save-settings': b => { db.patient.settings = { reco: b.reco !== false, sens: Math.min(1.6, Math.max(0.5, Number(b.sens) || 1)), swap: !!b.swap }; },
    'change-pin': b => { if ((b.pin || '').length < 4) throw new DemoError(400, 'Au moins 4 caractères'); db.patient.admin_pin = b.pin; },
    'rotate-device-key': () => { deviceKey = sfx() + sfx(); return { key: deviceKey }; },
  };

  /** Même contrat que fetch('/api/…') : renvoie les données ou lève une erreur portant .status. */
  async function request(method, path, body = {}, { key = deviceKey } = {}) {
    const url = new URL(path, 'http://demo');
    const fn = url.pathname.replace(/^\/api\//, ''), action = url.searchParams.get('action');
    if (key !== deviceKey) throw new DemoError(401, 'Appareil non reconnu');
    let out;
    if (fn === 'admin') {
      if (!session) throw new DemoError(403, 'Session soignant requise');
      if (method !== 'POST' || !admin[action]) throw new DemoError(404, 'Action inconnue');
      out = { ok: true, ...(admin[action](body || {}) || {}) };
    } else {
      const route = routes[`${method} ${fn}/${action}`];
      if (!route) throw new DemoError(404, 'Action inconnue');
      out = route(body || {});
    }
    if (method === 'POST') persist();
    return JSON.parse(JSON.stringify(out));
  }

  return { request, reset: () => { db = freshDb(withExamples); session = false; persist(); } };
}
