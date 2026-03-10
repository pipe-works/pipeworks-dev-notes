"""Tests for module entrypoint helpers."""

from pipeworks_dev_notes.__main__ import _build_uvicorn_log_config, _parse_port, find_available_port


def test_parse_port_accepts_valid_value() -> None:
    assert _parse_port("8765") == 8765


def test_find_available_port_prefers_requested_when_free(monkeypatch) -> None:
    monkeypatch.setattr("pipeworks_dev_notes.__main__._is_port_available", lambda host, port: True)
    assert find_available_port("127.0.0.1", 8765) == 8765


def test_find_available_port_scans_forward(monkeypatch) -> None:
    state = {"calls": []}

    def fake_is_available(host: str, port: int) -> bool:
        state["calls"].append(port)
        return port == 8767

    monkeypatch.setattr("pipeworks_dev_notes.__main__._is_port_available", fake_is_available)
    selected = find_available_port("127.0.0.1", 8765, max_attempts=5)

    assert selected == 8767
    assert state["calls"] == [8765, 8766, 8767]


def test_build_uvicorn_log_config_adds_service_prefix() -> None:
    config = _build_uvicorn_log_config()
    formatters = config["formatters"]
    assert formatters["default"]["fmt"].startswith("dev-notes ")
    assert formatters["access"]["fmt"].startswith("dev-notes ")
