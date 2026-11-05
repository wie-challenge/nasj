# Incorrectly Done stories

Live GitHub was read through authenticated `gh`; no GitHub writes occurred. Owner acceptance remains **PENDING**. Every original criterion has a classification, including explicit `EVIDENCE_UNAVAILABLE` where the exact acceptance proof is missing. The 963 classifications are not a claim of 963 fresh behavioral demonstrations.

**38 currently Done stories** have an original criterion contradicted, partially implemented or missing. This is the current list, not the historical40. Of those40 candidates, 35 still have confirmed unmet criteria; #73/#113/#176/#204 now have verification gaps and #102 is verified. New current failures are #45/#49/#158.

## #35 — Production Effort and Deadline Feasibility Calculator

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E03-01.C1**: Feasibility shows constraints, unmet capacity and assumptions.

Current behavior: Saved assumptions are not projected in full and RFQ feasibility does not compute estimated completion. Current review card still renders only remaining/shortage/effort/constraint codes.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G04, CP5-G05. Source: packages/contracts/src/commercial.ts:132; apps/api/src/modules/procurement/procurement.service.ts; apps/web/src/components/procurement.tsx:805. Evidence: current-source-review.json.

**E03-01.C4**: Show shortages, estimated completion and material/sample constraints.

Current behavior: Saved assumptions are not projected in full and RFQ feasibility does not compute estimated completion. Current review card still renders only remaining/shortage/effort/constraint codes.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G04, CP5-G05. Source: packages/contracts/src/commercial.ts:132; apps/api/src/modules/procurement/procurement.service.ts; apps/web/src/components/procurement.tsx:805. Evidence: current-source-review.json.

**E03-01.C5**: Mark missing inputs unknown and prevent unsupported feasible labels.

Current behavior: Known logisticsLeadDays is checked for null but not added to completion/deadline feasibility; 0 and365 days cannot affect the decision when otherwise equal. A current contract counterexample is recorded separately.

Reproduction: Native executable counterexample. Related findings: CP5-G03. Source: packages/contracts/src/commercial.ts:198. Evidence: logs/feasibility-counterexample.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #36 — Versioned Detailed Order Cost Builder

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E03-02.C3**: Distinguish fixed/variable costs and show subtotal, tax basis and contribution.

Current behavior: Cost card shows subtotal/margin method/tax status but no numeric planned contribution. This is presentation incompleteness, not money arithmetic failure.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G07. Source: apps/web/src/components/procurement.tsx:820. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #37 — Transparent Buyer Quote Summary

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E03-03.C2**: Show quantity, unit/total price, currency, tax, delivery assumptions and expiry.

Current behavior: Issued paymentTerms/deliveryConditions/unitPrice remain absent from the buyer quotation card, which renders total, quantity, location and expiry.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G06. Source: apps/web/src/components/procurement.tsx:845. Evidence: current-source-review.json.

**E03-03.C4**: Explain quality/sample requirements, payment milestones and exclusions.

Current behavior: Issued paymentTerms/deliveryConditions/unitPrice remain absent from the buyer quotation card, which renders total, quantity, location and expiry.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G06. Source: apps/web/src/components/procurement.tsx:845. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #40 — Authorized Acceptance of Exact Quote Terms

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E03-06.C3**: Present exact terms and record explicit actor/date/version acceptance.

Current behavior: Server binds exact actor/version/hash, but the buyer review omits material saved payment/delivery terms before acceptance.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G06. Source: apps/web/src/components/procurement.tsx:865. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #44 — Complete Artisan Offer Review

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E04-02.C4**: Provide accept/decline/clarification in supported preferred language.

Current behavior: Preferred-language interface strings exist; FR/AR consequential commercial terms remain unreviewed and acceptance requires original-English acknowledgement. Qualified translation approval is external.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: FPA-09. Source: apps/web/src/lib/offer-language.ts; apps/web/src/components/offer-review.tsx; apps/api/src/modules/commerce/commerce.service.ts:660. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #45 — Explicit Offer Acceptance, Decline and Expiry

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P1.

**E04-03.C1**: Explicit per-offer acceptance captures contract-term version and timestamp; decline/expiry releases reserved capacity; no association can silently accept.

Current behavior: A valid issued50-piece offer reserves all50 available pieces. Acceptance then compares remaining0 against the same50 again and returns409 ELIGIBILITY_STALE/CAPACITY_EXCEEDED. Decline/expiry release and spare-capacity replay work.

