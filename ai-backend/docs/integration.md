# NestJS integration contract

The receiving service is implemented here. The website adapter remains planned; no website repository code is changed.

## Caller steps

1. Authenticate the user and authorize the organization/resource/action in NestJS.
2. Build an immutable minimized snapshot from approved craft facts and independently declared capacity, deducting accepted commitments for the same units and period. Reject stale/inconsistent records.
3. Label demos `synthetic`; use `observed` only for genuine permitted evidence. Do not send names, phones, health attributes, raw sensors or wearable participation.
4. POST to `/api/v1/{matching|pricing|forecast}/preview` with `Authorization: Bearer <service-key>`. Local origin: `http://127.0.0.1:8001`. Real traffic must use private TLS. Keep the credential server-only and separate from Better Auth keys.
5. Use a bounded timeout (proposed initial setting: 3 seconds), no unbounded retry and an explicit unavailable state. Failure must not create a quote, selection or commitment.
6. Validate the response against the versioned contract. Save exact input/result/rule version/digest together in RecommendationRun; do not create an independent UI scorer.
7. Require human review, authorized finance approval and explicit artisan acceptance for the corresponding website business transitions.

## Contract files

- [OpenAPI](openapi.json): generated from the app, committed for cross-repository review.
- Synthetic examples: [matching](../examples/matching.json), [pricing](../examples/pricing.json), [forecast](../examples/forecast.json).

The future website adapter needs TypeScript DTOs or generated client types reviewed against OpenAPI. All example rates are illustrative assumptions, not wage guidance or measured field outcomes. The service cannot verify evidence supplied by its trusted caller. Input snapshots belong in scoped records, not public QR pages.

| Result | Caller action |
| --- | --- |
| 200 | Display labeled preview, explanations and limitations; require human review |
| 401 | Fix service authentication; no public-endpoint fallback |
| 413 | Reduce the snapshot within the configured bound |
| 422 | Correct the input contract; rejected values are not echoed |
| 500 / timeout | Show safe unavailability and retain request ID |

Responses carry `X-Request-ID` and are not cacheable. Matching sorts ties by opaque candidate ID. Forecast assumes a constant weekly capacity over seven calendar days, counts the first day and applies buffer after production; it does not infer holidays, part-time schedules or time per unit.
