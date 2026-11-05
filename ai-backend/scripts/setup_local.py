"""Create .env once, with a private service key; never print or overwrite it."""

import os
import secrets
from pathlib import Path

target = Path(__file__).resolve().parents[1] / ".env"
try:
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    print("Preserved existing .env")
else:
    with os.fdopen(descriptor, "w") as stream:
        stream.write("NASJ_AI_ENVIRONMENT=development\n")
        stream.write(f"NASJ_AI_SERVICE_API_KEY={secrets.token_urlsafe(48)}\n")
        stream.write("NASJ_AI_MAX_REQUEST_BYTES=65536\n")
    print("Created private .env. Configure the same service key in the future NestJS caller.")
