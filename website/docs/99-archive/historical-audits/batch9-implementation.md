# Batch 9 — Product Catalog & Sampling

Engineering review: 28 October 2026, Africa/Tunis. Repository: `website/`. No GitHub issue was edited. No
persistent database was migrated.

## A. Backlog coverage

| ID | Original criterion | Implemented | Remaining | Code status |
|---|---|---|---|---|
| E20-01 | Every order/batch references an immutable approved spec version, measurements and optional acceptance sample | `ProductSpecification` + `ProductSpecificationRevision` with `DRAFT → SUBMITTED_FOR_REVIEW → APPROVED/REJECTED → SUPERSEDED`. Approved revisions are never mutated; a change creates a higher revision. Materials, dimensions, tolerances, quality criteria and captioned reference images are persisted. | Linking a *catalogue* revision to an order's `ProcurementRevision` is not yet enforced; the existing order-level gate still uses `ProcurementSample` + `ProcurementRevision`. | PARTIALLY_IMPLEMENTED |
| E20-02 | Sample owner, compensation, material cost, actual hours, approval and decision logged | `ProductSampleRequest` captures terms, compensation (exact millimes), material responsibility, responsible artisan, planned completion, recorded minutes with an evidence class, evaluations and approval. State machine forbids starting work before compensation is agreed. | Material *cost* is recorded as responsibility text, not a TND amount. | IMPLEMENTED_UNVERIFIED |
| E20-03 | Approver, date, evidence, sample specification and amendment relation recorded | `BuyerSampleApproval` stores buyer organization, actor, decision, comments, evidence reference, specification revision and an `amendmentOf` chain. `sampleApprovalAuthorizesWork` rejects a different buyer organization, a different revision, a superseded revision or a non-approval. | — | IMPLEMENTED_UNVERIFIED |
| E02-06 | Approval records version, evidence and signatory | Same single workflow as E20-03, as instructed: one coherent buyer-approval path, not two. | — | IMPLEMENTED_UNVERIFIED |
| E02-05 | Changes create a version with traceable history | Pre-existing `ProcurementRevision` chain covers RFQ specification revisions; Batch 9 adds catalogue revision history. | RFQ revision UI was already implemented; no change made. | IMPLEMENTED_UNVERIFIED (pre-existing) |

E20-04 (reusable approved SKU catalogue) and E20-05 (design ownership governance) are out of scope as
instructed. `ProductSpecification.ownerOrganizationId` is a small supporting structure for later ownership
work; it is not a completion claim for E20-05.

## B. Working journeys

1. A design organization creates a product with an initial draft revision.
2. The revision is submitted for review and then approved or rejected; approval is recorded with actor and
   timestamp and the revision becomes immutable.
3. A later change creates revision N+1; the earlier approved revision stays on record.
4. A buyer raises a sample request. It starts at `TERMS_PENDING` with
   `compensationBasis = UNPAID_BY_DEFAULT_BLOCKED`, so sample work cannot begin.
5. Terms are agreed with a positive exact compensation; the request moves to `ACCEPTED_FOR_PRODUCTION`.
6. Sample work is submitted. Recorded time is stored with an evidence class (`OBSERVED`, `SYNTHETIC` or
   `UNKNOWN`) and `UNKNOWN` is stored as `null`, never as zero.
7. An inspector records a decision. Only after inspection does the request reach `UNDER_REVIEW`.
8. The owning buyer organization approves or rejects. A second decision is refused.
9. Production release continues to require the existing approved sample for the current order revision.

## C. Architecture

- `packages/contracts/src/catalog.ts` — state machines, `sampleMayStart`, `sampleApprovalAuthorizesWork` and
  zod schemas. Pure; no framework dependency.
- `apps/api/src/modules/catalog/` — `ProductCatalogService`, controller and module.
- `/catalog` page and `product-catalog-workspace.tsx`.

