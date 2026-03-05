"""Filesystem-backed store for shared note folders."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from pipeworks_dev_notes.frontmatter import (
    parse_markdown_with_frontmatter,
    render_markdown_with_frontmatter,
)

_REPO_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.md$")
_LEGACY_NOTE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


@dataclass(frozen=True, slots=True)
class NoteSummary:
    """Summary view for notes index responses."""

    note_id: str
    canonical_repo: str
    filename: str
    title: str
    owner: str
    status: str
    breaking_change_risk: str
    impacted_repos: list[str]
    last_reviewed: str


@dataclass(frozen=True, slots=True)
class NoteDocument:
    """Full note document response."""

    note_id: str
    canonical_repo: str
    filename: str
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


@dataclass(frozen=True, slots=True)
class _ResolvedNote:
    note_id: str
    canonical_repo: str
    filename: str
    path: Path
    legacy: bool


class NotesStore:
    """Notes store over the shared folder with read/write operations."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir

    def list_repos(self) -> list[str]:
        """Return canonical repository directory names under the shared root."""

        if not self.base_dir.exists():
            return []
        repos = [
            item.name
            for item in self.base_dir.iterdir()
            if item.is_dir() and _REPO_PATTERN.fullmatch(item.name)
        ]
        return sorted(set(repos))

    def list_notes(self) -> list[NoteSummary]:
        """Return metadata summaries for new-format and legacy notes."""

        if not self.base_dir.exists():
            return []

        notes: list[NoteSummary] = []
        for directory in sorted(self.base_dir.iterdir(), key=lambda item: item.name):
            if not directory.is_dir():
                continue
            notes.extend(self._summaries_for_directory(directory))
        return notes

    def get_note(self, note_id: str) -> NoteDocument | None:
        """Return full note markdown and metadata for a note identifier."""

        try:
            resolved = self._resolve_note(note_id)
        except ValueError:
            return None
        if not resolved.path.is_file():
            return None
        return self._document_from_file(resolved=resolved)

    def create_note(
        self, *, canonical_repo: str, filename: str, payload: NoteWrite
    ) -> NoteDocument:
        """Create a note file in `<canonical_repo>/<filename>.md`."""

        repo_name = self._validated_repo(canonical_repo)
        file_name = self._validated_filename(filename)
        repo_dir = self.base_dir / repo_name
        if not repo_dir.is_dir():
            raise FileNotFoundError(
                f"Canonical repo directory '{repo_name}' does not exist under shared root"
            )

        target = repo_dir / file_name
        if target.exists():
            raise FileExistsError(f"Note '{repo_name}/{file_name}' already exists")

        target.write_text(
            render_markdown_with_frontmatter(
                content=payload.content,
                metadata=self._metadata_from_payload(payload=payload),
            ),
            encoding="utf-8",
        )
        created = self.get_note(self.note_id_from_parts(repo_name=repo_name, filename=file_name))
        if created is None:
            raise RuntimeError(f"Failed to read created note '{repo_name}/{file_name}'")
        return created

    def update_note(self, *, note_id: str, payload: NoteWrite) -> NoteDocument | None:
        """Update existing note content in place."""

        try:
            resolved = self._resolve_note(note_id)
        except ValueError as exc:
            raise ValueError("Invalid note identifier") from exc

        if not resolved.path.is_file():
            return None

        resolved.path.write_text(
            render_markdown_with_frontmatter(
                content=payload.content,
                metadata=self._metadata_from_payload(payload=payload),
            ),
            encoding="utf-8",
        )
        return self.get_note(resolved.note_id)

    @staticmethod
    def filename_from_text(value: str) -> str:
        """Return a safe markdown filename from free text."""

        lowered = value.strip().lower()
        lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
        lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
        if not lowered:
            return ""
        return f"{lowered}.md"

    @staticmethod
    def note_id_from_parts(*, repo_name: str, filename: str) -> str:
        """Build note identifier from canonical repo and filename."""

        return f"{repo_name}/{filename}"

    def _summaries_for_directory(self, directory: Path) -> list[NoteSummary]:
        repo_name = directory.name
        summaries: list[NoteSummary] = []
        self._collect_notes(directory, repo_name, directory, summaries)
        return summaries

    def _collect_notes(
        self,
        current: Path,
        repo_name: str,
        repo_root: Path,
        summaries: list[NoteSummary],
    ) -> None:
        markdown_files = sorted(
            [item for item in current.iterdir() if item.is_file() and item.suffix.lower() == ".md"],
            key=lambda item: item.name,
        )

        for note_file in markdown_files:
            rel = note_file.relative_to(repo_root)
            rel_str = str(rel)

            if note_file.name == "README.md" and current == repo_root:
                resolved = _ResolvedNote(
                    note_id=repo_name,
                    canonical_repo=repo_name,
                    filename="README.md",
                    path=note_file,
                    legacy=True,
                )
            else:
                note_id = f"{repo_name}/{rel_str}"
                resolved = _ResolvedNote(
                    note_id=note_id,
                    canonical_repo=repo_name,
                    filename=rel_str,
                    path=note_file,
                    legacy=False,
                )
            summaries.append(self._summary_from_file(resolved=resolved))

        subdirs = sorted(
            [d for d in current.iterdir() if d.is_dir() and not d.name.startswith(".")],
            key=lambda d: d.name,
        )
        for subdir in subdirs:
            self._collect_notes(subdir, repo_name, repo_root, summaries)

    def _summary_from_file(self, *, resolved: _ResolvedNote) -> NoteSummary:
        parsed, title = self._parsed_and_title_from_file(
            path=resolved.path,
            fallback_title=resolved.filename.removesuffix(".md"),
        )
        metadata = parsed.metadata
        impacted = self._safe_impacted_repos(metadata.get("impacted_repos"))
        canonical_repo = str(metadata.get("canonical_repo", resolved.canonical_repo))
        return NoteSummary(
            note_id=resolved.note_id,
            canonical_repo=canonical_repo,
            filename=resolved.filename,
            title=title,
            owner=str(metadata.get("owner", "")),
            status=str(metadata.get("status", "")),
            breaking_change_risk=str(metadata.get("breaking_change_risk", "")),
            impacted_repos=impacted,
            last_reviewed=str(metadata.get("last_reviewed", "")),
        )

    def _document_from_file(self, *, resolved: _ResolvedNote) -> NoteDocument:
        parsed, title = self._parsed_and_title_from_file(
            path=resolved.path,
            fallback_title=resolved.filename.removesuffix(".md"),
        )
        metadata = parsed.metadata
        canonical_repo = str(metadata.get("canonical_repo", resolved.canonical_repo))
        return NoteDocument(
            note_id=resolved.note_id,
            canonical_repo=canonical_repo,
            filename=resolved.filename,
            title=title,
            metadata=metadata,
            content=parsed.body,
        )

    def _resolve_note(self, note_id: str) -> _ResolvedNote:
        cleaned = note_id.strip()
        if not cleaned:
            raise ValueError("Missing note identifier")

        if "/" in cleaned:
            repo_name, rel_path = cleaned.split("/", 1)
            safe_repo = self._validated_repo(repo_name)
            safe_path = self._validated_rel_path(rel_path)
            return _ResolvedNote(
                note_id=f"{safe_repo}/{safe_path}",
                canonical_repo=safe_repo,
                filename=safe_path,
                path=self.base_dir / safe_repo / safe_path,
                legacy=False,
            )

        if not _LEGACY_NOTE_ID_PATTERN.fullmatch(cleaned):
            raise ValueError("Invalid legacy note identifier")
        return _ResolvedNote(
            note_id=cleaned,
            canonical_repo=cleaned,
            filename="README.md",
            path=self.base_dir / cleaned / "README.md",
            legacy=True,
        )

    @staticmethod
    def _validated_repo(repo_name: str) -> str:
        cleaned = repo_name.strip()
        if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
            raise ValueError("Invalid canonical repo name")
        if not _REPO_PATTERN.fullmatch(cleaned):
            raise ValueError(
                "Invalid canonical repo name. Use letters, numbers, dots, underscores, or hyphens."
            )
        return cleaned

    @staticmethod
    def _validated_filename(filename: str) -> str:
        cleaned = filename.strip()
        if not cleaned:
            raise ValueError("Filename is required")
        if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
            raise ValueError("Invalid filename")
        if cleaned.endswith(".MD"):
            cleaned = f"{cleaned[:-3]}.md"
        if not cleaned.endswith(".md"):
            cleaned = f"{cleaned}.md"
        cleaned = cleaned.replace(" ", "-")
        if not _FILENAME_PATTERN.fullmatch(cleaned):
            raise ValueError(
                "Invalid filename. Use letters, numbers, dots, underscores, "
                "hyphens, and .md extension."
            )
        return cleaned

    @staticmethod
    def _validated_rel_path(rel_path: str) -> str:
        """Validate a relative path like 'subdir/file.md' within a repo."""
        cleaned = rel_path.strip()
        if not cleaned:
            raise ValueError("Path is required")
        if "\\" in cleaned or ".." in cleaned:
            raise ValueError("Invalid path")
        parts = cleaned.split("/")
        for part in parts:
            if not part or part.startswith("."):
                raise ValueError("Invalid path segment")
        return cleaned

    @staticmethod
    def _metadata_from_payload(*, payload: NoteWrite) -> dict[str, object]:
        return {
            "title": payload.title,
            "owner": payload.owner,
            "status": payload.status,
            "breaking_change_risk": payload.breaking_change_risk,
            "canonical_repo": payload.canonical_repo,
            "impacted_repos": payload.impacted_repos,
            "last_reviewed": payload.last_reviewed,
        }

    @staticmethod
    def _safe_impacted_repos(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item) for item in value]

    @staticmethod
    def _parsed_and_title_from_file(*, path: Path, fallback_title: str):
        raw = path.read_text(encoding="utf-8")
        parsed = parse_markdown_with_frontmatter(raw)

        metadata_title = parsed.metadata.get("title")
        if isinstance(metadata_title, str) and metadata_title.strip():
            return parsed, metadata_title.strip()
        for line in parsed.body.splitlines():
            if line.startswith("# "):
                return parsed, line.removeprefix("# ").strip()
        return parsed, fallback_title
