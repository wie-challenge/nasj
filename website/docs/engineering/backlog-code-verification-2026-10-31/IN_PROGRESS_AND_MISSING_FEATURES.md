# Unfinished software and verification work

Live GitHub was read through authenticated `gh`; no GitHub writes occurred. Owner acceptance remains **PENDING**. Every original criterion has a classification, including explicit `EVIDENCE_UNAVAILABLE` where the exact acceptance proof is missing. The 963 classifications are not a claim of 963 fresh behavioral demonstrations.

Priorities: P1 transactional integrity; P2 core workflow/privacy/accessibility; separately scheduled evidence restoration and external approvals. An unavailable classification is verification work, not an instruction to rebuild an existing feature.

## E01

- #84 — Artisan Registration, Skills and Language Preferences: E01-03.C3: Contact visibility is only a PRIVATE/ASSOCIATION/PUBLIC select without an audience explanation. Editable correction exists.

- #85 — Assisted Onboarding with Recorded Authorization: E01-05.C2: Accountless OnboardingAuthorization stores occurrence/withdrawal but no authorization validity period or expiry predicate. Linked-account DelegationGrant expiry is a separate implemented mechanism.

- #87 — Credential Recovery and Secure Account Changes: E01-07.C5: Recovery/session revocation and audit events exist, but completed credential reset/change has no approved-channel security notification; request-reset email is not a completion notice.

- #89 — Low-Bandwidth Artisan PWA and Safe Offline Updates: E01-08.C1: No service worker/offline synchronization/outbox for artisan PWA is shipped.

## E03

- #35 — Production Effort and Deadline Feasibility Calculator: E03-01.C1: Saved assumptions are not projected in full and RFQ feasibility does not compute estimated completion. Current review card still renders only remaining/shortage/effort/constraint codes. E03-01.C4: Saved assumptions are not projected in full and RFQ feasibility does not compute estimated completion. Current review card still renders only remaining/shortage/effort/constraint codes. E03-01.C5: Known logisticsLeadDays is checked for null but not added to completion/deadline feasibility; 0 and365 days cannot affect the decision when otherwise equal. A current contract counterexample is recorded separately.

- #36 — Versioned Detailed Order Cost Builder: E03-02.C3: Cost card shows subtotal/margin method/tax status but no numeric planned contribution. This is presentation incompleteness, not money arithmetic failure.

- #37 — Transparent Buyer Quote Summary: E03-03.C2: Issued paymentTerms/deliveryConditions/unitPrice remain absent from the buyer quotation card, which renders total, quantity, location and expiry. E03-03.C4: Issued paymentTerms/deliveryConditions/unitPrice remain absent from the buyer quotation card, which renders total, quantity, location and expiry.

- #40 — Authorized Acceptance of Exact Quote Terms: E03-06.C3: Server binds exact actor/version/hash, but the buyer review omits material saved payment/delivery terms before acceptance.

## E04

- #44 — Complete Artisan Offer Review: E04-02.C4: Preferred-language interface strings exist; FR/AR consequential commercial terms remain unreviewed and acceptance requires original-English acknowledgement. Qualified translation approval is external.

- #45 — Explicit Offer Acceptance, Decline and Expiry: E04-03.C1: A valid issued50-piece offer reserves all50 available pieces. Acceptance then compares remaining0 against the same50 again and returns409 ELIGIBILITY_STALE/CAPACITY_EXCEEDED. Decline/expiry release and spare-capacity replay work. E04-03.C3: A valid issued50-piece offer reserves all50 available pieces. Acceptance then compares remaining0 against the same50 again and returns409 ELIGIBILITY_STALE/CAPACITY_EXCEEDED. Decline/expiry release and spare-capacity replay work.

- #90 — Opt-In Verified Artisan Portfolio: E04-10.C1: Verified opt-in portfolio publication/withdrawal/evidence model is absent beyond skills declarations.

## E05

- #47 — Craft, Availability and Capacity Eligibility Filters: E05-01.C1: After eligibility ranking, remove weaving and retain an unrelated craft. Real preparation, issuance and acceptance still succeed. Guard checks skills.length rather than requested craft ID; equipment is not reread by this helper. E05-01.C2: After eligibility ranking, remove weaving and retain an unrelated craft. Real preparation, issuance and acceptance still succeed. Guard checks skills.length rather than requested craft ID; equipment is not reread by this helper.

