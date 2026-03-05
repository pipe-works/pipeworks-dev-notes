"""YAML front matter parsing utilities."""

from __future__ import annotations

from dataclasses import dataclass

import yaml


@dataclass(frozen=True, slots=True)
class ParsedMarkdown:
    """Parsed markdown document content and metadata."""

    metadata: dict[str, object]
    body: str


def parse_markdown_with_frontmatter(content: str) -> ParsedMarkdown:
    """Parse optional YAML front matter from markdown content."""

    if not content.startswith("---\n"):
        return ParsedMarkdown(metadata={}, body=content)

    parts = content.split("---\n", 2)
    if len(parts) < 3:
        return ParsedMarkdown(metadata={}, body=content)

    _, metadata_block, remainder = parts
    raw = yaml.safe_load(metadata_block) or {}
    metadata = raw if isinstance(raw, dict) else {}
    return ParsedMarkdown(metadata=metadata, body=remainder.lstrip("\n"))


def render_markdown_with_frontmatter(
    *,
    title: str,
    content: str,
    metadata: dict[str, object],
) -> str:
    """Render markdown with YAML front matter and heading."""

    metadata_block = yaml.safe_dump(
        metadata,
        sort_keys=False,
        default_flow_style=False,
        allow_unicode=False,
    ).strip()
    body = content.strip()
    return f"---\n{metadata_block}\n---\n# {title.strip()}\n\n{body}\n"
