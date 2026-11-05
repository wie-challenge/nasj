# Architecture and operations

```text
Next.js browser → NestJS website API → PostgreSQL / Prisma
                         │ authorize and minimize
                         │ bounded server-to-server bearer-authenticated call
                         ▼
                    FastAPI /api/v1
                    ├─ strict schemas + payload limit
                    ├─ pure matching / pricing / forecast rules
                    └─ advisory result + snapshot + digest + rule version

ESP32 / local wearable: no raw safety-data path to this service
```

NestJS owns business writes, scoped permissions, records, audit and human decisions. This service has no Prisma access, user sessions, financial ledger, queue, external provider or database. HTTP routers call pure module services; input/output schemas define a versioned boundary for the future TypeScript adapter.

## Service boundary

- All preview routes require a configured random 32–256-character ASCII service key, including development. A static key authenticates a service, not an end user or organization. NestJS must authorize the data before sending it. Rotate through deployment secrets; use private TLS service traffic.
- Minimal health responses are public. Production mode hides development documentation. No CORS middleware is enabled and no browser integration is intended.
- No payload persistence. Request logs contain generated request ID, fixed route, method, status and duration, never body, query or authentication data. Use `--no-access-log` to prevent a separate server access log of raw query strings.
- Validation errors omit rejected input; failures return generic codes and correlation IDs. The ASGI request boundary reads at most the configured body limit before rejecting with 413. Lists, identifiers, unit counts, date ranges and decimal precision are bounded.
- The digest covers canonical validated JSON. It is a replay check, not a cryptographic attestation that the caller's facts are true or authorized. Source IDs/timestamps/evidence kinds are supplied by the trusted caller.
- Decimals travel as strings. Matching normalizes to six decimals, rounds weighted components half-up and sums displayed components. Pricing rounds TND half-up to three decimals per line. Forecast uses integer calendar arithmetic with inclusive first day and an explicit post-production buffer.
- Readiness means configured in-process rules are available. It does not claim a model, provider, database or production deployment.

## Records and versions

Update the `*-rules-v1` constant for changes to eligibility, scoring, rounding, costing or calendars. The future NestJS RecommendationRun must persist exact input, result, rule version and digest together. Render explanations from that saved result rather than running a second scorer.

Declared weekly capacity here is an already projected snapshot. The website must align product units, commitment periods and source permissions; the service cannot check stale or mis-scoped data independently. No recommendation reserves capacity or bypasses voluntary acceptance.

## Deployment

A locked dependency set, non-root Docker image and loopback Compose setup are included. Real operation needs private ingress/TLS, rate limits, key rotation and caller timeout/fallback policies. Multi-key rotation or workload identity is later infrastructure work. No public deployment is created by this repository scaffold.
