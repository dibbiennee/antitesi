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

// ============================================================
// ARCHIVIO: i dati stanno nel repo, non in un magazzino esterno
// ============================================================
//
// Prima vivevano su Vercel Blob. Ogni lettura faceva una list(), che Vercel
// conta come "operazione avanzata": tre per ogni visitatore del sito, con
// 2.000 al mese incluse nel piano. Il 18 settembre il magazzino e' stato
// sospeso e il pannello ha smesso di salvare.
//
// Sono tre file di testo per 3 KB scarsi. Stanno meglio nel repo: leggerli
// non costa niente, scriverli e' un commit, e ogni modifica resta nello
// storico, quindi una cancellazione si recupera.

const REPO = 'dibbiennee/antitesi';
const RAMO = 'main';

function gettone() {
  const g = process.env.TOKEN_GITHUB_DISPATCH;
  if (!g) throw new Error('manca TOKEN_GITHUB_DISPATCH fra le variabili del progetto');
  return g;
}

function intestazioni() {
  return {
    Authorization: `Bearer ${gettone()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'antitesi-api',
  };
}

// Lettura: il file e' gia' servito dal sito, quindi lo si prende da li'.
// Costa zero e non tocca nessun limite. Dopo un salvataggio resta indietro
// il tempo del deploy, una trentina di secondi: per quella finestra il
// pannello preferisce la copia che ha appena scritto.
export async function leggiJson(percorso, req) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const r = await fetch(`${proto}://${req.headers.host}/${percorso}`, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch (_) { /* si prova GitHub */ }

  // Ripiego: direttamente dal repo, se il sito non sa rispondere a se stesso.
  try {
    const r = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${percorso}?ref=${RAMO}`,
      { headers: intestazioni(), cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      return JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
    }
  } catch (_) { /* niente */ }

  return null;
}

async function shaAttuale(percorso) {
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${percorso}?ref=${RAMO}`,
    { headers: intestazioni(), cache: 'no-store' });
  if (r.status === 404) return null;         // file nuovo
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status} leggendo ${percorso}`);
  return (await r.json()).sha;
}

// Scrittura: un commit. Se nel frattempo qualcun altro ha scritto lo stesso
// file, GitHub rifiuta con 409: si rilegge e si riprova una volta sola.
export async function scriviFile(percorso, contenutoBase64, messaggio) {
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const sha = await shaAttuale(percorso);
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${percorso}`, {
      method: 'PUT',
      headers: { ...intestazioni(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messaggio,
        content: contenutoBase64,
        branch: RAMO,
        ...(sha ? { sha } : {}),
      }),
    });

    if (r.ok) return await r.json();
    if (r.status === 409 && tentativo === 0) continue;   // scritture incrociate
    throw new Error(`GitHub ha risposto ${r.status} scrivendo ${percorso}: ${(await r.text()).slice(0, 200)}`);
  }
}

export async function scriviJson(percorso, dati, messaggio) {
  const testo = JSON.stringify(dati, null, 2) + '\n';
  return scriviFile(percorso, Buffer.from(testo, 'utf8').toString('base64'), messaggio);
}

export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return null; }
  }
  return body;
}
