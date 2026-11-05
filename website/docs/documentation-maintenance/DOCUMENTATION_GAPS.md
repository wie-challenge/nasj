# Documentation gaps

**Date:** 1 November 2026.

Topics where documentation is thin because the implementation or evidence is thin. These are not
documentation failures to be papered over — they reflect the actual state of the project.

## Not documented because not implemented

| Topic | Status |
|---|---|
| AI matching, forecasting, model evaluation | The Python service holds deterministic rule previews only. It is not integrated into website request paths and contains no trained model. Nine AI documents were proposed; writing them would describe capabilities that do not exist. |
| Wearable firmware internals | The IoT repository holds a simulator. No physical device validation, no IMU pipeline documentation beyond the simulator, no health or ergonomic claims. |
| Verified payment | The schema forbids the state. Documented as a boundary, not a feature. |
| Real banking, contracts, accounting | Not built. |

## Documented with limited evidence

| Topic | Limitation |
|---|---|
| Concurrency safety | Cannot be proven without Docker. Documented as blocked, not passed. |
| Browser journeys for the latest changes | The e2e suite needs Docker. UI changes are typechecked, not rendered. |
| Batch 5–14 acceptance | Summary reports survive; raw evidence was lost. See `EVIDENCE_RECOVERY_STATUS.md`. |

## Empty folders from the proposed tree

Created but intentionally empty, because no grounded source material exists:

- `04-ai/` — see above
- `10-research-and-pilots/` — pilot material lives in `competition/`

These are declared here rather than filled with placeholder documents. An empty folder is honest; a
template document claiming completeness is not.

## Not yet written, and worth writing

| Gap | Why it matters |
|---|---|
| Feature-level product documents | `01-product/` has one document. Procurement, production, QA, logistics and finance deserve one each, grounded in their services. |
| ADRs | No `architecture-decisions/` records exist. Decisions are currently embedded in batch reports. |
| Data retention policy | `docs` repository has `data-retention.md`; it is not yet mirrored here. |
