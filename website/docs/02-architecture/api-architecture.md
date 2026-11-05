# API boundaries and capacity replay contract

NestJS is authoritative. Next rewrites `/api/*` to its configured internal origin. `PUBLIC_APP_URL` must match the browser Origin exactly. Better Auth cookies are HttpOnly; account status, session expiry and privileged MFA are checked server-side. Unsafe methods require approved Origin and JSON; application mutations additionally require `X-CSRF-Token` from `GET /api/v1/me`. Never log that response/token. Same-origin cookies remain browser-managed.

Routes are defined in `apps/api/src/modules/{auth,users,organizations,artisans,governance,commerce,directory}/*.controller.ts` and the auth gateway allowlist. Shared strict schemas in `packages/contracts/src` are the executable request contracts; response projection types avoid exposing credentials. There is no upload or wearable endpoint; the isolated synthetic commerce routes are listed below. No generated OpenAPI is configured; do not describe these TypeScript contracts as OpenAPI.

| Area | Representative routes | Scope |
|---|---|---|
| Health | GET `/api/health/live`, `/api/health/ready` | Public; ready checks PostgreSQL |
| Session | GET/PATCH `/api/v1/me`, GET/DELETE `/api/v1/me/sessions[/:id]` | Own verified account |
| Organizations | `/api/v1/organizations`, `/:id`, `/:id/members`, `/:id/invitations` | Membership and operation permission |
| Administration | `/api/v1/admin/organizations`, approvals, users, audit | Platform policies and MFA; no implicit artisan access |
| Artisan | `/api/v1/artisans/me`, `/skills`, `/capacity`, `/associations`, `/delegations` | Owner |
| Assistance | `/api/v1/artisans/:id`, `/:id/skills`, `/:id/capacity` | Owner or current explicit consent/delegation scope |
| Governance | Privacy requests, support cases, consents and audit controllers | Own subject or explicitly scoped staff policies |

Consult controller decorators for exact methods and nested route suffixes. Each identifier passes `resourceIdSchema`; request/list schemas cap input sizes and reject unknown fields. Body limit is 32 KiB. Rate limits are enforced in Nest on direct and rewritten requests.

`POST /api/v1/artisans/me/capacity` and `POST /api/v1/artisans/:id/capacity` accept an optional `Idempotency-Key` of 16..128 ASCII letters/digits/underscore/hyphen. Existing clients without keys retain revision behavior. The browser uses UUID keys and retains one for the same payload during a failed request while the form stays mounted. Navigating/reloading loses that pending browser key; persist/reuse it in an API caller if recovery must survive reload.

A successful first call and authorized identical replay both return 201 and the same original JSON capacity projection (including original `supersededAt`). A changed parsed payload with the same scoped key returns 409 `IDEMPOTENCY_CONFLICT`; malformed key returns 400. Key reuse by a different actor/profile has a distinct scope and grants no access. Replay still rejects revoked consent, missing skill, invalid session or delegation. Outcomes are not automatically expired. The key is not stored or logged in plaintext.

Capacity input: `craftSkillId`, `unitType` HOURS/PIECES, numeric `quantity` at most two decimal places 0..100000, ISO `effectiveFrom` and `effectiveTo`. Quantity responses are decimal strings. No quantity is inferred from wearable data.

Errors contain `code`, safe `message`, optional field issues and `requestId`; the response header `X-Request-ID` matches. 401 means invalid session, 403 denied permission/origin/CSRF, 400 invalid input, 409 conflicting state/key, 429 rate limited (`Retry-After`), 503 dependency unavailable. Errors never return exception text or upstream credentials.

## Synthetic commerce contracts

All routes below are relative to `/api/v1/commerce`, require the independent Nest session/CSRF/origin boundary, and reject unknown input fields. Every POST/PATCH requires `Idempotency-Key`; missing/invalid keys return 400. Successful POSTs return 201; draft PATCH returns 200. The command result is `{id,version}`; reload `GET /workspace` for the current safe projection. Resource role checks happen before replay, and stale `version` returns 409. Lists are bounded to 100 records each; no arbitrary client tenant filter is accepted.

