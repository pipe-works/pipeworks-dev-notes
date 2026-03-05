"""Tests for shared notes filesystem store."""

from pathlib import Path

import pytest

from pipeworks_dev_notes.store import NotesStore, NoteWrite


def _write_new_note(base_dir: Path, repo: str, filename: str, markdown: str) -> None:
    repo_dir = base_dir / repo
    repo_dir.mkdir(parents=True, exist_ok=True)
    (repo_dir / filename).write_text(markdown, encoding="utf-8")


def _write_legacy_note(base_dir: Path, note_dir_name: str, readme: str) -> None:
    note_dir = base_dir / note_dir_name
    note_dir.mkdir(parents=True, exist_ok=True)
    (note_dir / "README.md").write_text(readme, encoding="utf-8")


def test_list_notes_returns_summary_metadata(tmp_path: Path) -> None:
    _write_new_note(
        tmp_path,
        "pipeworks_mud_server",
        "chat-user-llm-systems.md",
        (
            "---\n"
            "title: Chat User LLM Systems\n"
            "owner: aapark\n"
            "status: active\n"
            "breaking_change_risk: high\n"
            "canonical_repo: pipeworks_mud_server\n"
            "impacted_repos:\n"
            "  - pipeworks_axis_descriptor_lab\n"
            "last_reviewed: 2026-03-05\n"
            "---\n"
            "Body content\n"
        ),
    )
    store = NotesStore(tmp_path)
    notes = store.list_notes()
    assert len(notes) == 1
    note = notes[0]
    assert note.note_id == "pipeworks_mud_server/chat-user-llm-systems.md"
    assert note.filename == "chat-user-llm-systems.md"
    assert note.canonical_repo == "pipeworks_mud_server"
    assert note.title == "Chat User LLM Systems"
    assert note.owner == "aapark"
    assert note.status == "active"
    assert note.breaking_change_risk == "high"
    assert note.impacted_repos == ["pipeworks_axis_descriptor_lab"]
    assert note.last_reviewed == "2026-03-05"


def test_get_note_returns_none_for_missing_note_id(tmp_path: Path) -> None:
    store = NotesStore(tmp_path)
    assert store.get_note("missing") is None


def test_create_and_update_note(tmp_path: Path) -> None:
    (tmp_path / "pipeworks_mud_server").mkdir(parents=True, exist_ok=True)
    store = NotesStore(tmp_path)
    created = store.create_note(
        canonical_repo="pipeworks_mud_server",
        filename="chat-user-llm-systems",
        payload=NoteWrite(
            title="Chat User LLM Systems",
            content="Initial content",
            owner="aapark",
            status="draft",
            breaking_change_risk="medium",
            canonical_repo="pipeworks_mud_server",
            impacted_repos=["pipeworks_axis_descriptor_lab"],
            last_reviewed="2026-03-05",
        ),
    )
    assert created.note_id == "pipeworks_mud_server/chat-user-llm-systems.md"
    assert created.filename == "chat-user-llm-systems.md"
    assert created.metadata["status"] == "draft"
    assert created.metadata["title"] == "Chat User LLM Systems"
    assert "Initial content" in created.content

    updated = store.update_note(
        note_id="pipeworks_mud_server/chat-user-llm-systems.md",
        payload=NoteWrite(
            title="Chat User LLM Systems",
            content="Updated content",
            owner="aapark",
            status="active",
            breaking_change_risk="high",
            canonical_repo="pipeworks_mud_server",
            impacted_repos=["pipeworks_axis_descriptor_lab", "pipeworks_image_generator"],
            last_reviewed="2026-03-06",
        ),
    )

    assert updated is not None
    assert updated.metadata["status"] == "active"
    assert updated.metadata["breaking_change_risk"] == "high"
    assert "Updated content" in updated.content


def test_create_note_rejects_invalid_path_parts(tmp_path: Path) -> None:
    (tmp_path / "pipeworks_mud_server").mkdir(parents=True, exist_ok=True)
    store = NotesStore(tmp_path)
    with pytest.raises(ValueError):
        store.create_note(
            canonical_repo="pipeworks_mud_server",
            filename="../bad-path",
            payload=NoteWrite(
                title="Bad",
                content="Bad",
                owner="aapark",
                status="draft",
                breaking_change_risk="low",
                canonical_repo="pipeworks_mud_server",
                impacted_repos=[],
                last_reviewed="2026-03-05",
            ),
        )


def test_create_note_requires_canonical_repo_directory(tmp_path: Path) -> None:
    store = NotesStore(tmp_path)
    with pytest.raises(FileNotFoundError):
        store.create_note(
            canonical_repo="pipeworks_mud_server",
            filename="chat.md",
            payload=NoteWrite(
                title="Bad",
                content="Body",
                owner="aapark",
                status="draft",
                breaking_change_risk="low",
                canonical_repo="pipeworks_mud_server",
                impacted_repos=[],
                last_reviewed="2026-03-05",
            ),
        )


def test_nested_subdirectory_notes_discovered(tmp_path: Path) -> None:
    repo_dir = tmp_path / "my_repo" / "subdir"
    repo_dir.mkdir(parents=True)
    (repo_dir / "deep-note.md").write_text(
        "---\ntitle: Deep Note\nowner: test\nstatus: draft\n"
        "breaking_change_risk: low\ncanonical_repo: my_repo\n"
        "impacted_repos: []\nlast_reviewed: ''\n---\nNested body\n",
        encoding="utf-8",
    )
    # Also a top-level note
    (tmp_path / "my_repo" / "top.md").write_text(
        "---\ntitle: Top Note\n---\nTop body\n",
        encoding="utf-8",
    )

    store = NotesStore(tmp_path)
    notes = store.list_notes()
    assert len(notes) == 2
    ids = [n.note_id for n in notes]
    assert "my_repo/subdir/deep-note.md" in ids
    assert "my_repo/top.md" in ids

    # Verify nested note can be fetched
    deep = store.get_note("my_repo/subdir/deep-note.md")
    assert deep is not None
    assert deep.title == "Deep Note"
    assert "Nested body" in deep.content


def test_legacy_directory_read_compatibility(tmp_path: Path) -> None:
    _write_legacy_note(
        tmp_path,
        "pipe-works-image-generation",
        (
            "---\n"
            "title: Legacy Note\n"
            "canonical_repo: pipeworks_image_generator\n"
            "---\n"
            "# Legacy heading\n"
            "Legacy body\n"
        ),
    )
    store = NotesStore(tmp_path)
    notes = store.list_notes()
    assert len(notes) == 1
    assert notes[0].note_id == "pipe-works-image-generation"
    legacy = store.get_note("pipe-works-image-generation")
    assert legacy is not None
    assert legacy.filename == "README.md"
    assert legacy.title == "Legacy Note"
