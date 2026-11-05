# Implementation status

What is built, how it is evidenced, and what is not built.

**Verified against commit `70a3900` on 31 October 2026.** Every status below is traceable to code
under `apps/` or `packages/contracts/` and to an executable test. Where a capability is not tested,
that is stated rather than implied.

Legend: **VERIFIED** — code exists and an executable test exercises it. **UNVERIFIED** — code exists,
no test establishes the behaviour. **PARTIAL** — some of the described behaviour exists.
**PLANNED** — described in planning documents only. **NOT BUILT** — deliberately absent.

## Platform foundation

| Capability | Status | Code | Test evidence |
|---|---|---|---|
| Better Auth accounts, password recovery, session management | VERIFIED | `apps/api/src/modules/auth/` | `test/unit/foundation.test.ts` |
| Verified email change, TOTP MFA | VERIFIED | `modules/auth/` | `test/unit/foundation.test.ts` |
| Organizations, approval workflow, multi-role membership | VERIFIED | `modules/organizations/` | `test/unit/permissions.test.ts` |
| Staff invitations | VERIFIED | `modules/organizations/` | `test/unit/permissions.test.ts` |
| Artisan profiles, skills, capacity declarations | VERIFIED | `modules/artisans/` | `test/unit/capacity.test.ts` |
| Consent-bound delegation, privacy requests | VERIFIED | `modules/governance/` | `test/unit/security.test.ts` |
| Append-only audit trail | VERIFIED | `modules/foundation/audit.ts` | DB trigger `audit_append_only`; `test/unit/foundation.test.ts` |
| Rate limiting (Arcjet, development limiter) | VERIFIED | `modules/foundation/` | `test/unit/security.test.ts` |

## Current branch regression work — 1 November 2026

The acceptance guard converts the offer's own reservation instead of counting it twice, and
rechecks revised declarations for the same production period. Custody conservation applies per
leg; partial collection can reach the full total before hub confirmation and onward dispatch.
Buyer quote projections retain tax-review status while excluding internal costing containers.
The regression assertions are in `apps/api/test/commerce.scenarios.ts`, `capacity.scenarios.ts`,
`execution.scenarios.ts`, `procurement.scenarios.ts` and `unit/remediation-batch1.test.ts`.
These bounded corrections do not grant whole-backlog or external acceptance.

## Commerce

| Capability | Status | Code | Test evidence |
|---|---|---|---|
| Buyer RFQs, revisions, questions | VERIFIED | `modules/procurement/` | `test/unit/commercial.test.ts` |
| Quotes and exact acceptance | VERIFIED | `modules/procurement/` | `test/unit/commercial.test.ts` |
| Voluntary artisan offers | VERIFIED | `modules/procurement/` | `test/unit/commercial.test.ts` |
| Cumulative production progress | VERIFIED | `modules/procurement/` | `test/unit/planning.test.ts` |
| QA reconciliation and rework | VERIFIED | `modules/procurement/` | `test/unit/planning.test.ts` |
| Shipment, custody, delivery reporting | VERIFIED | `modules/procurement/logistics.ts` | `test/unit/logistics.test.ts` |
| Buyer delivery confirmation and shortage | VERIFIED | `packages/contracts/src/logistics.ts` | `test/unit/logistics.test.ts`, `remediation-batch2.test.ts` |
| Artisan payables from accepted work | VERIFIED | `modules/finance/` | `test/unit/finance.test.ts` |
| Simulated settlement (synthetic only) | VERIFIED | `modules/procurement/logistics.ts` | `test/unit/remediation-batch1.test.ts`; DB constraint `SimulatedSettlement_provenance_check` |
| Payout request and manual execution report | VERIFIED | `modules/finance/finance.service.ts` | `test/unit/batch12.test.ts` |
| **Independently verified payment** | **NOT BUILT** | — | No authority approved (owner decision D1). `execution_unverified` and `payout_status` forbid a verified row. |
| Contractual due dates and timeliness metrics | PARTIAL | `modules/finance/` | `test/unit/batch12.test.ts`; verified-positive case unreachable while D1 is open |
| Buyer order feedback and corrections | VERIFIED | `modules/collaboration/` | `test/unit/collaboration.test.ts` |

## Operations

| Capability | Status | Code | Test evidence |
|---|---|---|---|
| Health and readiness endpoints | VERIFIED | `modules/health/` | `test/unit/operations.test.ts` |
| Structured logs with redaction | VERIFIED | `modules/foundation/` | `test/unit/operations.test.ts` |
| Backup age alerting | VERIFIED | `scripts/`, `modules/foundation/` | `test/unit/operations.test.ts` |
| Worker event consumption | VERIFIED | `src/jobs/` | `test/unit/operations.test.ts` |
| Inventory and material lots | VERIFIED | `modules/inventory/` | `test/unit/inventory.test.ts` |
| Production directory | VERIFIED | `modules/directory/` | `test/unit/directory.test.ts` |
| Intelligence and analytics | VERIFIED | `modules/intelligence/` | `test/unit/intelligence.test.ts` |
| Isolated competition showroom | VERIFIED | `modules/demo/` | `test/unit/demo-feedback.test.ts` |

## Not built

These appear in product planning and are **not** implemented. Do not describe them as features.

- Real contracts or legally binding agreements.
- Bank connectivity, payment-provider integration or real transfers.
- Independently verified payment settlement.
- Comprehensive accounting or tax reporting.
- Physical stock custody.
- Wearable or physiological data collection. The IoT simulator is a separate repository and is not
  a website dependency.
- Live pilot readiness.
- Generated OpenAPI documentation. The TypeScript contracts are the API reference.

## How to re-verify this document

```bash
pnpm typecheck
pnpm test
pnpm test:integration   # requires Docker
```

The unit suites are the fastest check. Counts at the time of writing: 244 API unit tests and 27 web
unit tests. Do not copy those numbers into other documents; run the suites and read the output.
