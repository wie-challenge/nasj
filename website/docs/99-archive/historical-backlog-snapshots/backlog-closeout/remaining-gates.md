# Remaining external gates and hardening register

29 October 2026 · Africa/Tunis. No requirement is waived and no follow-up issue is created. All six
stories retain OWNER_ACCEPTANCE_PENDING. Original acceptance criteria remain in the issue inventory.

## Six outstanding stories

| Story / live workflow | Remaining requirement and completion evidence | Proposed follow-up / accountable role (not a named assignment) |
|---|---|---|
| [#92](https://github.com/wie-challenge/website/issues/92) · E19-01 · OPEN / In Progress | Real consenting participant comprehension sessions, recorded findings, fixes and recheck of the same instruction version (C5). Software accessibility is not participant comprehension. | Run consented comprehension sessions against the exact version/language and printable fallback; retain observations, fixes and recheck. Product/accessibility lead with qualified participant-research/consent review. E14-09 approval applies to personal-data collection. |
| [#206](https://github.com/wie-challenge/website/issues/206) · E18-03 · OPEN / In Progress | Approved actual revenue/cost recognition definitions, complete source evidence, per-order contribution/cash-gap review and named funding-policy ownership. Estimates and synthetic reviews are not recognized contribution. | Finance recognition-definition and source-event reconciliation work package, followed by real per-order review. Finance/accounting owner; do not infer recognition from a quote or funding approval. |
| [#146](https://github.com/wie-challenge/website/issues/146) · E10-11 · OPEN / In Progress | Qualified invoice/tax policy, approved invoice source/classification, and reconciled invoice/receipt/liability/payout subledgers with genuine source evidence. | Qualified invoice/tax policy then bounded invoice-source adapter/reconciliation validation. Finance/accounting + backend roles; approved policy before implementation relying on it. |
| [#148](https://github.com/wie-challenge/website/issues/148) · E10-13 · OPEN / In Progress | Approved bank/provider/manual settlement-verification authority and genuine positive settlement evidence. Keep execution_unverified and verified-payment exclusions until approved. | Define approved settlement-verification authority and obtain genuine source evidence before a verified-positive adapter or positive-state validation. Finance/payment operations + backend roles; never relax execution_unverified just to pass. |
| [#73](https://github.com/wie-challenge/website/issues/73) · E10-14 · CLOSED / Done | Lawful positive financial closure and exceptions remain disabled pending approved settlement, entitlement, material-disposition and invoice policies. CLOSED/Done is a workflow fact, not proof these requirements passed. | Owner scope-disposition review of the existing CLOSED/Done issue, plus qualified lawful-close/exception policy and end-to-end positive closure evidence. Finance/legal + owner; keep liabilities/history and deny unsafe closure. No automatic reopening. |
| [#74](https://github.com/wie-challenge/website/issues/74) · E14-09 · OPEN / In Progress | Qualified per-class privacy/retention review: durations, legal preservation exceptions, deletion/public-copy procedures, named incident/controller responsibilities and reviewed removal tests. Purge remains disabled. | Qualified privacy/legal review with approved durations, exceptions, deletion/public-copy process and named incident ownership, then reviewed removal verification. Privacy/security/operations roles; no destructive purge or compliance claim before approval. |

The six existing stories remain the acceptance anchors. Separate follow-up tasks may be proposed for
policy review, source adapters or field execution, but must link back to the original unsatisfied
criteria; they do not make the parent complete. No new issue/assignee/date is invented here.

## Compact Batch 14 hardening register

| Finding | Current status / exact boundary | Follow-up recommendation and acceptance evidence |
|---|---|---|
| B14-IV-01 — native status/history correspondence | OPEN LOW. Direct SQL can change the header or append a mismatched event; the application transaction remains consistent. | Backend/PostgreSQL hardening: separately review forward event-vocabulary and deferred chain/correspondence constraints, with native counterexamples and rollback/restore evidence. Do not rewrite historical migration 38. |
| B14-IV-03 — shared feedback GET/POST allowance | OPEN LOW. Authorized reads consume the submission bucket; reset cannot clear the per-IP limiter. | Security/API hardening: separately review method-aware limiting or a bounded read policy; test the complete default 8/300 read/write/retry path. Do not weaken abuse limits. |

These two LOW items are disclosed hardening follow-ups, not an open P2. B14-IV-02’s lost-response retry
was fixed and verified at both widths; C5 is now software-verified. B14-IV-04’s journey-count/terminal
wording corrections are complete, and old logs/findings remain historical.

## Approval and scope restrictions

- No real participant comprehension, customer satisfaction, recognized contribution, bank settlement,
  financial close, legal/privacy compliance or hosted recovery target is proved by synthetic tests.
- #209 retains independent software verification, owner acceptance PENDING, #74 privacy review, and
  specific permission before publication/testimonials. The Batch 13 native header/revision defence-in-
  depth residual remains disclosed in its independent report; it is not silently cleared here.
- #192 retains all five software criteria verified after remediation, owner acceptance PENDING,
  #74/privacy and real-collection/publication restrictions. Local remediation evidence still needs
  an approved reviewable reference before its proposed GitHub evidence comment is applied.
- #77’s local encrypted restore/logging controls do not certify hosted/off-site recovery, production
  owners/key custody or actual RTO/RPO. #184’s local SMTP/consent tests do not authorize messaging real
  participants. Other legal, operational and controlled-pilot gates remain applicable.
- #73’s existing CLOSED/Done state is preserved. Decide scope explicitly; do not reopen or reclose it
  automatically, and do not treat CLOSED/Done as lawful financial closure or owner acceptance.
- The 16 complete candidates are ready for owner review of software scope. All 22 owner sign-offs are
  pending. Posting comments, editing original backlogs or changing any workflow requires separate
  explicit owner approval. No deployment, persistent database work or Batch 15 is authorized.
