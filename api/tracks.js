import { authed, leggiJson, scriviJson, readBody } from './_lib.js';

const str = v => (v == null ? '' : String(v).trim());
const slug = s => str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function cleanTrack(t, i) {
  if (!t || !str(t.title)) return null;
  const out = { id: str(t.id) || slug(t.title) || ('track-' + i), title: str(t.title) };
  if (str(t.label)) out.label = str(t.label);
  if (str(t.date)) out.date = str(t.date);
  if (str(t.cover)) out.cover = str(t.cover);
  if (str(t.link)) out.link = str(t.link);
  if (str(t.clip)) out.clip = str(t.clip);
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await leggiJson('tracks.json', req);
    return res.status(200).json(Array.isArray(data) ? data : []);
  }

  if (req.method === 'POST') {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const body = readBody(req);
    if (!Array.isArray(body)) return res.status(400).json({ error: 'expected array of tracks' });
    const clean = body.map(cleanTrack).filter(Boolean);
    await scriviJson('tracks.json', clean,
      'Aggiorna tracce dal pannello');
    return res.status(200).json({ ok: true, count: clean.length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
