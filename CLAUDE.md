# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A lightweight FastAPI web app for managing cross-repo Markdown development notes with YAML front matter. Notes track governance metadata (owner, status, breaking change risk, impacted repos) across the pipe-works ecosystem. Source of truth is Markdown files on disk; the app provides a REST API and static frontend on top.

## Commands

```bash
# Setup
pip install -e ".[dev]"
pre-commit install

# Run server (starts at :8765, auto-scans for free port)
python -m pipeworks_dev_notes

# Tests (coverage must stay >= 80%)
pytest                          # full suite with coverage
pytest tests/test_store.py      # single test file
pytest -k test_create_and_update_note  # single test

# Lint & format
ruff check src/ tests/
black src/ tests/
mypy src/

# Pre-commit (runs black, ruff --fix, mypy, pytest smoke test)
pre-commit run --all-files
```

## Architecture

**Storage model**: Notes live in `_working_shared/<canonical_repo>/<filename>.md` with YAML front matter. Legacy format (`<dir>/README.md`) is still readable. The shared directory defaults to `/Users/aapark/pipe-works-development/_working_shared` and is overridable via `PIPEWORKS_DEV_NOTES_SHARED_DIR`.

**Key flow**: `app.py` (FastAPI routes) -> `store.py` (NotesStore, filesystem ops) -> `frontmatter.py` (YAML parse/render). Pydantic models in `api_models.py` handle API serialization; domain dataclasses (`NoteSummary`, `NoteDocument`, `NoteWrite`) live in `store.py`.

**Note identifiers**: New format is `<canonical_repo>/<filename>.md` (e.g. `pipeworks_mud_server/chat-user-llm-systems.md`). Legacy format is just the directory name, which resolves to `<dir>/README.md`.

**Server startup**: `__main__.py` uses uvicorn with auto port-scanning from 8765. Host/port configurable via `PIPEWORKS_DEV_NOTES_HOST` / `PIPEWORKS_DEV_NOTES_PORT`.

## API Endpoints

- `GET /health` - health check
- `GET /api/repos` - list canonical repo directories
- `GET /api/notes` - list all notes with summary metadata
- `GET /api/notes/{note_id}` - get full note (note_id is `repo/filename.md` or legacy name)
- `POST /api/notes` - create note (requires `canonical_repo` directory to exist)
- `PUT /api/notes/{note_id}` - update existing note

## Shell Tools

`tools/shared_working/` contains bash scripts for managing the shared folder:
- `working_shared_scaffold_repos.sh --apply` - create repo directories from detected git repos
- `working_shared_link.sh --apply` - create/repair `_working/shared` symlinks in each repo
- `working_shared_scaffold_note.sh --canonical-repo <repo> --filename <name> --apply` - create note template
- `working_shared_doctor.sh` - validate symlink setup
- `working_shared_index.sh --apply` - regenerate index

## Conventions

- Python 3.12+, line length 100 (black/ruff)
- Conventional commits required (release-please on main)
- Frontend must follow the style guide at `/Users/aapark/pipe-works-development/pipe-works/styles/app`
- CI uses the org's reusable workflow (`pipe-works/.github`) testing on Python 3.12 and 3.13
- pyenv virtualenv `pms` activates automatically via `.python-version`