- #48 — Multi-Group Batch Planning and Quantity Reconciliation: E05-03.C1: assertCandidates/validate consume saved EligibilityAssessment.knownRemaining/unit/period without fresh declaration checks; current native override accepts changed quantity after declaration becomes zero, corroborating the stale planning boundary. E05-03.C4: assertCandidates/validate consume saved EligibilityAssessment.knownRemaining/unit/period without fresh declaration checks; current native override accepts changed quantity after declaration becomes zero, corroborating the stale planning boundary.

- #49 — Atomic Capacity Reservation and Concurrent Offer Safety: E05-09.C4: Conversion of a fully reserved valid offer fails from own-reservation double counting, so this now-Done story cannot be accepted.

- #118 — Audited Human Override of Recommendations: E05-07.C4: Real human override accepts a candidate after requested craft removal and even after current declared capacity is zero, relying on saved ELIGIBLE/knownRemaining.

- #120 — Joint Scheduling Across Multiple Orders: E05-08.C1: Planning is per-order; no prioritized joint multi-order schedule proposal exists.

## E06

- #53 — Artisan Active Work and Versioned Instructions: E06-02.C1: Legacy instructions derive specificationVersion from quote.version; repricing can relabel unchanged specification provenance. Catalogue-bound branch is stronger and is not called broken. E06-02.C2: my-batches ownership filtering has no accepted/active status predicate or separate history mode. E06-02.C3: Legacy instructions derive specificationVersion from quote.version; repricing can relabel unchanged specification provenance. Catalogue-bound branch is stronger and is not called broken. E06-02.C5: Instruction Facts renders dl > span > dt/dd. This remains invalid definition-list semantics; no new axe verdict is invented for that exact screen.

- #119 — Production Dashboard with Distinct Fulfillment Quantities: E06-04.C1: Dashboard omits explicit inspected/remaining totals although produced/approved/shipped remain distinct. E06-04.C2: Dashboard omits explicit inspected/remaining totals although produced/approved/shipped remain distinct.

- #124 — Delegated Progress Reporting for Offline Artisans: E06-09.C1: Assigned coordinator authority is checked, but no active progress-specific delegation lookup or artisan report notification exists. Correction/dispute and attribution are present. E06-09.C2: Assigned coordinator authority is checked, but no active progress-specific delegation lookup or artisan report notification exists. Correction/dispute and attribution are present. E06-09.C4: Assigned coordinator authority is checked, but no active progress-specific delegation lookup or artisan report notification exists. Correction/dispute and attribution are present.

- #125 — Optional Private Progress Evidence Uploads: E06-10.C1: Production progress supports notes/evidence references, not private file upload/linkage for production events.

- #126 — Attributable Production and Handover Event Ledger: E06-11.C1: Source report records input occurredAt; ledger helper always writes new Date(), replacing occurrence with recording time. E06-11.C3: Source report records input occurredAt; ledger helper always writes new Date(), replacing occurrence with recording time.

## E07

- #51 — Batch Bill of Materials and Readiness View: E07-01.C3: BOM calculates exact thousandths and waste but lacks unit-aware procurement ceiling for discrete PIECES/UNITS; saved UI omits required rounding/waste explanation.

- #128 — Approved Supplier and Lead-Time Comparison: E07-07.C1: Material lot supplierReference is free text; no approved supplier comparison/versioned vendor performance model exists.

## E08

- #55 — Inspection Checklist Bound to Approved Specification: E08-01.C3: Stored tolerances/codes exist, but operator checklist does not expose complete inspection-method/defect-code metadata or explicit missing-checklist readiness. Write-time CHECKLIST_MISSING is stronger than readiness presentation. E08-01.C5: Stored tolerances/codes exist, but operator checklist does not expose complete inspection-method/defect-code metadata or explicit missing-checklist readiness. Write-time CHECKLIST_MISSING is stronger than readiness presentation.

