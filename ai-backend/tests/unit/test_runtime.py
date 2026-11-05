import asyncio
import shutil
import stat
import subprocess
import sys
from pathlib import Path

from starlette.types import Message, Receive, Scope, Send

from nasj_ai.core.middleware import RequestBoundary


def test_setup_preserves_existing_private_configuration(tmp_path: Path) -> None:
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    source = Path(__file__).parents[2] / "scripts/setup_local.py"
    shutil.copyfile(source, scripts / source.name)
    first = subprocess.check_output([sys.executable, str(scripts / source.name)], text=True)
    target = tmp_path / ".env"
    original = target.read_bytes()
    assert stat.S_IMODE(target.stat().st_mode) == 0o600
    second = subprocess.check_output([sys.executable, str(scripts / source.name)], text=True)
    assert original == target.read_bytes()
    key = original.decode().split("NASJ_AI_SERVICE_API_KEY=")[1].splitlines()[0]
    assert key not in first + second


def test_body_limit_counts_streamed_chunks_without_content_length() -> None:
    messages: list[Message] = [
        {"type": "http.request", "body": b"a" * 6, "more_body": True},
        {"type": "http.request", "body": b"b" * 6, "more_body": False},
    ]
    responses: list[Message] = []

    async def receive() -> Message:
        return messages.pop(0)

    async def send(message: Message) -> None:
        responses.append(message)

    async def downstream(_scope: Scope, _receive: Receive, _send: Send) -> None:
        raise AssertionError("Oversized requests must not reach the app")

    asyncio.run(
        RequestBoundary(downstream, max_bytes=10)(
            {"type": "http", "method": "POST", "headers": []},
            receive,
            send,
        )
    )
    assert responses[0]["status"] == 413
