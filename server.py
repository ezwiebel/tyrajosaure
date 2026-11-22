#!/usr/bin/env python3
"""Tyrajosaure : sert le site statique et une mini-API de stockage.

  GET /api/state  -> {"rev": n, "data": {...}}   (data = null si rien n'est enregistré)
  PUT /api/state  <- {"rev": n, "data": {...}}   (rev = révision sur laquelle on s'appuie)
                  -> 200 {"rev": n+1}  ou  409 + l'état actuel si quelqu'un a enregistré entre-temps

Aucune dépendance : uniquement la bibliothèque standard de Python.
"""

import json
import os
import threading
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUBLIC_DIR = Path(os.environ.get('PUBLIC_DIR', HERE / 'public'))
DATA_FILE = Path(os.environ.get('DATA_DIR', HERE / 'data')) / 'state.json'
PORT = int(os.environ.get('PORT', '8000'))
MAX_BODY = 512 * 1024  # largement assez pour quelques centaines de tirages

lock = threading.Lock()


def read_state():
    try:
        return json.loads(DATA_FILE.read_text('utf-8'))
    except FileNotFoundError:
        return {'rev': 0, 'data': None}


def write_state(state):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False), 'utf-8')
    os.replace(tmp, DATA_FILE)  # écriture atomique


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')  # toujours la dernière version du site
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/api/state':
            with lock:
                return self.send_json(HTTPStatus.OK, read_state())
        return super().do_GET()

    def do_PUT(self):
        if self.path.split('?')[0] != '/api/state':
            return self.send_json(HTTPStatus.NOT_FOUND, {'error': 'introuvable'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY:
            return self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {'error': 'taille invalide'})
        try:
            body = json.loads(self.rfile.read(length))
            rev, data = body['rev'], body['data']
            if not isinstance(rev, int) or not isinstance(data, dict):
                raise ValueError
        except (ValueError, KeyError, TypeError):
            return self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'JSON invalide'})

        with lock:
            current = read_state()
            if rev != current['rev']:
                return self.send_json(HTTPStatus.CONFLICT, current)
            new_rev = current['rev'] + 1
            write_state({'rev': new_rev, 'data': data})
        return self.send_json(HTTPStatus.OK, {'rev': new_rev})

    def log_message(self, fmt, *args):
        print(f'{self.address_string()} {fmt % args}', flush=True)


if __name__ == '__main__':
    print(f'Tyrajosaure sur le port {PORT} (données : {DATA_FILE})', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
