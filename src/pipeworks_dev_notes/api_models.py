"""Pydantic response models for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class NoteSummaryModel(BaseModel):
    """API response model for note summaries."""

    note_id: str
    canonical_repo: str
    filename: str
    title: str
    owner: str
    status: str
    breaking_change_risk: str
    impacted_repos: list[str]
    last_reviewed: str


class NoteDocumentModel(BaseModel):
    """API response model for full note documents."""

    note_id: str
    canonical_repo: str
    filename: str
    title: str
    metadata: dict[str, object]
    content: str


class WorkspaceActionRequest(BaseModel):
    """Request body for workspace actions that support dry-run."""

    apply: bool = False


class WorkspaceReposModel(BaseModel):
    """Response model for discovered and scaffolded repos."""

    discovered: list[str]
    scaffolded: list[str]


class ScaffoldResultModel(BaseModel):
    """Response model for scaffold operation."""

    discovered: list[str]
    created: list[str]
    existing: list[str]
    applied: bool


class LinkResultModel(BaseModel):
    """Response model for symlink operation."""

    created: list[str]
    repaired: list[str]
    skipped: list[str]
    applied: bool


class DoctorEntryModel(BaseModel):
    """Single symlink audit entry."""

    repo: str
    status: str
    detail: str = ""


class DoctorResultModel(BaseModel):
    """Response model for doctor audit."""

    entries: list[DoctorEntryModel]
    healthy: int
    unhealthy: int


class IndexResultModel(BaseModel):
    """Response model for index generation."""

    note_count: int
    repo_count: int
    applied: bool


class NoteWriteRequestModel(BaseModel):
    """API request model for creating or updating notes."""

    filename: str | None = None
    title: str
    content: str
    owner: str = ""
    status: str = "draft"
    breaking_change_risk: str = "medium"
    canonical_repo: str
    impacted_repos: list[str] = Field(default_factory=list)
    last_reviewed: str = ""
