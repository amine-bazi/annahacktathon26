import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { sql } from './db.js';

const COOKIE = 'anna_admin';
const SESSION_MS = 8 * 3600e3;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET manquant ou trop court (32 caractères minimum).');
  return s;
}

export const hashDeviceKey = key => createHash('sha256').update(String(key)).digest('hex');
export const newDeviceKey = () => randomBytes(24).toString('base64url');

export function hashPin(pin) {
  const salt = randomBytes(16);
  return `s1$${salt.toString('hex')}$${scryptSync(pin, salt, 32).toString('hex')}`;
}
export function verifyPin(pin, stored) {
  const [v, salt, hash] = String(stored || '').split('$');
  if (v !== 's1' || !salt || !hash) return false;
  const calc = scryptSync(String(pin), Buffer.from(salt, 'hex'), 32);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === calc.length && timingSafeEqual(calc, ref);
}

/** Identifie la personne accompagnée à partir de la clé d'appareil (en-tête x-device-key). */
export async function getPatient(req) {
  const key = req.headers['x-device-key'];
  if (!key || key.length > 200) return null;
  const rows = await sql`SELECT id, display_name, admin_pin_hash, daily_plan, settings
                         FROM patients WHERE device_key_hash = ${hashDeviceKey(key)}`;
  return rows[0] || null;
}

const sign = payload => createHmac('sha256', secret()).update(payload).digest('base64url');

export function sessionCookie(patientId) {
  const payload = `${patientId}.${Date.now() + SESSION_MS}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** Vrai si la requête porte une session soignant valide pour cette personne. */
export function isAdmin(req, patientId) {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return false;
  const [pid, exp, sig] = raw.split('.');
  if (pid !== patientId || !exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(`${pid}.${exp}`);
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
