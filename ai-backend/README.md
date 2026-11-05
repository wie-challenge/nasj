# nasj AI backend

Private Python/FastAPI decision-support service. Independent repository: <https://github.com/wie-challenge/ai-backend>.

The current engine is a **working deterministic baseline**, not trained ML. It provides advisory previews; the website's NestJS API still owns authorization, business records, approvals and artisan acceptance. No website integration is implemented yet.

## Requirements identified

| Capability | Included now | Next dependency |
| --- | --- | --- |
| Explainable matching — E05-02 / E11-01 | Eligibility, weighted ranking, exclusions, missing evidence, stable ties, replayable snapshots | Authorized website snapshots and saved RecommendationRun |
| Pricing suggestions — E11-02 | Editable effort range, assumption/source labels, exact TND costs and markup | Validated rate evidence and finance-controlled quote issuance |
| Capacity scenarios — E11-03 | Quantity, readiness, remaining capacity, deadline and buffer comparisons | Dated commitments and operational calendar calibration |
| Delay indicators — E11-04 | Requirements documented | Genuine production progress, versioned risk rules |
| Forecast evaluation — E11-05 | Evaluation protocol | Real forecast/completion pairs and cohort definitions |
| Ranking/override audits — E11-06 | Replay metadata | Scoped records, human overrides and aggregate analysis |
| Image assistance / learned time estimates — E11-07/08 | Explicitly deferred | Permissioned data, labels, held-out benchmarks and fallback |

These first three modules are foundation implementations, not completion claims for the full backlog stories. See [requirements](docs/requirements.md).

## Run

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/getting-started/installation/). CI checks Python 3.12 and 3.14.

```bash
uv sync --frozen
python scripts/setup_local.py
uv run --frozen uvicorn nasj_ai.main:create_app --factory --host 127.0.0.1 --port 8001 --reload --no-access-log
```

The setup script creates a private mode-0600 `.env` with a random service key. It never prints or overwrites it. Configure the same key server-side in the future NestJS caller, separately from Better Auth credentials. Never put it in a public Next.js variable or browser storage.

- Health: <http://127.0.0.1:8001/health/ready>
- Development explorer: <http://127.0.0.1:8001/docs>
- Development contract: <http://127.0.0.1:8001/openapi.json>

Use the explorer's Authorize button with the local service key, then submit a [synthetic request](examples/). Decimal quantities and money use JSON strings. API documentation is disabled in production mode.

The distribution is `nasj-ai`; its canonical Python import package is `nasj_ai`.
The source directory, wheel package and ASGI factory all use this namespace.

## Structure

```text
src/nasj_ai/
  main.py                 # App factory
  api/router.py           # Service-authenticated versioned API
  core/                   # Settings, authentication, body limits, safe errors/logging
  schemas/common.py       # Strict inputs, snapshots and response metadata
  modules/
    matching/             # schemas.py, service.py, router.py
    pricing/              # schemas.py, service.py, router.py
    forecast/             # schemas.py, service.py, router.py
tests/
  unit/                   # Domain rules and edge cases
  integration/            # HTTP, auth, validation, privacy boundary
examples/                 # Explicitly synthetic JSON payloads
scripts/                  # Local configuration and OpenAPI export
docs/                     # Requirements, architecture, integration, API schema
data/                     # Dataset policy; real data stays out of Git
models/                   # Future model lifecycle; no trained artifacts
evaluation/               # Future evaluation protocol
.github/workflows/        # Static checks, tests and package build
```

## API

| Method | Path | Access |
| --- | --- | --- |
| GET | `/health/live`, `/health/ready` | Minimal health response |
| POST | `/api/v1/matching/preview` | Service bearer key |
| POST | `/api/v1/pricing/preview` | Service bearer key |
| POST | `/api/v1/forecast/preview` | Service bearer key |

Each preview returns the rule version, input digest, source snapshot, full validated input, limitations and `human_review_required: true`. Inputs are not persisted. Unknown fields are rejected recursively, including health and wearable fields. Default maximum payload: 64 KiB.

NestJS must authorize and minimize inputs, persist the exact result/input/configuration, enforce human decisions and obtain artisan acceptance. This service has no database, commercial write endpoint, user login or browser integration. See [the integration contract](docs/integration.md).

## Verify

```bash
uv run --frozen ruff check .
uv run --frozen ruff format --check .
uv run --frozen mypy src tests scripts
uv run --frozen pytest
uv run --frozen python scripts/export_openapi.py
uv build
```

## Container

```bash
python scripts/setup_local.py
docker --context default compose up --build -d
```

The container uses a non-root user, read-only filesystem and loopback-only port 8001. Compose uses production mode with API docs disabled. This is a local starting point, not a deployed service. Real operation needs private ingress, TLS, secret rotation, rate limits and caller timeout/failure policies. No database, Redis, GPU, LLM API or training dependency is required.

Requirements: [canonical backlog](https://github.com/wie-challenge/docs/blob/main/nasj_FINAL_Detailed_Backlog.md), especially E11 and E05-02. Framework guidance: [FastAPI application structure](https://fastapi.tiangolo.com/tutorial/bigger-applications/).
