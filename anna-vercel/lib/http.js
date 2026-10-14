export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Texte obligatoire, nettoyé et borné. */
export function str(v, max = 300, { optional = false } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s && !optional) throw new HttpError(400, 'Champ manquant');
  if (s.length > max) throw new HttpError(400, 'Texte trop long');
  return s;
}

export const int = (v, min, max, dflt = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/** Enveloppe commune : erreurs métier → statut HTTP, le reste → 500 journalisé. */
export const handle = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Erreur serveur' });
  }
};
