# Architecture and operations

```text
Browser → Next.js → NestJS website API ──── PostgreSQL (users, permissions, conversations)
                         │
                         │ publish / consume (planned)
                         ▼
                    RabbitMQ (queue) ───────▶ NASJ AI service (this repository)
                                               ├─ FastAPI: health + service-key /api/v1
                                               ├─ Nasouj worker (planned)
                                               └─ Redis (cache)
                                                     │
                                                     ▼
                                               NVIDIA Build API (planned)

IoT wearable: no data path to this service
```

The full Nasouj design (role profiles, message formats, caching rules, prompt isolation) is in [nasouj-assistant-plan.md](nasouj-assistant-plan.md).

## Responsibilities

- **NestJS** owns authentication, authorization, business records, audit and conversation storage. It decides what data a request may contain.
- **This service** has no database, no user sessions and no browser access. It trusts only callers holding the service key (HTTP) or the RabbitMQ credentials (queue).
- **RabbitMQ** carries chat requests and answer fragments between NestJS and this service, plus background jobs.
- **Redis** holds short-lived cached data only (user context, recent history, rate-limit counters, optional repeated answers). Nothing in Redis is the only copy of anything.

## Service boundary rules (implemented)

- Every `/api/v1` route requires a random 32–256-character ASCII service key, including in development. The key authenticates a service, not a user.
- Health responses are minimal and public. Production mode hides the API explorer and OpenAPI document. No CORS is enabled.
- Request logs contain the request ID, route, method, status and duration only, never bodies, query strings or credentials. Run uvicorn with `--no-access-log`.
- Validation errors never echo rejected input. Unexpected failures return a generic code with the request ID.
- The request body limit (default 64 KiB) is enforced while reading, before the app runs.

## Local infrastructure

`compose.yaml` runs the API, RabbitMQ (`rabbitmq:4.3.7-management-alpine`, virtual host `nasj`) and Redis (`redis:8.8.4-alpine`, password required, no persistence, 256 MB limit). Ports are bound to `127.0.0.1`. Secrets come from `.env`, created by `scripts/setup_local.py`.

Known local-only shortcuts to fix before any deployment:

- RabbitMQ uses one user. Production needs separate NestJS and AI users with permissions limited to their queues.
- The Redis password is passed as a command argument, so it is visible to anyone who can inspect the container.
- There is no TLS between services.
