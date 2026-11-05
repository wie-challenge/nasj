# Component diagram

**Last verified:** 1 November 2026.

```mermaid
flowchart LR
  subgraph Client
    B[Browser]
  end
  subgraph "website repo"
    N[Next.js 16<br/>apps/web]
    A[NestJS 11<br/>apps/api]
    C[Contracts<br/>packages/contracts]
    W[Worker<br/>src/jobs]
  end
  subgraph Data
    P[(PostgreSQL 17<br/>134 models)]
  end
  B -->|HTTPS same origin| N
  N -->|/api rewrite| A
  A --> C
  N --> C
  A -->|Prisma 7| P
  W -->|Prisma 7| P
  A -->|OutboxEvent| P
  W -->|consume| P
```

No component in this diagram crosses a repository boundary. The AI backend and IoT simulator are
separate processes with no runtime link to the website.

## Related

- [System overview](system-overview.md)
- [Data flow](data-flow.md)
