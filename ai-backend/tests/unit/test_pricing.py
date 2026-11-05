from decimal import Decimal
from typing import Any

import pytest
from pydantic import ValidationError

from nasj_ai.modules.pricing.schemas import PricingRequest
from nasj_ai.modules.pricing.service import money, preview


def test_exact_tnd_costing_and_edit_recalculation(examples: dict[str, Any]) -> None:
    data = examples["pricing"]
    response = preview(PricingRequest.model_validate(data))
    # 10 × 30 min × 6 TND/hour = 30 labor; materials 20; fixed lines 10.
    assert response.low.labor_tnd == Decimal("30.000")
    assert response.low.subtotal_tnd == Decimal("60.000")
    assert response.low.total_excluding_tax_tnd == Decimal("66.000")
    assert response.high.labor_tnd == Decimal("60.000")
    assert response.high.total_excluding_tax_tnd == Decimal("99.000")
    data["materials_tnd_per_unit"] = "3.000"
    edited = preview(PricingRequest.model_validate(data))
    assert edited.low.total_excluding_tax_tnd == Decimal("77.000")
    assert edited.metadata.input_digest != response.metadata.input_digest


def test_half_millime_rounds_up() -> None:
    assert money(Decimal("1.0005")) == Decimal("1.001")


@pytest.mark.parametrize("change", ["float", "nan", "inverted", "fake_observed", "negative"])
def test_pricing_rejects_ambiguous_or_invalid_values(examples: dict[str, Any], change: str) -> None:
    data = examples["pricing"]
    if change == "float":
        data["materials_tnd_per_unit"] = 2.123
    elif change == "nan":
        data["labor_rate_tnd_per_hour"] = "NaN"
    elif change == "inverted":
        data["labor_minutes_per_unit_max"] = "10"
    elif change == "fake_observed":
        data["assumptions"]["kind"] = "observed"
    else:
        data["transport_tnd"] = "-1"
    with pytest.raises(ValidationError):
        PricingRequest.model_validate(data)
