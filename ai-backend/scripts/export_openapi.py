"""Write the API contract without reading deployment credentials."""

import json
from pathlib import Path

from pydantic import SecretStr

from nasj_ai.core.config import Settings
from nasj_ai.main import create_app

settings = Settings(
    _env_file=None,
    environment="test",
    service_api_key=SecretStr("schema-export-only-not-a-deployment-key"),
)
target = Path(__file__).resolve().parents[1] / "docs/openapi.json"
target.write_text(json.dumps(create_app(settings).openapi(), indent=2, sort_keys=True) + "\n")
print("Updated docs/openapi.json")
