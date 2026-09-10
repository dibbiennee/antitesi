import { authed, readJson, writeJson, readBody } from './_lib.js';

const str = v => (v == null ? '' : String(v).trim());

function cleanEvent(e) {
  if (!e || !str(e.date)) return null;
  const out = { date: str(e.date) };
  if (str(e.endDate)) out.endDate = str(e.endDate);
  if (str(e.title)) out.title = str(e.title);
  if (str(e.venue)) out.venue = str(e.venue);
  if (str(e.city)) out.city = str(e.city);
  if (str(e.poster)) out.poster = str(e.poster);
  if (str(e.ig_link)) out.ig_link = str(e.ig_link);
  if (str(e.tiktok_link)) out.tiktok_link = str(e.tiktok_link);
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readJson('data/events.json', '/events.json', req);
    return res.status(200).json(Array.isArray(data) ? data : []);
  }

  if (req.method === 'POST') {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const body = readBody(req);
    if (!Array.isArray(body)) return res.status(400).json({ error: 'expected array of events' });
    const clean = body.map(cleanEvent).filter(Boolean);
    await writeJson('data/events.json', clean);
    return res.status(200).json({ ok: true, count: clean.length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
