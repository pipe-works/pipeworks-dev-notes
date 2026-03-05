"""Filesystem-backed store for shared note folders."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from pipeworks_dev_notes.frontmatter import (
    parse_markdown_with_frontmatter,
    render_markdown_with_frontmatter,
)

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


@dataclass(frozen=True, slots=True)
class NoteSummary:
    """Summary view for notes index responses."""

    slug: str
    title: str
    owner: str
    status: str
    breaking_change_risk: str
    canonical_repo: str
    impacted_repos: list[str]
    last_reviewed: str


@dataclass(frozen=True, slots=True)
class NoteDocument:
    """Full note document response."""

    slug: str
    title: str
    metadata: dict[str, object]
    content: str


@dataclass(frozen=True, slots=True)
class NoteWrite:
    """Write payload used by create and update operations."""

    title: str
    content: str
    owner: str
    status: str
    breaking_change_risk: str
    canonical_repo: str
    impacted_repos: list[str]
    last_reviewed: str


class NotesStore:
    """Notes store over the shared folder with read/write operations."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir

    def list_notes(self) -> list[NoteSummary]:
        """Return metadata summaries for each directory note."""

        if not self.base_dir.exists():
            return []

        notes: list[NoteSummary] = []
        for directory in sorted(self.base_dir.iterdir(), key=lambda item: item.name):
            if not directory.is_dir():
                continue
            summary = self._build_summary(directory)
            notes.append(summary)
        return notes

    def get_note(self, slug: str) -> NoteDocument | None:
        """Return the full note markdown and metadata for a slug."""

        note_dir = self.base_dir / slug
        if not note_dir.is_dir():
            return None

        readme_path = note_dir / "README.md"
        raw = readme_path.read_text(encoding="utf-8") if readme_path.exists() else ""
        parsed = parse_markdown_with_frontmatter(raw)
        title = self._title_from_content_or_slug(slug=slug, content=raw)
        return NoteDocument(slug=slug, title=title, metadata=parsed.metadata, content=parsed.body)

    def create_note(self, slug: str, payload: NoteWrite) -> NoteDocument:
        """Create a new note folder and README."""

        safe_slug = self._validated_slug(slug)
        note_dir = self.base_dir / safe_slug
        if note_dir.exists():
            raise FileExistsError(f"Note '{safe_slug}' already exists")

        self.base_dir.mkdir(parents=True, exist_ok=True)
        note_dir.mkdir(parents=False, exist_ok=False)
        readme_path = note_dir / "README.md"
        readme_path.write_text(
            render_markdown_with_frontmatter(
                title=payload.title,
                content=payload.content,
                metadata=self._metadata_from_payload(payload),
            ),
            encoding="utf-8",
        )
        created = self.get_note(safe_slug)
        if created is None:
            raise RuntimeError(f"Failed to read created note '{safe_slug}'")
        return created

    def update_note(self, slug: str, payload: NoteWrite) -> NoteDocument | None:
        """Update an existing note README."""

        safe_slug = self._validated_slug(slug)
        note_dir = self.base_dir / safe_slug
        if not note_dir.is_dir():
            return None

        readme_path = note_dir / "README.md"
        readme_path.write_text(
            render_markdown_with_frontmatter(
                title=payload.title,
                content=payload.content,
                metadata=self._metadata_from_payload(payload),
            ),
            encoding="utf-8",
        )
        return self.get_note(safe_slug)

    @staticmethod
    def slug_from_text(value: str) -> str:
        """Return a URL-safe note slug generated from free text."""

        lowered = value.strip().lower()
        lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
        normalized = re.sub(r"-{2,}", "-", lowered).strip("-")
        return normalized

    def _build_summary(self, directory: Path) -> NoteSummary:
        slug = directory.name
        readme_path = directory / "README.md"
        raw = readme_path.read_text(encoding="utf-8") if readme_path.exists() else ""
        parsed = parse_markdown_with_frontmatter(raw)

        metadata = parsed.metadata
        impacted_repos = metadata.get("impacted_repos")
        safe_impacted = impacted_repos if isinstance(impacted_repos, list) else []
        impacted = [str(repo) for repo in safe_impacted]

        return NoteSummary(
            slug=slug,
            title=self._title_from_content_or_slug(slug=slug, content=raw),
            owner=str(metadata.get("owner", "")),
            status=str(metadata.get("status", "")),
            breaking_change_risk=str(metadata.get("breaking_change_risk", "")),
            canonical_repo=str(metadata.get("canonical_repo", "")),
            impacted_repos=impacted,
            last_reviewed=str(metadata.get("last_reviewed", "")),
        )

    @staticmethod
    def _title_from_content_or_slug(slug: str, content: str) -> str:
        for line in content.splitlines():
            if line.startswith("# "):
                return line.removeprefix("# ").strip()
        return slug

    @staticmethod
    def _metadata_from_payload(payload: NoteWrite) -> dict[str, object]:
        return {
            "owner": payload.owner,
            "status": payload.status,
            "breaking_change_risk": payload.breaking_change_risk,
            "canonical_repo": payload.canonical_repo,
            "impacted_repos": payload.impacted_repos,
            "last_reviewed": payload.last_reviewed,
        }

    @staticmethod
    def _validated_slug(slug: str) -> str:
        candidate = slug.strip().lower()
        if not _SLUG_PATTERN.fullmatch(candidate):
            raise ValueError("Invalid slug. Use lowercase letters, numbers, and hyphens only.")
        return candidate
