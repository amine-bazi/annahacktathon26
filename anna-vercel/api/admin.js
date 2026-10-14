// Espace soignant : édition de la banque de questions, des personnes et des réglages.
// Toutes les actions exigent une session soignant (cookie signé posé par /api/auth).
// POST /api/admin?action=<action>   { ...paramètres }
import { randomBytes } from 'node:crypto';
import { sql } from '../lib/db.js';
import { getPatient, isAdmin, hashPin, newDeviceKey, hashDeviceKey } from '../lib/auth.js';
import { slug, PEOPLE_KINDS } from '../lib/content.js';
import { send, handle, HttpError, str, int } from '../lib/http.js';

const suffix = () => randomBytes(3).toString('hex');

// Position suivante dans une liste (les noms de table sont figés dans le code, jamais issus de la requête).
const POSITION = {
  questions: (pid, scope) => sql`SELECT coalesce(max(position) + 1, 0)::int AS p FROM questions WHERE patient_id = ${pid} AND coalesce(parent_id, '§' || theme_id) = ${scope}`,
  themes: pid => sql`SELECT coalesce(max(position) + 1, 0)::int AS p FROM themes WHERE patient_id = ${pid}`,
  question_types: pid => sql`SELECT coalesce(max(position) + 1, 0)::int AS p FROM question_types WHERE patient_id = ${pid}`,
  followups: (pid, scope) => sql`SELECT coalesce(max(position) + 1, 0)::int AS p FROM followups WHERE patient_id = ${pid} AND theme_id = ${scope}`,
  people: pid => sql`SELECT coalesce(max(position) + 1, 0)::int AS p FROM people WHERE patient_id = ${pid}`,
};
async function nextPosition(table, patientId, scope) {
  return (await POSITION[table](patientId, scope))[0].p;
}

