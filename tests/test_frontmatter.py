"""Tests for markdown front matter parsing and rendering."""

from pipeworks_dev_notes.frontmatter import (
    parse_markdown_with_frontmatter,
    render_markdown_with_frontmatter,
)


def test_parse_without_frontmatter_returns_empty_metadata() -> None:
    result = parse_markdown_with_frontmatter("# Heading\nBody")
    assert result.metadata == {}
    assert result.body == "# Heading\nBody"


def test_parse_with_frontmatter_extracts_metadata_and_body() -> None:
    result = parse_markdown_with_frontmatter(
        "---\nowner: aapark\nstatus: draft\nimpacted_repos:\n  - repo-a\n---\n# Title\nText"
    )
    assert result.metadata["owner"] == "aapark"
    assert result.metadata["status"] == "draft"
    assert result.metadata["impacted_repos"] == ["repo-a"]
    assert result.body == "# Title\nText"


def test_render_and_parse_round_trip() -> None:
    markdown = render_markdown_with_frontmatter(
        title="Chat User LLM Systems",
        content="Body text",
        metadata={
            "owner": "aapark",
            "status": "active",
            "breaking_change_risk": "high",
            "canonical_repo": "pipeworks_mud_server",
            "impacted_repos": ["pipeworks_axis_descriptor_lab"],
            "last_reviewed": "2026-03-05",
        },
    )

    parsed = parse_markdown_with_frontmatter(markdown)
    assert parsed.metadata["owner"] == "aapark"
    assert parsed.metadata["status"] == "active"
    assert "# Chat User LLM Systems" in parsed.body
    assert "Body text" in parsed.body
