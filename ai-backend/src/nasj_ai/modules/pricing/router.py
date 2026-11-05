from fastapi import APIRouter

from nasj_ai.modules.pricing.schemas import PricingRequest, PricingResponse
from nasj_ai.modules.pricing.service import preview

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/preview", response_model=PricingResponse)
def pricing_preview(payload: PricingRequest) -> PricingResponse:
    return preview(payload)