| Method / route | Contract | Authorized operation |
|---|---|---|
| GET `/workspace` | `CommerceWorkspaceView` | Current buyer/internal memberships and own artisan profile; safe role-scoped lists |
| POST `/rfqs` | `rfqCreateSchema` | Approved BUYER creates synthetic draft, selecting an approved internal operator and active craft |
| PATCH `/rfqs/:id` | `rfqEditSchema` | Buyer edits DRAFT only; immutable owner/operator/provenance |
| POST `/rfqs/:id/actions` | `rfqActionSchema` | Buyer submit/accept/decline; production review; finance quote/expire |
| POST `/offers` | `offerCreateSchema` | Assigned production manager reserves selected declared capacity and issues immutable terms |
| POST `/offers/:id/actions` | `offerActionSchema` | Owner artisan accept/decline; production expire after deadline |
| POST `/batches/:id/actions` | `batchActionSchema` | Owner production/submission/rework decisions, assigned production/QA actions by role |
| POST `/batches/:id/progress` | `progressSchema` | Owner reports cumulative `produced`, never a delta |
| POST `/batches/:id/inspections` | `inspectionSchema` | Assigned QA records reconciled approved/rejected/pending snapshot and defect reason |
| POST `/orders/:id/actions` | `orderActionSchema` | Current role for funding, release, QA, logistics, buyer receipt, finance reconciliation/closure |
| POST `/payments` | `paymentCreateSchema` | Assigned finance schedules `BUYER_RECEIPT` or `ARTISAN_PAYOUT`; payout batch must belong to order |
| POST `/payments/:id/actions` | `paymentActionSchema` | Assigned finance progresses an isolated synthetic payment; settled requires `SIMULATED_SETTLEMENT` |

All exact fields/types are in `packages/contracts/src/commerce/contracts.ts`; state/role edges and money/quantity semantics are documented in [commerce architecture](commerce-domain.md). Dates are ISO timestamps, amounts are TND strings, quantities are whole pieces, all commercial `provenance` inputs must be `SYNTHETIC`. A positive quote has a future expiry before delivery. Offer terms include quantity, unit/total pay, effort range, expiry/deadline, specification, materials, rework and payment conditions before voluntary acceptance.

Buyer projections contain their own RFQs/orders/receipts and omit artisan offers/batches/payouts. Artisans receive their own terms, production and payouts without buyer quote/receipts or other artisans. QA cannot read individual money columns/payment records; production/finance see offer pay as required to create/reconcile terms. Draft RFQs remain private until submission. Platform ADMIN or organization-manager status alone grants no operational role. Individual wearable fields have no contract or persistence column and are rejected by strict schemas.


## Reports, CSV and transactional inbox

- `GET /api/v1/commerce/orders/:id/report`: current approved buyer membership or assigned internal operational role required; 403 for a foreign order or artisan whole-order access. Pending projections return `metrics: null`, status PENDING. Existing projections return `asOf`, definitionVersion 1, SYNTHETIC/SIMULATED metrics and CURRENT/STALE based on outstanding events for the owning buyer organization. Buyer finance includes only its own receipts; FINANCE_MANAGER sees aggregate artisan liabilities/payouts; QA/logistics/production without finance receive no money aggregate. Unknown costs/hours/verified settlement are null, never invented zeros.
- `GET /api/v1/commerce/orders/:id/report.csv`: identical server authorization/minimization; attachment filename synthetic-commerce.csv, text/csv and no-store. Fixed registry fields and integer cells only. A pending report exports the header without invented metrics; load the JSON/UI status first. No file upload or arbitrary filesystem path is supported.
- `GET /api/v1/commerce/inbox`: up to 100 newest static event-code/time notices, scoped using current approved memberships. Buyer notices exclude private offer/batch/payout events; artisan notices cover only its own work. Finance/production operator notices require assigned internal roles. Revocation removes organization notices from subsequent reads. A user cannot request another account's inbox or pass a tenant override.

All are protected Nest reads and require valid active sessions. There is no public analytics rebuild/replay endpoint. Reports and notices appear only after the separate worker processes committed events. Queue status/backfill are trusted CLI commands described in operations. These features never ingest monitoring fields.
## Buyer craft examples (#31)

`GET /api/v1/commerce/catalog` requires a current active verified session and returns at most 100 active craft categories, descriptions and version-1 synthetic example fixtures. Examples contain unit, specification/design suggestions, local illustrative image/alternative text (or null), indicative lead-time range/assumptions and `ILLUSTRATIVE`/`UNAVAILABLE` status. This shared projection contains no organization records, artisan identity/capacity, stock, price or confirmed supply.

