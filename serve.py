#!/usr/bin/env python3
"""A tiny local web server for Pengeflyt.

Browsers don't load JavaScript modules from file:// addresses, so the app has to be
served over http while you work on it. No installs needed - Python 3 is enough.

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
        # The standard server looks up the computer's host name here (a reverse DNS
        # lookup) just for log messages; on some networks that hangs, so skip it.
        socketserver.TCPServer.server_bind(self)
        self.server_name = "localhost"
        self.server_port = self.server_address[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    # Some systems map .js to text/plain, which browsers refuse to run as a module.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
    }

    def end_headers(self):
        # Always serve the latest files, so a reload shows your newest changes.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(Handler, directory=root)
    with Server(("127.0.0.1", port), handler) as server:
        print(f"Pengeflyt is running at http://localhost:{port}")
        print(f"Unit tests:            http://localhost:{port}/tests/")
        print("Press Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
