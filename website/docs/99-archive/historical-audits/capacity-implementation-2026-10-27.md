# Capacity implementation — #46 and #34

## Initial audit and approach

Baseline: main `6a8b854`. Read the web AGENTS.md and installed Next client-component guide; the full backlog, foundation guide/tracker, existing capacity/commerce/registry/contracts, PostgreSQL migrations, IAM locking, replay and audit helpers. Original #34/#46 acceptance criteria were read from the authenticated GitHub snapshot fetched earlier on 27 October; no remote state is changed. No root AGENTS.md exists.

Existing declarations use Decimal(12,2), HOURS/PIECES and arbitrary effective instants. Self-service replaces exact periods; assisted recording previously inserts without the same checks. Offers link to a declaration ID and reserve by that ID, which loses prior commitments after revision. IAM transactions acquire shared PostgreSQL advisory locks and recheck sessions; reuse those locks for all projection-sensitive writes. Audit and outbox already commit together.

Approach: additive declaration version/predecessor metadata; one shared writer and backend projection; exact hundredth quantities; reconcile obligations by artisan/craft/period across declaration versions. Preserve both existing authorized assistance paths. New UI submissions supply expected versions and replay keys. Capacity summaries expose totals and explicit unknowns without private financial terms. Existing interval quantities are treated conservatively as a single production-period budget, not multiplied across weeks; weekly declarations are the normal seven-day case. No inferred sensor capacity or unapproved hours/pieces conversion. Document boundary, longer-period and completion semantics with the final verification below.

Implementation is complete in the working tree. The final verification summary below records the completion checks; no GitHub status is changed.

## Implemented behavior

Artisans and authorized helpers now share one declaration writer and one period projection. The API returns declared, reserved, committed, remaining, commitment deficit and pending-reservation shortfall, with exact decimal strings, source version, period, calculation time and explicit unknown constraints. Active unexpired offers reserve capacity; acceptance replaces a reservation with a commitment without double counting. Declines and expiry release reservations at read time. A declared period is a production budget: completed and closed accepted work stays consumed for that period. Only a cancellation with no production releases an accepted hold.

A revision preserves the original declaration and every offer/batch reference. Offers attached to superseded declarations still consume the revised period's capacity. New offers and pending acceptance consult the same projection while holding the existing IAM transaction locks. Raising capacity can permit a still-valid earlier offer; reducing it below existing exposure blocks acceptance/new reservations. Accepted work is never canceled by editing a declaration.

Both the independent-artisan and assigned-registry screens expose the same summary, craft/period selection, revision action, actor names/times, history and actionable overcommitment warnings. Their calculations remain server-owned. Self-service history is now bounded and paginated, as registry history already was. Loading, retry, empty, save/error and keyboard feedback reuse existing components. New forms use replay keys and expected declaration versions.

## Files changed

| Group | Files and purpose |
| --- | --- |
| Shared domain/contracts | `packages/contracts/src/capacity.ts`: exact hundredth arithmetic, shared unit/period/version fields and summary/unknown types. `artisans.ts`, `foundation.ts`, `commerce/contracts.ts`, `index.ts`: extended safe views, remaining/availability candidate fields, and compatible self/helper schemas/exports. |
| Database | `apps/api/prisma/schema.prisma` and additive `20261027010000_capacity_revisions/migration.sql`: declaration version and unique predecessor relation; deterministic historical backfill; no identity/obligation deletion. |
| Backend | `modules/artisans/capacity.ts`: shared writer, exact projection and safe view mapping; `artisans.service.ts`/controller/projection: self/delegated workflows and bounded history; registry service/controller: identical business rules with existing assignment/worker authorization; commerce service: period-aware reservation and acceptance checks. Paths are relative to `apps/api/src`. |
| Frontend | `apps/web/src/components/capacity-workspace.tsx`: shared form/summary/history; artisan, foundation and commerce workspace components: integration into both existing screens plus backend remaining labels; accessible warning styling. |
| Domain/security/lifecycle tests | `apps/api/test/unit/capacity.test.ts`, `capacity.scenarios.ts`, `capacity-upgrade.scenarios.ts` and `integration.ts`: arithmetic, API, concurrency, authorization, revision and upgrade preservation. The aggregate test-only loopback request allowance was raised to accommodate the expanded suite; dedicated rate-limit tests retain their low limits. |
| Browser tests/fixtures | `tests/e2e/capacity.spec.ts`, existing loopback-only setup and `apps/api/test/commerce.fixture.ts`: synthetic obligations and assigned coordinator; 360/1280px keyboard/warning/retry/consistency and axe checks. No fixture route is registered in the application. |

## Domain decisions

