# Batch 14 progress record — E15-06 / #192

28 October 2026 · Africa/Tunis. Owner acceptance remains **PENDING**.

## Status: implementation and verification complete; awaiting owner review

| Phase | State |
|---|---|
| 1. Shared contracts and closed vocabularies | DONE (`packages/contracts/src/demo.ts`) |
| 2. Additive schema + one migration | DONE (`20261028170000_demo_feedback`) |
| 3. Visitor capture API + abuse controls | DONE (demo controller/service, dedicated `feedback` rate bucket) |
| 4. ADMIN moderation API | DONE (`demo-feedback.admin.ts` + controller) |
| 5. Visitor feedback UI | DONE (`demo-feedback-panel.tsx`, showroom wiring) |
| 6. Moderator review UI | DONE (`demo-feedback-admin.tsx`, `/admin/demo-feedback`, nav) |
| 7. Governance inventory | DONE (`DEMO_VISITOR_FEEDBACK`, duration null, review pending) |
| 8. Security/abuse tests | DONE (4 E15-06 demo scenarios incl. rate bucket and concurrency) |
| 9. Browser journeys | DONE (2 journeys, mobile + desktop, axe) |
| 10. Migration/restore + full regression | DONE: 6 migration + 206 integration + 59 browser, all green |

## Verified facts to preserve

- New migration is the 38th. It is additive; historical SQL untouched. It widens
  `DemoCommand_operation_check` forward (the original file is preserved) so the showroom's existing
  idempotency receipt table can carry a `feedback` command and an optional `feedbackId`.
- `DemoFeedbackEvent.actorId` is nullable **by design**: a visitor submission is anonymous. A CHECK
  constraint forces `actorId` for every moderation kind and forbids it for `SUBMITTED`, so history is
  attributable where it must be and never fabricates a user for an anonymous visitor.
- Native guards verified directly against PostgreSQL: content immutability, terminal closed status,
  append-only event history, feedback delete rejection, visitor-scenario ownership, generation
  agreement, and screen/category/status vocabulary.
- Showroom reset preserves feedback because it archives the scenario and the FK is `RESTRICT`.
- All six showroom personas are denied moderation; a persona additionally granted a real `SUPPORT`
  role can reach `/collaboration` but still receives 403 on every moderation route.
- Reset signs the personas out, so tests must re-switch before asserting persona-scoped behaviour.
- Two test-side defects were found and fixed during implementation (a snapshot that omitted the new
  tables, and a browser test that asserted across a generation boundary). Both were test bugs, not
  product bugs.

## Remaining

Nothing in the software scope. Outstanding are the external gates below: owner acceptance and the
E14-09 qualified privacy review before real collection at scale.

## Known follow-ups (external gates, not defects)

- Real participant feedback collection at scale stays disabled pending E14-09 / #74.
- No publication, testimonial or public rating surface exists.
