from fastapi import APIRouter, Depends

from nasj_ai.core.security import require_service_key

# Service-authenticated versioned API. Feature routers are included here.
router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_service_key)])
