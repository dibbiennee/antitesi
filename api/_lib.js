import { list, put } from '@vercel/blob';

// Auth: shared secret passed as Bearer token (the panel lives at a secret URL).
export function authed(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return !!tok && !!process.env.ADMIN_TOKEN && tok === process.env.ADMIN_TOKEN;
}

// Read a JSON blob; fall back to a static file served by the site if missing.
export async function readJson(pathname, fallbackPath, req) {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 10 });
    const hit = blobs.find(b => b.pathname === pathname);
    if (hit) {
      const r = await fetch(hit.url, { cache: 'no-store' });
      if (r.ok) return await r.json();
    }
  } catch (_) { /* ignore, try fallback */ }

  if (fallbackPath && req) {
    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const r = await fetch(`${proto}://${req.headers.host}${fallbackPath}`, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (_) { /* ignore */ }
  }
  return null;
}

export async function writeJson(pathname, data) {
  return put(pathname, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return null; }
  }
  return body;
}