- #56 — Reconciled Quality Inspection and Quantity Decisions: E08-02.C5: Inspection form serializes only data.criteria[0]; backend requires every required criterion, so multi-criterion QA cannot complete through this UI.

- #57 — Verified Shippable Quantity Projection: E08-03.C3: Projection distinguishes produced/approved/rejected/pending/shipped, but lacks explicit inspected-total presentation. E08-03.C4: Production dispute flags are recorded separately; shippable/consolidation logic does not consult or resolve those flags before fulfillment claims.

- #133 — Aggregate Defect and Process Improvement Analysis: E08-08.C1: Individual inspection attempts exist, but aggregate defect/reinspection process analysis is absent.

- #134 — Reinspection and Controlled Rejected-Unit Disposition: E08-09.C4: Reinspection authorization/evidence exists; controlled rejected-finished-unit disposal/write-off path is absent.

## E09

- #58 — QA-Approved Shipment Consolidation: E09-01.C5: Partial stage totals exist, but explicit remaining order quantity is omitted; uncovered production commitment is not the same value.

- #59 — Shipment Custody and Quantity Handover Ledger: E09-04.C4: Current custody balance is incorrectly shipment-wide rather than per holder/leg: valid collection100, receipt100, dispatch100 is rejected as excess. Over-collection rejection succeeds, but the legitimate onward movement fails.

- #60 — Buyer Receipt Confirmation and Delivery Differences: E09-05.C5: Discrepancy is retained and closure blocked, but consumer only handles commerce.* notifications; logistics discrepancy events get a receipt without operations/finance notices. This is the exact original C5, not the rewritten UI-copy criterion in old batch prose.

- #135 — Distinct Shipment, Delivery and Acceptance Milestones: E09-02.C2: Native PostgreSQL collection100 and hub receipt100 succeed, but dispatch of the same100 fails EXCESS_HANDOVER and leaves shipment COLLECTED. The guard sums movements across custody legs; the existing browser independently stalls awaiting IN_TRANSIT.

- #136 — Group Pickup and Collection Scheduling: E09-03.C4: Pickup validates window/coordinator/current readiness but has no overlapping assignment/different-hub collision lookup or conflict output.

- #138 — Versioned Buyer Shipment Manifest Downloads: E09-07.C1: Shipment views/documents do not implement a versioned buyer shipment-manifest artifact.

## E10

- #61 — Idempotent Artisan Payable Recognition: E10-06.C2: Payable recognition hardcodes BUYER_ACCEPTED_PIECE rather than honoring an accepted QA-approved earning milestone.

- #62 — Authorized Payout Approval and Maker-Checker Controls: E10-07.C2: Approval UI lacks beneficiary/source-term review; approval event lacks explicit permission/payable version reference beyond immutable payable ID and policy version. E10-07.C4: Approval UI lacks beneficiary/source-term review; approval event lacks explicit permission/payable version reference beyond immutable payable ID and policy version. E10-07.C5: Finance checks PaymentDispute and changed payable status/amount but does not enforce separate unresolved production-dispute flags before approval.

- #63 — Payout Execution, Failure and Verified Receipt: E10-08.C1: Payout lifecycle supports requested/approved/pending/unverified manual reports/failure; independently settled outcomes and operational partial-settlement reconciliation remain absent. E10-08.C2: Payout lifecycle supports requested/approved/pending/unverified manual reports/failure; independently settled outcomes and operational partial-settlement reconciliation remain absent. E10-08.C5: Payout lifecycle supports requested/approved/pending/unverified manual reports/failure; independently settled outcomes and operational partial-settlement reconciliation remain absent.

- #66 — Buyer Deposit Recording and Reconciliation: E10-05.C3: Receipt recording exists, but only rejected/disputed/pending verification reviews exist; positive authorized reconciliation/documented-credit approval path is absent. E10-05.C4: Receipt recording exists, but only rejected/disputed/pending verification reviews exist; positive authorized reconciliation/documented-credit approval path is absent.

- #72 — Partial Fulfillment and Cancellation Settlement: E10-10.C1: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete. E10-10.C2: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete. E10-10.C3: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete. E10-10.C4: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete.

