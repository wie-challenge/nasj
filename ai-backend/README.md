# NASJ AI backend

Private Python/FastAPI service that will run **Nasouj**, the NASJ chat assistant. Independent repository: <https://github.com/wie-challenge/ai-backend>.

**Current state: working foundation.** A chat request travels end to end:

1. A request goes into RabbitMQ.
2. The Nasouj worker picks it up and loads the user's role profile.
3. It builds an isolated prompt and calls the model, staying under a rate limit shared through Redis.
4. It streams the answer back on the reply queue.

The model is a built-in "fake" until an NVIDIA Build key is configured. Knowledge retrieval, tools and the NestJS side are not built yet. The design is in [docs/nasouj-assistant-plan.md](docs/nasouj-assistant-plan.md); the team's tasks are in [docs/nasouj-tasks.md](docs/nasouj-tasks.md).

The website's NestJS API owns users, permissions and business records. This service is only called server-to-server and never from a browser.

## Run locally

Requires **Python 3.12 or newer**, pip 25.1 or newer, and Docker. Check with `python --version`; on Windows, if `python` is older, use `py -3.13` instead. CI checks Python 3.12 and 3.14.

Create the virtual environment once:

```powershell
# Windows (PowerShell)
py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e . --group dev
```

```bash
# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e . --group dev
```

Then, with the venv activated:

```bash
python scripts/setup_local.py          # creates/updates the private .env with random secrets
docker compose up -d rabbitmq redis    # start the queue and cache (Docker Desktop must be running)
python -m nasj_ai.assistant.worker     # terminal 1: the Nasouj worker
python scripts/send_test_message.py --role ASSOCIATION_COORDINATOR "Bonjour Nasouj"   # terminal 2
```

The test script plays the part of NestJS: it publishes one request and prints the streamed answer, then a `done` line with the model and profile used. Roles: `BUYER_REPRESENTATIVE`, `ASSOCIATION_COORDINATOR`, `PLATFORM_ADMIN`, `NASJ_OPERATOR`. Locales: `--locale ar|fr|en`.

The HTTP API (health checks, and later service routes) runs separately:

```bash
uvicorn nasj_ai.main:create_app --factory --host 127.0.0.1 --port 8001 --reload --no-access-log
```

### Using a real model (NVIDIA Build)

The default `NASJ_AI_LLM_PROVIDER=fake` echoes your message, so everything works without a key. For real answers, create a free key at build.nvidia.com and set these in your own `.env` (never commit it):

```bash
NASJ_AI_LLM_PROVIDER=nvidia
NASJ_AI_LLM_API_KEY=nvapi-...
NASJ_AI_CHAT_MODEL=<model id copied from the model's page on build.nvidia.com>
```

Restart the worker after changing `.env`. The worker allows `NASJ_AI_LLM_REQUESTS_PER_MINUTE` (default 35) model calls per minute per key, counted in Redis across all workers.

- Dependencies are declared in `pyproject.toml`; `--group dev` adds the test and lint tools.
- `.venv/` is ignored by Git.
- After someone adds a dependency to `pyproject.toml`, run `pip install -e . --group dev` again.
- The Docker image and CI still install from `uv.lock` for exact, repeatable versions. Whoever changes dependencies should also update the lock file (`uv lock`) so CI and Docker match.

`setup_local.py` creates a private `.env` (mode 0600) with a random service key and RabbitMQ/Redis passwords. If `.env` already exists, it only adds missing settings and never changes or prints existing values. Configure the same service key server-side in NestJS. Never put it in a public Next.js variable or browser storage.

| Service | Local address |
| --- | --- |
| API health | <http://127.0.0.1:8001/health/ready> |
| API explorer (development only) | <http://127.0.0.1:8001/docs> |
| RabbitMQ (AMQP) | `amqp://nasj_ai:<password>@127.0.0.1:5672/nasj` |
| RabbitMQ management UI | <http://127.0.0.1:15672> (user and password from `.env`) |
| Redis | `redis://:<password>@127.0.0.1:6379/0` |

All ports are bound to `127.0.0.1` only.

## Full stack in Docker

```bash
python scripts/setup_local.py
docker compose up --build -d
```

This starts the API and the Nasouj worker (production mode, docs disabled, non-root, read-only filesystem), RabbitMQ and Redis. Inside Compose, both receive `NASJ_AI_RABBITMQ_URL` and `NASJ_AI_REDIS_URL` pointing at the `rabbitmq` and `redis` services, and the model settings from `.env`.

- RabbitMQ keeps queues in the `rabbitmq-data` volume.
- Redis is a cache only: persistence is off and memory is capped at 256 MB with least-recently-used eviction.

This is a local setup, not a deployment. Real operation needs private networking, TLS, secret rotation, separate RabbitMQ users per service and monitoring.

The distribution is `nasj-ai`; its canonical Python import package is `nasj_ai`.
The source directory, wheel package and ASGI factory all use this namespace.

## Structure

```text
src/nasj_ai/
  main.py                 # App factory, health routes
  api/router.py           # Service-authenticated /api/v1 router (feature routers are added here)
  core/                   # Settings, service-key auth, body limit, safe errors and logging
  schemas/common.py       # Strict base model for request/response schemas
  assistant/              # Nasouj
    schemas.py            # Queue message formats (request, delta, done, error)
    profiles.py           # Loads role profiles; maps each user role to one profile
    profiles/             # base/rules.md (shared rules) + buyer/, coordinator/, admin/ (profile.yaml + prompt.md)
    pipeline.py           # "chat" pipeline: isolated prompt layers, streaming, error events
    llm.py                # The only model client: NVIDIA (OpenAI-compatible) or fake
    rate_limit.py         # Per-minute model quota shared through Redis
    messaging.py          # RabbitMQ queue names and declaration
    knowledge.py          # Knowledge article format and loader
    eval_set.py           # Test question format and loader
    worker.py             # RabbitMQ consumer: python -m nasj_ai.assistant.worker
tests/
  unit/                   # Assistant contract, profiles, prompt isolation, pipeline, rate limit; setup
  integration/            # HTTP boundary: auth, validation, limits, redaction
scripts/                  # Local configuration, test message sender, content checker, OpenAPI export
knowledge/                # Nasouj articles, one folder per audience (see knowledge/README.md)
evaluation/assistant/     # Test questions, one file per role owner
docs/                     # Nasouj plan, architecture, generated OpenAPI
data/, models/           # Policies for data and model choice
.github/workflows/        # Lint, type checks, tests and package build
```

## API

| Method | Path | Access |
| --- | --- | --- |
| GET | `/health/live`, `/health/ready` | Public, minimal response |
| `*` | `/api/v1/...` | Service bearer key (`Authorization: Bearer <NASJ_AI_SERVICE_API_KEY>`) |

Chat traffic goes through RabbitMQ, not HTTP. No `/api/v1` feature routes exist yet; every future one will require the service key, reject unknown fields, limit request size (default 64 KiB) and never echo rejected input or log request bodies. The integration tests check these rules.

## Verify

With the venv activated:

```bash
ruff check .
ruff format --check .
mypy src tests scripts
pytest
python scripts/check_content.py
python scripts/export_openapi.py
docker compose config --quiet
```

On Windows, `test_setup_preserves_existing_private_configuration` fails because Windows can't set Unix file permissions (`0600`). It passes on Linux and in CI.
