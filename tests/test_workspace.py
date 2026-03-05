"""Unit tests for WorkspaceManager."""

from pathlib import Path

from pipeworks_dev_notes.workspace import WorkspaceManager


def _make_git_repo(root: Path, name: str, with_working: bool = False) -> Path:
    repo_dir = root / name
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / ".git").mkdir()
    if with_working:
        (repo_dir / "_working").mkdir()
    return repo_dir


def test_discover_repos_finds_git_dirs(tmp_path: Path) -> None:
    _make_git_repo(tmp_path, "alpha_repo")
    _make_git_repo(tmp_path, "beta-repo")
    (tmp_path / "not-a-repo").mkdir()
    (tmp_path / ".hidden-repo").mkdir()
    (tmp_path / ".hidden-repo" / ".git").mkdir()

    ws = WorkspaceManager(repo_root=tmp_path, shared_dir=tmp_path / "shared")
    repos = ws.discover_repos()
    assert repos == ["alpha_repo", "beta-repo"]


def test_discover_repos_empty_root(tmp_path: Path) -> None:
    ws = WorkspaceManager(repo_root=tmp_path / "nonexistent", shared_dir=tmp_path / "shared")
    assert ws.discover_repos() == []


def test_scaffold_repos_dry_run(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a")
    _make_git_repo(root, "repo_b")

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.scaffold_repos(apply=False)

    assert result.discovered == ["repo_a", "repo_b"]
    assert result.created == ["repo_a", "repo_b"]
    assert result.existing == []
    assert result.applied is False
    assert not (shared / "repo_a").exists()


def test_scaffold_repos_apply(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a")

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.scaffold_repos(apply=True)

    assert result.created == ["repo_a"]
    assert result.applied is True
    assert (shared / "repo_a").is_dir()


def test_scaffold_repos_idempotent(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a")
    (shared / "repo_a").mkdir()

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.scaffold_repos(apply=True)

    assert result.created == []
    assert result.existing == ["repo_a"]


def test_create_symlinks_dry_run(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.create_symlinks(apply=False)

    assert result.created == ["repo_a"]
    assert result.applied is False
    assert not (root / "repo_a" / "_working" / "shared").exists()


def test_create_symlinks_apply(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.create_symlinks(apply=True)

    assert result.created == ["repo_a"]
    link = root / "repo_a" / "_working" / "shared"
    assert link.is_symlink()
    assert link.resolve() == shared.resolve()


def test_create_symlinks_repair_wrong_target(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    wrong_target = tmp_path / "wrong"
    wrong_target.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)
    link_path = root / "repo_a" / "_working" / "shared"
    link_path.symlink_to(wrong_target)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.create_symlinks(apply=True)

    assert result.repaired == ["repo_a"]
    assert link_path.resolve() == shared.resolve()


def test_create_symlinks_skip_repos_without_working(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=False)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.create_symlinks(apply=True)

    assert result.skipped == ["repo_a"]
    assert result.created == []


def test_doctor_healthy(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)
    (root / "repo_a" / "_working" / "shared").symlink_to(shared)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.doctor()

    assert result.healthy == 1
    assert result.unhealthy == 0
    assert result.entries[0].status == "healthy"


def test_doctor_missing(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.doctor()

    assert result.unhealthy == 1
    assert result.entries[0].status == "missing"


def test_doctor_wrong_target(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    wrong = tmp_path / "wrong"
    wrong.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)
    (root / "repo_a" / "_working" / "shared").symlink_to(wrong)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.doctor()

    assert result.unhealthy == 1
    assert result.entries[0].status == "wrong_target"


def test_doctor_no_working_dir(tmp_path: Path) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=False)

    ws = WorkspaceManager(repo_root=root, shared_dir=shared)
    result = ws.doctor()

    assert result.unhealthy == 1
    assert result.entries[0].status == "no_working_dir"


def test_generate_index_writes_file(tmp_path: Path) -> None:
    shared = tmp_path / "shared"
    repo_dir = shared / "my_repo"
    repo_dir.mkdir(parents=True)
    (repo_dir / "test-note.md").write_text(
        "---\ntitle: Test Note\nowner: aapark\nstatus: draft\n"
        "breaking_change_risk: low\ncanonical_repo: my_repo\n"
        "impacted_repos: []\nlast_reviewed: ''\n---\nBody\n",
        encoding="utf-8",
    )

    ws = WorkspaceManager(repo_root=tmp_path, shared_dir=shared)
    result = ws.generate_index(apply=True)

    assert result.note_count == 1
    assert result.repo_count == 1
    assert result.applied is True
    index_path = shared / "INDEX.md"
    assert index_path.exists()
    content = index_path.read_text(encoding="utf-8")
    assert "[Test Note](my_repo/test-note.md)" in content
    assert "my_repo" in content


def test_generate_index_dry_run(tmp_path: Path) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    ws = WorkspaceManager(repo_root=tmp_path, shared_dir=shared)
    result = ws.generate_index(apply=False)

    assert result.applied is False
    assert not (shared / "INDEX.md").exists()
