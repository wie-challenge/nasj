# Ready-for-Done review

Live GitHub was read through authenticated `gh`; no GitHub writes occurred. Owner acceptance remains **PENDING**. Every original criterion has a classification, including explicit `EVIDENCE_UNAVAILABLE` where the exact acceptance proof is missing. The 963 classifications are not a claim of 963 fresh behavioral demonstrations.

**No currently open/Proposed/In Progress story is fully certified ready for Done.** This is a proof statement, not a claim that every open feature is absent. All eight historical nominees are now CLOSED and Project Done in live GitHub.

## #49 — RECOMMEND_REVIEW_OR_REOPEN

Live: CLOSED / Done. Desired: In Progress.

- **E05-09.C4 — CONTRADICTED_BY_EVIDENCE**: Convert accepted work and release declined/expired reservations once.

  Conversion of a fully reserved valid offer fails from own-reservation double counting, so this now-Done story cannot be accepted.

  Source: apps/api/src/modules/commerce/commerce.service.ts:687; apps/api/src/modules/procurement/eligibility-guard.ts:131. Fresh evidence: logs/capacity-craft-service-final.log.

## #106 — KEEP_DONE_VERIFIED

Live: CLOSED / Done. Desired: Done.

## #148 — KEEP_DONE_WITH_EVIDENCE_GAP

Live: CLOSED / Done. Desired: In Review.

- **E10-13.C2 — IMPLEMENTED_NOT_VERIFIED**: Derive due dates from accepted contractual rules rather than report creation dates.

  Due-date transcription/history references an immutable accepted payable-terms hash, but date correctness against those terms has not been freshly exercised at the native HTTP/service tier. This provenance check can be tested synthetically and is separate from D1, which blocks genuine settlement only.

  Source: apps/api/src/modules/finance/finance.service.ts:1040; apps/api/src/modules/finance/analysis.ts. Fresh evidence: No decisive execution for this criterion.

## #158 — RECOMMEND_REVIEW_OR_REOPEN

Live: CLOSED / Done. Desired: In Progress.

- **E12-02.C2 — PARTIALLY_IMPLEMENTED**: Provide labeled synthetic active, rest, noisy and disconnected signal presets.

  Shipped FixedDevice exposes only fixed active/rest sequence; noisy/disconnected values occur in tests but there are no labeled selectable noisy/disconnected presets or exposed deterministic seed control. Model reset/configure/sample APIs exist.

  Source: ../iot/simulator/src/fixtures.ts. Fresh evidence: No decisive execution for this criterion.

- **E12-02.C3 — PARTIALLY_IMPLEMENTED**: Expose test clock, threshold and deterministic seed/reset controls.

  Shipped FixedDevice exposes only fixed active/rest sequence; noisy/disconnected values occur in tests but there are no labeled selectable noisy/disconnected presets or exposed deterministic seed control. Model reset/configure/sample APIs exist.

  Source: ../iot/simulator/src/fixtures.ts. Fresh evidence: No decisive execution for this criterion.

## #160 — KEEP_DONE_VERIFIED

Live: CLOSED / Done. Desired: Done.

## #163 — KEEP_DONE_WITH_EVIDENCE_GAP

Live: CLOSED / Done. Desired: In Review.

- **E12-13.C5 — IMPLEMENTED_NOT_VERIFIED**: Persist only permitted settings and make reset/dismiss deterministic.

  Reset/dismiss execute; permitted settings are session-local in a private field. Whether the original persistence requirement accepts session-only storage is not independently established. No physical storage acceptance is claimed.

  Source: ../iot/simulator/src/simulator.ts:62. Fresh evidence: logs/iot-unit.log.

## #168 — KEEP_DONE_WITH_EVIDENCE_GAP

Live: CLOSED / Done. Desired: In Review.

- **E12-09.C1 — IMPLEMENTED_NOT_VERIFIED**: No commerce API or admin endpoint can read raw sensor or strain summary; technical and privacy tests confirm only user-declared capacity crosses boundary.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C2 — IMPLEMENTED_NOT_VERIFIED**: Keep sensor samples, activity/strain summaries and reminder history out of commercial database schemas.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C3 — IMPLEMENTED_NOT_VERIFIED**: Exclude monitoring-read APIs even for administrator roles.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C4 — IMPLEMENTED_NOT_VERIFIED**: Allow only independently authored capacity through its strict publication schema.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

- **E12-09.C5 — IMPLEMENTED_NOT_VERIFIED**: Separate local storage, network paths and permissions so opt-out has no commerce effects.

  Current strict capacity schemas/HTTP rejection and separate local simulator support separation, but complete admin endpoint/non-upload and opt-out independence acceptance requires the lost criterion trace or a dedicated exhaustive boundary probe. No whole-story pass inferred from repository separation.

  Source: apps/api/test/artisans.integration.ts; apps/api/test/unit/capacity.test.ts; ../iot/simulator/src. Fresh evidence: logs/integration.log; logs/iot-unit.log.

## #170 — KEEP_DONE_VERIFIED

Live: CLOSED / Done. Desired: Done.

Other open records were checked for available exact-criterion evidence. Missing provider/model/supplier/manifest/PWA functions and physical/external gates are separated in the census. Records with unavailable evidence must be verified before anyone concludes they are ready.