Reproduction: Native executable counterexample. Related findings: AUDIT-CAPACITY-01. Source: apps/api/src/modules/commerce/commerce.service.ts:687; apps/api/src/modules/procurement/eligibility-guard.ts:131. Evidence: logs/capacity-craft-service-final.log.

**E04-03.C3**: Convert reservation to accepted commitment atomically within capacity.

Current behavior: A valid issued50-piece offer reserves all50 available pieces. Acceptance then compares remaining0 against the same50 again and returns409 ELIGIBILITY_STALE/CAPACITY_EXCEEDED. Decline/expiry release and spare-capacity replay work.

Reproduction: Native executable counterexample. Related findings: AUDIT-CAPACITY-01. Source: apps/api/src/modules/commerce/commerce.service.ts:687; apps/api/src/modules/procurement/eligibility-guard.ts:131. Evidence: logs/capacity-craft-service-final.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #47 — Craft, Availability and Capacity Eligibility Filters

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E05-01.C1**: Ineligible groups excluded and exclusions explained.

Current behavior: After eligibility ranking, remove weaving and retain an unrelated craft. Real preparation, issuance and acceptance still succeed. Guard checks skills.length rather than requested craft ID; equipment is not reread by this helper.

Reproduction: Native executable counterexample. Related findings: AUDIT-CRAFT-02, CP5-G08. Source: apps/api/src/modules/procurement/eligibility-guard.ts:104; apps/api/src/modules/procurement/production-offers.ts:614. Evidence: logs/capacity-craft-service-final.log.

**E05-01.C2**: Filter craft, equipment, declared availability and free capacity.

Current behavior: After eligibility ranking, remove weaving and retain an unrelated craft. Real preparation, issuance and acceptance still succeed. Guard checks skills.length rather than requested craft ID; equipment is not reread by this helper.

Reproduction: Native executable counterexample. Related findings: AUDIT-CRAFT-02, CP5-G08. Source: apps/api/src/modules/procurement/eligibility-guard.ts:104; apps/api/src/modules/procurement/production-offers.ts:614. Evidence: logs/capacity-craft-service-final.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #48 — Multi-Group Batch Planning and Quantity Reconciliation

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E05-03.C1**: No negative quantity, no capacity oversubscription, totals reconcile.

Current behavior: assertCandidates/validate consume saved EligibilityAssessment.knownRemaining/unit/period without fresh declaration checks; current native override accepts changed quantity after declaration becomes zero, corroborating the stale planning boundary.

Reproduction: Native executable counterexample. Related findings: CP5-G08. Source: apps/api/src/modules/procurement/planning.ts:868; apps/api/src/modules/procurement/planning.ts:909. Evidence: logs/capacity-craft-extended.log.

**E05-03.C4**: Validate capacity periods, material assumptions and units.

Current behavior: assertCandidates/validate consume saved EligibilityAssessment.knownRemaining/unit/period without fresh declaration checks; current native override accepts changed quantity after declaration becomes zero, corroborating the stale planning boundary.

Reproduction: Native executable counterexample. Related findings: CP5-G08. Source: apps/api/src/modules/procurement/planning.ts:868; apps/api/src/modules/procurement/planning.ts:909. Evidence: logs/capacity-craft-extended.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #49 — Atomic Capacity Reservation and Concurrent Offer Safety

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P1.

**E05-09.C4**: Convert accepted work and release declined/expired reservations once.

Current behavior: Conversion of a fully reserved valid offer fails from own-reservation double counting, so this now-Done story cannot be accepted.

Reproduction: Native executable counterexample. Related findings: AUDIT-CAPACITY-01. Source: apps/api/src/modules/commerce/commerce.service.ts:687; apps/api/src/modules/procurement/eligibility-guard.ts:131. Evidence: logs/capacity-craft-service-final.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #51 — Batch Bill of Materials and Readiness View

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E07-01.C3**: Show per-unit usage, waste assumption and procurement rounding.

Current behavior: BOM calculates exact thousandths and waste but lacks unit-aware procurement ceiling for discrete PIECES/UNITS; saved UI omits required rounding/waste explanation.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G10. Source: packages/contracts/src/execution.ts; apps/api/src/modules/procurement/execution.ts; apps/web/src/components/execution-workspace.tsx. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #53 — Artisan Active Work and Versioned Instructions

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E06-02.C1**: Product version, quantity, due date, material and quality criteria visible.

