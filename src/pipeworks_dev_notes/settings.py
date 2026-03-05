"""Configuration helpers for pipeworks-dev-notes."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_SHARED_DIR = Path("/Users/aapark/pipe-works-development/_working_shared")
DEFAULT_REPO_ROOT = Path("/Users/aapark/pipe-works-development")


def shared_dir() -> Path:
    """Return the shared notes directory, overridable via environment."""

    configured = os.getenv("PIPEWORKS_DEV_NOTES_SHARED_DIR")
    if configured:
        return Path(configured).expanduser()
    return DEFAULT_SHARED_DIR


def repo_root() -> Path:
    """Return the workspace root containing git repos, overridable via environment."""

    configured = os.getenv("PIPEWORKS_DEV_NOTES_REPO_ROOT")
    if configured:
        return Path(configured).expanduser()
    return DEFAULT_REPO_ROOT
