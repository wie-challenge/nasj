from fastapi import APIRouter

from nasj_ai.modules.forecast.schemas import ForecastRequest, ForecastResponse
from nasj_ai.modules.forecast.service import preview

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/preview", response_model=ForecastResponse)
def forecast_preview(payload: ForecastRequest) -> ForecastResponse:
    return preview(payload)
