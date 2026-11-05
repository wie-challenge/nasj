"""Nasouj worker: takes chat requests from RabbitMQ and streams answers to each reply queue.

Run with: python -m nasj_ai.assistant.worker
"""

import asyncio
import logging
import time

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractIncomingMessage
from pydantic import ValidationError
from redis.asyncio import Redis

from nasj_ai.assistant.llm import ChatModel, build_model
from nasj_ai.assistant.messaging import declare_request_queue
from nasj_ai.assistant.pipeline import run_chat
from nasj_ai.assistant.rate_limit import MinuteRateLimiter, RedisCounter, limiter_name
from nasj_ai.assistant.schemas import ChatRequest, Delta, Done, ErrorEvent
from nasj_ai.core.config import Settings

logger = logging.getLogger("nasj_ai.worker")


class Worker:
    def __init__(
        self, channel: AbstractChannel, model: ChatModel, limiter: MinuteRateLimiter
    ) -> None:
        self._channel = channel
        self._model = model
        self._limiter = limiter

    async def handle(self, message: AbstractIncomingMessage) -> None:
        # Logs carry IDs, role and outcome only; never message content.
        if not message.reply_to or not message.correlation_id:
            logger.warning("Rejected request without reply address")
            await message.reject(requeue=False)
            return
        started = time.monotonic()
        try:
            request = ChatRequest.model_validate_json(message.body)
        except ValidationError:
            await self._reply(message, ErrorEvent(seq=1, code="invalid_request"))
            await message.ack()
            logger.info("correlation_id=%s outcome=invalid_request", message.correlation_id)
            return
        await self._limiter.acquire()
        outcome = "incomplete"
        try:
            async for event in run_chat(request, self._model):
                await self._reply(message, event)
                outcome = event.type
        except Exception as error:
            logger.error("request_id=%s failed: %s", request.request_id, type(error).__name__)
            await message.reject(requeue=False)
            return
        await message.ack()
        logger.info(
            "request_id=%s role=%s outcome=%s duration_ms=%d",
            request.request_id,
            request.role,
            outcome,
            (time.monotonic() - started) * 1000,
        )

    async def _reply(
        self, message: AbstractIncomingMessage, event: Delta | Done | ErrorEvent
    ) -> None:
        assert message.reply_to is not None
        await self._channel.default_exchange.publish(
            aio_pika.Message(
                event.model_dump_json().encode(),
                correlation_id=message.correlation_id,
                content_type="application/json",
            ),
            routing_key=message.reply_to,
        )


async def run(settings: Settings) -> None:
    if settings.rabbitmq_url is None or settings.redis_url is None:
        raise SystemExit(
            "Set NASJ_AI_RABBITMQ_URL and NASJ_AI_REDIS_URL (run python scripts/setup_local.py)"
        )
    redis_client = Redis.from_url(settings.redis_url.get_secret_value())
    connection = await aio_pika.connect_robust(settings.rabbitmq_url.get_secret_value())
    try:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=settings.worker_concurrency)
        queue = await declare_request_queue(channel)
        limiter = MinuteRateLimiter(
            RedisCounter(redis_client), limiter_name(settings), settings.llm_requests_per_minute
        )
        model = build_model(settings)
        await queue.consume(Worker(channel, model, limiter).handle)
        logger.info("Nasouj worker ready: provider=%s model=%s", settings.llm_provider, model.name)
        await asyncio.Future()
    finally:
        await connection.close()
        await redis_client.aclose()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        asyncio.run(run(Settings()))
    except KeyboardInterrupt:
        logger.info("Nasouj worker stopped")


if __name__ == "__main__":
    main()
