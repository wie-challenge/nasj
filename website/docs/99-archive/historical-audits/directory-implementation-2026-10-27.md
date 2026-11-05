# Production directory — #43

## Dependency status

#34 and #46 are implemented in this working tree and are not accepted. GitHub issues #34, #46 and #43 were not closed. The directory uses the existing `projectCapacity` function. It does not add a second capacity ledger, a reservation, a feasibility calculation, or AI ranking.

Before search was exposed, completed production was reviewed against the weekly-budget meaning of a declaration. The earlier projection released a COMPLETED batch and a CLOSED order, which refilled remaining capacity after the pieces had already been made. That rule was wrong for a throughput budget. `capacityOfferEffect` now keeps accepted work committed when the batch is COMPLETED, produced quantity is above zero, or the order is CLOSED. A CANCELLED order releases the hold only when nothing was produced. Unexpired PLANNED and OFFERED offers still reserve, except on CANCELLED or CLOSED orders. Superseded declarations stay in history and their offers are counted once through the current period projection. The correction and its regression tests are recorded in `CAPACITY_IMPLEMENTATION_2026-10-27.md`.

## What an authorized user can do

A buyer representative, association coordinator, or NASJ operator opens Production directory from their existing workspace. They filter by craft, coarse region, unit, Africa/Tunis period and a minimum known remaining quantity. The server returns paginated association groups. Each card shows declared, reserved, committed and remaining capacity, or Unknown when the figure must not be published. Opening a group shows the same aggregate. A coordinator of that association also sees artisans currently assigned to them, including missing declarations and deficits, and can open the existing assisted capacity screen. A buyer opening the same group sees the sentence that individual artisan records are not included. Clearing filters and an unmatched minimum both lead to an explicit empty state. Search does not reserve capacity.

## Group model and aggregation

A production group is an approved ASSOCIATION or PARTNER_COOPERATIVE organization, together with one active craft, one unit and one exact declaration period. No new group table or migration was added. Independent artisans without an active association management record are omitted. Eligible participants are ACTIVE and AVAILABLE. Linked accounts also need an active verified user and current `artisan.profile` consent. Accountless artisans need a current PARTICIPATION authorization on an active policy. Association membership alone is not directory consent.

Compatible rows sum in integer hundredths. Remaining is `max(0, declared - reserved - committed)` from the existing reconciler. HOURS and PIECES are never added. A missing declaration, an unknown projection, or an empty contributor set marks `INCOMPLETE_AGGREGATE`. `PERIOD_ALLOCATION_UNKNOWN`, `INCOMPATIBLE_COMMITMENT_UNIT` and `OVERLAPPING_DECLARATIONS` pass through unchanged. Commercial, operator and administrator viewers receive null quantities unless availability is fully known and the eligible cohort is at least 3. The known subtotal is not labeled as the whole group's bookable capacity. The home coordinator sees the subtotal even when it is incomplete. A cohort below 3 adds `SMALL_GROUP_SUPPRESSED` for everyone else. Overcommitted members keep a separate deficit and a remaining value of zero. Replacing a declaration does not drop the commitments attached to its predecessor.

## API

| Method / route | Behavior |
| --- | --- |
| GET `/api/v1/directory/groups` | Validated combined filters, stable sort, page size at most 50, scan cap 400 |
| GET `/api/v1/directory/groups/:id` | One group. Contributors only for the acting coordinator of that organization |
| GET `/api/v1/directory/availability` | Same query, restricted to fully known published groups |
| GET `/api/v1/directory/crafts` | Active craft id, name and category |
| GET `/api/v1/directory/regions` | Distinct approved association and cooperative regions |

The response contract is `DirectoryPage` and `DirectoryDetail` in `packages/contracts/src/directory.ts`. Every page sets `provenance` to `SYNTHETIC_DECLARED_CAPACITY` and `reservation` to false. Callers need an active verified session and one of PLATFORM_ADMIN, NASJ_OPERATOR, BUYER_REPRESENTATIVE, or ASSOCIATION_COORDINATOR. Outsiders and suspended memberships receive 403. Unknown fields, unsupported units, negative minimums and inverted periods receive 400. The directory screen itself is limited to buyer, coordinator and operator personas. An administrator can call the API and still receives suppressed small groups and no artisan names. The screen does not give administrators a directory link.

`DirectoryGroupView` is the input a later feasibility module can read: craft, organization, period, unit, known remaining, availability status and explicit constraints. Feasibility must call `projectCapacity` again inside the reservation transaction. A stored directory response is not authority to commit work.

## Security evidence

Disposable PostgreSQL scenarios in `apps/api/test/directory.scenarios.ts`:

