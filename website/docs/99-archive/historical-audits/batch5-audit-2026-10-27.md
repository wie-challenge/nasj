# Batch 5 audit — 27 October 2026

The workspace root is not a Git repository. `website/` is the application repository, at `main` with a substantial pre-existing dirty tree. The initial tracked/untracked paths are recorded in `evidence/batch5-20261027/initial-working-tree.txt`. Existing edits and six earlier additive migration directories are preserved. The only project AGENTS.md is `apps/web/AGENTS.md`; frontend implementation follows its installed Next.js documentation requirement.

## Authoritative records

`SpecificationMaterialLine` is the versioned bill of materials. `BatchMaterialRequirement` is a released batch's requirements snapshot, not stock. `BatchRelease` retains its explicitly synthetic material and funding attestation. `CommercialOffer` holds accepted compensation terms and links to capacity declarations; `CommercialBatch` is the resulting accepted work. Reservations and later material custody must use these existing records, never create artisan acceptance.

`ShipmentPreparation` allocates quality-approved pieces for shipment. `Shipment`, custody events and `BuyerDeliveryConfirmation` distinguish operator reports, physical receipt and buyer acceptance. `ArtisanPayable` is an immutable obligation recognized from allocated buyer-accepted pieces; its unique batch/milestone/source constraint prevents duplicate recognition. `SimulatedSettlement` and its history remain synthetic and constrained to `bankVerified=false`. Existing TND helpers use integer millimes and format three decimal places. Material quantities use integer thousandths with compatible units; no binary floating point enters ledger arithmetic.

The existing IAM transaction takes advisory locks 724631902 then 724631903, validates current user/session and serializes against membership/account lifecycle changes. Scoped membership permission computation rejects suspended memberships, revoked grants and unapproved organizations. Organization type, buyer assignment and current artisan assignment/management remain required business boundaries; the global ADMIN persona confers no business permission.

## Verified GitHub source

The connected GitHub plugin returned 404 for #68. Read-only authenticated `gh` access succeeded. `evidence/batch5-20261027/github-issues.json` records all 213 current issues including bodies, acceptance criteria, dependencies and project status. No issue, comment or project field was changed.

All eleven target issues are OPEN / Proposed: E07-02 #68; E07-03 #69; E07-04 #70; E07-05 #127; E07-06 #71; E10-05 #66; E10-07 #62; E10-08 #63; E10-09 #145; E10-10 #72; E10-14 #73.

Current upstream gates differ from older local engineering reports: #39 (authorization), #51 (material requirements), #60 (buyer receipt), #61 (payable recognition) and #143 (artisan statement) are CLOSED / Done. Their recorded scope still does not prove physical inventory, real payment or live pilot acceptance. #41 (funding milestones), #65 (reviewed invoices) and #67 (batch cancellation) remain OPEN / Proposed. Each target's direct dependency list is retained in the final report and raw snapshot.

## Migration chain and boundaries

The six existing migrations, in order, are 20261027010000_capacity_revisions, 20261027020000_commercial_decisions, 20261027030000_production_offers, 20261027040000_production_execution, 20261027050000_logistics_traceability and 20261027060000_shipment_cancel_damage. Earlier foundation migrations establish `procurement_immutable_evidence()` before the additive evidence triggers reference it. Migration 060000 extends shipment status and introduces nonnegative damaged quantities without altering commercial order state.

`initial-migration-hashes.txt` fingerprints those files before Batch 5. New migrations follow this chain. Only newly created disposable PostgreSQL containers may receive migrations during this work. No reset, `db push`, development launcher or persistent migration command is authorized by this implementation request.

An initial integration attempt overlapped creation of the new migration directories and failed with Prisma P3015 (migration.sql had not yet been written). This is not a passing baseline; the final complete-chain integration run is the relevant evidence.

## Initial repairs and verification policy

Payable reconciliation currently uses `finance.payout.read` for a mutation. It must use a dedicated `finance.payable.reconcile` scoped write grant while retaining finance read access. Production/logistics assignments and current internal organization authority must remain enforced before idempotent replay.

Buyer-accepted quantities must have one defined projection. The existing `CommercialOrder.delivered` field also supports the older synthetic commerce workflow, so changing historical order states is not an acceptable repair. The implemented rule is a transactionally maintained denormalized procurement delivered total: sum of buyer-accepted pieces from immutable confirmations. Migration 080000 backfills only procurement-managed orders. The older non-procurement demonstration retains its existing delivered semantics. Legacy managed delivery/settlement/closure actions are denied, and no historical state is changed.

No approved stock-receipt source, bank reconciliation source, payout verification authority, invoice/tax policy, accountless acceptance method or lawful financial-closure exception exists in the inspected project. Manually entered evidence is a report. Synthetic records cannot be promoted to independently verified stock or paid receipts. These are implementation-enforced blockers, not owner acceptance inferred from software tests.
