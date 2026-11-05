# Known limitations

Deliberate boundaries of the current prototype. Each is a design decision or an external gate, not a
bug to be quietly worked around.

## Financial

- **No verified payment exists.** `execution_unverified` and `payout_status` prevent any database row
  from representing an independently verified settlement. Until an owner approves an evidence
  authority (Batch 2 decision D1), verified payment is reported as **unavailable**, never as a
  measured zero.
- **Simulated settlements are synthetic.** They carry `provenance = SYNTHETIC` and
  `bankVerified = false` by database constraint. They never reduce a real payable obligation and are
  never promoted to real payment.
- **A manual execution report is not verified payment.** An operator recording that money moved is
  evidence of intent, not of settlement.
- **No accounting export of verified amounts.** The export path exists but cannot emit a verified row
  while the constraints stand.

## Operational

- **No deployment was performed.** `docker-compose.yml` is a local stack. Local Compose is not a
  production deployment.
- **No external paging.** Backup and readiness alerts are local codes and exit statuses; there is no
  on-call integration.
- **No physical stock custody.** Inventory and material lots are records, not warehouse control.

## Verification gaps

- **Concurrency is not proven.** The Docker-backed integration suite is the only place that exercises
  simultaneous transactions. Where it is unavailable, SQL, Prisma and HTTP behaviour can still be
  checked, but that is not concurrency evidence.
- **Browser journeys require Docker and Chromium.** UI changes can be typechecked without them, but a
  rendered page is not evidence until a browser journey runs.
- **Historical PASS results do not describe the current commit.** Every document under
  `docs/engineering/` is a dated record. Re-run the suite before repeating a claim.

## Data and privacy

- **No wearable or physiological data.** The IoT simulator lives in a separate repository and is not a
  website dependency. No participant health data enters commerce.
- **Synthetic data only in the showroom.** The competition showroom uses fictional personas and
  synthetic records.
- **Audit identifiers are personal metadata.** Log access must be restricted even though payloads are
  redacted.

## Scope boundaries

- No live contracts, legal agreements or banking integration.
- No comprehensive accounting or tax reporting.
- No generated OpenAPI specification; TypeScript contracts under `packages/contracts/src` are the
  authoritative request and response shapes.
- No microservices, message broker or cache tier. One API owns authentication and the database, with a
  database-local worker consuming metadata events.
