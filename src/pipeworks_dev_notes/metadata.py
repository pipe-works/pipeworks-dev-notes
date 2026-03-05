"""Core metadata defaults for shared-note documents."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class NoteMetadataTemplate:
    """Default metadata values used when scaffolding a new shared note."""

    canonical_repo: str
    impacted_repos: list[str]
    status: str
    breaking_change_risk: str
    owner: str
    last_reviewed: str


def default_template() -> NoteMetadataTemplate:
    """Return a conservative baseline metadata template."""

    return NoteMetadataTemplate(
        canonical_repo="pipeworks_mud_server",
        impacted_repos=[],
        status="draft",
        breaking_change_risk="medium",
        owner="",
        last_reviewed="",
    )
