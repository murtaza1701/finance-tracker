#!/usr/bin/env python3
"""En liten lokal webserver for Pengeflyt.

Nettlesere laster ikke JavaScript-moduler fra file://-adresser, så appen må serveres
over http mens du jobber med den. Ingenting må installeres – Python 3 holder.

    python3 serve.py          ->  http://localhost:8000
    python3 serve.py 3000     ->  http://localhost:3000
"""
import functools
import http.server
import os
import socketserver
import sys


class Server(http.server.ThreadingHTTPServer):
    def server_bind(self):
        # Standardserveren slår opp maskinens navn her (omvendt DNS-oppslag) bare for
        # loggmeldinger; på noen nettverk henger det, så hopp over det.
        socketserver.TCPServer.server_bind(self)
        self.server_name = "localhost"
        self.server_port = self.server_address[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    # Noen systemer sender .js som text/plain, og det nekter nettlesere å kjøre som modul.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
    }

    def end_headers(self):
        # Send alltid de nyeste filene, så en omlasting viser de siste endringene.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)
    with Server(("127.0.0.1", port), handler) as server:
        print(f"Pengeflyt kjører på http://localhost:{port}")
        print(f"Enhetstester:          http://localhost:{port}/tests/")
        print("Trykk Ctrl+C for å stoppe.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
