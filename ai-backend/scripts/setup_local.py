"""Create .env with private random secrets; add missing keys, never print or overwrite values."""

import os
import secrets
from collections.abc import Callable
from pathlib import Path

target = Path(__file__).resolve().parents[1] / ".env"
# Generators receive the values known so far, so URLs match the passwords already in .env.
defaults: dict[str, Callable[[dict[str, str]], str]] = {
    "NASJ_AI_ENVIRONMENT": lambda _: "development",
    "NASJ_AI_SERVICE_API_KEY": lambda _: secrets.token_urlsafe(48),
    "NASJ_AI_MAX_REQUEST_BYTES": lambda _: "65536",
    "NASJ_AI_RABBITMQ_USER": lambda _: "nasj_ai",
    "NASJ_AI_RABBITMQ_PASSWORD": lambda _: secrets.token_urlsafe(32),
    "NASJ_AI_REDIS_PASSWORD": lambda _: secrets.token_urlsafe(32),
    "NASJ_AI_RABBITMQ_URL": lambda known: (
        f"amqp://{known['NASJ_AI_RABBITMQ_USER']}:{known['NASJ_AI_RABBITMQ_PASSWORD']}"
        "@127.0.0.1:5672/nasj"
    ),
    "NASJ_AI_REDIS_URL": lambda known: (
        f"redis://:{known['NASJ_AI_REDIS_PASSWORD']}@127.0.0.1:6379/0"
    ),
    "NASJ_AI_LLM_PROVIDER": lambda _: "fake",
}


def complete(known: dict[str, str]) -> list[str]:
    added = [key for key in defaults if key not in known]
    for key in added:
        known[key] = defaults[key](known)
    return added


try:
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    lines = target.read_text().splitlines()
    known = {
        name.strip(): value.strip()
        for name, _, value in (line.partition("=") for line in lines if "=" in line)
    }
    missing = complete(known)
    if missing:
        with target.open("a") as stream:
            if lines and lines[-1].strip():
                stream.write("\n")
            stream.writelines(f"{key}={known[key]}\n" for key in missing)
        print(f"Added {len(missing)} missing setting(s) to .env; existing values preserved")
    else:
        print("Preserved existing .env")
else:
    values: dict[str, str] = {}
    complete(values)
    with os.fdopen(descriptor, "w") as stream:
        stream.writelines(f"{key}={value}\n" for key, value in values.items())
    print("Created private .env. Configure the same service key in the NestJS caller.")