- A three-artisan Sfax weaving group publishes 300.00 declared, 60.00 reserved, 90.00 committed and 150.00 remaining pieces. The completed portion of that committed total stays consumed.
- The buyer payload does not contain artisan names, the fixture phone `+21699000111`, pay fields, or the one-person group's 40.00.
- Craft category `TEXTILE` and region `sfax` match the same group. A minimum of 149 includes it and 151 excludes it.
- `/availability` omits the incomplete hours group.
- The hours group is incomplete because peers have no hours declaration and pieces commitments are an incompatible unit. Its remaining value is null for the buyer.
- Page size 1 is stable and returns distinct ids.
- The Sfax coordinator's detail includes the assigned artisan and the completed commitment. The buyer's detail has `contributors: null`.
- The one-person Kairouan group is suppressed for the buyer and visible, with the artisan name, to that group's coordinator. The other coordinator cannot read the name.
- The administrator detail has no contributors and does not bypass the three-person publication rule.
- An unaffiliated account receives 403. Invalid unit, an unknown sensor field and an inverted period receive 400.
- Cancelling an unproduced offer leaves the reserved total unchanged. Declining a reservation removes it once. A revision from 100 to 25 pieces keeps the predecessor's 30 committed pieces and reports a deficit of 5. Ending the assignment removes the name and leaves the group commitment. Withdrawing participation removes that artisan from the cohort. At two remaining eligible artisans the buyer quantity becomes null with `SMALL_GROUP_SUPPRESSED`. Suspending the coordinator returns 403. The superseded declaration remains stored.

Playwright at 360px and 1280px signs in a synthetic buyer and coordinator, searches, confirms 300.00 pieces without names or the fixture phone, confirms the buyer detail withholds individuals, confirms the one-person group is unknown to the buyer and named for its coordinator, confirms the empty minimum, and checks keyboard focus, axe on `main`, and horizontal overflow.

## #43 acceptance

| Original criterion | Result |
| --- | --- |
| Fictional data labeled; eligible group attributes visible | Provenance is `SYNTHETIC_DECLARED_CAPACITY` on the API and the screen. Only eligible, consented or authorized participants enter a group. |
| Fictional groups with craft, coarse area and capacity periods | Groups are associations. Filters and cards show craft, organization region and the declaration period in Africa/Tunis. |
| Distinguish declared, committed and remaining capacity with units | Cards and API also show reserved. Units stay HOURS or PIECES. Unknown is not rendered as zero. |
| Label synthetic provenance and omit personal contacts and home addresses | The screen says synthetic declared capacity. Responses omit phone, email, home address, pay and authentication identifiers. Region is the organization region. |
| Filter eligible groups and provide clear empty states | Combined server filters, pagination and an explicit empty sentence. Browser coverage includes a minimum that matches nothing. |

These criteria are implemented. They are not accepted. The GitHub issue was not updated.

## Verification

Commands from `website/` on 27 October 2026. No check was skipped.

| Command | Result |
| --- | --- |
| `pnpm lint` | Pass. 264 files. |
| `pnpm typecheck` | Pass. Contracts, API, API tests and web. |
| `pnpm test` | Pass. 50 API unit tests and 9 web unit tests. |
| `pnpm test:integration` | Pass. 105 scenarios on a newly created disposable PostgreSQL database, including both directory scenarios and the corrected completed-throughput scenario. |
| `pnpm test:e2e` | Pass. 31/31, including the directory journey at 360px and 1280px. |
| `pnpm build` | Pass. Contracts, API and Next production build. `/directory` and `/directory/[id]` are dynamic routes. |

Existing development and production databases were not migrated. The directory adds no migration. The earlier additive capacity-revision migration remains unapplied outside disposable databases. Evidence: `evidence/directory-20261027/summary.json`.

## Limits and next stories

The directory is English. Strings are ordinary UI text and can be translated later. It does not rank results, convert hours to pieces, spread a period across weeks, or infer capacity from wearable data. Reads are not locked; a later reservation must revalidate capacity in the existing IAM transaction. Administrators do not get the directory screen. Operators with only PRODUCTION_MANAGER, and no NASJ_OPERATOR persona, are not directory viewers.

#35 Production Feasibility is not ready to treat as unblocked. #33 is already complete. #34 is implemented and not accepted. Feasibility still needs effort ranges, calendar, material and sample constraints, and its own shortage rules. It must not consume a directory response as available capacity.

#47 Commercial Eligibility needs accepted #43 and accepted #46. Neither acceptance has happened. #44 Offer Review needs accepted #43 and is not started by this work. Directory search does not create or review an offer.