Current behavior: Legacy instructions derive specificationVersion from quote.version; repricing can relabel unchanged specification provenance. Catalogue-bound branch is stronger and is not called broken.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G11. Source: apps/api/src/modules/procurement/execution.ts:1151. Evidence: current-source-review.json.

**E06-02.C2**: Show only owned accepted/active batches with quantity, deadline and state.

Current behavior: my-batches ownership filtering has no accepted/active status predicate or separate history mode.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G12. Source: apps/api/src/modules/procurement/execution.ts:1086. Evidence: current-source-review.json.

**E06-02.C3**: Display locked specification, materials and quality checklist.

Current behavior: Legacy instructions derive specificationVersion from quote.version; repricing can relabel unchanged specification provenance. Catalogue-bound branch is stronger and is not called broken.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G11. Source: apps/api/src/modules/procurement/execution.ts:1151. Evidence: current-source-review.json.

**E06-02.C5**: Handle empty/missing-document states accessibly on mobile.

Current behavior: Instruction Facts renders dl > span > dt/dd. This remains invalid definition-list semantics; no new axe verdict is invented for that exact screen.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G13. Source: apps/web/src/components/execution-workspace.tsx:24. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #55 — Inspection Checklist Bound to Approved Specification

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E08-01.C3**: Present tolerances, units, defect codes and inspection method.

Current behavior: Stored tolerances/codes exist, but operator checklist does not expose complete inspection-method/defect-code metadata or explicit missing-checklist readiness. Write-time CHECKLIST_MISSING is stronger than readiness presentation.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G14. Source: apps/web/src/components/execution-workspace.tsx; apps/api/src/modules/procurement/execution.ts:863. Evidence: current-source-review.json.

**E08-01.C5**: Mark missing checklist/approval as inspection-readiness blocker.

Current behavior: Stored tolerances/codes exist, but operator checklist does not expose complete inspection-method/defect-code metadata or explicit missing-checklist readiness. Write-time CHECKLIST_MISSING is stronger than readiness presentation.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G14. Source: apps/web/src/components/execution-workspace.tsx; apps/api/src/modules/procurement/execution.ts:863. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #56 — Reconciled Quality Inspection and Quantity Decisions

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E08-02.C5**: Record defects/evidence and update QA totals transactionally.

Current behavior: Inspection form serializes only data.criteria[0]; backend requires every required criterion, so multi-criterion QA cannot complete through this UI.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G15, CP5-G18. Source: apps/web/src/components/execution-workspace.tsx:241. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #57 — Verified Shippable Quantity Projection

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E08-03.C3**: Separate reported, inspected, accepted, rejected, pending and shipped.

Current behavior: Projection distinguishes produced/approved/rejected/pending/shipped, but lacks explicit inspected-total presentation.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G17. Source: apps/api/src/modules/procurement/execution.ts; apps/web/src/components/execution-workspace.tsx. Evidence: current-source-review.json.

**E08-03.C4**: Exclude disputed and rework units from fulfillment claims.

Current behavior: Production dispute flags are recorded separately; shippable/consolidation logic does not consult or resolve those flags before fulfillment claims.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G16. Source: apps/api/src/modules/procurement/execution.ts. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #58 — QA-Approved Shipment Consolidation

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E09-01.C5**: Show partial fulfillment and remaining order quantity.

Current behavior: Partial stage totals exist, but explicit remaining order quantity is omitted; uncovered production commitment is not the same value.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G17. Source: apps/api/src/modules/procurement/execution.ts; apps/web/src/components/execution-workspace.tsx. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #60 — Buyer Receipt Confirmation and Delivery Differences

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E09-05.C5**: Notify operations/finance and preserve open discrepancy before closure.

Current behavior: Discrepancy is retained and closure blocked, but consumer only handles commerce.* notifications; logistics discrepancy events get a receipt without operations/finance notices. This is the exact original C5, not the rewritten UI-copy criterion in old batch prose.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G21. Source: apps/api/src/jobs/commerce-consumer.ts:90; apps/api/src/modules/procurement/logistics.ts:336. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #61 — Idempotent Artisan Payable Recognition

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-06.C2**: Create obligation from the accepted offer's agreed milestone and rate snapshot.

