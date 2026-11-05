# Isolated showroom verification

28 October 2026 · Africa/Tunis.

`DEMO_SEED_VERSION = 3`. No persistent `pnpm demo:setup` was run. The existing test harness creates a
visitor demo on a disposable `nasj_demo` database. All identities, organizations, costs and outcomes are
fictional and labelled synthetic.

The seed provides the initial RFQ/quotation/capacity fixture, a weighted policy and a **draft** product
specification. It does not fabricate catalogue approval, accepted sample work, observed real hours or a
verified payment. Plans and later records arise from real authorized services during the connected journey.

`tests/demo-e2e/batch811.spec.ts` follows one generation through design review, buyer quote acceptance,
weighted two-group planning, paid sample terms, own-artisan sample consent, synthetic observed sample time,
quality evaluation, buyer sign-off, explicit specification binding, per-person offers and artisan acceptance.
It then releases the pinned batch, records voluntary consented synthetic time through the artisan UI,
checks its private earnings/history, reports progress, inspects the approved checklist, creates an exception,
private support and discussion, and opens the intelligence/collaboration views.

The final stage reconciles one accepted commitment / eight pieces, eight inspected pieces, one sample
payable, one plan, one exception, one support case and one discussion. The accountless offer remains pending;
its existence is not artisan consent. The sample payable remains recognized, not paid. Verified paid is zero.

Totals now include plans, specifications, sample requests/payables, exceptions, discussions, support cases
and notification deliveries. Start/reset compares the complete actual totals with the versioned seed totals.
The previous generation's users are disabled and sessions revoked; historical business records remain.
A second visitor cannot read the first visitor's resources, and reset leaves that other generation intact.
The integration suite also interrupts reset deliberately and verifies transaction rollback.

Evidence: [browser-demo-release.log](evidence/browser-demo-release.log), or the separately executed
[browser-demo-final.log](../../../engineering/batch8-11-completion/evidence/browser-demo-final.log); the final combined suite includes the same three
showroom specs. [Integration evidence](../../../engineering/batch8-11-completion/evidence/integration-release.log) supplies native database assertions
for isolation, reset idempotency, stale generations, suspended memberships and accountless acceptance.
