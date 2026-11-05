from datetime import date
from typing import Any

from nasj_ai.modules.forecast.schemas import ForecastRequest
from nasj_ai.modules.forecast.service import preview


def test_scenarios_compare_buffer_readiness_and_shortfall(examples: dict[str, Any]) -> None:
    response = preview(ForecastRequest.model_validate(examples["forecast"]))
    feasible, late, full = response.scenarios
    assert feasible.production_days == 7
    assert feasible.earliest_completion == date(2026, 10, 26)
    assert feasible.feasible_by_deadline
    assert feasible.shortfall_units == 0
    assert late.effective_start_date == date(2026, 10, 25)
    assert not late.feasible_by_deadline
    assert late.shortfall_units == 7
    assert full.earliest_completion is None
    assert full.shortfall_units == 7


def test_start_day_counts_and_deadline_before_start_is_infeasible(examples: dict[str, Any]) -> None:
    data = examples["forecast"]
    scenario = data["scenarios"][0]
    scenario.update(quantity=1, buffer_days=0, deadline="2026-10-20")
    response = preview(ForecastRequest.model_validate(data)).scenarios[0]
    assert response.earliest_completion == date(2026, 10, 20)
    assert response.feasible_by_deadline
    scenario["deadline"] = "2026-10-19"
    response = preview(ForecastRequest.model_validate(data)).scenarios[0]
    assert not response.feasible_by_deadline
    assert response.shortfall_units == 1


def test_very_slow_scenario_does_not_overflow_the_calendar(examples: dict[str, Any]) -> None:
    data = examples["forecast"]
    data["scenarios"][0].update(quantity=1_000_000, weekly_capacity_units=1)
    result = preview(ForecastRequest.model_validate(data)).scenarios[0]
    assert result.earliest_completion is None
    assert not result.feasible_by_deadline
    assert any("supported calendar" in reason for reason in result.reasons)
