# Independent capacity and craft findings

## AUDIT-CAPACITY-01 — valid own reservation counted twice (P1)

Affected: #45 E04-03.C1/C3 and #49 E05-09.C4. Both are now CLOSED/Done in live GitHub.

Preparation validates current capacity; issuance changes PREPARED to OFFERED. projectCapacity includes OFFERED reservations. Acceptance first sees a consistent reservation projection, then calls requireCurrentEligibility with the same offer quantity. The guard compares already-reduced remaining against that quantity again. Valid50-of50 acceptance returns409 ELIGIBILITY_STALE/CAPACITY_EXCEEDED. This is not a shortage or authorization failure.

Native PostgreSQL service cases also prove40-of100 acceptance plus concurrent same-key replay creates one batch; a subsequent capacity reduction denies acceptance; decline/expiry release reservations; expired acceptance denies. Real independent backend sessions and advisory-lock contention are separately checked. These are not PGlite concurrency claims.

Source: apps/api/src/modules/commerce/commerce.service.ts:687; apps/api/src/modules/procurement/eligibility-guard.ts:131; apps/api/src/modules/artisans/capacity.ts. Evidence: logs/capacity-craft-service-final.log, logs/capacity-craft-extended.log, logs/guard-native.log. Maintained integration and commercial HTTP fail at the same valid-acceptance boundary. The browser accepts a smaller offer and later times out at dispatch, independently explained by AUDIT-CUSTODY-04 below. No product correction was made.

Proposed fix: distinguish conversion of the current offer's existing reservation from a new reservation. Preserve capacity/tenant/consent locks, conflict detection and idempotency. Verify exact-fill, partial-fill, stale capacity, competing acceptances and decline/expiry/replay before Done.

## AUDIT-CRAFT-02 — current requested craft bypass (P2)

Affected: #47 E05-01.C1/C2 and #118 E05-07.C4. Native fixture ranks a weaving artisan, deletes weaving, retains an unrelated skill and keeps the old declaration. Preparation, issuance, acceptance and human override all succeed. Foreign coordinator override is deniedNOT_FOUND. After declaration quantity becomes zero, override still succeeds using historical knownRemaining.

The commitment helper checks profile.skills.length, not input.craftSkillId. Planning override reads saved ELIGIBLE/knownRemaining. Equipment is also not reread by the helper, although this audit does not claim a separate equipment exploit was executed.

Source: apps/api/src/modules/procurement/eligibility-guard.ts:104; production-offers.ts:614; planning.ts:460. Evidence: logs/capacity-craft-extended.log. Current pause denial works at both preparation and issuance, so the earlier blanket stale-pause verdict is superseded.

Proposed fix: validate the actual requested active craft, relevant equipment and current declaration/period/qualification at every binding boundary, including human overrides. Execute authorized and foreign/revoked organization cases. Do not rely on saved ranking snapshots.

## AUDIT-SIMULATOR-03 — incomplete original preset/control scope (P2)

#158 E12-02.C2/C3 requires labeled active/rest/noisy/disconnected presets and deterministic seed/reset controls. Current fixtures.ts ships a single FixedDevice active/rest stream and fixtureSample(active); noisy/disconnected inputs exist only in tests. Configure/reset/sample APIs and synthetic labels are present, but the requested complete exposed preset/control scope is not shipped. Tests12/12 prove the available local model, not these missing controls or physical hardware. Recommend Done→In Progress.

## AUDIT-CUSTODY-04 — valid onward dispatch blocked (P1)

#135 E09-02.C2 and #59 E09-04.C4 fail. Native service collection100 and confirmation100 succeed against a100-piece shipment. Dispatch of those same100 then fails EXCESS_HANDOVER because the guard adds collection and dispatch across different custody legs. Shipment stays COLLECTED; no dispatch row is created. The existing browser trace independently reaches the same boundary after successful offer acceptance. Evidence: logs/custody-chain.log and browser-artifacts-original; source logistics.ts:203. G19 is partial/regressed.

Proposed fix: track conservation per holder/leg and keep confirmation separate from movement. Verify full-chain collection/receipt/dispatch, overdraw on each leg, stale versions, identical replay and concurrent requests in native PostgreSQL before acceptance.