`POST /api/v1/commerce/rfqs` additionally accepts optional `catalogExampleId`. The API checks the current active craft and requires a known illustrative example of that craft before invoking the existing transactional replay-safe command. The buyer must provide valid specification/design requirements, quantity, destination and future delivery deadline. Example selection is an initial suggestion, not a reservation, quote or approved SKU. The selection ID participates in the command fingerprint; only the buyer-confirmed RFQ fields are persisted. Draft edits retain their existing strict schema. Manual RFQs remain available without an example; live SKU/version lineage belongs to E20 and is not implemented by this route.

## Production directory (#43)

Read-only discovery. A search result is not a reservation, a feasibility decision, or a production commitment. Quantities come from `projectCapacity`. Compatible HOURS stay separate from PIECES. Exact period bounds are matched; quantities are not multiplied by the number of weeks.

| Method / route | Contract | Permission |
|---|---|---|
| GET `/api/v1/directory/groups` | `directoryQuerySchema` → `DirectoryPage` | Active verified session with PLATFORM_ADMIN, NASJ_OPERATOR, BUYER_REPRESENTATIVE, or ASSOCIATION_COORDINATOR |
| GET `/api/v1/directory/groups/:id` | `directoryGroupIdSchema` → `DirectoryDetail` | Same. Assigned artisan names only for the coordinator of that organization |
| GET `/api/v1/directory/availability` | same query as groups | Same. Returns only groups whose availability is fully known and, for non-home viewers, large enough to publish |
| GET `/api/v1/directory/crafts` | active craft id, name, category | Same |
| GET `/api/v1/directory/regions` | distinct approved association or cooperative regions | Same |

Filters combine: `craft` (skill id or category), `region` (case-insensitive organization region), `unit` (`HOURS` or `PIECES`), both `effectiveFrom` and `effectiveTo`, nonnegative `minRemaining`, and `organizationId`. `page` and `pageSize` are bounded (`pageSize` maximum 50). Unknown fields, inverted periods, negative minimums and unsupported units return 400. Results sort by name, craft, unit, period and id. The scan stops at 400 eligible profiles and reports `truncated`.

Commercial, operator and administrator responses publish quantities only when every eligible participant in the craft has a known declaration for that exact period and the eligible cohort is at least 3. Otherwise quantities are null, `availabilityKnown` is false, and constraints include `INCOMPLETE_AGGREGATE` and/or `SMALL_GROUP_SUPPRESSED`. A known subtotal is not advertised as the whole group's bookable capacity. The home coordinator sees the subtotal, missing declarations, deficits and only currently assigned artisan display names, with links into the existing assisted capacity screen. Platform administrator status does not reveal names or bypass suppression.

Responses include `provenance: SYNTHETIC_DECLARED_CAPACITY` and `reservation: false`. They omit phone, email, home address, pay, health and authentication identifiers. Group ids are opaque encodings of organization, craft, unit and period. Replaced or unauthorized ids return 400 or 404. Suspended membership and users without an approved commercial or association affiliation receive 403.

## Commercial decisions (#35, #36, #37, #40)

These routes extend `/api/v1/procurement`. They reuse the existing RFQ, revision, sample, quote and acceptance records. A feasibility result is not an artisan assignment or a capacity reservation. Quotation acceptance creates the existing commercial order and an immutable acceptance snapshot. It does not reserve capacity, accept artisan work, collect payment, or create a legal signature. Tax on a costed quotation stays `PENDING_LEGAL_REVIEW`; the response does not invent a Tunisian VAT rate.

Every mutation requires the Nest session, CSRF, origin check and `Idempotency-Key`. Successful creates return 201. A missing or cross-organization RFQ returns 404. Suspended membership is denied by the existing account check inside the transaction.

| Method / route | Who | Behavior |
|---|---|---|
| POST `/effort-assumptions` | Active internal member with `operator.quotation.prepare` | Appends an approved effort range for one craft and unit. `finance.quotation.read` cannot write. No default rate is invented. |
| POST `/rfqs/:id/feasibility-assessments` | Assigned quotation operator | Records one explainable assessment. `FEASIBLE` requires pieces, a covering known cohort, an approved effort row, attested materials, an approved current sample, logistics days and a calendar source. |
| GET `/rfqs/:id/feasibility-assessments` | Same RFQ access | Operators receive the assessments. Buyers receive an empty list. |
| POST `/rfqs/:id/cost-estimates` | Assigned quotation operator | Appends a cost version. Incomplete required categories stay draft and cannot be issued. |
| GET `/rfqs/:id/cost-estimates` | Same RFQ access | Operators receive components. Buyers receive an empty list. |
| POST `/rfqs/:id/costed-quotes` | Assigned quotation operator | Issues one quotation from a complete cost version and its feasibility assessment. A later version supersedes the previous one without rewriting it. |
| POST `/rfqs/:id/quotes` | Assigned quotation operator | Existing free-typed quotation path. Preserved until a feasibility assessment or cost estimate exists for the request. After that, the route returns 409 `COSTED_QUOTATION_REQUIRED` and writes nothing. |
| POST `/rfqs/:id/accept` | Buyer member with `buyer.quotation.approve` on the owning organization | Accepts the current unexpired issued version when `termsSha256` matches. A hash-less quote cannot be accepted after feasibility or costing has started. |
| POST `/rfqs/:id/quote-rejections` | Same buyer approval permission | Appends one rejection. It does not rewrite the quotation row. |

