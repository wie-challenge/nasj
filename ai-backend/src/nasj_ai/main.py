from fastapi import FastAPI

from nasj_ai import __version__
from nasj_ai.api.router import router
from nasj_ai.core.config import Settings
from nasj_ai.core.errors import install_error_handlers
from nasj_ai.core.middleware import RequestBoundary


def create_app(settings: Settings | None = None) -> FastAPI:
    configured = settings or Settings()
    development = configured.environment != "production"
    app = FastAPI(
        title="NASJ AI Service",
        version=__version__,
        description="Private backend for the Nasouj assistant. Service-to-service only.",
        docs_url="/docs" if development else None,
        redoc_url=None,
        openapi_url="/openapi.json" if development else None,
    )
    app.state.settings = configured
    app.add_middleware(RequestBoundary, max_bytes=configured.max_request_bytes)
    install_error_handlers(app)
    app.include_router(router)

    @app.get("/health/live", tags=["health"])
    def live() -> dict[str, str]:
        return {"status": "alive"}

    @app.get("/health/ready", tags=["health"])
    def ready() -> dict[str, str]:
        # No model, queue or cache connection is required yet.
        return {"status": "ready"}

    return app
