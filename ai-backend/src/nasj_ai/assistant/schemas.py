"""Queue message formats between NestJS and the Nasouj worker (plan section 6.2)."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, field_validator

from nasj_ai.schemas.common import StrictModel

Role = Literal[
    "BUYER_REPRESENTATIVE",
    "ASSOCIATION_COORDINATOR",
    "PLATFORM_ADMIN",
    "NASJ_OPERATOR",
]
# Website permission names, e.g. "buyer.rfq.create", "association.offer.recordDecision".
Permission = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")]


class ChatMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(StrictModel):
    version: Literal[1] = 1
    request_id: UUID
    role: Role
    locale: Literal["ar", "fr", "en"]
    route: str = Field(default="/", max_length=200, pattern=r"^/[A-Za-z0-9/_\-\[\].]*$")
    organization_type: (
        Literal["BUYER_BUSINESS", "ASSOCIATION", "PARTNER_COOPERATIVE", "INTERNAL"] | None
    ) = None
    permissions: list[Permission] = Field(default_factory=list, max_length=100)
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)

    @field_validator("messages")
    @classmethod
    def ends_with_user(cls, value: list[ChatMessage]) -> list[ChatMessage]:
        if value[-1].role != "user":
            raise ValueError("The last message must come from the user")
        return value


class Usage(StrictModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)


class Delta(StrictModel):
    type: Literal["delta"] = "delta"
    seq: int = Field(ge=1)
    text: str


class Done(StrictModel):
    type: Literal["done"] = "done"
    seq: int = Field(ge=1)
    model: str
    profile: str
    usage: Usage | None = None


ErrorCode = Literal["invalid_request", "model_busy", "model_unavailable"]


class ErrorEvent(StrictModel):
    type: Literal["error"] = "error"
    seq: int = Field(ge=1)
    code: ErrorCode


ReplyEvent = Annotated[Delta | Done | ErrorEvent, Field(discriminator="type")]