Current behavior: Payable recognition hardcodes BUYER_ACCEPTED_PIECE rather than honoring an accepted QA-approved earning milestone.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G22. Source: apps/api/src/modules/procurement/logistics.ts:1017. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #62 — Authorized Payout Approval and Maker-Checker Controls

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-07.C2**: Show beneficiary, amount, due obligation and evidence before approval.

Current behavior: Approval UI lacks beneficiary/source-term review; approval event lacks explicit permission/payable version reference beyond immutable payable ID and policy version.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G23. Source: apps/web/src/components/finance-workspace.tsx; apps/api/src/modules/finance/finance.service.ts:289. Evidence: current-source-review.json.

**E10-07.C4**: Record approver, time, authority, reason and payable version.

Current behavior: Approval UI lacks beneficiary/source-term review; approval event lacks explicit permission/payable version reference beyond immutable payable ID and policy version.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G23. Source: apps/web/src/components/finance-workspace.tsx; apps/api/src/modules/finance/finance.service.ts:289. Evidence: current-source-review.json.

**E10-07.C5**: Block duplicate, excessive, disputed or unauthorized approvals and invalidate approval after material changes.

Current behavior: Finance checks PaymentDispute and changed payable status/amount but does not enforce separate unresolved production-dispute flags before approval.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G23. Source: apps/api/src/modules/finance/finance.service.ts. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #63 — Payout Execution, Failure and Verified Receipt

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-08.C1**: Failed, pending and paid states distinct, verified reference required.

Current behavior: Payout lifecycle supports requested/approved/pending/unverified manual reports/failure; independently settled outcomes and operational partial-settlement reconciliation remain absent.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G24. Source: apps/api/src/modules/finance/finance.service.ts; apps/api/prisma/migrations/20261027080000_financial_controls/migration.sql. Evidence: current-source-review.json.

**E10-08.C2**: Record initiated transfer separately from pending, failed and settled outcomes.

Current behavior: Payout lifecycle supports requested/approved/pending/unverified manual reports/failure; independently settled outcomes and operational partial-settlement reconciliation remain absent.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G24. Source: apps/api/src/modules/finance/finance.service.ts; apps/api/prisma/migrations/20261027080000_financial_controls/migration.sql. Evidence: current-source-review.json.

**E10-08.C5**: Reconcile partial settlements and prevent total payout exceeding outstanding liability.

Current behavior: Payout lifecycle supports requested/approved/pending/unverified manual reports/failure; independently settled outcomes and operational partial-settlement reconciliation remain absent.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G24. Source: apps/api/src/modules/finance/finance.service.ts; apps/api/prisma/migrations/20261027080000_financial_controls/migration.sql. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #66 — Buyer Deposit Recording and Reconciliation

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-05.C3**: Match evidence to buyer/order and identify partial, unmatched or duplicate receipts.

Current behavior: Receipt recording exists, but only rejected/disputed/pending verification reviews exist; positive authorized reconciliation/documented-credit approval path is absent.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G28. Source: packages/contracts/src/finance.ts; apps/api/src/modules/finance/finance.service.ts:201. Evidence: current-source-review.json.

**E10-05.C4**: Confirm funding only after authorized reconciliation or documented credit approval.

Current behavior: Receipt recording exists, but only rejected/disputed/pending verification reviews exist; positive authorized reconciliation/documented-credit approval path is absent.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G28. Source: packages/contracts/src/finance.ts; apps/api/src/modules/finance/finance.service.ts:201. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #72 — Partial Fulfillment and Cancellation Settlement

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-10.C1**: Agreed work and materials obligations reconciled first.

Current behavior: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G29, CP5-G31. Source: apps/api/src/modules/finance/finance.service.ts:521; apps/api/src/modules/finance/finance.service.ts:1218. Evidence: current-source-review.json.

**E10-10.C2**: Inventory accepted terms, completed/rejected/disputed work and issued/returned materials.

Current behavior: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G29, CP5-G31. Source: apps/api/src/modules/finance/finance.service.ts:521; apps/api/src/modules/finance/finance.service.ts:1218. Evidence: current-source-review.json.

**E10-10.C3**: Calculate buyer credits, artisan obligations and approved costs separately.

Current behavior: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G22, CP5-G24, CP5-G29, CP5-G31. Source: apps/api/src/modules/finance/finance.service.ts:521; apps/api/src/modules/finance/finance.service.ts:1218. Evidence: current-source-review.json.

**E10-10.C4**: Require evidence and authorized agreement for any deduction or negotiated remedy.

