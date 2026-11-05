from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from nasj_ai.core.config import Settings
from nasj_ai.main import create_app


def test_health_is_available_and_request_metadata_is_safe(client: TestClient) -> None:
    response = client.get("/health/ready")
    assert response.json() == {"status": "ready"}
    assert len(response.headers["x-request-id"]) == 32
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("module", ["matching", "pricing", "forecast"])
def test_previews_require_service_authentication(
    client: TestClient,
    examples: dict[str, Any],
    module: str,
) -> None:
    for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": "Basic dGVzdA=="}):
        response = client.post(f"/api/v1/{module}/preview", json=examples[module], headers=headers)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("module", ["matching", "pricing", "forecast"])
def test_previews_are_repeatable_and_label_their_limits(
    client: TestClient,
    headers: dict[str, str],
    examples: dict[str, Any],
    module: str,
) -> None:
    first = client.post(f"/api/v1/{module}/preview", json=examples[module], headers=headers)
    second = client.post(f"/api/v1/{module}/preview", json=examples[module], headers=headers)
    assert first.status_code == 200, first.text
    assert first.json() == second.json()
    meta = first.json()["metadata"]
    assert meta["human_review_required"] is True
    assert meta["snapshot"]["evidence_kind"] == "synthetic"
    assert meta["limitations"]


def test_rejected_input_and_credentials_are_not_echoed(
    client: TestClient,
    headers: dict[str, str],
    examples: dict[str, Any],
) -> None:
    payload = examples["matching"]
    payload["candidates"][0]["health_score"] = "PRIVATE-PAYLOAD-SENTINEL"
    response = client.post("/api/v1/matching/preview", json=payload, headers=headers)
    assert response.status_code == 422
    assert "PRIVATE-PAYLOAD-SENTINEL" not in response.text
    assert "health_score" not in response.text
    assert headers["Authorization"] not in response.text


def test_oversized_payload_is_rejected(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post("/api/v1/matching/preview", content=b"x" * 65_537, headers=headers)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_malformed_json_is_a_safe_validation_error(
    client: TestClient,
    headers: dict[str, str],
) -> None:
    response = client.post(
        "/api/v1/pricing/preview",
        content="{broken",
        headers={**headers, "Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "broken" not in response.text


def test_production_hides_api_documentation() -> None:
    settings = Settings(
        _env_file=None,
        environment="production",
        service_api_key=SecretStr("test-" * 10),
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404


def test_unexpected_failures_are_redacted() -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        service_api_key=SecretStr("test-" * 10),
    )
    app = create_app(settings)

    @app.get("/test-only-failure")
    def fail() -> None:
        raise RuntimeError("PRIVATE-EXCEPTION-SENTINEL")

    with TestClient(app, raise_server_exceptions=False) as session:
        response = session.get("/test-only-failure")
    assert response.status_code == 500
    assert "PRIVATE-EXCEPTION-SENTINEL" not in response.text
    assert response.json()["error"]["code"] == "internal_error"
    assert response.headers["cache-control"] == "no-store"


def test_missing_or_short_credentials_fail_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NASJ_AI_SERVICE_API_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, service_api_key=SecretStr("short"))


def test_request_logging_does_not_record_body_or_credentials(
    client: TestClient,
    headers: dict[str, str],
    examples: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    payload = examples["pricing"]
    payload["assumptions"]["reference"] = "PRIVATE-REFERENCE-SENTINEL"
    with caplog.at_level("INFO", logger="nasj_ai.requests"):
        response = client.post("/api/v1/pricing/preview", json=payload, headers=headers)
    assert response.status_code == 200
    assert "PRIVATE-REFERENCE-SENTINEL" not in caplog.text
    assert headers["Authorization"] not in caplog.text
    assert "request_id=" in caplog.text