- **Precision:** Decimal(12,2) persistence, integer hundredths for arithmetic; declaration limit 100000. Existing `quantity` response formatting is retained. Calculated totals have two decimal places. Self-service numbers and assisted decimal strings normalize to the same exact writer. Zero is a valid voluntary declaration, not an absent value.
- **Units:** HOURS and PIECES remain separate. Existing commercial obligations are in pieces. An overlapping incompatible obligation produces `INCOMPATIBLE_COMMITMENT_UNIT`; remaining is conservatively zero with `availabilityKnown=false`. No time/production-rate conversion is invented.
- **Calendar:** Africa/Tunis is the business display/input timezone. Inputs with offsets represent absolute instants; the UI explicitly interprets its date/time controls as Tunis time. Periods are half-open `[effectiveFrom,effectiveTo)`. Offer coverage now excludes the period end; an order exactly at the next period start belongs to that next period.
- **Weekly/longer periods:** A normal weekly declaration is a seven-day interval. Existing arbitrary intervals remain supported as a single conservative budget for their whole declared production period. Quantities are never multiplied by the number of weeks. The current model has no authoritative per-week work schedule: an obligation tied to a differently bounded overlapping period yields `PERIOD_ALLOCATION_UNKNOWN` and blocks unsupported availability. No sub-week spreading or full-quantity-per-overlapping-week duplication is performed.
- **Reservation lifecycle:** Unexpired PLANNED/OFFERED records reserve once. Expired, DECLINED and EXPIRED records do not reserve, and ACCEPTED records are counted only as commitments. No new queue or release ledger is needed; read-time projections reflect expiry immediately.
- **Commitment lifecycle:** Accepted work consumes the declared period budget. A COMPLETED batch, produced quantity above zero, or a CLOSED order keeps that quantity committed. CANCELLED releases the hold only when the batch is not COMPLETED and produced quantity is zero. DECLINED and expired offers do not reserve. Rework and in-progress obligations remain committed. No cancellation or amendment workflow was added. This corrects an earlier read-time release of completed throughput, which would have refilled a weekly budget after the pieces were already made. The correction is `capacityOfferEffect` inside the existing projection; reservations and commitments are not a second ledger. #34 and #46 remain pending owner acceptance.
- **Revisions:** Only exact-period revisions are accepted; partial overlaps and multiple unresolved active declarations fail. New version/predecessor metadata retains lineage. The migration deterministically backfills existing exact-period versions; ambiguous legacy overlaps remain visible and block availability instead of being silently rewritten. History rows retain original declaration values; their `summary` is the current projection for that period, not a fabricated historical snapshot.
- **Deficits:** `deficit=max(0,committed-declared)`, so declared 25/reserved 20/committed 30 yields deficit 5 and remaining 0. `reservationShortfall=max(0,reserved+committed-declared)` separately shows 25 in that case. Pending offers are not silently erased to hide this shortfall.
- **Concurrency/replay:** Existing PostgreSQL IAM advisory locks serialize declarations, reservations, decisions and relevant commerce state changes. The projection and mutation occur under the same transaction. Explicit expected-version checks reject stale writes; new UI requests always supply them. The field remains optional for compatible existing callers. Identical legacy unkeyed declarations are no-ops; keyed replay returns the original outcome. Current authorization is checked before replay, and changed payload/key reuse is rejected.

## Security verification

The tests exercise self access, authorized assigned assistance, scoped legacy delegation, unassigned same-association denial, other-organization denial, suspended membership, withdrawn capacity authorization, unknown monitoring fields and unchanged records after denial. Existing tests retain administrator isolation and participant assignment/authorization revocation coverage. Assisted recording requires current participation and separate capacity authorization; it does not confer offer-decision or financial authority.

Audit and outbox use the existing transaction. Capacity events identify the acting user, artisan, organization when applicable, declaration/version, voluntary quantity/unit/period, predecessor and authorization/delegation reference. Safe capacity views expose no offer prices, payment terms, contact details or health data.

## Acceptance traceability