Current behavior: Cancellation remedy remains policy-pending proposal/snapshot: no complete separate credit, entitlement, material-cost calculation or participant-agreed applied settlement; production dispute facts are incomplete.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G29, CP5-G31. Source: apps/api/src/modules/finance/finance.service.ts:521; apps/api/src/modules/finance/finance.service.ts:1218. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #78 — Authenticated Web and NestJS API Boundaries

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E16-05.C1**: Zod validation, rate limits, resource-level RBAC and error contracts.

Current behavior: Authenticated HTTP POST deposits with -1.000, abc and1.0000 returns500 instead of400 field validation. Refinement calls parseTnd after invalid input; safe errors do not establish correct validation.

Reproduction: Native executable counterexample. Related findings: CP5-G30, FPA-02. Source: packages/contracts/src/finance.ts:7; apps/api/src/common/validation.pipe.ts. Evidence: logs/finance-validation-http.log.

**E16-05.C2**: Validate payload/query schemas and return consistent safe errors.

Current behavior: Authenticated HTTP POST deposits with -1.000, abc and1.0000 returns500 instead of400 field validation. Refinement calls parseTnd after invalid input; safe errors do not establish correct validation.

Reproduction: Native executable counterexample. Related findings: CP5-G30, FPA-02. Source: packages/contracts/src/finance.ts:7; apps/api/src/common/validation.pipe.ts. Evidence: logs/finance-validation-http.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #84 — Artisan Registration, Skills and Language Preferences

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E01-03.C3**: Explain visibility and allow correction before submission.

Current behavior: Contact visibility is only a PRIVATE/ASSOCIATION/PUBLIC select without an audience explanation. Editable correction exists.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G02. Source: apps/web/src/components/artisan-workspace.tsx:128. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #85 — Assisted Onboarding with Recorded Authorization

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E01-05.C2**: Record artisan, helper, allowed actions, consent method and authorization period.

Current behavior: Accountless OnboardingAuthorization stores occurrence/withdrawal but no authorization validity period or expiry predicate. Linked-account DelegationGrant expiry is a separate implemented mechanism.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G01. Source: apps/api/prisma/schema.prisma:1114; apps/api/src/modules/registry/registry.service.ts. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #87 — Credential Recovery and Secure Account Changes

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E01-07.C5**: Revoke affected sessions and notify through the approved channel.

Current behavior: Recovery/session revocation and audit events exist, but completed credential reset/change has no approved-channel security notification; request-reset email is not a completion notice.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G34, FPA-02. Source: apps/api/src/modules/auth/auth.service.ts; apps/api/src/modules/auth/auth.gateway.ts; apps/api/src/jobs/commerce-consumer.ts. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #88 — Responsive Accessible Critical User Journeys

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E16-02.C1**: Keyboard and small-screen critical flows tested; reduced-motion honored.

Current behavior: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes.

Reproduction: Current browser journey failure and source review; not every listed UI barrier independently rerun. Related findings: CP5-G13, CP5-G15, CP5-G18. Source: apps/web/src/components/execution-workspace.tsx; tests/e2e/execution.spec.ts. Evidence: logs/browser-original.log.

**E16-02.C2**: Make buyer RFQ, artisan decisions/progress and operator review usable on small screens.

Current behavior: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes.

Reproduction: Current browser journey failure and source review; not every listed UI barrier independently rerun. Related findings: CP5-G13, CP5-G15, CP5-G18. Source: apps/web/src/components/execution-workspace.tsx; tests/e2e/execution.spec.ts. Evidence: logs/browser-original.log.

**E16-02.C3**: Provide labels, keyboard controls, visible focus and understandable validation.

Current behavior: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes.

Reproduction: Current browser journey failure and source review; not every listed UI barrier independently rerun. Related findings: CP5-G13, CP5-G15, CP5-G18. Source: apps/web/src/components/execution-workspace.tsx; tests/e2e/execution.spec.ts. Evidence: logs/browser-original.log.

**E16-02.C5**: Test representative low-end device/browser conditions and fix blocking barriers.

Current behavior: Buyer mobile/keyboard/axe/presentation flows execute, but production journey fails and production definition-list/multi-criterion QA barriers remain. Do not promote entire accessibility acceptance from representative successes.

Reproduction: Current browser journey failure and source review; not every listed UI barrier independently rerun. Related findings: CP5-G13, CP5-G15, CP5-G18. Source: apps/web/src/components/execution-workspace.tsx; tests/e2e/execution.spec.ts. Evidence: logs/browser-original.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #118 — Audited Human Override of Recommendations

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E05-07.C4**: Keep hard capacity/qualification/consent guards active.

