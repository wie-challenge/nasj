from decimal import ROUND_HALF_UP, Decimal

from nasj_ai.modules.matching.schemas import (
    CandidateResult,
    MatchingRequest,
    MatchingResponse,
    ScoreComponents,
)
from nasj_ai.schemas.common import metadata

RULE_VERSION = "matching-rules-v1"
PRECISION = Decimal("0.000001")


def preview(payload: MatchingRequest) -> MatchingResponse:
    results: list[CandidateResult] = []
    for candidate in payload.candidates:
        remaining = candidate.weekly_capacity_units - candidate.committed_units_per_week
        exclusions = []
        if payload.craft_id not in candidate.craft_ids:
            exclusions.append("Required craft is not declared")
        if candidate.availability != "available":
            exclusions.append("Availability is paused")
        if remaining == 0:
            exclusions.append("No uncommitted declared weekly capacity")
        missing = ["skill_level"] if candidate.skill_level is None else []
        components = None
        score = None
        reasons = exclusions
        if not exclusions:
            skill = (Decimal(candidate.skill_level or 0) / 5).quantize(PRECISION)
            capacity = min(Decimal(remaining) / payload.requested_units, Decimal(1)).quantize(
                PRECISION,
                rounding=ROUND_HALF_UP,
            )
            skill_weighted = (skill * payload.weights.skill).quantize(
                PRECISION,
                rounding=ROUND_HALF_UP,
            )
            capacity_weighted = (capacity * payload.weights.capacity).quantize(
                PRECISION,
                rounding=ROUND_HALF_UP,
            )
            components = ScoreComponents(
                skill_normalized=skill.quantize(PRECISION),
                capacity_normalized=capacity.quantize(PRECISION),
                skill_weighted=skill_weighted,
                capacity_weighted=capacity_weighted,
            )
            score = skill_weighted + capacity_weighted
            reasons = [
                "Required craft is declared and availability is available",
                f"{remaining} uncommitted units/week for {payload.requested_units} requested units",
                "Missing skill evidence contributes zero; it is not an observed skill assessment"
                if missing
                else f"Declared skill level {candidate.skill_level}/5",
            ]
        results.append(
            CandidateResult(
                candidate_id=candidate.candidate_id,
                eligible=not exclusions,
                score=score,
                remaining_units_per_week=remaining,
                components=components,
                reasons=reasons,
                missing_evidence=missing,
            )
        )
    results.sort(key=lambda item: (not item.eligible, -(item.score or 0), item.candidate_id))
    ranked = [
        item.model_copy(update={"rank": i + 1}) if item.eligible else item
        for i, item in enumerate(results)
    ]
    return MatchingResponse(
        metadata=metadata(
            payload,
            RULE_VERSION,
            [
                "Unvalidated operational weights; this is a rules baseline, not trained ML",
                "Capacity is a weekly snapshot, not a dated allocation or availability guarantee",
                "Recommendations neither select artisans nor create accepted commitments",
            ],
        ),
        input_snapshot=payload,
        results=ranked,
    )
