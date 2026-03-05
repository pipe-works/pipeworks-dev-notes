"""FastAPI application for pipeworks-dev-notes."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pipeworks_dev_notes.api_models import (
    NoteDocumentModel,
    NoteSummaryModel,
    NoteWriteRequestModel,
)
from pipeworks_dev_notes.settings import shared_dir
from pipeworks_dev_notes.store import NotesStore, NoteWrite


def _store_dependency() -> NotesStore:
    return NotesStore(base_dir=shared_dir())


def create_app() -> FastAPI:
    """Create and configure the web application."""

    app = FastAPI(title="pipeworks-dev-notes", version="0.1.0")
    static_dir = Path(__file__).parent / "web" / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/")
    async def root() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/notes", response_model=list[NoteSummaryModel])
    async def list_notes(
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> list[NoteSummaryModel]:
        return [NoteSummaryModel.model_validate(asdict(item)) for item in store.list_notes()]

    @app.get("/api/notes/{slug}", response_model=NoteDocumentModel)
    async def get_note(
        slug: str,
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> NoteDocumentModel:
        note = store.get_note(slug)
        if note is None:
            raise HTTPException(status_code=404, detail=f"Note '{slug}' not found")
        return NoteDocumentModel.model_validate(asdict(note))

    @app.post(
        "/api/notes",
        response_model=NoteDocumentModel,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_note(
        payload: NoteWriteRequestModel,
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> NoteDocumentModel:
        slug = payload.slug or NotesStore.slug_from_text(payload.title)
        if not slug:
            raise HTTPException(status_code=400, detail="Unable to derive slug from title")
        try:
            created = store.create_note(slug=slug, payload=_to_note_write(payload))
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return NoteDocumentModel.model_validate(asdict(created))

    @app.put("/api/notes/{slug}", response_model=NoteDocumentModel)
    async def update_note(
        slug: str,
        payload: NoteWriteRequestModel,
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> NoteDocumentModel:
        try:
            updated = store.update_note(slug=slug, payload=_to_note_write(payload))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if updated is None:
            raise HTTPException(status_code=404, detail=f"Note '{slug}' not found")
        return NoteDocumentModel.model_validate(asdict(updated))

    return app


app = create_app()


def _to_note_write(payload: NoteWriteRequestModel) -> NoteWrite:
    return NoteWrite(
        title=payload.title,
        content=payload.content,
        owner=payload.owner,
        status=payload.status,
        breaking_change_risk=payload.breaking_change_risk,
        canonical_repo=payload.canonical_repo,
        impacted_repos=payload.impacted_repos,
        last_reviewed=payload.last_reviewed,
    )