`ProcurementQuote` rows are append-only. Displayed status is derived: acceptance, rejection, a later version, or expiry. The stored status column remains the insert-time marker. Buyer quotation detail omits `internal` cost components, including artisan labor. Issuing a `FEASIBLE` quotation rechecks `publishedCapacity` for the stored period and returns 409 when the known remaining pieces no longer cover the quantity.

## Production eligibility and offers (#47, #44, #45)

These routes also extend `/api/v1/procurement`. They reuse `CommercialOffer`, `CommercialBatch` and `projectCapacity`. A prepared offer does not reserve capacity. Issuing it moves `PREPARED` to `OFFERED`, which reserves. Artisan acceptance uses the existing commerce action and creates one batch. Decline and expiry release that reservation once. A coordinator report does not accept the offer.

An unrelated caller receives 404. A related caller without the listed permission receives 403. Platform administrator status does not bypass either check. Mutations require the Nest session, CSRF, origin check and `Idempotency-Key`, except verification, which always returns 409.

| Method / route | Who | Behavior |
|---|---|---|
| POST `/orders/:id/eligibility-assessments` | Assigned internal member with `operator.production.manage` | Writes one immutable assessment version for artisans who have the order craft. |
| GET `/orders/:id/eligibility-assessments` | Same production operator | Returns the latest version, explanations and unknown constraints. |
| GET `/orders/:id/production` | Same production operator | Returns required, prepared, reserved, accepted and uncovered quantities separately. |
| POST `/orders/:id/offers` | Same production operator | Prepares one offer. Pay and effort come from the accepted cost and feasibility version. |
| GET `/orders/:id/offers` | Same production operator | Lists offers for that order, including pay. |
| POST `/offers/:id/issue` | Same production operator | Rechecks eligibility, capacity and order quantity, then reserves. |
| POST `/offers/:id/assisted-decisions` | Assigned coordinator with `association.offer.recordDecision` | Records an in-person report for an accountless artisan. The offer stays `OFFERED`. |
| POST `/offers/:id/assisted-decisions/:decisionId/verify` | Coordinator who can see that report | Always 409 `VERIFICATION_UNAPPROVED`. No acceptance is written. |
| GET `/assigned-offers` | Coordinator with `association.offer.recordDecision` | Lists offers only for current assignments. |
| POST `/api/v1/commerce/offers/:id/actions` | The linked artisan, for accept and decline | Requires the current offer version. A stored `termsSha256` must match. |

Procurement-managed orders cannot use the older `POST /api/v1/commerce/offers` path. That path remains for non-procurement planning orders.

## Production execution (#52, #53, #54, #119, #124, #126, #51, #55, #56, #57, #134, #58)

These routes extend `/api/v1/procurement`. They start from an accepted `CommercialBatch`. The procurement order stays `APPROVED`. Reported, submitted, quality-approved and prepared quantities are separate. A preparation is not a shipment. Buyer members see aggregate quantities on the execution read. They do not see artisan names, materials, criteria, or batch rows.

An unrelated caller receives 404. A related caller without the listed permission receives 403. Mutations require the Nest session, CSRF, origin check and `Idempotency-Key`.