Current behavior: Real human override accepts a candidate after requested craft removal and even after current declared capacity is zero, relying on saved ELIGIBLE/knownRemaining.

Reproduction: Native executable counterexample. Related findings: AUDIT-CRAFT-02, CP5-G08. Source: apps/api/src/modules/procurement/planning.ts:460; apps/api/src/modules/procurement/eligibility-guard.ts:104. Evidence: logs/capacity-craft-extended.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #119 — Production Dashboard with Distinct Fulfillment Quantities

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E06-04.C1**: Dashboard distinguishes produced, inspected, accepted and shipped.

Current behavior: Dashboard omits explicit inspected/remaining totals although produced/approved/shipped remain distinct.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G17. Source: apps/api/src/modules/procurement/execution.ts; apps/web/src/components/execution-workspace.tsx. Evidence: current-source-review.json.

**E06-04.C2**: Separate planned, accepted work, produced, inspected, approved and shipped.

Current behavior: Dashboard omits explicit inspected/remaining totals although produced/approved/shipped remain distinct.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G17. Source: apps/api/src/modules/procurement/execution.ts; apps/web/src/components/execution-workspace.tsx. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #124 — Delegated Progress Reporting for Offline Artisans

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E06-09.C1**: Explicit delegation recorded; artisan notified and able to dispute.

Current behavior: Assigned coordinator authority is checked, but no active progress-specific delegation lookup or artisan report notification exists. Correction/dispute and attribution are present.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G45. Source: apps/api/src/modules/procurement/execution.ts:1330. Evidence: current-source-review.json.

**E06-09.C2**: Verify active progress delegation for the artisan/batch.

Current behavior: Assigned coordinator authority is checked, but no active progress-specific delegation lookup or artisan report notification exists. Correction/dispute and attribution are present.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G45. Source: apps/api/src/modules/procurement/execution.ts:1330. Evidence: current-source-review.json.

**E06-09.C4**: Notify artisan and offer correction/dispute route.

Current behavior: Assigned coordinator authority is checked, but no active progress-specific delegation lookup or artisan report notification exists. Correction/dispute and attribution are present.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G45. Source: apps/api/src/modules/procurement/execution.ts:1330. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #126 — Attributable Production and Handover Event Ledger

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E06-11.C1**: Events store actor, source, quantity, recorded/occurred timestamps and authorized proxy indication, and reconcile with batch totals.

Current behavior: Source report records input occurredAt; ledger helper always writes new Date(), replacing occurrence with recording time.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G49. Source: apps/api/src/modules/procurement/execution.ts:1488. Evidence: current-source-review.json.

**E06-11.C3**: Separate occurred_at from recorded_at and identify proxy actions.

Current behavior: Source report records input occurredAt; ledger helper always writes new Date(), replacing occurrence with recording time.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G49. Source: apps/api/src/modules/procurement/execution.ts:1488. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #134 — Reinspection and Controlled Rejected-Unit Disposition

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E08-09.C4**: Require authorized reason/evidence for approval/disposal.

Current behavior: Reinspection authorization/evidence exists; controlled rejected-finished-unit disposal/write-off path is absent.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G53. Source: apps/api/src/modules/procurement/execution.ts; apps/web/src/components/execution-workspace.tsx. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #135 — Distinct Shipment, Delivery and Acceptance Milestones

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P1.

**E09-02.C2**: Separate prepared, shipped, transit, delivered and buyer-accepted states.

Current behavior: Native PostgreSQL collection100 and hub receipt100 succeed, but dispatch of the same100 fails EXCESS_HANDOVER and leaves shipment COLLECTED. The guard sums movements across custody legs; the existing browser independently stalls awaiting IN_TRANSIT.

Reproduction: Current browser journey failure and source review; not every listed UI barrier independently rerun. Related findings: AUDIT-CUSTODY-04. Source: apps/api/src/modules/procurement/logistics.ts:203. Evidence: logs/custody-chain.log; logs/browser-original.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #136 — Group Pickup and Collection Scheduling

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E09-03.C4**: Obtain confirmation and surface conflicts/unready output.