const actions = {
  async 'add-question'(p, b) {
    const themeId = str(b.themeId, 80);
    const parentId = str(b.parentId, 200, { optional: true }) || null;
    const label = str(b.label, 60);
    const raw = str(b.text, 300);
    const kind = ['question', 'ask', 'say'].includes(b.kind) ? b.kind : 'question';
    const [theme] = await sql`SELECT id FROM themes WHERE patient_id = ${p.id} AND id = ${themeId}`;
    if (!theme) throw new HttpError(404, 'Thème introuvable');
    if (parentId) {
      const [parent] = await sql`SELECT id FROM questions WHERE patient_id = ${p.id} AND id = ${parentId} AND theme_id = ${themeId}`;
      if (!parent) throw new HttpError(404, 'Question parente introuvable');
    }
    const text = kind === 'ask' ? `Demander : « ${raw} »` : kind === 'say' ? `Dire : « ${raw} »` : raw;
    const id = `${parentId || themeId}.${slug(label) || 'q'}-${suffix()}`;
    const position = await nextPosition('questions', p.id, parentId || '§' + themeId);
    await sql`INSERT INTO questions (patient_id, id, theme_id, parent_id, label, text, kind, ask_text, is_urgent, has_intensity, position)
              VALUES (${p.id}, ${id}, ${themeId}, ${parentId}, ${label}, ${text}, ${kind}, ${kind === 'question' ? null : raw},
                      ${!!b.urgent}, ${kind === 'question' && !!b.intensity}, ${position})`;
    return { id };
  },
  async 'delete-question'(p, b) {
    // Les sous-questions partent avec (clé étrangère en cascade). Les statistiques passées restent.
    await sql`DELETE FROM questions WHERE patient_id = ${p.id} AND id = ${str(b.id, 200)}`;
  },
  async 'add-theme'(p, b) {
    const label = str(b.label, 60);
    const typeId = str(b.typeId, 80);
    const id = `${slug(label) || 'theme'}-${suffix()}`;
    await sql`INSERT INTO themes (patient_id, id, type_id, label, is_private, position)
              VALUES (${p.id}, ${id}, ${typeId}, ${label}, ${!!b.private}, ${await nextPosition('themes', p.id)})`;
    return { id };
  },
  async 'add-type'(p, b) {
    const name = str(b.name, 40);
    const id = `${slug(name) || 'type'}-${suffix()}`;
    const hue = [...name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
    await sql`INSERT INTO question_types (patient_id, id, name, short_label, hue, position)
              VALUES (${p.id}, ${id}, ${name}, ${name.slice(0, 14)}, ${hue}, ${await nextPosition('question_types', p.id)})`;
    return { id };
  },
  async 'delete-type'(p, b) {
    const id = str(b.id, 80);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM themes WHERE patient_id = ${p.id} AND type_id = ${id}`;
    if (n) throw new HttpError(409, 'Ce type contient encore des thèmes');
    await sql`DELETE FROM question_types WHERE patient_id = ${p.id} AND id = ${id}`;
  },
  async 'add-followup'(p, b) {
    const themeId = str(b.themeId, 80);
    await sql`INSERT INTO followups (patient_id, theme_id, text, position)
              VALUES (${p.id}, ${themeId}, ${str(b.text, 300)}, ${await nextPosition('followups', p.id, themeId)})`;
  },
  async 'delete-followup'(p, b) {
    await sql`DELETE FROM followups WHERE patient_id = ${p.id} AND id = ${int(b.id, 1, Number.MAX_SAFE_INTEGER, -1)}`;
  },
  async 'add-person'(p, b) {
    const name = str(b.name, 60);
    const kind = PEOPLE_KINDS.includes(b.kind) ? b.kind : 'Proches';
    const id = `${slug(name) || 'p'}-${suffix()}`;
    await sql`INSERT INTO people (patient_id, id, name, role, kind, position)
              VALUES (${p.id}, ${id}, ${name}, ${str(b.role, 80, { optional: true })}, ${kind}, ${await nextPosition('people', p.id)})`;
    return { id };
  },
  async 'delete-person'(p, b) {
    await sql`DELETE FROM people WHERE patient_id = ${p.id} AND id = ${str(b.id, 80)}`;
  },
  async 'save-plan'(p, b) {
    await sql`UPDATE patients SET daily_plan = ${str(b.plan, 4000, { optional: true })} WHERE id = ${p.id}`;
  },
  async 'save-settings'(p, b) {
    const settings = { reco: b.reco !== false, sens: Math.min(1.6, Math.max(0.5, Number(b.sens) || 1)), swap: !!b.swap, cam: b.cam === 'user' ? 'user' : 'environment' };
    await sql`UPDATE patients SET settings = ${JSON.stringify(settings)}::jsonb WHERE id = ${p.id}`;
  },
  async 'change-pin'(p, b) {
    const pin = str(b.pin, 64);
    if (pin.length < 4) throw new HttpError(400, 'Au moins 4 caractères');
    await sql`UPDATE patients SET admin_pin_hash = ${hashPin(pin)} WHERE id = ${p.id}`;
  },
  async 'rotate-device-key'(p) {
    // Révoque tous les appareils reliés : chacun devra rouvrir le nouveau lien d'installation.
    const key = newDeviceKey();
    await sql`UPDATE patients SET device_key_hash = ${hashDeviceKey(key)} WHERE id = ${p.id}`;
    return { key };
  },
};

export default handle(async (req, res) => {
  const patient = await getPatient(req);
  if (!patient) throw new HttpError(401, 'Appareil non reconnu');
  if (!isAdmin(req, patient.id)) throw new HttpError(403, 'Session soignant requise');
  if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée');
  const fn = actions[req.query.action];
  if (!fn) throw new HttpError(404, 'Action inconnue');
  try {
    send(res, 200, { ok: true, ...(await fn(patient, req.body || {})) });
  } catch (e) {
    if (e.code === '23503') throw new HttpError(409, 'Élément lié introuvable');   // clé étrangère
    if (e.code === '23505') throw new HttpError(409, 'Cet élément existe déjà');  // unicité
    throw e;
  }
});
