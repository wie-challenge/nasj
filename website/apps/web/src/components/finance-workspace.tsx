'use client';
import { FinancialAnalysis, RfqFinanceReview } from './financial-analysis';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  ActionForm,
  Input,
  ResourceState,
  Select,
  Workspace,
  humanize,
  text,
  useResource,
} from './workspace-ui';

const root = '/api/v1/finance';
const post = (path: string, body: unknown) =>
  apiFetch(path, { method: 'POST', body, idempotencyKey: crypto.randomUUID() });
type Deposit = {
  id: string;
  amountTnd: string;
  paymentReference: string;
  status: string;
  evidence: string;
  provenance: string;
};
type Payable = { id: string; amountTnd: string; status: string; batchId?: string };
type Payout = {
  id: string;
  payableId: string;
  amountTnd: string;
  status: string;
  requestedBy?: string;
  requesterId?: string;
  executions?: {
    id: string;
    amountTnd: string;
    status: string;
    reference: string;
    evidence: string;
  }[];
};
type Dispute = {
  responseDueAt?: string;
  escalation?: string;
  id: string;
  amountTnd: string;
  reason: string;
  description: string;
  status: string;
  history?: { id: string; status: string; reason: string }[];
};
type Adjustment = { id: string; amountTnd: string; kind: string; reason: string; status: string };
type Closure = {
  status: string;
  blockers: (string | { code: string; message: string })[];
  history?: {
    id: string;
    actorId: string;
    status: string;
    createdAt: string;
    snapshot: unknown;
  }[];
};
type FinanceView = {
  orderVersion: number;
  orderId: string;
  delivered: number;
  expectedTnd: string;
  deposits: Deposit[];
  payables: Payable[];
  payouts: Payout[];
  disputes: Dispute[];
  adjustments: Adjustment[];
  closure: Closure;
  permissions?: string[];
  actions?: Record<string, boolean>;
};
const has = (data: FinanceView | null, permission: string) =>
  Boolean(data?.permissions?.includes(permission) || data?.actions?.[permission]);