| Method / route | Who | Behavior |
|---|---|---|
| GET `/orders/:id/execution` | Assigned operator with `operator.production.manage`, or the buyer member for aggregates | Returns the quantity summary and, for the operator, materials, criteria and batches. |
| POST `/orders/:id/material-lines` | Assigned production operator | Appends the bill of materials for the locked specification revision. |
| POST `/orders/:id/inspection-criteria` | Assigned production operator | Appends the inspection checklist for that revision. |
| POST `/orders/:id/consolidations` | Assigned production operator | Prepares quality-approved pieces that are not already prepared. |
| GET `/orders/:id/consolidations` | Assigned production operator, or the buyer member | Lists preparation groups as quantity, time and `PREPARED` status. Batch and artisan identifiers are omitted. |
| POST `/batches/:id/release` | Assigned production operator | Releases one accepted batch after the offer, specification, material and synthetic funding checks. |
| GET `/batches/:id/instructions` | Artisan owner, assigned coordinator, or assigned operator | Returns the locked work instructions. |
| GET `/batches/:id/materials` | Same | Returns the batch material snapshot. |
| POST `/batches/:id/start` | Artisan owner or assigned coordinator with `association.production.update` | Moves a released batch to `IN_PROGRESS`. |
| POST `/batches/:id/progress` | Same | Records a cumulative produced total. |
| GET `/batches/:id/progress` | Anyone who can see the batch | Lists progress events. |
| POST `/batches/:id/progress-corrections` | Artisan, assigned coordinator, or production operator | Appends a correction. The original event remains. |
| POST `/batches/:id/progress-flags` | Anyone who can see the batch | Flags a report without changing the total. |
| POST `/batches/:id/submit` | Artisan owner or assigned coordinator | Submits the reported total for inspection. |
| GET `/batches/:id/events` | Anyone who can see the batch | Lists the production ledger. |
| POST `/batches/:id/inspections` | Assigned operator with `operator.quality.approve` | Records one inspection. Approved, rejected and pending must equal the submitted quantity. |
| GET `/batches/:id/inspections` | Anyone who can see the batch | Lists inspection attempts. |
| POST `/batches/:id/reinspections` | Assigned quality operator | Reinspects previously rejected pieces without adding manufactured quantity. |
| GET `/my-batches` | Linked artisan | Lists that artisan's procurement batches. |
| GET `/assigned-batches` | Coordinator with `association.production.update` | Lists batches for current assignment and management only. |

## Logistics, traceability and simulated settlement (#135, #136, #59, #60, #137, #140, #141, #139, #142, #143, #144, #61)

These routes extend the same procurement API. `ShipmentPreparation` stays `PREPARED`. A shipment is a separate record. The procurement order stays `APPROVED`, and `CommercialOrder.delivered` stays 0. Shipped, reported-delivered and buyer-accepted quantities are separate. A simulated settlement has `provenance = SYNTHETIC` and `bankVerified = false`. It does not write `SyntheticPayment`.

Mutations require the Nest session, CSRF, origin check and `Idempotency-Key`. Unrelated callers receive 404. A related caller without the listed permission receives 403. Logistics, publication and simulation also require an unrevoked operator assignment to the buyer organization. The public traceability read does not require a session. Its response uses `Cache-Control: no-store`. An unpublished token and an internal order id both return 404. A revoked token returns `{ status: "REVOKED", content: null }`.

