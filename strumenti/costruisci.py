# -*- coding: utf-8 -*-
"""
Costruzione del sito Antitesi.

La pagina e' scritta per essere disegnata dal browser: date, tracce e
contenuti arrivano da JavaScript al caricamento. Comodo per sviluppare, ma
chi legge il sorgente senza eseguire il codice non ci trova niente. Google
in genere esegue il codice, i crawler delle intelligenze artificiali spesso
no: leggono il sorgente e basta.

Questo script apre la pagina con Chrome, aspetta che il codice abbia finito
e salva l'HTML risultante al posto del guscio. Il codice resta dentro,
quindi al caricamento ridisegna sopra lo stesso contenuto, con le date
aggiornate al giorno in cui si guarda.

    python3 strumenti/costruisci.py
    python3 strumenti/costruisci.py --prova    (non salva, mostra soltanto)

Da rilanciare prima di ogni pubblicazione, e ogni volta che si cambiano le
date dal pannello: quelle finiscono su Blob, non nel sorgente salvato qui.
"""

import functools
import http.server
import io
import os
import re
import socket
import subprocess
import sys
import threading
import urllib.error
import urllib.request

RADICE = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# I dati veri stanno su Vercel Blob, non nei file del repo: durante la
# costruzione le chiamate all'API vengono inoltrate alla produzione.
PRODUZIONE = 'https://antitesi.link'

# indirizzo -> file da riscrivere
PAGINE = [('/', 'index.html')]

MINIMO = 300          # caratteri di testo che devono comparire nel sorgente


# ------------------------------------------------------------------ #
# server di appoggio: si comporta come Vercel con cleanUrls e inoltra l'API
# ------------------------------------------------------------------ #

class Servitore(http.server.SimpleHTTPRequestHandler):

    def translate_path(self, path):
        p = super().translate_path(path.split('?')[0].split('#')[0])
        if os.path.isdir(p):
            i = os.path.join(p, 'index.html')
            if os.path.isfile(i):
                return i
        if not os.path.exists(p) and os.path.isfile(p + '.html'):
            return p + '.html'
        return p

    def do_GET(self):
        if self.path.startswith('/api/'):
            return self.inoltra()
        return super().do_GET()

    def inoltra(self):
        """Gira la richiesta alla produzione, cosi' il sorgente salvato
        contiene i dati veri e non quelli fermi nei file del repo."""
        try:
            with urllib.request.urlopen(PRODUZIONE + self.path, timeout=20) as r:
                corpo, tipo, codice = r.read(), r.headers.get('Content-Type', ''), r.status
        except urllib.error.HTTPError as e:
            corpo, tipo, codice = e.read(), 'application/json', e.code
        except Exception as e:
            print('  API non raggiungibile (%s): %s' % (self.path, e))
            corpo, tipo, codice = b'{}', 'application/json', 502

        self.send_response(codice)
        self.send_header('Content-Type', tipo or 'application/json')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def log_message(self, *a):
        pass


def porta_libera():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ------------------------------------------------------------------ #
# resa con Chrome
# ------------------------------------------------------------------ #

def rendi(url):
    """
    Niente --user-data-dir: con un profilo indicato a mano Chrome resta
    appeso e non esce mai. Senza, se ne crea uno usa e getta, che e' anche
    quello che serve: nessuna lingua scelta in una costruzione precedente.
    """
    fuori = subprocess.run(
        [CHROME, '--headless', '--disable-gpu', '--dump-dom',
         '--lang=it-IT', '--accept-lang=it-IT,it',
         '--virtual-time-budget=12000', url],
        capture_output=True, text=True, timeout=120)
    if fuori.returncode != 0:
        raise SystemExit('Chrome ha fallito su %s\n%s' % (url, fuori.stderr[:400]))
    return fuori.stdout


def ripulisci(html):
    """
    Tre correzioni sul risultato della resa.

    1. Le barrette del lettore audio le costruisce il codice, sono decine di
       div identici: nel sorgente sono solo rumore, e il codice le rifa'.
    2. La classe is-visible e i ritardi delle animazioni vengono tolti, cosi'
       chi apre il sito rivede la comparsa in dissolvenza. Il testo resta nel
       sorgente comunque: e' li' che guardano i crawler.
    3. Il doctype deve restare in cima.
    """
    html = re.sub(r'<div class="preview-bar"[^>]*></div>', '', html)
    html = re.sub(r'\s*style="transition-delay:\s*[\d.]+ms;?"', '', html)
    html = re.sub(r'(<[^>]*?class="[^"]*?)\s*is-visible([^"]*")', r'\1\2', html)
    html = re.sub(r'class="(\s+)', 'class="', html)

    # senza questo ogni costruzione aggiunge una riga vuota alla precedente
    html = re.sub(r'\n{3,}', '\n\n', html)

    if not html.lstrip().lower().startswith('<!doctype'):
        html = '<!doctype html>\n' + html
    return html.rstrip() + '\n'


def testo_visibile(html):
    corpo = re.sub(r'<script.*?</script>', '', html, flags=re.S)
    corpo = re.sub(r'<style.*?</style>', '', corpo, flags=re.S)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', corpo)).strip()


def controlla(html, testo):
    """Il sorgente salvato deve essere in italiano, pieno e senza rumore."""
    guai = []

    if len(testo) < MINIMO:
        guai.append('solo %d caratteri di testo (ne servono %d)' % (len(testo), MINIMO))

    if 'lang="it"' not in html:
        guai.append('non e\' in italiano')

    # la sezione date deve essere stata disegnata, in un modo o nell'altro
    if 'events-empty' not in html and 'event-card' not in html:
        guai.append('la sezione date e\' rimasta vuota: il codice non ha girato')

    if re.search(r'<div class="preview-bar"', html):
        guai.append('barrette del lettore rimaste dentro')

    if re.search(r'class="[^"]*\bis-visible\b', html):
        guai.append('classi di animazione rimaste dentro')

    return guai


def main():
    prova = '--prova' in sys.argv

    if not os.path.isfile(CHROME):
        raise SystemExit('Chrome non trovato in %s' % CHROME)

    porta = porta_libera()
    servitore = http.server.ThreadingHTTPServer(
        ('127.0.0.1', porta), functools.partial(Servitore, directory=RADICE))
    threading.Thread(target=servitore.serve_forever, daemon=True).start()
    print('server di appoggio sulla porta %d, API inoltrata a %s' % (porta, PRODUZIONE))

    problemi = []
    try:
        for indirizzo, file_uscita in PAGINE:
            html = ripulisci(rendi('http://127.0.0.1:%d%s' % (porta, indirizzo)))
            testo = testo_visibile(html)
            guai = controlla(html, testo)

            if guai:
                problemi.append((indirizzo, guai))
                print('  %-14s %6d car.  NON SALVATA' % (indirizzo, len(testo)))
                continue

            if prova:
                print('  %-14s %6d car.  (prova, non salvata)' % (indirizzo, len(testo)))
                continue

            io.open(os.path.join(RADICE, file_uscita), 'w', encoding='utf-8').write(html)
            print('  %-14s %6d car.' % (indirizzo, len(testo)))
    finally:
        servitore.shutdown()

    if problemi:
        print('\nATTENZIONE, pagine non salvate:')
        for indirizzo, guai in problemi:
            print('  %s: %s' % (indirizzo, '; '.join(guai)))
        return 1

    print('\n%d pagina costruita.' % len(PAGINE))
    return 0


if __name__ == '__main__':
    sys.exit(main())
