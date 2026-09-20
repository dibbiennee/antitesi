import { authed, bloccato, attesaResidua, scriviFile, readBody } from './_lib.js';

// Le locandine finiscono nel repo, in /locandine, e vengono servite come
// file statici del sito. Prima stavano su Vercel Blob, che e' stato sospeso
// per superamento dei limiti: ogni caricamento era un'operazione avanzata.
//
// Il corpo della richiesta viaggia in base64, che gonfia di un terzo, e
// Vercel accetta corpi fino a circa 4,5 MB: il limite qui sotto tiene conto
// di entrambe le cose. Il pannello comunque ridimensiona prima di mandare.
const MASSIMO = 3_000_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (bloccato(req)) {
    const attesa = attesaResidua(req);
    res.setHeader('Retry-After', String(attesa));
    return res.status(429).json({ error: 'too many attempts', attesa });
  }

  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = readBody(req) || {};
  const { filename, dataUrl } = body;
  if (!filename || !dataUrl) return res.status(400).json({ error: 'missing filename or dataUrl' });

  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl));
  if (!m) return res.status(400).json({ error: 'bad dataUrl' });

  const tipo = m[1];
  if (!/^image\//.test(tipo) && !/^audio\//.test(tipo)) {
    return res.status(415).json({ error: 'only image or audio allowed' });
  }

  const base64 = m[2];
  const byte = Math.floor(base64.length * 3 / 4);
  if (byte > MASSIMO) {
    return res.status(413).json({ error: `file troppo grande (${Math.round(byte / 1e6)} MB, massimo 3 MB)` });
  }

  // nome prevedibile ma non ripetibile, cosi' due locandine con lo stesso
  // nome non si sovrascrivono a vicenda
  const pulito = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50) || 'file';
  const suffisso = Math.random().toString(36).slice(2, 8);
  const punto = pulito.lastIndexOf('.');
  const nome = punto > 0
    ? `${pulito.slice(0, punto)}-${suffisso}${pulito.slice(punto)}`
    : `${pulito}-${suffisso}`;

  try {
    await scriviFile(`locandine/${nome}`, base64, `Carica la locandina ${nome}`);
  } catch (err) {
    return res.status(502).json({ error: 'caricamento non riuscito: ' + err.message });
  }

  // percorso relativo: il file viene servito dal sito stesso
  return res.status(200).json({ url: `/locandine/${nome}` });
}
