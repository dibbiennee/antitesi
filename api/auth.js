import { authed, bloccato, attesaResidua } from './_lib.js';

// Verifica la password del pannello senza toccare i dati.
// Serve a dare un esito immediato al login, invece di scoprire
// che la password e' sbagliata solo al primo salvataggio.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (bloccato(req)) {
    const attesa = attesaResidua(req);
    res.setHeader('Retry-After', String(attesa));
    return res.status(429).json({ error: 'too many attempts', attesa });
  }

  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ ok: true });
}
