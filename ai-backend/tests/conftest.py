from collections.abc import Iterator

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from pydantic import SecretStr

from nasj_ai.core.config import Settings
from nasj_ai.core.security import require_service_key
from nasj_ai.main import create_app
from nasj_ai.schemas.common import StrictModel

TEST_KEY = "test-only-credential-not-for-deployment-123456"


class ProbeInput(StrictModel):
    message: str


# Stands in for a feature route so the shared service boundary can be tested.
probe = APIRouter(prefix="/api/v1", dependencies=[Depends(require_service_key)])


@probe.post("/test-only/probe")
def receive(_payload: ProbeInput) -> dict[str, bool]:
    return {"received": True}


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(
        _env_file=None,
        environment="test",
        service_api_key=SecretStr(TEST_KEY),
    )
    app = create_app(settings)
    app.include_router(probe)
    with TestClient(app) as session:
        yield session


@pytest.fixture
def headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_KEY}"}
