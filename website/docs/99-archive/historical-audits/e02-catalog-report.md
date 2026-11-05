# E02-01 / #31 — Buyer craft and example catalog

Implementation and local verification: 2026-10-20. Branch: `epic/e02-buyer-procurement-and-rfq-catalog`. This report covers [#31](https://github.com/wie-challenge/website/issues/31), not the complete E02 epic. Prerequisite #30 was confirmed closed. Issue closure and merge remain review actions.

## Result

Signed-in users can browse `/commerce/catalog` and filter active crafts. Four version-1 fictional examples show specifications, piece units, indicative day ranges and their planning assumptions. The runner and basket have original local SVG illustrations; embroidery demonstrates missing-image fallback, pottery is explicitly unavailable, and the reference “Other traditional crafts” category has no examples. A network image failure also falls back to readable specification text.

Eligible examples link to `/commerce/buyer?example=…`. The existing buyer workspace resolves the ID from the current server catalog before showing a prefilled request. Specifications remain editable. Quantity, destination and future deadline start blank and require buyer confirmation. Invalid or unavailable links display an actionable error and no creation form. Existing organization, session, CSRF, version and replay boundaries remain authoritative.

`GET /api/v1/commerce/catalog` returns at most 100 active crafts with a shared buyer-safe projection. It contains no organization procurement records, artisan identities, individual capacity, stock, prices or verified supply. `POST /api/v1/commerce/rfqs` validates optional `catalogExampleId` against its current active craft and fixture availability. It fingerprints that selection with the normal request, and persists only the buyer-confirmed RFQ fields. This initial example link is not approved-SKU lineage, a reservation, a quote, a stock check or a real contract. No migration, runtime dependency, network image provider or device integration was added.

## Acceptance mapping

| Original criterion | Implemented evidence |
|---|---|
| Categories display specifications, indicative lead-time ranges and demo labels. | Active-craft projection, category descriptions, four labelled examples and explicit fixture assumptions. API scenario and both viewport journeys. |
| List craft categories and examples with images, units and specification summaries. | Responsive category grid, original illustrated runner/basket, piece units and specification summaries. Browser checks assert a loaded image, filter and RFQ prefill. |
| Show indicative lead-time ranges and assumptions without promising unverified supply. | Per-example day ranges state fictional 10-piece planning assumptions and require capacity/material/shipping/date reassessment. No inventory, price or promise is projected. |
| Identify synthetic and unavailable products visibly. | Page disclosure plus each card's synthetic/illustrative or unavailable label; unavailable cards have no RFQ link. API rejects forged/unavailable/mismatched selections with no draft/event mutation. |
| Handle empty categories and missing images and link products into the RFQ form. | Empty category/catalog states; null-image and failed-image fallback; mobile/desktop keyboard link into the existing form, confirmed required fields, editable persisted draft and no order. |

## Verification

Final local checks: lint and type checks; 46 unit tests; 61 disposable PostgreSQL/Nest integration scenarios; 18 optimized Chromium cases; dependency audit; production build. The new catalog contributes three API scenarios and three browser cases. Its five main-content axe checkpoints have zero violations, alongside the retained 15 commerce checkpoints. Browser viewports are 360×800 and 1280×900; overflow and keyboard activation are asserted. The full browser run retains the existing slow-mobile commerce, identity/MFA and failure cases. This is scoped automated evidence, not general accessibility certification.

The API checks exercise real authenticated routes, empty active-craft projection, deactivation, foreign-organization write denial, strict schemas, altered/unknown/unavailable example IDs, replay/conflict and atomic failure. Browser loading/503/retry/empty-response checks use controlled routes; failed image requests are actually aborted. All test database writes use disposable containers; developer data is preserved. Screenshots `.local/catalog-{mobile,desktop}.png` and the detailed Playwright report are ignored locally and included in the existing three-day CI artifact. Safe aggregate results are committed in `evidence/e02-catalog/local-summary.json`; hosted status is provided by the feature pull request's checks.

An initial integration failure exposed the pre-existing operations CLI test's assumption that port 3001 was down. It now owns a temporary 503 endpoint, and the integration suite passed with the real developer API still running. Initial browser runs caught test-locator mismatches for wrapped selects/prefilled textareas and Next's separate route announcer; role/name queries and main-region alert scopes corrected those tests. The passing final results supersede those interrupted debugging runs.

## Review and remaining scope

Review covered the shared projection, active-craft/example validation, optional create field omission before Prisma persistence, unchanged edit schema, command fingerprint, query-string resolution, image origins and test isolation. No blocking issue remains in that inspected scope. The PR is ready for review after its checks pass; this report does not close an issue or merge the branch.

E02 #33 still needs its own complete draft/revision/field-error acceptance review after #31 is reviewed and accepted. Attachments, attributable timeline, revisions/clarifications, sample sign-off, discussions, immutable procurement documents and approved-SKU reorder are separate stories with the kickoff's dependency gates. E20 owns approved live SKU/version lineage. Physical #197 remains open and independent; all examples and simulator values remain synthetic.
