"""Smoke tests for baseline project setup."""

import re

from pipeworks_dev_notes import __version__
from pipeworks_dev_notes.metadata import default_template


def test_version_is_defined() -> None:
    """Project exposes a version string."""

    assert __version__
    assert re.fullmatch(r"\d+\.\d+\.\d+", __version__)


def test_default_template_has_expected_defaults() -> None:
    """Metadata template defaults are intentionally conservative."""

    template = default_template()
    assert template.status == "draft"
    assert template.breaking_change_risk == "medium"
    assert template.impacted_repos == []