| Method / route | Who | Behavior |
|---|---|---|
| GET `/orders/:id/shipments` | Assigned operator with `operator.logistics.manage`, or the buyer member | Lists shipments. Buyers do not see the hub or handover actors. |
| POST `/orders/:id/shipments` | Assigned logistics operator | Allocates unshipped prepared pieces from one association and schedules pickup. |
| GET `/shipments/:id` | Same as the list | Returns one shipment. |
| POST `/shipments/:id/pickups` | Assigned logistics operator | Replaces the window only while the shipment is `PICKUP_SCHEDULED`. Earlier windows remain. |
| POST `/shipments/:id/cancel` | Assigned logistics operator | Cancels a pickup before any handover and releases the prepared pieces. |
| POST `/shipments/:id/handovers` | Association coordinator with `association.handover.record` for collection; assigned logistics operator for hub receipt and synthetic dispatch | Collection stays pending until the operator confirms it. Dispatch is not a carrier confirmation. |
| POST `/shipments/:id/delivery-reports` | Assigned logistics operator | Reports delivery. This is not buyer confirmation. |
| POST `/shipments/:id/buyer-confirmations` | Buyer member with `buyer.delivery.confirm` | Records received, accepted, missing and damaged pieces. Accepted plus damaged must equal received. A difference opens a discrepancy. One confirmation per shipment. |
| GET `/pickups` | Coordinator with `association.handover.record` | Lists that association's pickups. |
| GET `/orders/:id/traceability` | Assigned logistics operator or the buyer member | Returns publication status. The public path is present only while published. |
| POST `/orders/:id/traceability` | Assigned logistics operator | Drafts one public record per order. |
| POST `/traceability/:id/submit-review` | Assigned logistics operator | Moves `DRAFT` to `PENDING_REVIEW`. |
| POST `/traceability/:id/publish` | Assigned operator with `operator.traceability.publish` | Publishes the reviewed record and stores the producer-share snapshot. |
| POST `/traceability/:id/revoke` | Same publisher | Revokes the public page. |
| POST `/traceability/:id/corrections` | Assigned logistics operator | Hides a published page until it is reviewed again. |
| GET `/api/v1/public/traceability/:token` | No session | Returns the latest published snapshot, or a revoked status with no content. |
| GET `/orders/:id/financial-summary` | Internal member with `finance.quotation.read` or `operator.accounts.read`, or the buyer member | Internal readers see planned cost, agreed compensation and contribution. Buyers see the quotation total, unverified collection and pending tax only. |
| GET `/my-compensation` | Linked artisan | Returns that artisan's agreed, earned and verified-paid lines. |
| GET `/artisans/:id/compensation` | The artisan, or an internal member with `finance.payout.read` | A coordinator receives 404. An accountless statement is marked undelivered. |
| POST `/orders/:id/payables/reconcile` | Internal member with `finance.payout.read` | Recognizes payables for buyer-accepted pieces. `QUALITY_APPROVED` is rejected. |
| GET `/orders/:id/payables` | `finance.payout.read`, or an assigned operator with `operator.payment.record` | Lists recognized payables. Amounts are not artisan names. |
| GET `/orders/:id/payment-simulations` | Assigned operator with `operator.payment.record`, or internal finance read | Lists synthetic settlement attempts. |
| POST `/orders/:id/payment-simulations` | Assigned operator with `operator.payment.record` | Schedules a synthetic buyer or artisan attempt. |
| POST `/payment-simulations/:id/advance` | Same simulation permission | Moves `SCHEDULED` to initiated, settled, or failed. Settled cannot be repeated. |

## Batch 5 — Inventory and finance controls

The connected `/api/v1/inventory/*` and `/api/v1/finance/*` contracts, actions, exact quantity rules and permission mapping are documented in [the Batch 5 report](../99-archive/historical-audits/batch5-implementation-2026-10-27.md#e-api-contracts) and [inventory notes](../99-archive/historical-audits/batch5-inventory.md). Every new POST requires a valid `Idempotency-Key`; the existing authenticated session, privileged MFA, origin and CSRF boundary applies. Supported evidence remains synthetic or pending verification. No bank/physical verification promotion endpoint exists.

`POST /api/v1/procurement/orders/:id/payables/reconcile` now requires the dedicated scoped `finance.payable.reconcile` permission and a current buyer assignment. `finance.payout.read` authorizes scoped reads only. Compensation/financial projections validate the current internal organization and assignment. Granular permissions can be provisioned through the existing explicit-grant API; platform administration alone grants no business authority.

For procurement-managed orders only, `CommercialOrder.delivered` now means the sum of **buyer-accepted pieces** and is updated in the same transaction as confirmation. Migration 080000 backfills those totals while preserving non-procurement synthetic totals and every historical order state. Managed orders reject legacy commerce DELIVERED, BUYER_ACCEPTED, SETTLED and CLOSED actions, preventing synthetic settlement from bypassing the finance gate. Closure assessment stores an immutable actor/time/checklist/ledger snapshot; required bank/payout/tax and unsettled-obligation blockers prevent successful closure.

## Batch 6 showroom control and provenance

`GET /api/v1/demo/session` returns no-store visitor control state; normal environments return unavailable without provisioning. `POST /api/v1/demo/start`, `/switch` and `/reset` are enabled only for nonproduction loopback `nasj_demo`. They require the HttpOnly visitor cookie, matching Origin, `X-Demo-CSRF` and `Idempotency-Key`. Start creates a synthetic generation; switch accepts only the fixed six personas (operator aliases production), authenticates through Better Auth and returns no password; reset requires current scenarioId/generation/confirm=true and archives/recreates atomically. Ordinary domain routes still require normal session CSRF and scoped authorization. See [scenario guide](../99-archive/historical-audits/demo-scenario-guide.md) and [reset runbook](../99-archive/historical-audits/demo-reset-runbook.md).

Shared provenance metadata and export rules are defined in `packages/contracts/src/provenance.ts`. No MEASURED/VERIFIED publication authority is configured, so those claims are rejected rather than approved from client labels. Public references are privacy-safe allowlisted methodology anchors. Existing legal, finance, custody and consent states are unchanged.
