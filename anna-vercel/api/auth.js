// Code soignant : création au premier accès, connexion (essais limités), déconnexion.
// GET  /api/auth?action=status
// POST /api/auth?action=setup | login   { pin }
// POST /api/auth?action=logout
import { sql } from '../lib/db.js';
import { getPatient, isAdmin, hashPin, verifyPin, sessionCookie, clearCookie, clientIp } from '../lib/auth.js';
import { send, handle, HttpError, str } from '../lib/http.js';

const MAX_FAILS = 8;          // essais ratés autorisés…
const WINDOW = '15 minutes';  // …par appareil et par adresse IP sur cette fenêtre

export default handle(async (req, res) => {
  const patient = await getPatient(req);
  if (!patient) throw new HttpError(401, 'Appareil non reconnu');
  const action = req.query.action;

  if (req.method === 'GET' && action === 'status') {
    return send(res, 200, { hasPin: !!patient.admin_pin_hash, isAdmin: isAdmin(req, patient.id) });
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée');

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearCookie());
    return send(res, 200, { ok: true });
  }

  const pin = str(req.body?.pin, 64);
  if (pin.length < 4) throw new HttpError(400, 'Au moins 4 caractères');

  if (action === 'setup') {
    // Seulement si aucun code n'existe : on ne peut pas écraser un code existant sans être connecté.
    const rows = await sql`UPDATE patients SET admin_pin_hash = ${hashPin(pin)}
                           WHERE id = ${patient.id} AND admin_pin_hash IS NULL RETURNING id`;
    if (!rows.length) throw new HttpError(409, 'Un code existe déjà');
    res.setHeader('Set-Cookie', sessionCookie(patient.id));
    return send(res, 200, { ok: true });
  }

  if (action === 'login') {
    const ip = clientIp(req);
    const [{ fails }] = await sql`SELECT count(*)::int AS fails FROM auth_attempts
                                  WHERE patient_id = ${patient.id} AND ip = ${ip} AND NOT ok
                                    AND created_at > now() - ${WINDOW}::interval`;
    if (fails >= MAX_FAILS) throw new HttpError(429, 'Trop d’essais, réessaie dans 15 minutes');
    const ok = !!patient.admin_pin_hash && verifyPin(pin, patient.admin_pin_hash);
    await sql`INSERT INTO auth_attempts (patient_id, ip, ok) VALUES (${patient.id}, ${ip}, ${ok})`;
    if (!ok) throw new HttpError(401, 'Code incorrect');
    res.setHeader('Set-Cookie', sessionCookie(patient.id));
    return send(res, 200, { ok: true });
  }

  throw new HttpError(404, 'Action inconnue');
});
