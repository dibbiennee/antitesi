import { authed } from './_lib.js';

// Le date vivono su Blob, il sorgente salvato no: dopo un salvataggio dal
// pannello le persone vedono subito la serata nuova, ma chi legge il
// sorgente senza eseguire il codice continuerebbe a leggere "nessuna data
// in programma". Questo endpoint sveglia il workflow su GitHub, che rifa'
// la costruzione con Chrome e pubblica.
//
// Il gettone di GitHub sta fra le variabili d'ambiente del progetto, mai
// nel codice. Se manca, l'endpoint lo dice invece di fallire di nascosto.

const REPO = 'dibbiennee/antitesi';
const EVENTO = 'date-aggiornate';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });

  const gettone = process.env.TOKEN_GITHUB_DISPATCH;
  if (!gettone) return res.status(501).json({ error: 'ricostruzione non configurata' });

  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gettone}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'antitesi-pannello',
      },
      body: JSON.stringify({ event_type: EVENTO }),
    });

    if (!r.ok) {
      const dettaglio = await r.text();
      return res.status(502).json({ error: `github ha risposto ${r.status}`, dettaglio: dettaglio.slice(0, 200) });
    }
  } catch (err) {
    return res.status(502).json({ error: 'github non raggiungibile: ' + err.message });
  }

  return res.status(202).json({ ok: true });
}
