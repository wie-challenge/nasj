# Remaining acceptance gates

28 October 2026 · Africa/Tunis.

## External gate — E19-01 criterion 5

Real representative artisans have not completed consenting mobile/print instruction-comprehension sessions.
The instruction software, source/approved translation handling, immutable binding, captions and print path
are implemented. Actual comprehension, misunderstandings and reviewed fixes cannot be inferred from tests.
Use [COMPREHENSION_VALIDATION_PROTOCOL.md](comprehension-validation-protocol.md) and retain versioned consent,
findings and retests. This gate remains BLOCKED_EXTERNAL_EVIDENCE; no participant results were fabricated.

## Owner acceptance

All 33 stories retain `PENDING_OWNER_REVIEW`, independently of their software verification status. The owner
should review the exact original criteria, test evidence, synthetic limitations and the previously closed
sample-approval story #100. Authenticated read-only GitHub retrieval shows 24 closed / 9 open target issues;
those states were not changed in this task and are not acceptance evidence.

## Operational limits

- Real SMTP/inbox delivery is not claimed. The adapter is disabled by default and was exercised only against
  disposable local SMTP and controlled failures. `SENT` means SMTP acceptance; `DELIVERED` is used for the
  actual in-app view. An interrupted `SENDING` or uncertain acknowledgement requires provider review before
  another submission; automatic retry would risk duplicate messages.
- The default cohort floor is conservative engineering configuration. Production policy approval and any
  appropriate governance/legal review remain the owner's responsibility; synthetic fixture review is not a
  real policy acceptance.
- No real payment, physical inventory receipt, time study, quality inspection, forecast accuracy, tax or legal
  agreement was verified. Unknown values remain unavailable, and synthetic examples stay labelled.
- Existing SQL-only inventory/finance FK metadata drift remains documented. Authoritative SQL constraints
  were preserved. Do not apply Prisma's suggested removals.

Native Docker/PostgreSQL and `tsx` are available. There is no remaining infrastructure excuse for treating
unexecuted checks as passed. Final command results and any remaining software failures are recorded in the
acceptance matrix and evidence summary; earlier failed attempts are diagnostic history.
