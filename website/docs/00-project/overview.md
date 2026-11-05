# Project overview

**Last verified:** 1 November 2026 against commit `70a3900`.

NASJ is a full-stack platform for artisan production, procurement, coordination, traceability and
business intelligence. It connects buyers who need crafted goods with artisan producers, through an
operator organization that manages quality, logistics and settlement.

## What it does

A buyer organization submits a request for quotation. Artisans respond with voluntary offers, or the
operator matches capacity to demand. Accepted offers become production batches, tracked through
cumulative progress, quality reconciliation and shipment. Accepted work creates a payable
obligation. Logistics records custody, delivery and buyer receipt, including shortages and damage.

Every step is authorization-scoped and audited. Nothing is a real contract, a real payment or a real
shipment — the workspace is synthetic by design, and the database enforces that.

## Who uses it

| Actor | Responsibility |
|---|---|
| Buyer representative | Submit RFQs, accept quotes, confirm delivery, give feedback |
| Artisan | Declare capacity, offer on requests, report production progress |
| Association coordinator | Support artisans, manage delegated access |
| NASJ operator | Review requests, match and allocate, manage quality and logistics |
| Finance | Recognise payables, request payouts, record execution |
| Administrator | Approve organizations, manage platform access |

## The three systems

1. **Website and API** (this repository) — the authoritative application. Next.js frontend, NestJS
   API, PostgreSQL via Prisma, shared TypeScript contracts.
2. **AI backend** — a separate Python service. It provides deterministic rule-based previews. It is
   **not** integrated into website request paths and contains no trained model. See
   [AI documentation](../04-ai/).
3. **IoT simulator** — a separate repository holding a wearable prototype and local simulator. It is
   **not** a website dependency and collects no physiological data into commerce. See
   [IoT documentation](../05-iot/).

## Engineering maturity

The foundation, identity, organizations, artisan capacity, commerce, logistics, feedback and the
isolated showroom are implemented and covered by executable tests. Verified payment, real banking,
physical stock and live pilot readiness are **not** implemented.

Read [Current status](current-status.md) for the capability-by-capability position and
[Scope and boundaries](scope-and-boundaries.md) for what is deliberately absent.

## Technology

| Layer | Choice |
|---|---|
| Package manager / runtime | pnpm 11.3.0, Node 24 |
| Frontend | Next.js 16.4.2, React, TypeScript |
| API | NestJS 11.2.7, ESM |
| Data | PostgreSQL 17, Prisma 7.10.1 |
| Contracts | Shared strict Zod schemas in `packages/contracts` |
| Auth | Better Auth, Arcjet rate limiting |
| Tests | Node test runner, Playwright |

There is one API and one database. No microservices, message broker or cache tier.

## Related

- [Repository map](repository-map.md)
- [Terminology](terminology.md)
- [System overview](../02-architecture/system-overview.md)