The existing `ProcurementSample`, `ProcurementSampleDecision`, `ApprovedProductVersion` and `BatchRelease`
remain the authority for an accepted order's design gate. Batch 9 adds the *design lifecycle* those records
reference rather than creating a competing source of product truth.

## D. Database changes

Migration `20261028020000_product_catalog` (additive, 5 tables, no `DROP`): `ProductSpecification`,
`ProductSpecificationRevision`, `ProductSampleRequest`, `SampleEvaluation`, `BuyerSampleApproval`.
`@@unique([specificationId, revisionNumber])` prevents duplicate revisions;
`@@unique([ownerOrganizationId, productCode])` scopes a product code to its owner; `amendmentOfId` is unique
so an amendment has one predecessor.

## E. APIs

| Method | Route | Permission |
|---|---|---|
| GET | `/api/v1/catalog` | any scoped catalogue participant |
| POST | `/api/v1/catalog/specifications` | `product.specification.manage` |
| POST | `/api/v1/catalog/specifications/:id/revisions` | owning design organization |
| POST | `/api/v1/catalog/specification-revisions/:id/submit` | `product.specification.manage` |
| POST | `/api/v1/catalog/specification-revisions/:id/decision` | `product.specification.manage` |
| POST | `/api/v1/catalog/samples` | buyer or operator |
| POST | `/api/v1/catalog/samples/:id/terms` | scoped participant |
| POST | `/api/v1/catalog/samples/:id/work` | scoped participant |
| POST | `/api/v1/catalog/samples/:id/evaluations` | scoped participant |
| POST | `/api/v1/catalog/samples/:id/approval` | owning buyer, `buyer.quotation.approve` |

## F. Business rules

- Specification transitions: `DRAFT → SUBMITTED_FOR_REVIEW → APPROVED | REJECTED`, and
  `APPROVED | REJECTED → SUPERSEDED`. `DRAFT → APPROVED` is impossible.
- Sample transitions require `ACCEPTED_FOR_PRODUCTION → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → APPROVED |
  REJECTED | REVISION_REQUESTED`. `IN_PROGRESS → APPROVED` is impossible.
- `sampleMayStart` returns `allowed: false` for a missing basis, a missing amount, a malformed amount or an
  amount ≤ 0.
- `sampleApprovalAuthorizesWork` requires matching buyer organization **and** matching revision **and**
  revision state `APPROVED` **and** decision `APPROVED`.
- Compensation is parsed with the shared exact TND helpers (`parseTnd`/`formatTnd`), never floating point.

## G. Security

- Approval is bound to the request's own `buyerOrganizationId` and requires an active `BUYER_BUSINESS`
  membership holding `buyer.quotation.approve`. A different buyer organization receives `403`.
- Cross-organization reads return `404`: `sample()` checks organization scoping before disclosing existence.
- Reference images carry a SHA-256 digest and a caption; no binary blob is fetched through this API.
- Every mutation is idempotent and audited. Approved revisions cannot be edited in place.

## H. Tests

- `node --import tsx --test test/unit/catalog.test.ts` — PASS, 4 tests (specification immutability, sample
  transition ordering, unpaid-by-default blocking, cross-organization/version approval rejection).
- Full API unit suite — PASS, 108 tests.
- `pnpm lint`, `pnpm --filter @nasj/api typecheck`, `pnpm --filter @nasj/web typecheck`, `pnpm build` — PASS.

Not executable here: integration, browser and demo suites (no PostgreSQL, no Docker, sandbox denies `tsx`
IPC). Migrations were not executed.

## I. Limitations

- The catalogue revision is not yet bound to the order-level `ProcurementRevision` at release time; the
  existing order gate still governs production. This is the main remaining E20-01 criterion.
- Sample material cost is descriptive text, not a computed TND amount.
- All demonstration data is synthetic and labelled as such.

## J. Next readiness

Ready for owner review of versioning immutability, paid-sample gating and buyer-scoped approval. E20-01 stays
partially implemented until order/batch release references the catalogue revision.
