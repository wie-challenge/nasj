import hashlib
import json
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict, Field


def decimal_string(value: object) -> object:
    if not isinstance(value, (str, Decimal)):
        raise ValueError("Decimal quantities must be encoded as strings")
    return value


Number = Annotated[
    Decimal,
    BeforeValidator(decimal_string),
    Field(ge=0, le=1_000_000, max_digits=13, decimal_places=6, allow_inf_nan=False),
]
Money = Annotated[
    Decimal,
    BeforeValidator(decimal_string),
    Field(ge=0, le=1_000_000_000, max_digits=13, decimal_places=3, allow_inf_nan=False),
]
Identifier = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
Units = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
PositiveUnits = Annotated[int, Field(strict=True, ge=1, le=1_000_000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, hide_input_in_errors=True)


class Snapshot(StrictModel):
    snapshot_id: UUID
    as_of: AwareDatetime
    evidence_kind: Literal["synthetic", "observed"]


class PreviewInput(StrictModel):
    snapshot: Snapshot


class PreviewMetadata(StrictModel):
    rule_version: str
    method: Literal["deterministic_rules"] = "deterministic_rules"
    input_digest: str
    snapshot: Snapshot
    human_review_required: Literal[True] = True
    limitations: list[str]


def metadata(payload: PreviewInput, version: str, limitations: list[str]) -> PreviewMetadata:
    canonical = json.dumps(payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return PreviewMetadata(
        rule_version=version,
        input_digest=hashlib.sha256(canonical.encode()).hexdigest(),
        snapshot=payload.snapshot,
        limitations=limitations,
    )
