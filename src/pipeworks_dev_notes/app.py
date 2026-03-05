"""FastAPI application for pipeworks-dev-notes."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pipeworks_dev_notes import __version__
from pipeworks_dev_notes.api_models import (
    DoctorEntryModel,
    DoctorResultModel,
    IndexResultModel,
    LinkResultModel,
    NoteDocumentModel,
    NoteSummaryModel,
    NoteWriteRequestModel,
    ScaffoldResultModel,
    WorkspaceActionRequest,
    WorkspaceReposModel,
)
from pipeworks_dev_notes.settings import repo_root, shared_dir
from pipeworks_dev_notes.store import NotesStore, NoteWrite
from pipeworks_dev_notes.workspace import WorkspaceManager


def _store_dependency() -> NotesStore:
    return NotesStore(base_dir=shared_dir())


def _workspace_dependency() -> WorkspaceManager:
    return WorkspaceManager(repo_root=repo_root(), shared_dir=shared_dir())


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

    @app.get("/api/version")
    async def version() -> dict[str, str]:
        return {"version": __version__}

    @app.get("/api/notes", response_model=list[NoteSummaryModel])
    async def list_notes(
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> list[NoteSummaryModel]:
        return [NoteSummaryModel.model_validate(asdict(item)) for item in store.list_notes()]

    @app.get("/api/repos", response_model=list[str])
    async def list_repos(store: NotesStore = Depends(_store_dependency)) -> list[str]:  # noqa: B008
        return store.list_repos()

    @app.get("/api/workspace/repos", response_model=WorkspaceReposModel)
    async def workspace_repos(
        ws: WorkspaceManager = Depends(_workspace_dependency),  # noqa: B008
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> WorkspaceReposModel:
        return WorkspaceReposModel(
            discovered=ws.discover_repos(),
            scaffolded=store.list_repos(),
        )

    @app.post("/api/workspace/scaffold", response_model=ScaffoldResultModel)
    async def workspace_scaffold(
        body: WorkspaceActionRequest,
        ws: WorkspaceManager = Depends(_workspace_dependency),  # noqa: B008
    ) -> ScaffoldResultModel:
        result = ws.scaffold_repos(apply=body.apply)
        return ScaffoldResultModel(
            discovered=result.discovered,
            created=result.created,
            existing=result.existing,
            applied=result.applied,
        )

    @app.post("/api/workspace/link", response_model=LinkResultModel)
    async def workspace_link(
        body: WorkspaceActionRequest,
        ws: WorkspaceManager = Depends(_workspace_dependency),  # noqa: B008
    ) -> LinkResultModel:
        result = ws.create_symlinks(apply=body.apply)
        return LinkResultModel(
            created=result.created,
            repaired=result.repaired,
            skipped=result.skipped,
            applied=result.applied,
        )

    @app.get("/api/workspace/doctor", response_model=DoctorResultModel)
    async def workspace_doctor(
        ws: WorkspaceManager = Depends(_workspace_dependency),  # noqa: B008
    ) -> DoctorResultModel:
        result = ws.doctor()
        return DoctorResultModel(
            entries=[
                DoctorEntryModel(repo=e.repo, status=e.status, detail=e.detail)
                for e in result.entries
            ],
            healthy=result.healthy,
            unhealthy=result.unhealthy,
        )

    @app.post("/api/workspace/index", response_model=IndexResultModel)
    async def workspace_index(
        body: WorkspaceActionRequest,
        ws: WorkspaceManager = Depends(_workspace_dependency),  # noqa: B008
    ) -> IndexResultModel:
        result = ws.generate_index(apply=body.apply)
        return IndexResultModel(
            note_count=result.note_count,
            repo_count=result.repo_count,
            applied=result.applied,
        )

    @app.get("/api/notes/{note_id:path}", response_model=NoteDocumentModel)
    async def get_note(
        note_id: str,
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> NoteDocumentModel:
        note = store.get_note(note_id)
        if note is None:
            raise HTTPException(status_code=404, detail=f"Note '{note_id}' not found")
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
        filename = payload.filename or NotesStore.filename_from_text(payload.title)
        if not filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        try:
            created = store.create_note(
                canonical_repo=payload.canonical_repo,
                filename=filename,
                payload=_to_note_write(payload),
            )
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return NoteDocumentModel.model_validate(asdict(created))

    @app.put("/api/notes/{note_id:path}", response_model=NoteDocumentModel)
    async def update_note(
        note_id: str,
        payload: NoteWriteRequestModel,
        store: NotesStore = Depends(_store_dependency),  # noqa: B008
    ) -> NoteDocumentModel:
        try:
            updated = store.update_note(note_id=note_id, payload=_to_note_write(payload))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if updated is None:
            raise HTTPException(status_code=404, detail=f"Note '{note_id}' not found")
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
