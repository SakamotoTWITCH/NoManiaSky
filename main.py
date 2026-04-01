from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import threading
import webbrowser


ROOT = Path(__file__).resolve().parent


class SilentHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        return


def find_free_port(start_port=8765, max_attempts=30):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("Nenhuma porta livre encontrada.")


def main():
    port = find_free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), SilentHandler)
    url = f"http://127.0.0.1:{port}/index.html"

    print(f"Servidor iniciado em {url}")
    print("Feche esta janela ou pressione Ctrl+C para encerrar.")

    threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
