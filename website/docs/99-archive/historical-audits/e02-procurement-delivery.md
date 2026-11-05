# E02 procurement delivery — 2026-10-21

Branch: `epic/e02-procurement-completion`. This delivery implements the nine E02 buyer stories in the **local synthetic demonstration**, building on the merged category/example catalog. It does not authorize a live commercial pilot or close the E03/E09/E10/E20 upstream epics. Hosted checks and merge for this branch have not been performed.

## Buyer and operator workflows

Open `/procurement` after signing in. Buyers see their company requests; assigned NASJ operators see submitted requests for their assigned buyer accounts. Existing legacy internal finance actors retain the explicitly scoped synthetic regression workflow. Pending/suspended affiliations and revoked assignments are checked on every API request. Platform administrators receive no implicit commercial access.

1. Create and reopen an editable draft with specifications, design requirements, integer piece quantity and a future delivery deadline/destination. Confirm the NASJ team. Field errors appear beside the relevant labelled control. Submit the exact version once; retries reuse a scoped command key.
2. In References, select PNG/JPEG/WebP files, preview them, upload and remove draft references. There are at most five images, 256 KiB each and 16 megapixels. The server fully decodes and re-encodes each image as WebP, strips metadata and stores bytes privately in PostgreSQL. Reads require a current participant session plus a 60-second session-bound signed token. No public storage URL is created.
3. Follow the persisted Activity timeline and paginated specification Revisions. Events have stable IDs, timestamps and safe actor labels. Revisions retain author, reason, predecessor and full specification/attachment/clarification snapshots. Earlier history is never fabricated for legacy records.
4. Assigned operators start review and ask feasibility questions. Buyers answer with attributed immutable answers; answers become a new terms revision. Revisions and answers invalidate affected quotes and sample approval. Accepted obligations reject direct edits and require the separate approved amendment process.
5. Operators publish exact-version sample evidence and acceptance criteria. Explicitly authorized buyer signatories approve, reject or request changes with comments and time. A replacement sample needs a new decision. Managed full-production release checks the latest sample/specification approval; replacing a sample after production has progressed requires an amendment.
6. Operators issue a versioned quotation after recording current price, capacity and material review references and a synthetic tax-policy/rate snapshot. A buyer with explicit approval authority accepts a current unexpired exact quote. Acceptance, order and immutable contract snapshot are committed together. Stale, cross-company, superseded and duplicate commands cannot create another order.
7. Discuss the request/order with attributed plain-text messages. Internal operator notes stay outside buyer/coordinator threads and buyer activity. Assigned coordinators can access `/procurement/discussions` only for accepted orders involving a currently assigned, managed and authorized participant; this grants no prices, private notes or documents. React renders message text without HTML execution.
8. Download immutable numbered quote, contract, synthetic invoice and delivery-record JSON versions from `/procurement/documents`. Every download rechecks access; old quote versions are marked superseded. Delivery documents require persisted delivery evidence. Invoices copy accepted exact terms rather than current editable configuration. Individual artisan payment statements are never included.
9. Publish reusable approved product versions only after current sample approval and exact quotation acceptance. Record compatible materials and observed lead-time count/context. Buyers use `/procurement/products` to confirm a new quantity, destination and deadline; a reorder copies versioned specification and source lineage into a new draft, carrying no quote, acceptance, payment, order or sample approval. Discontinued/superseded products cannot be reordered or newly quoted. Existing obligations remain unchanged.

## Story acceptance evidence

