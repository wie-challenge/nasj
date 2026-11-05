from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import pytest
from pydantic import ValidationError

from nasj_ai.modules.matching.schemas import MatchingRequest
from nasj_ai.modules.matching.service import preview


def test_replay_and_explanations_reproduce_the_ranking(examples: dict[str, Any]) -> None:
    request = MatchingRequest.model_validate(examples["matching"])
    first = preview(request)
    assert first == preview(request)
    assert first.metadata.method == "deterministic_rules"
    assert [item.candidate_id for item in first.results] == ["artisan-a", "artisan-b", "artisan-c"]
    for result in first.results:
        if not result.eligible:
            assert result.rank is None and result.score is None
            continue
        components = result.components
        assert components is not None
        assert result.score == components.skill_weighted + components.capacity_weighted
        assert components.capacity_weighted == (
            components.capacity_normalized * request.weights.capacity
        ).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    assert first.results[2].reasons == ["Availability is paused"]


def test_ties_are_deterministic_and_missing_evidence_is_disclosed(examples: dict[str, Any]) -> None:
    data = examples["matching"]
    a = data["candidates"][0]
    a["skill_level"] = None
    data["candidates"] = [{**a, "candidate_id": "z"}, {**a, "candidate_id": "a"}]
    response = preview(MatchingRequest.model_validate(data))
    assert [item.candidate_id for item in response.results] == ["a", "z"]
    assert response.results[0].missing_evidence == ["skill_level"]


def test_full_and_wrong_craft_candidates_are_excluded(examples: dict[str, Any]) -> None:
    data = examples["matching"]
    data["candidates"][0]["committed_units_per_week"] = 40
    data["candidates"][1]["craft_ids"] = ["ceramics"]
    response = preview(MatchingRequest.model_validate(data))
    assert not any(item.eligible for item in response.results)
    assert all(item.reasons for item in response.results)


@pytest.mark.parametrize("change", ["duplicates", "overcommitted", "weights", "health"])
def test_invalid_or_sensitive_inputs_are_rejected(
    examples: dict[str, Any],
    change: str,
) -> None:
    data = examples["matching"]
    if change == "duplicates":
        data["candidates"].append(data["candidates"][0])
    elif change == "overcommitted":
        data["candidates"][0]["committed_units_per_week"] = 41
    elif change == "weights":
        data["weights"] = {"skill": "0.7", "capacity": "0.7"}
    else:
        data["candidates"][0]["wearable_participation"] = True
    with pytest.raises(ValidationError):
        MatchingRequest.model_validate(data)


def test_thirds_and_weight_rounding_use_displayed_components(examples: dict[str, Any]) -> None:
    data = examples["matching"]
    data["requested_units"] = 3
    data["candidates"][0]["weekly_capacity_units"] = 1
    data["candidates"][0]["committed_units_per_week"] = 0
    result = preview(MatchingRequest.model_validate(data)).results[1]
    assert result.candidate_id == "artisan-a"
    assert result.components is not None
    assert result.components.capacity_normalized == Decimal("0.333333")
    assert result.components.capacity_weighted == Decimal("0.166667")
