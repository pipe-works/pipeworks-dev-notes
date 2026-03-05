"""Pydantic response models for the API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class NoteSummaryModel(BaseModel):
    """API response model for note summaries."""

    slug: str
    title: str
    owner: str
    status: str
    breaking_change_risk: str
    canonical_repo: str
    impacted_repos: list[str]
    last_reviewed: str


class NoteDocumentModel(BaseModel):
    """API response model for full note documents."""

    slug: str
    title: str
    metadata: dict[str, object]
    content: str


class NoteWriteRequestModel(BaseModel):
    """API request model for creating or updating notes."""

    slug: str | None = None
    title: str
    content: str
    owner: str = ""
    status: str = "draft"
    breaking_change_risk: str = "medium"
    canonical_repo: str = ""
    impacted_repos: list[str] = Field(default_factory=list)
    last_reviewed: str = ""
