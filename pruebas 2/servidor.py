#!/usr/bin/env python3
"""Servidor estático del banco de pruebas de ARIZA SAT, puerto 8899."""
import http.server, socketserver, os

PUERTO = 8899
RAIZ = os.path.dirname(os.path.abspath(__file__))

class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', PUERTO), Manejador) as s:
    print('servidor en http://127.0.0.1:%d' % PUERTO, flush=True)
    s.serve_forever()
