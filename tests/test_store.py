"""Tests for shared notes filesystem store."""

from pathlib import Path

import pytest

from pipeworks_dev_notes.store import NotesStore, NoteWrite


def _write_note(base_dir: Path, slug: str, readme: str) -> None:
    note_dir = base_dir / slug
    note_dir.mkdir(parents=True, exist_ok=True)
    (note_dir / "README.md").write_text(readme, encoding="utf-8")


def test_list_notes_returns_summary_metadata(tmp_path: Path) -> None:
    _write_note(
        tmp_path,
        "chat-user-llm-systems",
        (
            "---\n"
            "owner: aapark\n"
            "status: active\n"
            "breaking_change_risk: high\n"
            "canonical_repo: pipeworks_mud_server\n"
            "impacted_repos:\n"
            "  - pipeworks_axis_descriptor_lab\n"
            "last_reviewed: 2026-03-05\n"
            "---\n"
            "# Chat User LLM Systems\n"
            "Body\n"
        ),
    )
    store = NotesStore(tmp_path)
    notes = store.list_notes()
    assert len(notes) == 1
    note = notes[0]
    assert note.slug == "chat-user-llm-systems"
    assert note.title == "Chat User LLM Systems"
    assert note.owner == "aapark"
    assert note.status == "active"
    assert note.breaking_change_risk == "high"
    assert note.canonical_repo == "pipeworks_mud_server"
    assert note.impacted_repos == ["pipeworks_axis_descriptor_lab"]
    assert note.last_reviewed == "2026-03-05"


def test_get_note_returns_none_for_missing_slug(tmp_path: Path) -> None:
    store = NotesStore(tmp_path)
    assert store.get_note("missing") is None


def test_create_and_update_note(tmp_path: Path) -> None:
    store = NotesStore(tmp_path)
    created = store.create_note(
        slug="chat-user-llm-systems",
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
    assert created.slug == "chat-user-llm-systems"
    assert created.metadata["status"] == "draft"
    assert "Initial content" in created.content

    updated = store.update_note(
        slug="chat-user-llm-systems",
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


def test_create_note_rejects_invalid_slug(tmp_path: Path) -> None:
    store = NotesStore(tmp_path)
    with pytest.raises(ValueError):
        store.create_note(
            slug="../bad-path",
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
