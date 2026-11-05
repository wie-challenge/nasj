from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, _error: RequestValidationError) -> JSONResponse:
        # Pydantic's default errors include rejected input. Do not echo it.
        return JSONResponse(
            {"error": {"code": "invalid_request", "request_id": request.state.request_id}},
            status_code=422,
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        return JSONResponse(
            {
                "error": {
                    "code": f"http_{error.status_code}",
                    "request_id": request.state.request_id,
                }
            },
            status_code=error.status_code,
            headers=error.headers,
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, _error: Exception) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": "internal_error", "request_id": request.state.request_id}},
            status_code=500,
            headers={"X-Request-ID": request.state.request_id, "Cache-Control": "no-store"},
        )
