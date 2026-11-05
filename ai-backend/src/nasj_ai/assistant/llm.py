"""Chat model clients. This is the only module that talks to a model provider."""

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

import openai
from openai.types.chat import ChatCompletionMessageParam

from nasj_ai.core.config import Settings


@dataclass(frozen=True)
class PromptMessage:
    role: Literal["system", "user", "assistant"]
    content: str


class ModelUnavailable(Exception):
    def __init__(self, code: Literal["model_busy", "model_unavailable"]) -> None:
        super().__init__(code)
        self.code: Literal["model_busy", "model_unavailable"] = code


class ChatModel(Protocol):
    name: str

    def stream(self, messages: Sequence[PromptMessage]) -> AsyncIterator[str]: ...


class FakeChat:
    """Streams a canned reply so queues, profiles and the website can be built without a key."""

    name = "fake"

    async def stream(self, messages: Sequence[PromptMessage]) -> AsyncIterator[str]:
        question = messages[-1].content[:200]
        reply = (
            f"(Fake model) Nasouj received: «{question}». "
            "Set NASJ_AI_LLM_PROVIDER=nvidia to get real answers."
        )
        for index, word in enumerate(reply.split(" ")):
            yield word if index == 0 else f" {word}"


class OpenAICompatibleChat:
    """NVIDIA Build speaks the OpenAI chat format, so the official client works unchanged."""

    def __init__(self, settings: Settings) -> None:
        assert settings.llm_api_key is not None
        self.name = settings.chat_model
        self._max_tokens = settings.llm_max_output_tokens
        self._client = openai.AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key.get_secret_value(),
            timeout=settings.llm_timeout_seconds,
            max_retries=1,
        )

    async def stream(self, messages: Sequence[PromptMessage]) -> AsyncIterator[str]:
        try:
            response = await self._client.chat.completions.create(
                model=self.name,
                messages=[_to_openai(message) for message in messages],
                max_tokens=self._max_tokens,
                stream=True,
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except openai.RateLimitError as error:
            raise ModelUnavailable("model_busy") from error
        except (openai.APIConnectionError, openai.APIStatusError) as error:
            raise ModelUnavailable("model_unavailable") from error


def _to_openai(message: PromptMessage) -> ChatCompletionMessageParam:
    if message.role == "system":
        return {"role": "system", "content": message.content}
    if message.role == "user":
        return {"role": "user", "content": message.content}
    return {"role": "assistant", "content": message.content}


def build_model(settings: Settings) -> ChatModel:
    return OpenAICompatibleChat(settings) if settings.llm_provider == "nvidia" else FakeChat()
