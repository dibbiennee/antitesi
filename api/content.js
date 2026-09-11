import { authed, readJson, writeJson, readBody } from './_lib.js';

// Whitelisted shape so the panel can only set known fields.
function cleanContent(b) {
  b = b || {};
  const s = v => (v == null ? '' : String(v).trim());
  const photos = b.photos || {};
  const links = b.links || {};
  const booking = b.booking || {};
  const zaya = b.zaya || {};
  const bio = b.bio || {};
  return {
    tagline: s(b.tagline),
    bio: { it: s(bio.it), en: s(bio.en) },
    photos: {
      profile: s(photos.profile),
      hero: s(photos.hero),
      backdrop: s(photos.backdrop),
      zayaCover: s(photos.zayaCover),
    },
    links: {
      youtube: s(links.youtube),
      spotify: s(links.spotify),
      soundcloud: s(links.soundcloud),
      tiktok: s(links.tiktok),
      instagram: s(links.instagram),
      instagramHandle: s(links.instagramHandle),
    },
    booking: { email: s(booking.email) },
    zaya: {
      title: s(zaya.title),
      albumUrl: s(zaya.albumUrl),
      clipUrl: s(zaya.clipUrl),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readJson('data/content.json', '/content.json', req);
    return res.status(200).json(data && typeof data === 'object' ? data : {});
  }

  if (req.method === 'POST') {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const body = readBody(req);
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'expected object' });
    const clean = cleanContent(body);
    await writeJson('data/content.json', clean);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
