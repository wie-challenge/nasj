"""Bound HTTP payloads before JSON parsing; log metadata, never input bodies or headers."""

import logging
import time
from uuid import uuid4

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("nasj_ai.requests")


class RequestBoundary:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        chunks: list[bytes] = []
        length = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            length += len(chunk)
            if length > self.max_bytes:
                await JSONResponse(
                    {"error": {"code": "payload_too_large", "request_id": request_id}},
                    status_code=413,
                    headers={"X-Request-ID": request_id},
                )(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        sent_body = False
        status = 500
        started = time.monotonic()

        async def bounded_receive() -> Message:
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        async def contextual_send(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = list(message.get("headers", [])) + [
                    (b"x-request-id", request_id.encode()),
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ]
            await send(message)

        try:
            await self.app(scope, bounded_receive, contextual_send)
        finally:
            route = scope.get("route")
            logger.info(
                "request_id=%s method=%s route=%s status=%s duration_ms=%.2f",
                request_id,
                scope.get("method"),
                getattr(route, "path", "unmatched"),
                status,
                (time.monotonic() - started) * 1000,
            )