| Story | Local-demo result | Principal verification |
| --- | --- | --- |
| E02-01 #31 | Retained merged catalog | `catalog.scenarios.ts`, `catalog.spec.ts`, original `E02_CATALOG_REPORT.md` |
| E02-02 #33 | Draft validation, persistence, editing and guarded submission | Procurement draft/submission/replay/field-error tests; existing commerce validation and unauthorized-write tests |
| E02-03 #95 | Private validated references, preview/progress/removal | Spoofed MIME, executable, size/count, concurrent additions, expired token and cross-company denial tests; browser upload/preview |
| E02-04 #96 | Persisted attributable activity | Stable submission event count, refresh, version and organization-denial assertions; timeline screen |
| E02-05 #97 | Clarifications and immutable revision lineage | Quote-after-revision denial, prior quantity retained, predecessor links, stale writes and accepted-amendment rejection |
| E02-06 #100 | Exact sample-version buyer review | Signatory/evidence/specification persistence, changes requested, superseded decision rejection and production-gate regression |
| E02-07 #101 | Scoped paginated discussions | Internal-note exclusion, escaped HTML text, current coordinator assignment and revocation tests |
| E02-08 #102 | Versioned organization document center | Exact invoice totals/quantity, number uniqueness, duplicate issuance denial, immutable database trigger, missing delivery and cross-company download denial |
| E02-09 #104 | Reviewed product lineage and new reorder draft | New quantity/destination/date, no inherited quote/sample/payment, discontinued quote/reorder denial and preserved original delivery |

## Architecture and migration

The module reuses Better Auth, User, Organization/member grants, CommercialRfq/Order, IAM transactions, scoped idempotency, audit/outbox and the existing shadcn shell. New contracts are in `packages/contracts/src/procurement.ts`; authenticated endpoints are under `/api/v1/procurement`. Existing synthetic commerce endpoints remain compatible, while managed quotations must use the versioned acceptance path.

Migration `20261021030000_buyer_procurement` is additive and transactional. Eleven related tables hold revisions, activity, attachments, clarifications, discussions, samples/decisions, quotes/acceptance, approved product versions and documents. Foreign keys retain existing actors and obligations. Database triggers reject updates/deletes to immutable evidence; partial legacy history remains explicitly unavailable. Existing RFQs default to `procurementManaged=false`, preserving earlier simulator fixtures. The full encrypted backup/restore test includes all 51 application tables.

The local migration was applied only after an encrypted backup. Before/after row hashes are identical for **6 User, 6 Account and 2 Session records**. Private backups, identities and raw logs stay ignored under `.local`; no credentials are included in this document.

## Verification

Final local regression: **49 unit tests, 93 PostgreSQL integration scenarios, 25 browser tests**, with zero skipped/flaky/unexpected cases. The browser report includes **41 axe checkpoints with zero violations**. Lint/type checks, dependency audit and the production build passed. Prisma validation passed and the read-only database/schema diff is empty. Screenshot review led to a final navigation-spacing adjustment; all three affected procurement browser cases passed again after that adjustment. A frozen offline install also passed, and the existing local buyer account successfully opened `/procurement`. Safe aggregate evidence is in `evidence/e02-procurement/local-summary.json`.

Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm audit --audit-level=high`, `pnpm build`, Prisma schema validation and read-only database/schema comparison. Raw evidence is private under `.local/e02/` and `.local/e2e-report.json`.

## Release boundary and remaining upstream work

This delivers synthetic buyer-facing workflows. Sample evidence/review references are recorded, not independently verified physical production. The full paid sample-offer, labor/material tracking and payable workflow remains E20-02. Approved-product lead-time observations require real verification before live publication. Price/capacity/material review references do not reserve capacity or establish material supply. The finance/logistics source records are local simulations: documents visibly say they are not tax or legal documents, and delivery records do not implement the full shortage/dispute/receipt domain. Live accounting/tax policy, controlled corrections/credits, approved contracts/amendments and verified provider reconciliation remain E03/E09/E10 prerequisites for a commercial pilot. Real payouts remain disabled. Physical wearable #197 remains pending hardware.

No canonical backlog IDs are rewritten and no issue is automatically closed. The existing `E02_COMPLETION_AUDIT.md` records the earlier pre-implementation gap assessment; this report supersedes its implementation-status findings for the local-demo slice after final verification.
