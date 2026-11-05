# Batch 13 acceptance matrix — E18-06 / #209

28 October 2026 · Africa/Tunis. Exactly one story and its five original acceptance criteria, taken
verbatim from the Batch 13 [scope audit](../remediation-batches/batch13-planning/scope-audit.md), which retrieved them from
the live issue. No GitHub state was read or changed during implementation; the discussion-channel ID
is quoted from planning.

**Owner acceptance: PENDING.** Software evidence does not certify legal approval, real participant
feedback, actual commercial satisfaction or production readiness. Qualified privacy review under
E14-09/#74 remains required before any real feedback collection.

| # | Original criterion (verbatim) | Implementation | Tests | Software status |
|---|---|---|---|---|
| C1 | Feedback tied to delivered order and permission-scoped, with dispute status and follow-up owner. | `collaboration/order-feedback.ts` eligibility + scope helpers (`feedbackEligibility`, `buyerFeedbackAuthority`, `supportFeedbackAuthority`, `eligibleFollowUpOwners`); `BuyerOrderFeedback.receiptConfirmationId` FK plus the native `buyer_order_feedback_eligibility` trigger re-check `received > 0` and shipment/order lineage; `followUpOwnerId` FK with owner-required CHECK; linked claim status read live from `SupportTicket` under existing authority | `order-feedback.scenarios.ts` receipt-eligibility, zero-receipt, partial/damaged, foreign-order-receipt, revoked-membership, revoked-assignment and invalid-owner cases; `feedback-migration.scenarios.ts` B13-M03/M04; `unit/collaboration.test.ts` eligibility and case-link rules | VERIFIED_SOFTWARE_CRITERIA |
| C2 | Link feedback to delivered order and authorized buyer participant. | `BuyerOrderFeedback` pins `orderId`, `reporterId` (server actor) and the exact `receiptConfirmationId`; unique `(orderId, reporterId)`; header identity guard makes those fields immutable; creation requires active buyer membership in that order's buyer organization with `buyer.delivery.confirm` and `buyer.rfq.read` | `order-feedback.scenarios.ts` authority, duplicate, forged-reporter, different-tenant and artisan/coordinator denial cases; two-employee privacy case; `unit/collaboration.test.ts` strict-schema rejections | VERIFIED_SOFTWARE_CRITERIA |
| C3 | Record rating/category, comments, date, follow-up owner and status. | `BuyerOrderFeedbackRevision` stores category, nullable integer rating 1–5, plain comment ≤ 2000, server `createdAt`/actor, follow-up status and owner, note, reason; CHECK constraints for category/rating/status/lengths; header `createdAt` immutable and `updatedAt` never used as event time | `unit/collaboration.test.ts` category/rating/comment bounds and follow-up transitions; `order-feedback.scenarios.ts` create/correct/follow-up field assertions; `feedback-migration.scenarios.ts` B13-M04 invalid-rating and unassigned-`FOLLOW_UP` rejections | VERIFIED_SOFTWARE_CRITERIA |
| C4 | Keep claims/disputes distinct from informal feedback and link formal cases. | Feedback never creates, resolves or settles a claim. `feedbackCaseLinkMatches` plus the `buyer_feedback_revision_chain` trigger restrict links to an `ORDER`-related `SupportTicket` for this exact order and operating organization; a `FEEDBACK_LINKED` event is appended and ticket status is untouched; `/support/cases` (`SupportCase`) is never used | `order-feedback.scenarios.ts` cross-order link, outsider link, resolved-follow-up-leaves-claim-open, financial non-interference snapshot; `feedback-migration.scenarios.ts` cross-order link rejection at the database; `unit/collaboration.test.ts` `feedbackCaseLinkMatches` | VERIFIED_SOFTWARE_CRITERIA |
| C5 | Restrict visibility and prevent publication/testimonials without specific permission. | Reads are author-scoped or scoped-support; another employee of the same buyer organization gets 404; buyer history nulls internal notes and hides inaccessible case ids; `feedbackSourceLabel` marks every source as not proving real satisfaction; no public route, publication field, marketing permission or automatic message exists; subject export includes only the reporter's own history with notes withheld; retention entry added without inventing a duration | `order-feedback.scenarios.ts` two-employee/different-tenant/artisan 404s, note-withholding, subject-export minimization, financial non-interference; `demo.scenarios.ts` visitor-generation isolation; `tests/e2e/order-feedback.spec.ts` buyer view hides notes and unauth reads are 401 | VERIFIED_SOFTWARE_CRITERIA |

## Cross-batch safeguards rechecked

| Safeguard | Status | Evidence |
|---|---|---|
| A12-01 unresolved financial adjustments still block closure | PRESERVED | `batch12.scenarios.ts` unchanged and passing in the full suite; no closure or adjustment code was touched |
| A12-02 unfunded or stale finance reviews still block quote acceptance | PRESERVED | `batch12.scenarios.ts` unchanged and passing; `ProcurementService.accept` untouched |
| A12-03 unverified settlement excluded from verified payment metrics | PRESERVED | `finance.scenarios.ts` and `batch12.scenarios.ts` unchanged and passing; no settlement code touched |
| Financial non-interference from feedback operations | VERIFIED | `order-feedback.scenarios.ts` snapshots payables, adjustments, disputes, receipt quantities, acceptances, terms and closure before/after follow-up and case linking |

## Scope discipline

E15-06/#192, E18-04/#207, E18-05/#208 and Batch 14 were not implemented. The three planning documents
in `batch13-planning/` are preserved unmodified. No GitHub issue or board state changed.

## Readiness decision

E18-06 is ready for independent Batch 13 verification of its software evidence. It is **not** ready
for owner acceptance, live collection of real participant feedback, publication of any rating or
testimonial, or a real pilot. Those require the separate qualified privacy and policy decisions named
above.
