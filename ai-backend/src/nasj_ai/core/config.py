from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the NASJ AI service.

    ``NASJ_AI_`` is the current prefix. ``HIRFA_AI_`` is still accepted so an existing local
    ``.env`` written before the product rename keeps working; new deployments should use
    ``NASJ_AI_``.
    """

    model_config = SettingsConfigDict(
        env_prefix="NASJ_AI_",
        env_file=".env",
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    environment: Literal["development", "test", "production"] = Field(
        default="development",
        validation_alias=AliasChoices("NASJ_AI_ENVIRONMENT", "HIRFA_AI_ENVIRONMENT"),
    )
    service_api_key: SecretStr = Field(
        validation_alias=AliasChoices("NASJ_AI_SERVICE_API_KEY", "HIRFA_AI_SERVICE_API_KEY"),
    )
    max_request_bytes: int = Field(
        default=65_536,
        ge=1024,
        le=1_048_576,
        validation_alias=AliasChoices("NASJ_AI_MAX_REQUEST_BYTES", "HIRFA_AI_MAX_REQUEST_BYTES"),
    )

    @field_validator("service_api_key")
    @classmethod
    def key_is_configured(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value()
        if not 32 <= len(raw) <= 256 or not raw.isascii():
            raise ValueError("Configure a random ASCII service key of 32–256 characters")
        return value
