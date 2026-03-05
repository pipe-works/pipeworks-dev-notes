"""Workspace operations for managing shared directory structure."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from pipeworks_dev_notes.store import _REPO_PATTERN, NotesStore


@dataclass(frozen=True, slots=True)
class ScaffoldResult:
    """Result of scaffolding repo directories."""

    discovered: list[str]
    created: list[str]
    existing: list[str]
    applied: bool


@dataclass(frozen=True, slots=True)
class LinkResult:
    """Result of creating/repairing symlinks."""

    created: list[str]
    repaired: list[str]
    skipped: list[str]
    applied: bool


@dataclass(frozen=True, slots=True)
class DoctorEntry:
    """Single symlink audit entry."""

    repo: str
    status: str  # "healthy", "missing", "wrong_target", "no_working_dir"
    detail: str = ""


@dataclass(frozen=True, slots=True)
class DoctorResult:
    """Result of symlink audit."""

    entries: list[DoctorEntry] = field(default_factory=list)
    healthy: int = 0
    unhealthy: int = 0


@dataclass(frozen=True, slots=True)
class IndexResult:
    """Result of INDEX.md generation."""

    note_count: int
    repo_count: int
    applied: bool


class WorkspaceManager:
    """Python equivalent of the shell tools for workspace management."""

    def __init__(self, repo_root: Path, shared_dir: Path) -> None:
        self.repo_root = repo_root
        self.shared_dir = shared_dir

    def discover_repos(self) -> list[str]:
        """Scan repo_root for directories containing .git, sorted, skip dot-prefixed."""

        if not self.repo_root.is_dir():
            return []
        repos = []
        for item in self.repo_root.iterdir():
            if not item.is_dir():
                continue
            if item.name.startswith("."):
                continue
            if not (item / ".git").exists():
                continue
            if not _REPO_PATTERN.fullmatch(item.name):
                continue
            repos.append(item.name)
        return sorted(repos)

    def scaffold_repos(self, *, apply: bool = False) -> ScaffoldResult:
        """Create shared_dir/<repo>/ dirs for each discovered repo."""

        discovered = self.discover_repos()
        created: list[str] = []
        existing: list[str] = []

        for repo_name in discovered:
            repo_dir = self.shared_dir / repo_name
            if repo_dir.is_dir():
                existing.append(repo_name)
            else:
                if apply:
                    repo_dir.mkdir(parents=True, exist_ok=True)
                created.append(repo_name)

        return ScaffoldResult(
            discovered=discovered,
            created=created,
            existing=existing,
            applied=apply,
        )

    def create_symlinks(self, *, apply: bool = False) -> LinkResult:
        """Create/repair <repo>/_working/shared -> shared_dir symlinks."""

        discovered = self.discover_repos()
        created: list[str] = []
        repaired: list[str] = []
        skipped: list[str] = []

        for repo_name in discovered:
            repo_path = self.repo_root / repo_name
            working_dir = repo_path / "_working"

            if not working_dir.is_dir():
                skipped.append(repo_name)
                continue

            link_path = working_dir / "shared"
            target = self.shared_dir

            if link_path.is_symlink():
                current_target = link_path.resolve()
                if current_target == target.resolve():
                    continue  # already correct
                if apply:
                    link_path.unlink()
                    link_path.symlink_to(target)
                repaired.append(repo_name)
            elif link_path.exists():
                skipped.append(repo_name)
            else:
                if apply:
                    link_path.symlink_to(target)
                created.append(repo_name)

        return LinkResult(
            created=created,
            repaired=repaired,
            skipped=skipped,
            applied=apply,
        )

    def doctor(self) -> DoctorResult:
        """Read-only symlink audit."""

        discovered = self.discover_repos()
        entries: list[DoctorEntry] = []
        healthy = 0
        unhealthy = 0

        for repo_name in discovered:
            repo_path = self.repo_root / repo_name
            working_dir = repo_path / "_working"

            if not working_dir.is_dir():
                entries.append(
                    DoctorEntry(
                        repo=repo_name,
                        status="no_working_dir",
                        detail=str(working_dir),
                    )
                )
                unhealthy += 1
                continue

            link_path = working_dir / "shared"
            target = self.shared_dir

            if not link_path.exists() and not link_path.is_symlink():
                entries.append(DoctorEntry(repo=repo_name, status="missing", detail=str(link_path)))
                unhealthy += 1
            elif link_path.is_symlink():
                current_target = link_path.resolve()
                if current_target == target.resolve():
                    entries.append(DoctorEntry(repo=repo_name, status="healthy"))
                    healthy += 1
                else:
                    entries.append(
                        DoctorEntry(
                            repo=repo_name,
                            status="wrong_target",
                            detail=f"points to {current_target}",
                        )
                    )
                    unhealthy += 1
            else:
                entries.append(
                    DoctorEntry(
                        repo=repo_name,
                        status="not_symlink",
                        detail=str(link_path),
                    )
                )
                unhealthy += 1

        return DoctorResult(entries=entries, healthy=healthy, unhealthy=unhealthy)

    def generate_index(self, *, apply: bool = False) -> IndexResult:
        """Write INDEX.md table using NotesStore data."""

        store = NotesStore(base_dir=self.shared_dir)
        notes = store.list_notes()
        repos = store.list_repos()

        lines = [
            "# Shared Notes Index",
            "",
            f"**{len(notes)}** notes across **{len(repos)}** repositories.",
            "",
            "| Repo | Note | Owner | Status | Risk |",
            "|------|------|-------|--------|------|",
        ]
        for note in notes:
            lines.append(
                f"| {note.canonical_repo} | {note.title} | "
                f"{note.owner or '-'} | {note.status or '-'} | "
                f"{note.breaking_change_risk or '-'} |"
            )
        lines.append("")

        content = "\n".join(lines)

        if apply:
            self.shared_dir.mkdir(parents=True, exist_ok=True)
            (self.shared_dir / "INDEX.md").write_text(content, encoding="utf-8")

        return IndexResult(
            note_count=len(notes),
            repo_count=len(repos),
            applied=apply,
        )
