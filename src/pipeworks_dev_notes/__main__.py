"""Run module entrypoint."""

from __future__ import annotations

import os
import socket
from copy import deepcopy
from typing import Any

import uvicorn
from uvicorn.config import LOGGING_CONFIG

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
PORT_SCAN_LIMIT = 50
SERVICE_LOG_LABEL = "dev-notes"


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


def _build_uvicorn_log_config(service_label: str = SERVICE_LOG_LABEL) -> dict[str, Any]:
    """Build Uvicorn logging config with a service prefix."""
    log_config = deepcopy(LOGGING_CONFIG)
    formatters = log_config.get("formatters")
    if isinstance(formatters, dict):
        default_formatter = formatters.get("default")
        if isinstance(default_formatter, dict):
            default_formatter["fmt"] = f"{service_label} %(levelprefix)s %(message)s"

        access_formatter = formatters.get("access")
        if isinstance(access_formatter, dict):
            access_formatter["fmt"] = (
                f'{service_label} %(levelprefix)s %(client_addr)s - "%(request_line)s" '
                "%(status_code)s"
            )
    return log_config


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
        print(
            f"{SERVICE_LOG_LABEL} INFO: Requested port {requested_port} unavailable; "
            f"using {selected_port}.",
            flush=True,
        )
    print(
        f"{SERVICE_LOG_LABEL} INFO: pipeworks-dev-notes running at http://{host}:{selected_port}",
        flush=True,
    )

    uvicorn.run(
        "pipeworks_dev_notes.app:app",
        host=host,
        port=selected_port,
        reload=True,
        log_config=_build_uvicorn_log_config(),
    )


if __name__ == "__main__":
    main()
