from typing import Literal, Self

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the NASJ AI service.


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

    # Queue and cache; only the Nasouj worker needs them.
    rabbitmq_url: SecretStr | None = None
    redis_url: SecretStr | None = None

    # "fake" streams a canned answer so the pipeline works without a model key.
    llm_provider: Literal["fake", "nvidia"] = "fake"
    llm_base_url: str = "https://integrate.api.nvidia.com/v1"
    llm_api_key: SecretStr | None = None
    chat_model: str = ""
    llm_timeout_seconds: float = Field(default=60, gt=0, le=300)
    llm_max_output_tokens: int = Field(default=1024, ge=64, le=8192)
    llm_requests_per_minute: int = Field(default=35, ge=1, le=10_000)
    worker_concurrency: int = Field(default=4, ge=1, le=64)

    @field_validator("service_api_key")
    @classmethod
    def key_is_configured(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value()
        if not 32 <= len(raw) <= 256 or not raw.isascii():
            raise ValueError("Configure a random ASCII service key of 32–256 characters")
        return value

    @field_validator("rabbitmq_url", "redis_url", "llm_api_key", mode="before")
    @classmethod
    def blank_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def model_is_configured(self) -> Self:
        if self.llm_provider == "nvidia" and (self.llm_api_key is None or not self.chat_model):
            raise ValueError("The nvidia provider needs NASJ_AI_LLM_API_KEY and NASJ_AI_CHAT_MODEL")
        return self
