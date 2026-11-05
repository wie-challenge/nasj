# Repository map

**Last verified:** 1 November 2026.

NASJ spans four independent Git repositories. They are checked out as siblings under a local
container directory that has no Git repository of its own, no submodules and no shared dependency
manifest.

| Repository | Purpose | Files | Required to run the website? |
|---|---|---|---|
| `website` | Next.js frontend, NestJS API, shared contracts, database, tests | 1063 tracked | **Yes** |
| `docs` | Product backlog artefacts, original issue bodies, governance notes | 26 tracked | No |
| `ai-backend` | Python advisory service; deterministic rule previews only | 53 tracked | No |
| `iot` | Wearable simulator and firmware notes | 15 tracked | No |

## website

The authoritative application.

| Path | Contents |
|---|---|
| `apps/web/` | Next.js App Router frontend, 46 workspace components |
| `apps/api/` | NestJS API: 19 business modules, Prisma schema, 39 migrations |
| `packages/contracts/` | Shared strict Zod schemas and safe response types. No Prisma, no credentials |
| `tests/e2e/` | Playwright browser journeys |
| `scripts/` | Setup, seeding, validation and operations tooling |
| `docs/` | All documentation (see [docs/README.md](../README.md)) |
| `.github/workflows/` | CI: `checks.yml`, `pr.yml`, `scheduled.yml` |

## docs

Product artefacts referenced by the competition report and the backlog audit.

| Path | Contents |
|---|---|
| `NASJ_FINAL_Detailed_Backlog.md` | Expanded product scope |
| `NASJ_FINAL_Full_Project_Backlog.md` | Canonical backlog, version 2.0 |
| `NASJ_FINAL_GitHub_Issues.csv` | Original issue bodies and criterion text |
| `github/` | Backlog import state and index |

These are product plans and historical issue evidence. They are not field observations and do not
constitute owner acceptance.

## ai-backend

A separate Python service. It is **not** integrated into website request paths.

| Path | Contents |
|---|---|
| `src/nasj_ai/` | Package: `api`, `core`, `modules`, `schemas` |
| `tests/` | Unit and integration tests |
| `compose.yaml` | Container definition |
| `docs/` | Architecture, integration, requirements, OpenAPI |

Configuration uses the `NASJ_AI_` environment prefix, with `HIRFA_AI_` still accepted so an existing
local `.env` keeps working.

## iot

An independent wearable prototype and local simulator.

| Path | Contents |
|---|---|
| `simulator/src/` | `simulator.ts`, `demo.ts`, `fixtures.ts` |
| `simulator/test/` | Simulator tests |

It has no website runtime dependency. No participant or physiological data enters commerce.

## Boundary rules

- Website builds, tests and CI never load sibling repositories.
- No repository imports source from another.
- The `docs` repository is referenced by path only, and only from documentation.