function Blockers({ closure }: { closure: Closure }) {
  return (
    <>
      <p>
        Financial closure: <strong>{humanize(closure.status)}</strong>
      </p>
      {closure.blockers.map((blocker, index) => (
        <p key={typeof blocker === 'string' ? blocker : `${blocker.code}-${index}`}>
          {typeof blocker === 'string' ? humanize(blocker) : blocker.message}
        </p>
      ))}
    </>
  );
}
export function FinanceWorkspace() {
  const [orderId, setOrderId] = useState('');
  return (
    <Workspace
      title="Finance and order closure"
      description="Review deposits, payable obligations, independent approvals and closure blockers. Bank verification and live transfers remain unavailable."
    >
      <ActionForm
        label="Open order finances"
        action={async (form) => {
          setOrderId(text(form, 'orderId'));
        }}
        successMessage="Order selected."
      >
        <Input name="orderId" label="Commercial order reference" required />
      </ActionForm>
      <RfqFinanceReview />
      {orderId ? (
        <OrderFinance key={orderId} orderId={orderId} />
      ) : (
        <p>
          Select a commercial order. You can also open financial controls from an accepted
          procurement request.
        </p>
      )}
    </Workspace>
  );
}
export function OrderFinance({ orderId }: { orderId: string }) {
  const resource = useResource<FinanceView>(`${root}/orders/${orderId}`);
  const data = resource.data;
  const allowed = (permission: string) => has(data, permission);
  return (
    <section
      aria-labelledby={`finance-${orderId}`}
      className="section-gap financial-order-workspace"
    >
      <h2 id={`finance-${orderId}`}>Financial controls and closure</h2>
      <ResourceState {...resource} retry={resource.reload} />
      <p>
        Reported evidence remains pending independent verification. No action here initiates a bank
        transfer or removes an artisan claim.
      </p>
      {data && (
        <>
          <p>
            Buyer-accepted delivery: {data.delivered ?? 'Awaiting reconciliation'} pieces. Expected
            buyer amount: {data.expectedTnd} TND.
          </p>
          <h3>Buyer deposits</h3>
          {!data.deposits.length && <p>No buyer deposits reported.</p>}
          {data.deposits.map((deposit) => (
            <article key={deposit.id}>
              <p>
                {deposit.amountTnd} TND · {deposit.paymentReference} · {humanize(deposit.status)}.
              </p>
              <p>
                Source {humanize(deposit.provenance)}. Evidence {deposit.evidence}. Bank
                verification: unavailable.
              </p>
              {allowed('finance.deposit.review') && (
                <ActionForm
                  label="Review deposit evidence"
                  onSuccess={resource.reload}
                  action={(form) =>
                    post(`${root}/deposits/${deposit.id}/review`, {
                      decision: text(form, 'decision'),
                      reason: text(form, 'reason'),
                    })
                  }
                >
                  <Select
                    name="decision"
                    label="Deposit review decision"
                    options={['PENDING_VERIFICATION', 'REJECTED', 'DISPUTED']}
                  />
                  <Input name="reason" label="Deposit review reason" required />
                </ActionForm>
              )}
            </article>
          ))}
          {allowed('finance.deposit.record') && (
            <ActionForm
              label="Record pending buyer deposit"
              onSuccess={resource.reload}
              action={(form) =>
                post(`${root}/orders/${orderId}/deposits`, {
                  amountTnd: text(form, 'amountTnd'),
                  paymentReference: text(form, 'paymentReference'),
                  paymentDate: new Date(text(form, 'paymentDate')).toISOString(),
                  evidence: text(form, 'evidence'),
                  provenance: text(form, 'provenance'),
                })
              }
            >
              <Input name="amountTnd" label="Claimed deposit amount (TND)" required />
              <Input name="paymentReference" label="Buyer payment reference" required />
              <Input
                name="paymentDate"
                label="Reported payment date"
                type="datetime-local"
                required
              />
              <Input name="evidence" label="Buyer deposit evidence reference" required />
              <Select
                name="provenance"
                label="Deposit provenance"
                options={['PENDING_VERIFICATION', 'SYNTHETIC']}
              />
            </ActionForm>
          )}
          <h3>Recognized artisan obligations</h3>
          {!data.payables.length && (
            <p>No recognized payables. This does not waive accepted compensation.</p>
          )}
          {data.payables.map((payable) => (
            <article key={payable.id}>
              <p>
                Payable {payable.id} · {payable.amountTnd} TND · {humanize(payable.status)}.
              </p>
              {allowed('finance.payout.request') && (
                <ActionForm
                  label="Request payout approval"
                  onSuccess={resource.reload}
                  action={(form) =>
                    post(`${root}/orders/${orderId}/payouts`, {
                      payableId: payable.id,
                      amountTnd: text(form, 'amountTnd'),
                      reason: text(form, 'reason'),
                    })
                  }
                >
                  <Input name="amountTnd" label="Requested payout amount (TND)" required />
                  <Input name="reason" label="Payout request reason" required />
                </ActionForm>
              )}
            </article>
          ))}
          <h3>Payout approval and execution</h3>
          {!data.payouts.length && <p>No payout requests.</p>}
          {data.payouts.map((payout) => (
            <article key={payout.id}>
              <p>
                {payout.amountTnd} TND · {humanize(payout.status)} · payable {payout.payableId}.
              </p>
              {payout.status === 'REQUESTED' && allowed('finance.payout.approve') && (
                <ActionForm
                  label="Independently approve payout"
                  onSuccess={resource.reload}
                  action={(form) =>
                    post(`${root}/payouts/${payout.id}/approve`, { reason: text(form, 'reason') })
                  }
                >
                  <p>
                    Approval requires a different authorized person from the requester. The service
                    checks current permission, payable balance and approval policy.
                  </p>
                  <Input name="reason" label="Independent approval reason" required />
                </ActionForm>
              )}
              {['APPROVED', 'EXECUTION_PENDING', 'VERIFICATION_PENDING'].includes(payout.status) &&
                allowed('finance.payout.execute') && (
                  <ActionForm
                    label="Record payout execution report"
                    onSuccess={resource.reload}
                    action={(form) =>
                      post(`${root}/payouts/${payout.id}/executions`, {
                        amountTnd: text(form, 'amountTnd'),
                        reference: text(form, 'reference'),
                        evidence: text(form, 'evidence'),
                        occurredAt: new Date(text(form, 'occurredAt')).toISOString(),
                        outcome: text(form, 'outcome'),
                      })
                    }
                  >
                    <Input name="amountTnd" label="Reported execution amount (TND)" required />
                    <Input name="reference" label="Operator-reported payment reference" required />
                    <Input name="evidence" label="Execution evidence reference" required />
                    <Input
                      name="occurredAt"
                      label="Reported execution date"
                      type="datetime-local"
                      required
                    />
                    <Select
                      name="outcome"
                      label="Execution report outcome"
                      options={['REPORTED', 'FAILED']}
                    />
                    <p>This records an external claim. It cannot create a verified payment.</p>
                  </ActionForm>
                )}
              {payout.executions?.map((execution) => (
                <p key={execution.id}>
                  Execution {execution.amountTnd} TND · {humanize(execution.status)} ·{' '}
                  {execution.reference}. Source: operator report. Evidence: {execution.evidence}.
                </p>
              ))}
            </article>
          ))}
          <h3>Payment disputes</h3>
          {!data.disputes.length && <p>No recorded payment disputes.</p>}
          {data.disputes.map((dispute) => (
            <DisputeCard
              key={dispute.id}
              dispute={dispute}
              manage={allowed('finance.dispute.manage')}
              reload={resource.reload}
            />
          ))}
          <h3>Cancellation and partial fulfillment adjustments</h3>
          <p>
            Proposals preserve original compensation and historical obligations. Unclear entitlement
            remains under review.
          </p>
          {allowed('finance.adjustment.propose') && (
            <ActionForm
              label="Propose financial adjustment"
              onSuccess={resource.reload}
              action={(form) =>
                post(`${root}/orders/${orderId}/adjustments`, {
                  amountTnd: text(form, 'amountTnd'),
                  kind: text(form, 'kind'),
                  reason: text(form, 'reason'),
                })
              }
            >
              <Input name="amountTnd" label="Proposed adjustment amount (TND)" required />
              <Select
                name="kind"
                label="Adjustment kind"
                options={['CANCELLATION', 'PARTIAL_FULFILLMENT', 'REFUND']}
              />
              <Input name="reason" label="Contractual basis and adjustment reason" required />
            </ActionForm>
          )}
          {data.adjustments.map((adjustment) => (
            <article key={adjustment.id}>
              <p>
                {humanize(adjustment.kind)} · {adjustment.amountTnd} TND ·{' '}
                {humanize(adjustment.status)}. {adjustment.reason}
              </p>
              {allowed('finance.adjustment.approve') && adjustment.status === 'PENDING_REVIEW' && (
                <ActionForm
                  label="Independently review adjustment"
                  onSuccess={resource.reload}
                  action={(form) =>
                    post(`${root}/adjustments/${adjustment.id}/approve`, {
                      reason: text(form, 'reason'),
                    })
                  }
                >
                  <Input name="reason" label="Adjustment review reason" required />
                </ActionForm>
              )}
            </article>
          ))}
          <h3>Order closure assessment</h3>
          {(allowed('finance.payout.read') || allowed('operator.accounts.read')) && (
            <FinancialAnalysis
              orderId={orderId}
              canRecord={allowed('finance.payable.reconcile')}
              canExport={allowed('finance.accounting.export')}
            />
          )}
          <Blockers closure={data.closure} />
          <p>
            Stored assessments preserve the evidence available at review time. Synthetic readiness
            does not verify payment or authorize financial closure.
          </p>
          {data.closure.history?.map((assessment) => (
            <details key={assessment.id}>
              <summary>
                {humanize(assessment.status)} — {new Date(assessment.createdAt).toLocaleString()}
              </summary>
              <p>Recorded by {assessment.actorId}</p>
              <pre className="assessment-snapshot">
                {JSON.stringify(assessment.snapshot, null, 2)}
              </pre>
            </details>
          ))}
          {allowed('finance.closure.assess') && (
            <ActionForm
              label="Save closure assessment"
              onSuccess={resource.reload}
              action={() => post(`${root}/orders/${orderId}/closure`, {})}
            />
          )}
          {allowed('finance.closure.assess') && (
            <ActionForm
              label="Request financial closure"
              onSuccess={resource.reload}
              action={async (f) => {
                const result = (await post(`${root}/orders/${orderId}/close`, {
                  version: data.orderVersion,
                  reason: text(f, 'reason'),
                  ...(text(f, 'exceptionReference')
                    ? { exceptionReference: text(f, 'exceptionReference') }
                    : {}),
                })) as { status: string; blockers: string[] };
                if (result.status === 'DENIED')
                  throw new Error(`Closure denied: ${result.blockers.join(', ')}`);
              }}
            >
              <Input name="reason" label="Closure decision reason" required />
              <Input
                name="exceptionReference"
                label="Exception evidence reference (no waiver policy enabled)"
              />
            </ActionForm>
          )}
          {allowed('finance.closure.assess') && (
            <ActionForm
              label="Record closure assessment"
              onSuccess={resource.reload}
              action={() => post(`${root}/orders/${orderId}/closure`, {})}
              successMessage="Closure assessment recorded. Review every blocker before further action."
            />
          )}
        </>
      )}
    </section>
  );
}
function DisputeCard({
  dispute,
  manage = false,
  claimant = false,
  reload,
}: {
  dispute: Dispute;
  manage?: boolean;
  claimant?: boolean;
  reload: () => unknown;
}) {
  return (
    <article>
      <p>
        Dispute {dispute.amountTnd} TND · {humanize(dispute.status)}. {dispute.reason}
      </p>
      <p>{dispute.description}</p>
      {dispute.responseDueAt && (
        <p>
          Response target:{' '}
          {new Date(dispute.responseDueAt).toLocaleString('en-GB', { timeZone: 'Africa/Tunis' })}{' '}
          (Tunis). Escalation: {humanize(dispute.escalation ?? 'FINANCE_REVIEW_QUEUE')}.{' '}
          <Link href="/participant-support">Contact independent participant support</Link>.
        </p>
      )}
      {dispute.history?.map((event) => (
        <p key={event.id}>
          {humanize(event.status)}: {event.reason}
        </p>
      ))}
      {(manage || (claimant && ['PROPOSED_RESOLUTION', 'RESOLVED'].includes(dispute.status))) && (
        <ActionForm
          label="Review payment dispute"
          onSuccess={reload}
          action={(form) =>
            post(`${root}/disputes/${dispute.id}/review`, {
              status: text(form, 'status'),
              reason: text(form, 'reason'),
            })
          }
        >
          <Select
            name="status"
            label="Dispute next status"
            options={
              claimant
                ? dispute.status === 'RESOLVED'
                  ? ['CLOSED']
                  : ['RESOLVED']
                : ['UNDER_REVIEW', 'AWAITING_EVIDENCE', 'PROPOSED_RESOLUTION']
            }
          />
          <Input name="reason" label="Evidence and resolution reason" required />
          <p>
            A simulation never settles this claim. Review decisions remain in the audit history.
          </p>
        </ActionForm>
      )}
    </article>
  );
}
type StatementLine = {
  orderId: string;
  batchId: string;
  agreedTnd: string;
  earnedTnd: string;
  paidVerifiedTnd: string;
  payables: Payable[];
  disputes: Dispute[];
  payouts?: Payout[];
};
export function ArtisanFinancialStatement() {
  const resource = useResource<{ items: StatementLine[] }>(`${root}/my-statement`);
  return (
    <section className="section-gap" aria-label="Payment history and disputes">
      <h2>Payment history and disputes</h2>
      <ResourceState {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && !resource.data?.items.length && (
        <p>No financial statement lines are available.</p>
      )}
      {resource.data?.items.map((line) => (
        <article key={line.batchId}>
          <h3>Batch {line.batchId}</h3>
          {line.payables.map((payable) => (
            <p key={payable.id}>
              Payable {payable.amountTnd} TND · {humanize(payable.status)}.
            </p>
          ))}
          {line.payouts?.map((payout) => (
            <div key={payout.id}>
              <p>
                Payout request {payout.amountTnd} TND · {humanize(payout.status)}.
              </p>
              {payout.executions?.map((execution) => (
                <p key={execution.id}>
                  Payment report {execution.amountTnd} TND · {humanize(execution.status)} ·{' '}
                  {execution.reference}. Independent verification: unavailable.
                </p>
              ))}
            </div>
          ))}
          {line.disputes.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} claimant reload={resource.reload} />
          ))}
          <ActionForm
            label="Raise a payment dispute"
            onSuccess={resource.reload}
            action={(form) =>
              post(`${root}/orders/${line.orderId}/disputes`, {
                batchId: line.batchId,
                amountTnd: text(form, 'amountTnd'),
                reason: text(form, 'reason'),
                description: text(form, 'description'),
                evidence: text(form, 'evidence'),
              })
            }
          >
            <Input name="amountTnd" label="Disputed amount (TND)" required />
            <Input name="reason" label="Payment concern" required />
            <Input name="description" label="Describe the payment concern" required />
            <Input name="evidence" label="Supporting evidence reference" required />
          </ActionForm>
        </article>
      ))}
      <p>
        For accessible assistance, use{' '}
        <Link href="/participant-support">independent participant support</Link>. A coordinator
        cannot waive your compensation claim.
      </p>
    </section>
  );
}
