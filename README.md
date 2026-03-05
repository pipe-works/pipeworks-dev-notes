# pipeworks-dev-notes

`pipeworks-dev-notes` is the workspace for a lightweight web-based Markdown notes tool
for cross-repo pipe-works development governance.

## Goals

- Keep Markdown + YAML front matter as the source of truth.
- Support cross-repo impact tracking (`canonical_repo`, `impacted_repos`, risk/state fields).
- Stay compatible with local editor workflows (for example Obsidian).

## Frontend Styling Constraint

Frontend implementation work must follow the existing style guide at:

- `/Users/aapark/pipe-works-development/pipe-works/styles/app`

## Repository Layout

- `src/pipeworks_dev_notes/`: package source code.
- `src/pipeworks_dev_notes/web/static/`: app frontend shell (HTML/CSS/JS).
- `tests/`: pytest suite.
- `tools/shared_working/`: shared-folder maintenance scripts (scaffold/link/index/doctor).
- `_working/`: local untracked notes, scratch docs, and planning artifacts.

## Quick Start

```bash
pip install -e ".[dev]"
pre-commit install
pytest
python -m pipeworks_dev_notes
```

`python -m pipeworks_dev_notes` starts at port `8765` and automatically scans for
the next free port when needed, printing the selected URL to the terminal.

## Quality Tooling

- Lint: `ruff check src/ tests/`
- Format: `black src/ tests/`
- Type check: `mypy src/`
- Tests: `pytest`
- Pre-commit: `pre-commit run --all-files`

## Current Status

Initial vertical slice is in place:

- Python packaging and dev dependencies
- Pre-commit hooks
- FastAPI backend endpoints:
  - `GET /health`
  - `GET /api/repos`
  - `GET /api/notes`
  - `GET /api/notes/{note_id}`
  - `POST /api/notes`
  - `PUT /api/notes/{note_id}`
- Static frontend served at `/`
- Canonical storage model: `_working_shared/<canonical_repo>/<filename>.md`
- Legacy read compatibility: `_working_shared/<legacy_dir>/README.md` is still readable
- Pytest + coverage configuration and API/store tests
