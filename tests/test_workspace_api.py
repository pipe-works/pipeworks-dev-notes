"""Integration tests for workspace API endpoints."""

from pathlib import Path

from fastapi.testclient import TestClient

from pipeworks_dev_notes.app import create_app


def _make_git_repo(root: Path, name: str, with_working: bool = False) -> Path:
    repo_dir = root / name
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / ".git").mkdir()
    if with_working:
        (repo_dir / "_working").mkdir()
    return repo_dir


def test_workspace_repos_endpoint(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a")
    (shared / "repo_a").mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(root))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/repos")
    assert response.status_code == 200
    data = response.json()
    assert data["discovered"] == ["repo_a"]
    assert data["scaffolded"] == ["repo_a"]


def test_scaffold_dry_run(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(root))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.post("/api/workspace/scaffold", json={"apply": False})
    assert response.status_code == 200
    data = response.json()
    assert data["applied"] is False
    assert "repo_a" in data["created"]
    assert not (shared / "repo_a").exists()


def test_scaffold_apply(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(root))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.post("/api/workspace/scaffold", json={"apply": True})
    assert response.status_code == 200
    data = response.json()
    assert data["applied"] is True
    assert (shared / "repo_a").is_dir()


def test_doctor_response_shape(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(root))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/doctor")
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert "healthy" in data
    assert "unhealthy" in data
    assert len(data["entries"]) == 1
    assert data["entries"][0]["repo"] == "repo_a"
    assert data["entries"][0]["status"] == "missing"


def test_workspace_link_endpoint(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "root"
    shared = tmp_path / "shared"
    shared.mkdir()
    _make_git_repo(root, "repo_a", with_working=True)

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(root))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.post("/api/workspace/link", json={"apply": True})
    assert response.status_code == 200
    data = response.json()
    assert data["applied"] is True
    assert "repo_a" in data["created"]


def test_workspace_index_endpoint(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.post("/api/workspace/index", json={"apply": True})
    assert response.status_code == 200
    data = response.json()
    assert data["applied"] is True
    assert "note_count" in data
    assert "repo_count" in data


def test_dirlist_endpoint(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    repo = shared / "my_repo"
    repo.mkdir(parents=True)
    (repo / "subdir").mkdir()
    (repo / ".hidden").mkdir()
    (repo / "notes.md").write_text("hello", encoding="utf-8")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/dirlist/my_repo")
    assert response.status_code == 200
    data = response.json()
    assert data["dirs"] == ["subdir"]
    assert data["files"] == ["notes.md"]


def test_dirlist_not_found(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/dirlist/nonexistent")
    assert response.status_code == 404


def test_file_read_endpoint(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    repo = shared / "my_repo"
    repo.mkdir(parents=True)
    (repo / "test.md").write_text("# Hello\nWorld", encoding="utf-8")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/file/my_repo/test.md")
    assert response.status_code == 200
    assert response.text == "# Hello\nWorld"


def test_file_read_not_found(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/file/nope.md")
    assert response.status_code == 404


def test_file_write_endpoint(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    repo = shared / "my_repo"
    repo.mkdir(parents=True)
    (repo / "test.md").write_text("old", encoding="utf-8")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.put(
        "/api/workspace/file/my_repo/test.md",
        content="# Updated\nNew content",
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert (repo / "test.md").read_text(encoding="utf-8") == "# Updated\nNew content"


def test_file_write_no_parent(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.put(
        "/api/workspace/file/nope/test.md",
        content="data",
        headers={"Content-Type": "text/plain"},
    )
    assert response.status_code == 404


def test_image_endpoint(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    repo = shared / "my_repo"
    repo.mkdir(parents=True)
    (repo / "pic.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8)

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/image/my_repo/pic.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_image_not_found(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/image/nope.png")
    assert response.status_code == 404


def test_image_non_image_rejected(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()
    (shared / "test.txt").write_text("hello", encoding="utf-8")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/image/test.txt")
    assert response.status_code == 400


def test_index_content_endpoint(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()
    (shared / "INDEX.md").write_text("# Index\nHello", encoding="utf-8")

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/index/content")
    assert response.status_code == 200
    assert "# Index" in response.text


def test_index_content_not_found(tmp_path: Path, monkeypatch) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()

    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(shared))

    client = TestClient(create_app())
    response = client.get("/api/workspace/index/content")
    assert response.status_code == 404
