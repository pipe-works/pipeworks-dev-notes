"""Configuration helpers for pipeworks-dev-notes."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_SHARED_DIR = Path("/Users/aapark/pipe-works-development/_working_shared")


def shared_dir() -> Path:
    """Return the shared notes directory, overridable via environment."""

    configured = os.getenv("PIPEWORKS_DEV_NOTES_SHARED_DIR")
    if configured:
        return Path(configured).expanduser()
    return DEFAULT_SHARED_DIR
