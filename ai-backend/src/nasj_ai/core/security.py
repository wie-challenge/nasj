from secrets import compare_digest
from typing import Annotated

from fastapi import HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False, scheme_name="NestJS service credential")


def require_service_key(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
) -> None:
    expected = request.app.state.settings.service_api_key.get_secret_value()
    supplied = credentials.credentials if credentials else ""
    # Bytes also handle malformed non-ASCII credentials without a comparison exception.
    if not compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(
            status_code=401,
            detail="Service authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
