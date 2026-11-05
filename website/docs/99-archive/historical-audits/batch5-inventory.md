# Batch 5 inventory controls

The stock ledger is independent from specifications, BOM lines and the legacy synthetic release attestation. `MaterialLot` represents a recorded receipt. `SYNTHETIC` is demonstration stock; `PENDING_VERIFICATION` is an operator report awaiting an approved physical receipt policy. Neither is independently verified physical stock, and no verification endpoint exists.

Quantity is a signed PostgreSQL bigint in integer thousandths of the existing material unit, serialized as decimal strings. METERS supports thousandths; PIECES and UNITS require multiples of 1000. No conversion between units is assumed. Lot conservation is enforced by a database CHECK: received = available + reserved + issued + consumed + damaged + quarantine. Returned is cumulative history and excluded from conservation. Shortage explicitly reconciled as a loss is segregated in the unavailable damaged/loss bucket with a separate `DISCREPANCY_LOSS_SEGREGATED` movement; the receipt remains unchanged.

`InventoryMovement`, `MaterialReceipt`, and `MaterialReconciliation` are append-only, including database UPDATE/DELETE rejection triggers. Mutations run within the existing IAM advisory-lock transaction, recheck active session/membership, resource scope and grant before idempotency replay, and append an audit event/outbox event. This serializes simultaneous reservations with lifecycle/revocation changes. Database constraints reject negative balances and unsupported provenance, quantities, units, recipient sources and dispositions.

A reservation binds a released `BatchMaterialRequirement`, lot, accepted offer and approved order. Material code and unit must match. The stock organization must match the order's operator organization, and the operator needs a current buyer account assignment. Stock reservation capacity is the requirement minus active remaining reservations, in-transit handovers and net usable received material; this permits separately documented replacement stock after shortage or damage. Available stock is also checked. Releasing a reservation restores only its unissued balance. Issued and consumed material is never restored by changing reservation status.

Handovers preserve sender actor, receiving organization, actual batch artisan, time and evidence reference. Sending is separate from recipient acknowledgement. Direct receipt requires the authenticated artisan owning the batch profile. Assisted reporting requires the receive grant, current coordinator assignment, active management relationship and approved association membership; PHONE or IN_PERSON is recorded with PENDING_INDEPENDENT_VERIFICATION. Revoked assignments cannot view those private handovers. Direct receipt records an authenticated acknowledgement, not independent physical evidence.

A shortage or damage creates DISCREPANCY_REPORTED and blocks readiness. An authorized stock adjustment actor can explicitly reconcile that discrepancy with a reason, preserving the original receipt and loss history. Net good receipts still need to cover the full requirement. Replacement handovers and receipts can complete synthetic demonstration readiness. A pending stock provenance or assisted confirmation never becomes verified readiness. Existing synthetic releases without an inventory workflow retain their historical semantics. Once inventory operations start for a batch, incomplete receipts, open discrepancies, and pending physical verification prevent production start and progress through the existing execution service. `MaterialReadiness` stores the operational projection separately from immutable `BatchMaterialRequirement` release evidence. Material projections now show that persisted readiness with the historical release attestation as fallback.

Returns require recorded unconsumed receipt and remain quarantined. Damaged material is segregated upon receipt; returning it transfers damaged to quarantine, while unused returns transfer issued to quarantine. Disposition requires the adjustment grant and a reason. Only UNUSED stock can be explicitly restored to availability; damaged and defective returns remain unavailable. Repeated disposition and returns exceeding the corresponding condition balance are refused. Consumption requires a direct acknowledged or reconciled receipt and sufficient good unreturned stock. It transfers issued to consumed; consumed material cannot be returned.

## Routes

All routes use `/api/v1/inventory`; global session, CSRF, origin and error handling apply. POST endpoints accept `Idempotency-Key`.

- GET organizations/:id — inventory.stock.read; scoped stock, movement history, reservations, handovers, receipts, returns and current permissions.
- GET my-handovers — authenticated artisan ownership or current assigned coordinator with inventory.stock.receive.
- POST organizations/:id/lots — inventory.stock.register, internal organization only.
- POST lots/:id/reservations — inventory.stock.reserve plus buyer account scope.
- POST reservations/:id/release — inventory.stock.reserve plus buyer account scope.
- POST reservations/:id/handovers — inventory.stock.handover plus buyer account scope.
- POST handovers/:id/receipts — direct artisan or assigned inventory.stock.receive coordinator.
- POST handovers/:id/reconcile — inventory.stock.adjust plus buyer account scope.
- POST handovers/:id/returns — inventory.stock.adjust plus buyer account scope.
- POST returns/:id/disposition — inventory.stock.adjust in the lot organization.
- POST handovers/:id/consumption — inventory.stock.adjust plus buyer account scope.

## Evidence and limitations

`test/inventory.scenarios.ts` exercises controlled synthetic lot creation, grant denial/revocation, invalid inputs/provenance, current coordinator scope, exact idempotency, concurrent reservation exclusion, incompatible units, discrepancy/replacement workflow, damaged quarantine/disposition, consumption bounds and database movement immutability. `test/unit/inventory.test.ts` tests strict quantity/provenance schemas and conservation. Actual outcomes belong in the final executed test report.

No supplier purchasing integration, approved independent receipt verification policy, live warehouse acceptance, independent accountless verification, or production physical inventory certification is implemented. No material provenance is automatically promoted. Schema migration 20261027070000_inventory_controls is additive and must be applied separately to persistent environments by an authorized operator; development work only uses disposable databases for validation.