- #142 — Order Revenue, Cost and Contribution Dashboard: E10-01.C2: Dashboard/export reads supported costs/receipts/liabilities but no issued-invoice subledger total, so invoiced revenue is not distinguished.

- #143 — Artisan Compensation Statement and Payment Status: E10-02.C3: Statement lineage links immutable obligations but recognition uses hardcoded buyer-accepted milestone instead of accepted earning milestone. E10-02.C4: Statement omits recorded contractual due-date history from its projection; separate finance metrics do not satisfy the artisan statement.

- #147 — Approved Payment Provider Integration: E10-12.C1: Only manual unverified payout reports and simulation exist; no approved provider adapter, signed callback or payment reconciliation integration.

## E11

- #155 — Human-Reviewed Image-Assisted Defect Suggestions: E11-07.C1: AI service has deterministic previews; no image defect model/training/validated assistive inference path is supplied.

- #156 — Validated Production-Time Prediction Model: E11-08.C1: No consented representative training dataset or trained production-time model exists; deterministic estimation is a separate scope.

## E12

- #158 — Reproducible Repetitive-Motion Simulator: E12-02.C2: Shipped FixedDevice exposes only fixed active/rest sequence; noisy/disconnected values occur in tests but there are no labeled selectable noisy/disconnected presets or exposed deterministic seed control. Model reset/configure/sample APIs exist. E12-02.C3: Shipped FixedDevice exposes only fixed active/rest sequence; noisy/disconnected values occur in tests but there are no labeled selectable noisy/disconnected presets or exposed deterministic seed control. Model reset/configure/sample APIs exist.

## E13

- #139 — Auditable Aggregate Producer-Share Definition: E13-07.C1: Share formula handles supplied denominator/refund values, but runtime statement/public share passes refundMillimes0 and lacks integrated cancellation/partial settlement treatment. E13-07.C4: Share formula handles supplied denominator/refund values, but runtime statement/public share passes refundMillimes0 and lacks integrated cancellation/partial settlement treatment.

## E15

- #190 — Deterministic Isolated Demo Reset: E15-04.C1: Showroom reset confirmation explicitly says local safety companion history is separate and is not reset. Both original C1 and C3 require that state to clear. Server reset isolation is otherwise exercised. E15-04.C3: Showroom reset confirmation explicitly says local safety companion history is separate and is not reset. Both original C1 and C3 require that state to clear. Server reset isolation is otherwise exercised.

## E16

- #78 — Authenticated Web and NestJS API Boundaries: E16-05.C1: Authenticated HTTP POST deposits with -1.000, abc and1.0000 returns500 instead of400 field validation. Refinement calls parseTnd after invalid input; safe errors do not establish correct validation. E16-05.C2: Authenticated HTTP POST deposits with -1.000, abc and1.0000 returns500 instead of400 field validation. Refinement calls parseTnd after invalid input; safe errors do not establish correct validation.

- #88 — Responsive Accessible Critical User Journeys: E16-02.C1: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes. E16-02.C2: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes. E16-02.C3: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes. E16-02.C5: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes.

## E18

- #207 — Recurring Buyer Agreements and Replenishment Planning: E18-04.C1: No recurring buyer agreement/replenishment contract workflow exists in sales/procurement runtime.

## Verification debt

Implemented-but-unverified stories: #30, #73, #113, #148, #163, #168, #176, #188, #204. Stories whose acceptance evidence remains unavailable: #34, #39, #41, #42, #43, #46, #50, #52, #54, #64, #65, #67, #68, #69, #70, #71, #74, #75, #77, #79, #81, #91, #92, #93, #94, #98, #99, #103, #105, #107, #108, #109, #110, #111, #112, #114, #115, #116, #117, #121, #122, #123, #127, #129, #130, #131, #132, #137, #140, #141, #144, #145, #146, #149, #150, #151, #152, #153, #154, #157, #159, #161, #167, #172, #173, #174, #177, #178, #179, #180, #181, #182, #183, #184, #185, #186, #194, #195, #197, #199, #200, #201, #202, #205, #206, #208, #209, #210, #211, #212, #213. Every exact criterion and recovery need is retained in FULL_ISSUE_CENSUS.json. Do not turn these into blanket implementation tickets.
