// Côté tablette d'Anna : lecture de la banque + enregistrement des réponses et des échanges.
// GET  /api/data?action=bootstrap
// POST /api/data?action=events        { events: [{ key, theme, answer, ms, at }] }
// POST /api/data?action=conversation  { id, theme, path, result, n, dur, urgent, at }
// POST /api/data?action=note          { conversationId, question, answer }
import { sql } from '../lib/db.js';
import { getPatient, isAdmin } from '../lib/auth.js';
import { loadBootstrap, privateScopes } from '../lib/repo.js';
import { send, handle, HttpError, str, int } from '../lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULTS = new Set(['resolu', 'non-trouve', 'message', 'parole']);

// Horodatage fourni par la tablette (file d'attente hors ligne), borné à 7 jours en arrière.
function when(at) {
  const t = Number(at);
  const now = Date.now();
  return new Date(Number.isFinite(t) && t > now - 7 * 864e5 && t < now + 300e3 ? t : now).toISOString();
}

export default handle(async (req, res) => {
  const patient = await getPatient(req);
  if (!patient) throw new HttpError(401, 'Appareil non reconnu');
  const action = req.query.action;

  if (req.method === 'GET' && action === 'bootstrap') {
    return send(res, 200, await loadBootstrap(patient, isAdmin(req, patient.id)));
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée');
  const b = req.body || {};
  const priv = await privateScopes(patient.id);

  if (action === 'events') {
    const events = (Array.isArray(b.events) ? b.events : []).slice(0, 200)
      .map(e => ({ key: str(e.key, 200), theme: str(e.theme, 80), answer: e.answer, ms: int(e.ms, 0, 600000), at: when(e.at) }))
      .filter(e => ['oui', 'non', 'parler'].includes(e.answer) && !priv.theme(e.theme) && !priv.question(e.key));
    if (events.length) {
      await sql.transaction(events.map(e => sql`
        INSERT INTO answer_events (patient_id, question_key, theme_id, answer, response_ms, created_at)
        VALUES (${patient.id}, ${e.key}, ${e.theme}, ${e.answer}, ${e.ms}, ${e.at})`));
    }
    return send(res, 200, { saved: events.length });
  }

  if (action === 'conversation') {
    if (!UUID.test(b.id || '')) throw new HttpError(400, 'Identifiant invalide');
    const theme = str(b.theme, 80);
    if (!RESULTS.has(b.result)) throw new HttpError(400, 'Résultat invalide');
    const path = (Array.isArray(b.path) ? b.path : []).slice(0, 10).map(p => str(p, 200));
    if (!path.length) throw new HttpError(400, 'Chemin vide');
    // Un thème privé n'est jamais enregistré, même si la tablette l'envoyait par erreur.
    if (priv.theme(theme)) return send(res, 200, { saved: 0 });
    await sql`
      INSERT INTO conversations (id, patient_id, theme_id, path, result, questions_count, duration_ms, is_urgent, created_at)
      VALUES (${b.id}, ${patient.id}, ${theme}, ${path}, ${b.result}, ${int(b.n, 0, 500)}, ${int(b.dur, 0, 36e5)}, ${!!b.urgent}, ${when(b.at)})
      ON CONFLICT (id) DO NOTHING`;
    return send(res, 200, { saved: 1 });
  }

  if (action === 'note') {
    if (!UUID.test(b.conversationId || '')) throw new HttpError(400, 'Identifiant invalide');
    if (!['oui', 'non'].includes(b.answer)) throw new HttpError(400, 'Réponse invalide');
    const rows = await sql`
      INSERT INTO conversation_notes (conversation_id, question, answer)
      SELECT ${b.conversationId}, ${str(b.question, 300)}, ${b.answer}
      WHERE EXISTS (SELECT 1 FROM conversations WHERE id = ${b.conversationId} AND patient_id = ${patient.id})
      RETURNING id`;
    return send(res, 200, { saved: rows.length });
  }

  throw new HttpError(404, 'Action inconnue');
});
