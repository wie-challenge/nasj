from fastapi import APIRouter, Depends

from nasj_ai.core.security import require_service_key
from nasj_ai.modules.forecast.router import router as forecast
from nasj_ai.modules.matching.router import router as matching
from nasj_ai.modules.pricing.router import router as pricing

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_service_key)])
router.include_router(matching)
router.include_router(pricing)
router.include_router(forecast)
