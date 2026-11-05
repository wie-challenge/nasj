# Requirements and implementation boundaries

Source: [nasj detailed backlog v3.0](https://github.com/wie-challenge/docs/blob/main/nasj_FINAL_Detailed_Backlog.md), 15 October 2026: E11-01–08, E05-01/02 and E03-02/04.

## Competition foundation

1. **Matching:** eligibility precedes ranking. Exclude paused, wrong-craft and fully committed candidates. Explain normalized skill and remaining-capacity factors, weights, components and ties. Missing skill evidence contributes zero and is disclosed; that provisional policy needs operational review. Weights are illustrative, not validated predictors. Partial-capacity candidates may appear for later multi-group planning; no allocation is performed.
2. **Pricing:** caller supplies quantity, effort range, labor rate, per-unit materials and fixed QA/transport/overhead/contingency costs. No default pay rate is invented. An explicit illustrative/observed source reference covers the assumptions. Low/high results show each line and cost markup; taxes and any fairness certification are excluded. The service cannot verify a caller's source claim.
3. **Capacity:** compare up to ten named scenarios using declared weekly finished-unit capacity minus accepted weekly commitments. Apply material readiness, deadline and buffer. The first day counts; uniform throughput is spread over seven calendar days. No effort inference, holiday calendar or production optimization is claimed.

Every preview discloses rules, snapshots, digest and limitations. Models contain no health, sensor, wearable participation or personal contact fields. Input snapshots are minimized by the trusted NestJS caller.

## Delivery sequence

| Step | Owner | Exit evidence |
| --- | --- | --- |
| Rules and contracts | AI backend | Reproducible calculations, authenticated HTTP checks, examples and OpenAPI |
| Website adapter | Website API | Authorized snapshots, private credential, bounded timeout and safe unavailable state |
| RecommendationRun and approval | Website API | Immutable snapshot/result/version, one scorer, human review and artisan acceptance |
| Calibration | Product/research + AI | Consented time studies, rate evidence, reviewed scoring and calendar assumptions |
| Controlled pilot | Operations + website + AI | Real progress records, approved operation and reviewed outcomes |
| Learned models | AI + research | Permissioned labels, representative cohorts, held-out benchmarks and fallback |

Only the first row is implemented here as a foundation. The website currently provides identity/organization/artisan foundations, not the full commercial RFQ/order/production flow. Agree authoritative units and period snapshots before building the adapter. This service does not fetch directly from the website database.

## Later modules

- **E11-04 delay risk:** genuine progress/exception snapshots, staleness handling, versioned thresholds, triggering facts and an intervention owner. Unknown data must not imply low risk or certain failure.
- **E11-05 evaluation:** pair forecasts made before outcomes with genuine completion labels. Define cancellation/missing handling, cohort and absolute errors. Report sample size and limitations; synthetic fixtures are not accuracy evidence.
- **E11-06 audits:** NestJS owns scoped RecommendationRun/override events. Aggregate exposure analysis requires purpose-limited access and small-group suppression, with no automated worker penalties.
- **E11-07 image assistance:** permissioned images, craft/defect-specific held-out evaluation and inspector correction. Never automatically reject work or change pay.
- **E11-08 learned time estimation:** consented representative labels, time-aware evaluation, craft/context coverage, drift monitoring and deterministic fallback. Predictions cannot amend accepted dates.

No empty public endpoints pretend these later capabilities exist. Policies and extension points are documented in `data/`, `models/` and `evaluation/`.
