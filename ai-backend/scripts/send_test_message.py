"""Send one chat request through RabbitMQ and print Nasouj's streamed answer.

Plays the part of NestJS, so the worker can be tested alone. The worker must be running.

    python scripts/send_test_message.py --role ASSOCIATION_COORDINATOR "Bonjour Nasouj"
"""

import argparse
import asyncio
import io
import sys
import uuid
from typing import get_args

import aio_pika
from aio_pika.abc import AbstractIncomingMessage
from pydantic import RootModel

from nasj_ai.assistant.messaging import REQUEST_QUEUE, declare_request_queue
from nasj_ai.assistant.schemas import ChatRequest, Delta, ReplyEvent, Role
from nasj_ai.core.config import Settings


class Reply(RootModel[ReplyEvent]):
    pass


async def send(role: str, locale: str, text: str, timeout: float) -> None:
    settings = Settings()
    if settings.rabbitmq_url is None:
        sys.exit("Set NASJ_AI_RABBITMQ_URL (run python scripts/setup_local.py)")
    request = ChatRequest.model_validate(
        {
            "request_id": str(uuid.uuid4()),
            "role": role,
            "locale": locale,
            "messages": [{"role": "user", "content": text}],
        }
    )
    correlation_id = str(request.request_id)
    finished = asyncio.Event()

    async def on_reply(message: AbstractIncomingMessage) -> None:
        async with message.process():
            if message.correlation_id != correlation_id:
                return
            event = Reply.model_validate_json(message.body).root
            if isinstance(event, Delta):
                print(event.text, end="", flush=True)
            else:
                print(f"\n\n[{event.model_dump_json()}]")
                finished.set()

    connection = await aio_pika.connect_robust(settings.rabbitmq_url.get_secret_value())
    async with connection:
        channel = await connection.channel()
        await declare_request_queue(channel)
        replies = await channel.declare_queue(exclusive=True, auto_delete=True)
        await replies.consume(on_reply)
        await channel.default_exchange.publish(
            aio_pika.Message(
                request.model_dump_json().encode(),
                correlation_id=correlation_id,
                reply_to=replies.name,
                expiration=60,
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=REQUEST_QUEUE,
        )
        try:
            await asyncio.wait_for(finished.wait(), timeout)
        except TimeoutError:
            sys.exit(f"\nNo complete answer within {timeout:.0f}s. Is the worker running?")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("text")
    parser.add_argument("--role", choices=get_args(Role), default="BUYER_REPRESENTATIVE")
    parser.add_argument("--locale", choices=("ar", "fr", "en"), default="fr")
    parser.add_argument("--timeout", type=float, default=90)
    arguments = parser.parse_args()
    # Windows consoles may default to a legacy code page that can't show Arabic or accents.
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(send(arguments.role, arguments.locale, arguments.text, arguments.timeout))