| Story | Original acceptance criterion | Evidence |
| --- | --- | --- |
| #46 | Stated capacity/effective period without sensor or health-derived data | Shared strict schemas; independent and registry API input-denial scenarios. |
| #46 | Declared amount, craft, unit and weekly period | Shared fields, exact writer, seven-day examples and Tunis period UI. |
| #46 | Ownership, nonnegative values and period/version rules | IAM/resource/assignment checks; zero/negative/unit/craft/overlap/stale/replay/concurrency tests. |
| #46 | Reject sensor/strain/health availability fields | Strict self and assisted payloads plus bounded strict history queries; domain and real HTTP tests. |
| #46 | Declared/reserved/committed values without deleting accepted work | Shared projections, reduced-budget and migration-preservation tests; both UI views. |
| #34 | Voluntary weekly/effective-date declaration; no wearable inference or disappearing work | Existing self/worker authorization retained; unified writer and predecessor reconciliation. |
| #34 | Display capacity, units, effective period and accepted commitments | Shared server summary, craft/period selector, history, mobile/desktop browser totals. |
| #34 | Only artisan or explicitly authorized helper edits | Current self/delegation/assigned-registry checks and API allow/deny scenarios. |
| #34 | Reject negative/incompatible amounts and unresolved overlaps | Shared validation, incompatible-unit unknowns, overlap/stale tests and new-offer denial. |
| #34 | Below-commitment warning; accepted terms require amendment | 100/20/30 → 25/20/30 → deficit 5; persistent accepted batch; accessible warning and amendment explanation. No editing of accepted terms is provided. |

Both stories are implemented as one workstream and evaluated separately above. GitHub issues remain unchanged; owner acceptance review is still required before marking them complete.

## Verification status

GitHub issues #34 and #46 returned HTTP 404 from this environment (private repository). Original acceptance criteria were taken from `docs/HirfaCare_FINAL_Detailed_Backlog.md` (E01-04 and E04-11) and the earlier authenticated snapshot in `evidence/backlog-20261027/snapshot.json`. Live GitHub checkboxes were not changed.

Final local commands, executed 27 October 2026 against website working tree on main `6a8b854`:

| Command | Result |
| --- | --- |
| `pnpm lint` | Pass; 253 source/test/tool files. |
| `pnpm typecheck` | Pass; contracts, API, API tests, Next typegen and web strict types. |
| `pnpm test` | Pass; 47 API + 9 web unit tests (56 total). |
| `pnpm test:integration` | Pass; 103 HTTP/SQL/SMTP scenarios against a newly created disposable PostgreSQL database, including 8 capacity scenarios and the additive capacity-migration preservation check. |
| `pnpm test:e2e` | Pass; 29/29 browser tests, including both 360px and 1280px capacity journeys with keyboard, axe and retry checks. |
| `pnpm build` | Pass; shared contracts, API and optimized Next production build. |

No skipped or unexecuted check is called a pass. Existing development/production databases were not migrated during this verification. Safe aggregate evidence: `evidence/capacity-20261027/summary.json`. That file records the first run, including the scenario name that expected completed work to release capacity. The accounting correction above changed that assertion. The directory verification re-ran the suite and is the current evidence.

## Rollout and remaining limits

The migration was applied and rehearsed only in newly created disposable databases. Existing development/production databases were not reset or migrated. Before using these sources against an existing database, take its configured backup and apply the additive migration through the existing setup/migration workflow (`pnpm db:migrate`); preserve normal schema-owner permissions. No package/dependency or authentication-provider changes are needed.

No new assisted offer acceptance, inventory planning, amendment, legal/tax or real-payout workflow was implemented. Accountless artisans can declare capacity through authorized coordinators, while the existing commercial offer-decision constraints remain in force. Full translation and cross-browser/physical-device certification are outside this milestone; the reusable UI retains the existing localization groundwork. Global IAM locking is retained without claiming growth-scale throughput.

## Accounting correction before directory exposure

The first capacity verification treated completed batches and closed orders as released production capacity. That is the wrong meaning of a weekly throughput budget: 100 pieces declared and 100 pieces completed in that week must not report 100 pieces available again. Temporary reservation occupancy is different from historical production consumption.

The smallest rule change is in `capacityOfferEffect`. Unexpired PLANNED/OFFERED offers on orders that are not CANCELLED or CLOSED still reserve. Accepted work stays committed when the batch is COMPLETED, produced quantity is positive, or the order is CLOSED. Accepted work on a CANCELLED order is released only when nothing was produced. Superseded declarations still contribute their offers once, through the current period projection. The integration scenario now asserts that a completed batch leaves committed quantity in place, and a later acceptance adds to that committed total rather than replacing a released one.

#34 and #46 are implemented and rechecked with this rule. They are not accepted. The directory depends on them provisionally.

## Next feature readiness

- **#43 directory:** implemented in the working tree against the corrected projection. See `DIRECTORY_IMPLEMENTATION_2026-10-27.md`. Owner acceptance is still required. GitHub was not closed.
- **#35 feasibility:** #33 is already complete. The #34 implementation supplies capacity inputs only after acceptance. Feasibility still needs disclosed effort ranges, calendar/material/sample constraints, completion/shortage logic and unknown-input behavior. It must revalidate the authoritative projection transactionally and must not treat a directory result as a reservation.
- **#47 eligibility and #44 offer review:** both still wait on accepted #43 and, for #47, accepted #46. Directory search does not decide eligibility or create offers.
