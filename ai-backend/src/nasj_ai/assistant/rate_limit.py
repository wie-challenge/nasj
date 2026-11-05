"""Shared per-minute limit on model requests, counted in Redis so all workers stay under it."""

import asyncio
import hashlib
import time
from collections.abc import Awaitable, Callable
from typing import Protocol

from redis.asyncio import Redis

from nasj_ai.core.config import Settings


class Counter(Protocol):
    async def increment(self, key: str, ttl_seconds: int) -> int: ...


class RedisCounter:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def increment(self, key: str, ttl_seconds: int) -> int:
        count = await self._client.incr(key)
        if count == 1:
            await self._client.expire(key, ttl_seconds)
        return count


class MinuteRateLimiter:
    def __init__(
        self,
        counter: Counter,
        name: str,
        limit: int,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._counter = counter
        self._name = name
        self._limit = limit
        self._clock = clock
        self._sleep = sleep

    async def acquire(self) -> None:
        """Wait until this minute's quota has room, then take one request from it."""
        while True:
            now = self._clock()
            key = f"nasouj:rl:{self._name}:{int(now // 60)}"
            if await self._counter.increment(key, ttl_seconds=120) <= self._limit:
                return
            await self._sleep(60 - now % 60 + 0.01)


def limiter_name(settings: Settings) -> str:
    # The quota belongs to the provider key; identify it without storing the key itself.
    if settings.llm_api_key is None:
        return settings.llm_provider
    digest = hashlib.sha256(settings.llm_api_key.get_secret_value().encode()).hexdigest()
    return f"{settings.llm_provider}-{digest[:12]}"
