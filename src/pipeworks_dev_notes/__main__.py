"""Run module entrypoint."""

from __future__ import annotations

import os
import socket

import uvicorn

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
PORT_SCAN_LIMIT = 50


def _parse_port(value: str) -> int:
    """Parse and validate a TCP port number from string input."""

    try:
        port = int(value)
    except ValueError as exc:
        raise ValueError(f"Invalid port value '{value}'") from exc
    if not 1 <= port <= 65535:
        raise ValueError(f"Port out of range: {port}")
    return port


def _is_port_available(host: str, port: int) -> bool:
    """Return True when the host/port is currently bindable."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as candidate:
        candidate.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            candidate.bind((host, port))
        except OSError:
            return False
    return True


def find_available_port(
    host: str, requested_port: int, *, max_attempts: int = PORT_SCAN_LIMIT
) -> int:
    """Find the first available port starting from requested_port."""

    port = requested_port
    for _ in range(max_attempts):
        if port > 65535:
            break
        if _is_port_available(host, port):
            return port
        port += 1

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as fallback:
        fallback.bind((host, 0))
        return int(fallback.getsockname()[1])


def main() -> None:
    """Run the development server."""

    host = os.getenv("PIPEWORKS_DEV_NOTES_HOST", DEFAULT_HOST)
    requested_port = _parse_port(os.getenv("PIPEWORKS_DEV_NOTES_PORT", str(DEFAULT_PORT)))
    selected_port = find_available_port(host, requested_port)

    if selected_port != requested_port:
        print(f"Requested port {requested_port} unavailable; using {selected_port}.", flush=True)
    print(f"pipeworks-dev-notes running at http://{host}:{selected_port}", flush=True)

    uvicorn.run("pipeworks_dev_notes.app:app", host=host, port=selected_port, reload=True)


if __name__ == "__main__":
    main()
