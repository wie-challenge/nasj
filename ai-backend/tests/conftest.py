import copy
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from nasj_ai.core.config import Settings
from nasj_ai.main import create_app

TEST_KEY = "test-only-credential-not-for-deployment-123456"


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(
        _env_file=None,
        environment="test",
        service_api_key=SecretStr(TEST_KEY),
    )
    with TestClient(create_app(settings)) as session:
        yield session


@pytest.fixture
def headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_KEY}"}


@pytest.fixture
def examples() -> dict[str, Any]:
    directory = Path(__file__).parent.parent / "examples"
    return {
        name: copy.deepcopy(json.loads((directory / f"{name}.json").read_text()))
        for name in ("matching", "pricing", "forecast")
    }
