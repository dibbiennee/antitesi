import { put } from '@vercel/blob';
import { authed, readBody } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = readBody(req) || {};
  const { filename, dataUrl } = body;
  if (!filename || !dataUrl) return res.status(400).json({ error: 'missing filename or dataUrl' });

  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl));
  if (!m) return res.status(400).json({ error: 'bad dataUrl' });

  const contentType = m[1];
  if (!/^image\//.test(contentType) && !/^audio\//.test(contentType)) {
    return res.status(415).json({ error: 'only image or audio allowed' });
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6_000_000) return res.status(413).json({ error: 'file too large (max ~6MB)' });

  const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'file';
  const blob = await put(`uploads/${safe}`, buf, {
    access: 'public',
    addRandomSuffix: true,
    contentType,
  });
  return res.status(200).json({ url: blob.url });
}
