from fastapi import APIRouter

from nasj_ai.modules.matching.schemas import MatchingRequest, MatchingResponse
from nasj_ai.modules.matching.service import preview

router = APIRouter(prefix="/matching", tags=["matching"])


@router.post("/preview", response_model=MatchingResponse)
def matching_preview(payload: MatchingRequest) -> MatchingResponse:
    return preview(payload)
