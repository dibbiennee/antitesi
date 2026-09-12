import { list, put } from '@vercel/blob';

// Blocco dei tentativi.
//
// Chi sbaglia la password piu' di TENTATIVI_MAX volte resta fuori fino a
// fine finestra. Il conteggio vive nella memoria dell'istanza, quindi vale
// finche' quella istanza resta calda e non e' condiviso fra le altre: ferma
// chi insiste da un browser, non un attacco distribuito. Quel lavoro lo fa
// la regola del firewall sul bordo, che butta via la richiesta prima che
// diventi un'invocazione.
const TENTATIVI_MAX = 5;
const FINESTRA = Number(process.env.AUTH_LOCK_WINDOW || 600) * 1000;
const tentativi = new Map();

function indirizzo(req) {
  const inoltrato = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return inoltrato || req.headers['x-real-ip'] || 'ignoto';
}

function scaduto(voce) {
  return !voce || (Date.now() - voce.da) > FINESTRA;
}

// Da chiamare prima di authed, per poter rispondere 429 invece di 401:
// a chi ha davvero sbagliato serve sapere che deve aspettare.
export function bloccato(req) {
  const ip = indirizzo(req);
  const voce = tentativi.get(ip);
  if (scaduto(voce)) {
    tentativi.delete(ip);
    return false;
  }
  return voce.n >= TENTATIVI_MAX;
}

export function attesaResidua(req) {
  const voce = tentativi.get(indirizzo(req));
  if (scaduto(voce)) return 0;
  return Math.ceil((FINESTRA - (Date.now() - voce.da)) / 1000);
}

// Auth: shared secret passed as Bearer token (the panel lives at a secret URL).
export function authed(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const atteso = process.env.ADMIN_TOKEN;
  const ip = indirizzo(req);

  if (bloccato(req)) return false;

  const ok = !!tok && !!atteso && tok === atteso;

  if (ok) {
    tentativi.delete(ip);
    return true;
  }

  const voce = tentativi.get(ip);
  if (scaduto(voce)) tentativi.set(ip, { n: 1, da: Date.now() });
  else voce.n += 1;

  return false;
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
