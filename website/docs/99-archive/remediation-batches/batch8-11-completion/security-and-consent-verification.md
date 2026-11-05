# Security and consent verification — Batches 8–11

28 October 2026. Verification uses authenticated HTTP, native PostgreSQL transactions, browser journeys and local SMTP capture. The [18-case negative security index](../../../engineering/batch8-11-completion/evidence/scenario-coverage.json) records executed test references and outcomes; [integration output](../../../engineering/batch8-11-completion/evidence/integration-release.log) records all 150 passing scenarios.

## Critical consent and authority repairs

**D-1 — Counteroffer:** manager review prepares and issues a linked replacement through the existing offer service, preserving original terms and marking the original replaced. It creates no artisan consent. The assigned artisan must accept the exact replacement terms hash through the existing commercial acceptance path. Collaboration confirmation requires that authoritative acceptance. Concurrent acceptance, expired or stale terms and insufficient capacity are tested; a failure rolls back rather than leaving partial agreement or duplicate batches.

**D-3 — Schedule:** buying-organization approval requires the actual buyer grant, and artisan approval requires the assigned artisan. A platform administrator cannot substitute for either. Separate approvals preserve the previous effective deadline until both exist. Stale offer versions, deadlines and incompatible capacity periods fail closed. Quantities and pay remain unchanged.

**D-4 — Specification:** explicit buyer-authorized binding pins the approved catalogue revision and exact existing buyer sample approval. It creates an append-only procurement projection instead of altering accepted quote history or introducing another consent gate. A catalogue revision may serve multiple orders; each order has its own unique procurement projection. Production release, instructions, materials, checklist and inspection use that projection. Later drafts do not overwrite approved content. Image bytes require the authorized attachment and matching digest; translations retain source language and review provenance.

**D-5 — Paid sample work:** the assigned artisan explicitly accepts exact issued labor and material reimbursement terms. Work completion recognizes a unique obligation in the existing `ArtisanPayable` ledger. SQL enforces mutually exclusive sample and batch sources. Buyer rejection does not erase the obligation; recognized is never represented as paid or verified. The legacy sample-payable table is retained for migration compatibility, with no application write path creating another ledger.

## Other verified boundaries

- Cross-organization access, revoked delegation, suspended affiliation, coordinator impersonation, unsupported accountless acceptance and cross-visitor showroom access are denied through existing authorization paths.
- Association capacity exposes consented, delegated aggregates with unknown and incompatible units explicit; it exposes no participant identities, contact information or private compensation.
- Ranking keeps eligibility separate from weights and human overrides. Private health, support requests and refusal history do not become ranking penalties. Unknown capacity is not invented as zero or infinity; hours do not become pieces.
- Discussion filtering protects internal notes and sanitizes visible content. Support requests permit omission of justification; tickets retain scoped evidence, assigned handling and auditable decisions without becoming a financial ledger.
- Time reporting requires personal, voluntary consent, bounded non-overlapping duration, observed-unit coverage and provenance. Corrections append records. Synthetic batch evidence cannot be relabelled observed. Private individual earnings are separately authorized.
- Analytics enforce bounded reporting periods, consented membership, independent financial contributor suppression and reviewed minimum cohort policy. Reports distinguish synthetic, agreed, earned and verified amounts.
- Forecast and comparison records are immutable. Missing output, cancelled work and unrecorded throughput do not manufacture accuracy or timing certainty.

## Notification delivery

External email delivery defaults to disabled. No persistent provider configuration was enabled. The worker atomically claims pending delivery, rechecks recipient opt-in, and sends outside the domain transaction. SMTP acceptance records `SENT`, never recipient `DELIVERED`. Safe preflight failures permit explicit audited retry; ambiguous send acknowledgement records `UNCERTAIN`, while interrupted `SENDING` requires review. Neither is blindly resent. In-app fallback requires its own explicit opt-in. Local SMTP tests verify concurrent workers send once, retries are idempotent, opt-out prevents delivery, and uncertainty remains visible.

## Remaining gates

The checks substantiate the implemented permissions and tested workflows, not universal security or real-world outcomes. Actual consenting participant comprehension sessions and reviewed findings remain required for E19-01 criterion 5. The owner must review and accept all stories. No live deployment, persistent migration, external email, GitHub mutation, staging or commit was performed.
