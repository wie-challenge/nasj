"""RabbitMQ names shared by the worker, test script and (by agreement) the NestJS caller."""

from aio_pika.abc import AbstractChannel, AbstractQueue

REQUEST_QUEUE = "nasouj.chat.requests"
DEAD_LETTER_QUEUE = "nasouj.dead-letter"


async def declare_request_queue(channel: AbstractChannel) -> AbstractQueue:
    """Declare the durable request queue; rejected or expired requests are dead-lettered."""
    await channel.declare_queue(DEAD_LETTER_QUEUE, durable=True)
    return await channel.declare_queue(
        REQUEST_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": DEAD_LETTER_QUEUE,
        },
    )
