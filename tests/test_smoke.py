"""Smoke tests for baseline project setup."""

from pipeworks_dev_notes import __version__
from pipeworks_dev_notes.metadata import default_template


def test_version_is_defined() -> None:
    """Project exposes a version string."""

    assert __version__ == "0.1.0"


def test_default_template_has_expected_defaults() -> None:
    """Metadata template defaults are intentionally conservative."""

    template = default_template()
    assert template.status == "draft"
    assert template.breaking_change_risk == "medium"
    assert template.impacted_repos == []
