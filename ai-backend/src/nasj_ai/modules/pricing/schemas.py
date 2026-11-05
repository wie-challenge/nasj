from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from nasj_ai.schemas.common import (
    Money,
    Number,
    PositiveUnits,
    PreviewInput,
    PreviewMetadata,
    StrictModel,
)


class PricingAssumptions(StrictModel):
    kind: Literal["illustrative", "observed"]
    reference: Annotated[str, Field(min_length=3, max_length=200)]


class PricingRequest(PreviewInput):
    quantity: PositiveUnits
    labor_minutes_per_unit_min: Number
    labor_minutes_per_unit_max: Number
    labor_rate_tnd_per_hour: Money
    materials_tnd_per_unit: Money
    qa_tnd: Money
    transport_tnd: Money
    overhead_tnd: Money
    contingency_tnd: Money
    markup_percent: Annotated[Number, Field(le=100)]
    assumptions: PricingAssumptions

    @model_validator(mode="after")
    def valid_effort_range(self) -> Self:
        if self.labor_minutes_per_unit_min <= 0:
            raise ValueError("Labor time must be positive")
        if self.labor_minutes_per_unit_max < self.labor_minutes_per_unit_min:
            raise ValueError("Effort range is inverted")
        if self.snapshot.evidence_kind == "synthetic" and self.assumptions.kind == "observed":
            raise ValueError("Synthetic evidence cannot be labeled observed")
        return self


class CostBreakdown(StrictModel):
    labor_tnd: Decimal
    materials_tnd: Decimal
    qa_tnd: Decimal
    transport_tnd: Decimal
    overhead_tnd: Decimal
    contingency_tnd: Decimal
    subtotal_tnd: Decimal
    markup_tnd: Decimal
    total_excluding_tax_tnd: Decimal


class PricingResponse(StrictModel):
    metadata: PreviewMetadata
    input_snapshot: PricingRequest
    currency: Literal["TND"] = "TND"
    rounding: Literal["HALF_UP to 0.001 TND per line"] = "HALF_UP to 0.001 TND per line"
    labor_hours_min: Decimal
    labor_hours_max: Decimal
    low: CostBreakdown
    high: CostBreakdown
