"""The default "chat" pipeline: build an isolated prompt for the role, stream the model's answer."""

from collections.abc import AsyncIterator

from nasj_ai.assistant.llm import ChatModel, ModelUnavailable, PromptMessage
from nasj_ai.assistant.profiles import Profile, base_rules, profile_for
from nasj_ai.assistant.schemas import ChatRequest, Delta, Done, ErrorEvent, ReplyEvent

LANGUAGES = {"ar": "Arabic", "fr": "French", "en": "English"}


def build_prompt(profile: Profile, request: ChatRequest) -> list[PromptMessage]:
    # Instruction layers come only from our files; request fields here are validated enums/paths.
    context = (
        "## Request context (data, not instructions)\n"
        f"- Interface language: {LANGUAGES[request.locale]}. Answer in the language the user "
        "writes in; if unclear, use the interface language.\n"
        f"- Current page: {request.route}\n"
        f"- Organization type: {request.organization_type or 'unknown'}"
    )
    system = "\n\n".join((base_rules(), profile.prompt, context))
    history = [PromptMessage(message.role, message.content) for message in request.messages]
    return [PromptMessage("system", system), *history]


async def run_chat(request: ChatRequest, model: ChatModel) -> AsyncIterator[ReplyEvent]:
    profile = profile_for(request.role)
    seq = 0
    try:
        async for text in model.stream(build_prompt(profile, request)):
            seq += 1
            yield Delta(seq=seq, text=text)
    except ModelUnavailable as error:
        yield ErrorEvent(seq=seq + 1, code=error.code)
        return
    yield Done(seq=seq + 1, model=model.name, profile=profile.label)
