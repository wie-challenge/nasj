from decimal import ROUND_HALF_UP, Decimal

from nasj_ai.modules.pricing.schemas import CostBreakdown, PricingRequest, PricingResponse
from nasj_ai.schemas.common import metadata

RULE_VERSION = "pricing-rules-v1"


def money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def preview(payload: PricingRequest) -> PricingResponse:
    def breakdown(minutes: Decimal) -> CostBreakdown:
        labor = money(payload.quantity * minutes * payload.labor_rate_tnd_per_hour / 60)
        materials = money(payload.quantity * payload.materials_tnd_per_unit)
        subtotal = labor + materials + payload.qa_tnd + payload.transport_tnd
        subtotal += payload.overhead_tnd + payload.contingency_tnd
        subtotal = money(subtotal)
        markup = money(subtotal * payload.markup_percent / 100)
        return CostBreakdown(
            labor_tnd=labor,
            materials_tnd=materials,
            qa_tnd=money(payload.qa_tnd),
            transport_tnd=money(payload.transport_tnd),
            overhead_tnd=money(payload.overhead_tnd),
            contingency_tnd=money(payload.contingency_tnd),
            subtotal_tnd=subtotal,
            markup_tnd=markup,
            total_excluding_tax_tnd=subtotal + markup,
        )

    return PricingResponse(
        metadata=metadata(
            payload,
            RULE_VERSION,
            [
                "Rates and effort are caller-supplied assumptions, not validated fair-pay findings",
                "Markup is on cost, not a target gross margin; taxes are excluded",
                "Finance approval and artisan agreement are required outside this service",
            ],
        ),
        input_snapshot=payload,
        labor_hours_min=(payload.quantity * payload.labor_minutes_per_unit_min / 60).quantize(
            Decimal("0.000001"),
            rounding=ROUND_HALF_UP,
        ),
        labor_hours_max=(payload.quantity * payload.labor_minutes_per_unit_max / 60).quantize(
            Decimal("0.000001"),
            rounding=ROUND_HALF_UP,
        ),
        low=breakdown(payload.labor_minutes_per_unit_min),
        high=breakdown(payload.labor_minutes_per_unit_max),
    )
