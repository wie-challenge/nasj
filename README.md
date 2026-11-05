# NASJ

NASJ is a monorepo for the website platform, an advisory AI backend, and a local wearable simulator. Each project has its own dependencies and setup instructions. Run commands from the project directory they belong to; there is no shared root install command.

## Repository contents

| Directory | Project | What it contains |
| --- | --- | --- |
| [`website/`](website/README.md) | NASJ web platform | Next.js web app, NestJS API, PostgreSQL schema, and shared TypeScript contracts. |
| [`ai-backend/`](ai-backend/README.md) | NASJ AI backend | Python/FastAPI service with deterministic matching, pricing, and forecast preview endpoints. |
| [`iot/`](iot/README.md) | NASJ IoT tools | A local wearable simulator and the future home for device firmware. |

The projects are versioned together here, but they do not share a runtime or dependency installation. The AI service is not yet integrated with the website. The IoT simulator makes no network connection to the website or backend, and it is not physical device firmware.

## Website quick start

The website is the main user-facing application. It requires Git, Node.js 24, pnpm 11.3.0, and Docker Engine with Compose.

```powershell
git clone https://github.com/wie-challenge/nasj.git
cd nasj\website
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000/auth/login>. The local launcher starts or reuses its PostgreSQL and Mailpit services, applies migrations, seeds fictional accounts, and starts the web app and API. Seeded local sign-in details are kept in the ignored file `website/.local/dev-credentials.json`; keep that file private and never commit its contents. Local verification email is available at <http://localhost:8026>.

Press **Ctrl+C** in the `pnpm dev` terminal to stop the app processes. The database data remains available for the next run. See the [website README](website/README.md) and [local development guide](website/docs/03-engineering/local-development.md) for environment details, troubleshooting, tests, and deployment guidance.

## AI backend

The AI backend requires Python 3.12 or newer and [uv](https://docs.astral.sh/uv/).

```sh
cd ai-backend
uv sync --frozen
python scripts/setup_local.py
uv run --frozen uvicorn nasj_ai.main:create_app --factory --host 127.0.0.1 --port 8001 --reload --no-access-log
```

The service creates a private local `.env` containing a generated API key. Keep the key secret. The API explorer is at <http://127.0.0.1:8001/docs> and readiness is at <http://127.0.0.1:8001/health/ready>. Its current matching, pricing, and forecast modules are deterministic advisory previews, not trained machine learning. Responses require human review, and no website integration is implemented yet. See the [AI backend README](ai-backend/README.md) for API boundaries and verification commands.

## IoT simulator

The simulator requires Node.js 24 and pnpm 11.3.0. It uses local, explicitly simulated values and needs no backend credentials.

```sh
cd iot/simulator
pnpm install --frozen-lockfile
pnpm demo
```

Run its checks from `iot/simulator` with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. No device-to-application communication or physical hardware verification is included. See the [IoT README](iot/README.md) and [simulator guide](iot/simulator/README.md).

## Website checks

From `website/`, run the checks needed for the change:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Integration and browser tests require Docker; browser tests also require Playwright Chromium. The website README documents `pnpm test:integration`, `pnpm test:e2e`, and other verification commands.

## Security and local data

- Do not commit `.env`, `.local/`, local credentials, generated API keys, or real participant data.
- Keep database and service secrets private; use local example files only as configuration references.
- Website commerce fixtures and IoT simulator output are synthetic. They do not prove a real payment, delivery, artisan capacity, or sensor reading.
- The AI service is advisory. The website remains responsible for authorization and business decisions when integration is implemented.
