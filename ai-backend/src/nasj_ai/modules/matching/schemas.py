from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from nasj_ai.schemas.common import (
    Identifier,
    Number,
    PositiveUnits,
    PreviewInput,
    PreviewMetadata,
    StrictModel,
    Units,
)


class Candidate(StrictModel):
    candidate_id: Identifier
    craft_ids: Annotated[list[Identifier], Field(max_length=20)]
    availability: Literal["available", "paused"]
    weekly_capacity_units: Units
    committed_units_per_week: Units
    skill_level: Annotated[int | None, Field(strict=True, ge=0, le=5)] = None

    @model_validator(mode="after")
    def commitments_fit(self) -> Self:
        if self.committed_units_per_week > self.weekly_capacity_units:
            raise ValueError("Commitments exceed declared capacity")
        return self


class Weights(StrictModel):
    skill: Number = Decimal("0.5")
    capacity: Number = Decimal("0.5")

    @model_validator(mode="after")
    def total_is_one(self) -> Self:
        if self.skill + self.capacity != 1:
            raise ValueError("Weights must sum to one")
        return self


class MatchingRequest(PreviewInput):
    craft_id: Identifier
    requested_units: PositiveUnits
    candidates: Annotated[list[Candidate], Field(max_length=100)]
    weights: Weights = Weights()

    @model_validator(mode="after")
    def unique_candidates(self) -> Self:
        ids = [candidate.candidate_id for candidate in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate candidate identifiers")
        return self


class ScoreComponents(StrictModel):
    skill_normalized: Decimal
    capacity_normalized: Decimal
    skill_weighted: Decimal
    capacity_weighted: Decimal


class CandidateResult(StrictModel):
    candidate_id: Identifier
    eligible: bool
    rank: int | None = None
    score: Decimal | None = None
    remaining_units_per_week: int
    components: ScoreComponents | None = None
    reasons: list[str]
    missing_evidence: list[str]


class MatchingResponse(StrictModel):
    metadata: PreviewMetadata
    input_snapshot: MatchingRequest
    results: list[CandidateResult]
