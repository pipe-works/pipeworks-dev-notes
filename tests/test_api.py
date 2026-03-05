"""Integration tests for API endpoints."""

from pathlib import Path

from fastapi.testclient import TestClient

from pipeworks_dev_notes.app import create_app


def _write_new_note(base_dir: Path, repo: str, filename: str, markdown: str) -> None:
    repo_dir = base_dir / repo
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / filename).write_text(markdown, encoding="utf-8")


def _write_legacy_note(base_dir: Path, note_dir_name: str, readme: str) -> None:
    note_dir = base_dir / note_dir_name
    note_dir.mkdir(parents=True, exist_ok=True)
    (note_dir / "README.md").write_text(readme, encoding="utf-8")


def test_health_endpoint() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_notes_endpoints(tmp_path: Path, monkeypatch) -> None:
    _write_new_note(
        tmp_path,
        "pipeworks_image_generator",
        "pipe-works-image-generation.md",
        (
            "---\n"
            "title: Pipe Works Image Generation\n"
            "owner: aapark\n"
            "status: draft\n"
            "breaking_change_risk: medium\n"
            "canonical_repo: pipeworks_image_generator\n"
            "impacted_repos:\n"
            "  - pipeworks_mud_server\n"
            "last_reviewed: 2026-03-05\n"
            "---\n"
            "Cross-repo note content.\n"
        ),
    )
    _write_legacy_note(
        tmp_path,
        "legacy-sample",
        (
            "---\n"
            "title: Legacy Sample\n"
            "canonical_repo: pipeworks_mud_server\n"
            "---\n"
            "# Legacy Sample\n"
            "Legacy body\n"
        ),
    )
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(tmp_path))

    client = TestClient(create_app())
    repos_response = client.get("/api/repos")
    assert repos_response.status_code == 200
    assert repos_response.json() == ["legacy-sample", "pipeworks_image_generator"]

    list_response = client.get("/api/notes")
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload) == 2
    note_ids = {item["note_id"] for item in list_payload}
    assert "pipeworks_image_generator/pipe-works-image-generation.md" in note_ids
    assert "legacy-sample" in note_ids

    detail_response = client.get(
        "/api/notes/pipeworks_image_generator/pipe-works-image-generation.md"
    )
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["title"] == "Pipe Works Image Generation"
    assert detail_payload["filename"] == "pipe-works-image-generation.md"
    assert detail_payload["metadata"]["canonical_repo"] == "pipeworks_image_generator"
    assert "Cross-repo note content." in detail_payload["content"]

    missing_response = client.get("/api/notes/missing")
    assert missing_response.status_code == 404


def test_create_and_update_note_endpoints(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / "pipeworks_mud_server").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(tmp_path))
    client = TestClient(create_app())

    create_payload = {
        "filename": "chat-user-llm-systems.md",
        "title": "Chat User LLM Systems",
        "content": "Initial content from API",
        "owner": "aapark",
        "status": "draft",
        "breaking_change_risk": "medium",
        "canonical_repo": "pipeworks_mud_server",
        "impacted_repos": ["pipeworks_axis_descriptor_lab"],
        "last_reviewed": "2026-03-05",
    }
    create_response = client.post("/api/notes", json=create_payload)
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["note_id"] == "pipeworks_mud_server/chat-user-llm-systems.md"
    assert created["metadata"]["owner"] == "aapark"

    update_payload = {
        **create_payload,
        "status": "active",
        "breaking_change_risk": "high",
        "content": "Updated content from API",
    }
    update_response = client.put(
        "/api/notes/pipeworks_mud_server/chat-user-llm-systems.md",
        json=update_payload,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["metadata"]["status"] == "active"
    assert updated["metadata"]["breaking_change_risk"] == "high"
    assert "Updated content from API" in updated["content"]


def test_create_note_conflict_and_validation(tmp_path: Path, monkeypatch) -> None:
    (tmp_path / "pipeworks_mud_server").mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(tmp_path))
    client = TestClient(create_app())

    payload = {
        "canonical_repo": "pipeworks_mud_server",
        "filename": "valid-note.md",
        "title": "Valid Slug",
        "content": "Body",
    }
    first = client.post("/api/notes", json=payload)
    assert first.status_code == 201

    second = client.post("/api/notes", json=payload)
    assert second.status_code == 409

    invalid = client.post(
        "/api/notes",
        json={
            "canonical_repo": "pipeworks_mud_server",
            "filename": "../bad-slug",
            "title": "Bad Slug",
            "content": "Body",
        },
    )
    assert invalid.status_code == 400


def test_create_requires_existing_canonical_repo_directory(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PIPEWORKS_DEV_NOTES_SHARED_DIR", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/notes",
        json={
            "canonical_repo": "pipeworks_mud_server",
            "filename": "new-note.md",
            "title": "Missing Repo Dir",
            "content": "Body",
        },
    )
    assert response.status_code == 404
