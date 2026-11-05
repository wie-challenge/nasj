# Data flow

**Last verified:** 1 November 2026.

## Command flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js
  participant A as NestJS
  participant D as PostgreSQL
  B->>N: POST /api/v1/...
  N->>A: rewrite to API origin
  A->>A: session + CSRF + permission + Zod
  A->>D: BEGIN; advisory locks; reload identity
  A->>D: business write
  A->>D: AuditEvent
  A->>D: OutboxEvent
  A->>D: COMMIT
  A-->>N: safe projection
  N-->>B: rendered response
```

Every command follows this shape. There is no path where business state commits without its audit
and outbox rows.

## Read flow

Reads run inside the same authorization check but without the write transaction. Projections strip
credentials and internal costing before leaving the API; see
[API architecture](api-architecture.md).

## Event flow

The worker consumes `OutboxEvent` rows and rebuilds projections. Events carry identifiers and
status only — no request bodies, no free text. See
[Event and outbox model](event-and-outbox-model.md).
