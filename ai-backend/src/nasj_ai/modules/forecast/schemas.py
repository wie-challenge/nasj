from datetime import date
from typing import Annotated, Self

from pydantic import Field, model_validator

from nasj_ai.schemas.common import (
    Identifier,
    PositiveUnits,
    PreviewInput,
    PreviewMetadata,
    StrictModel,
    Units,
)


class Scenario(StrictModel):
    scenario_id: Identifier
    quantity: PositiveUnits
    start_date: date
    materials_ready_date: date
    deadline: date
    weekly_capacity_units: Units
    committed_units_per_week: Units
    buffer_days: Annotated[int, Field(strict=True, ge=0, le=365)] = 0

    @model_validator(mode="after")
    def bounded_scenario(self) -> Self:
        if self.committed_units_per_week > self.weekly_capacity_units:
            raise ValueError("Commitments exceed declared capacity")
        if not all(
            2020 <= d.year <= 2100
            for d in (
                self.start_date,
                self.materials_ready_date,
                self.deadline,
            )
        ):
            raise ValueError("Scenario dates must be between 2020 and 2100")
        return self


class ForecastRequest(PreviewInput):
    scenarios: Annotated[list[Scenario], Field(min_length=1, max_length=10)]

    @model_validator(mode="after")
    def unique_scenarios(self) -> Self:
        ids = [item.scenario_id for item in self.scenarios]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate scenario identifiers")
        return self


class ScenarioResult(StrictModel):
    scenario_id: Identifier
    effective_start_date: date
    remaining_units_per_week: int
    production_days: int | None
    earliest_completion: date | None
    feasible_by_deadline: bool
    shortfall_units: int
    reasons: list[str]


class ForecastResponse(StrictModel):
    metadata: PreviewMetadata
    input_snapshot: ForecastRequest
    scenarios: list[ScenarioResult]