Current behavior: Pickup validates window/coordinator/current readiness but has no overlapping assignment/different-hub collision lookup or conflict output.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G54. Source: apps/api/src/modules/procurement/logistics.ts:132. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #139 — Auditable Aggregate Producer-Share Definition

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E13-07.C1**: Define direct artisan compensation divided by agreed basis, label gross versus net where relevant, handle refunds and do not disclose individual rates publicly.

Current behavior: Share formula handles supplied denominator/refund values, but runtime statement/public share passes refundMillimes0 and lacks integrated cancellation/partial settlement treatment.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G31. Source: apps/api/src/modules/procurement/logistics.ts:1069. Evidence: current-source-review.json.

**E13-07.C4**: Specify refunds, cancellations, partial fulfillment and zero/missing denominator handling.

Current behavior: Share formula handles supplied denominator/refund values, but runtime statement/public share passes refundMillimes0 and lacks integrated cancellation/partial settlement treatment.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G31. Source: apps/api/src/modules/procurement/logistics.ts:1069. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #142 — Order Revenue, Cost and Contribution Dashboard

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-01.C2**: Separate quoted, invoiced, collected revenue and incurred/estimated costs.

Current behavior: Dashboard/export reads supported costs/receipts/liabilities but no issued-invoice subledger total, so invoiced revenue is not distinguished.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G56. Source: apps/api/src/modules/finance/finance.service.ts; apps/web/src/components/financial-analysis.tsx. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #143 — Artisan Compensation Statement and Payment Status

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E10-02.C3**: Link each amount to accepted terms and milestone/evidence.

Current behavior: Statement lineage links immutable obligations but recognition uses hardcoded buyer-accepted milestone instead of accepted earning milestone.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G22. Source: apps/api/src/modules/procurement/logistics.ts:1017. Evidence: current-source-review.json.

**E10-02.C4**: Explain adjustments, due dates, disputes and simulated versus verified status.

Current behavior: Statement omits recorded contractual due-date history from its projection; separate finance metrics do not satisfy the artisan statement.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: CP5-G55. Source: apps/api/src/modules/procurement/logistics.ts:1098. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #158 — Reproducible Repetitive-Motion Simulator

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E12-02.C2**: Provide labeled synthetic active, rest, noisy and disconnected signal presets.

Current behavior: Shipped FixedDevice exposes only fixed active/rest sequence; noisy/disconnected values occur in tests but there are no labeled selectable noisy/disconnected presets or exposed deterministic seed control. Model reset/configure/sample APIs exist.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: AUDIT-SIMULATOR-03. Source: ../iot/simulator/src/fixtures.ts. Evidence: current-source-review.json.

**E12-02.C3**: Expose test clock, threshold and deterministic seed/reset controls.

Current behavior: Shipped FixedDevice exposes only fixed active/rest sequence; noisy/disconnected values occur in tests but there are no labeled selectable noisy/disconnected presets or exposed deterministic seed control. Model reset/configure/sample APIs exist.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: AUDIT-SIMULATOR-03. Source: ../iot/simulator/src/fixtures.ts. Evidence: current-source-review.json.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.

## #190 — Deterministic Isolated Demo Reset

Status: CLOSED / Done. Recommendation: **In Progress; reopen for remediation after owner decision**. Priority: P2.

**E15-04.C1**: Reset clears every related order, payment and safety simulation state.

Current behavior: Showroom reset confirmation explicitly says local safety companion history is separate and is not reset. Both original C1 and C3 require that state to clear. Server reset isolation is otherwise exercised.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: Current independent requirement mismatch. Source: apps/web/src/components/demo-showroom.tsx:183; apps/api/src/modules/demo/demo.service.ts:573. Evidence: logs/demo-native.log.

**E15-04.C3**: Clear session scenario, transient errors, simulated payments and local safety simulation state.

Current behavior: Showroom reset confirmation explicitly says local safety companion history is separate and is not reset. Both original C1 and C3 require that state to clear. Server reset isolation is otherwise exercised.

Reproduction: Current-source confirmation; decisive behavior not freshly reproduced. Related findings: Current independent requirement mismatch. Source: apps/web/src/components/demo-showroom.tsx:183; apps/api/src/modules/demo/demo.service.ts:573. Evidence: logs/demo-native.log.

Before Done: implement the missing behavior and execute the exact original requirement, including its negative/authorization cases. Successful unrelated units do not close this gap.


The three identities missing from the earlier 37-item reconstruction were **#44, #84 and #85**. The historical denominator “40 of 61” could not be substantiated.
