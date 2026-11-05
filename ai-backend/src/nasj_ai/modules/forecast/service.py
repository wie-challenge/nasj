from datetime import date, timedelta

from nasj_ai.modules.forecast.schemas import ForecastRequest, ForecastResponse, ScenarioResult
from nasj_ai.schemas.common import metadata

RULE_VERSION = "forecast-rules-v1"


def preview(payload: ForecastRequest) -> ForecastResponse:
    results = []
    for scenario in payload.scenarios:
        start = max(scenario.start_date, scenario.materials_ready_date)
        remaining = scenario.weekly_capacity_units - scenario.committed_units_per_week
        days = (scenario.quantity * 7 + remaining - 1) // remaining if remaining else None
        # The first production day counts; buffer consumes whole days after production.
        offset = days - 1 + scenario.buffer_days if days else None
        completion = (
            start + timedelta(days=offset)
            if offset is not None and offset <= (date(2100, 12, 31) - start).days
            else None
        )
        horizon = max(0, (scenario.deadline - start).days + 1 - scenario.buffer_days)
        deliverable = remaining * horizon // 7
        shortfall = max(0, scenario.quantity - deliverable)
        reasons = [
            "Uniform throughput over seven calendar days per week; no holiday calendar",
            "Capacity is assumed unchanged throughout the scenario; no effort inference",
            f"Production begins after materials readiness; {scenario.buffer_days} buffer days",
        ]
        if not remaining:
            reasons.append("No uncommitted capacity; completion cannot be estimated")
        elif completion is None:
            reasons.append("Completion exceeds the supported calendar ending in 2100")
        if scenario.deadline < start:
            reasons.append("Deadline precedes the effective production start")
        results.append(
            ScenarioResult(
                scenario_id=scenario.scenario_id,
                effective_start_date=start,
                remaining_units_per_week=remaining,
                production_days=days,
                earliest_completion=completion,
                feasible_by_deadline=completion is not None and completion <= scenario.deadline,
                shortfall_units=shortfall,
                reasons=reasons,
            )
        )
    return ForecastResponse(
        metadata=metadata(
            payload,
            RULE_VERSION,
            [
                "Calendar-day capacity arithmetic, not a validated prediction model",
                "Exploration only; accepted commitments and order dates are not modified",
                "No effort inference: the input is declared weekly finished-unit capacity",
            ],
        ),
        input_snapshot=payload,
        scenarios=results,
    )
