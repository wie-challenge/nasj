'use client';
import type * as C from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { PublicTraceCode } from './trace-qr';
import { announceLogisticsUpdate } from '@/lib/logistics-events';
import {
  ActionForm,
  Input,
  ResourceState,
  Workspace,
  humanize,
  text,
  useResource,
} from './workspace-ui';

function tunis(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const root = '/api/v1/procurement';
function key() {
  return crypto.randomUUID();
}
async function post<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'POST', body, idempotencyKey: key() });
}
export function LogisticsOrder({ orderId }: { orderId: string }) {
  const resource = useResource<{ items: ShipmentView[] }>(`${root}/orders/${orderId}/shipments`);
  const preparations = useResource<C.ExecutionView>(`${root}/orders/${orderId}/execution`);
  const finance = useResource<FinanceView>(`${root}/orders/${orderId}/financial-summary`);
  const trace = useResource<{
    publication: { id: string; status: string; publicPath: string | null } | null;
  }>(`${root}/orders/${orderId}/traceability`);
  const data = resource.data;
  const ready = preparations.data?.preparations ?? [];
  const firstPiece = ready.find((row) => row.items[0])?.items[0];
  return (
    <section className="section-gap" aria-labelledby="logistics-heading">
      <h2 id="logistics-heading">Logistics and settlement</h2>
      <p>A prepared group is not a shipment. A simulated payment is not a bank transfer.</p>
      <ResourceState {...resource} retry={resource.reload} />
      <ResourceState {...preparations} retry={preparations.reload} />
      <ResourceState {...finance} retry={finance.reload} />
      {finance.data && !finance.data.buyerView && (
        <article>
          <h3>Financial summary</h3>
          <p>
            Agreed revenue {finance.data.agreedRevenueTnd} TND. Collected{' '}
            {finance.data.collectedTnd} TND (
            {humanize(finance.data.collectionStatus ?? 'UNVERIFIED')}).
          </p>
          <p>
            Planned cost {finance.data.plannedCostTnd ?? 'Unknown'} TND. Planned contribution{' '}
            {finance.data.plannedContributionTnd ?? 'Unavailable'} TND. This is not realized profit.
          </p>
          <p>
            Agreed compensation {finance.data.agreedCompensationTnd} TND. Recognized payable{' '}
            {finance.data.recognizedPayableTnd} TND. Verified paid {finance.data.paidVerifiedTnd}{' '}
            TND.
          </p>
          <p>
            Tax: {humanize(finance.data.taxStatus ?? 'PENDING_LEGAL_REVIEW')}. Provenance:
            synthetic.
          </p>
          {(finance.data.warnings ?? []).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {finance.data.canReconcile && (
            <ActionForm
              label="Recognize buyer-accepted payables"
              confirm="Recognize payables for buyer-accepted pieces? This does not send a payment."
              action={() =>
                post(`${root}/orders/${orderId}/payables/reconcile`, {
                  milestone: 'BUYER_ACCEPTED_PIECE',
                })
              }
              onSuccess={finance.reload}
            />
          )}
        </article>
      )}
      {finance.data && !finance.data.buyerView && finance.data.canSimulate && (
        <SettlementPanel orderId={orderId} />
      )}
      {finance.data?.buyerView && (
        <p>
          Agreed order amount {finance.data.agreedRevenueTnd} TND. Collection is unverified. Tax
          treatment is pending legal review.
        </p>
      )}
      {trace.data?.publication?.publicPath && (
        <>
          <p>
            Public traceability link: {trace.data.publication.publicPath}. Synthetic agreed producer
            share is shown only after publication review.
          </p>
          <PublicTraceCode path={trace.data.publication.publicPath} />
        </>
      )}
      {!trace.data?.publication && preparations.data?.revisionId && (
        <ActionForm
          label="Draft public traceability"
          action={(form) =>
            post(`${root}/orders/${orderId}/traceability`, { story: text(form, 'story') })
          }
          onSuccess={trace.reload}
        >
          <Input name="story" label="Approved public craft story" required />
        </ActionForm>
      )}
      {trace.data?.publication?.status === 'DRAFT' && (
        <ActionForm
          label="Submit traceability for review"
          action={() =>
            post(`${root}/traceability/${trace.data?.publication?.id}/submit-review`, {
              reason: 'Synthetic review request',
            })
          }
          onSuccess={trace.reload}
        />
      )}
      {trace.data?.publication?.status === 'PENDING_REVIEW' && (
        <ActionForm
          label="Publish traceability"
          confirm="Publish this synthetic traceability page?"
          action={() =>
            post(`${root}/traceability/${trace.data?.publication?.id}/publish`, {
              reason: 'Synthetic publication',
            })
          }
          onSuccess={trace.reload}
        />
      )}
      {trace.data?.publication?.status === 'PUBLISHED' && (
        <ActionForm
          label="Revoke public traceability"
          confirm="Revoke this public page?"
          action={() =>
            post(`${root}/traceability/${trace.data?.publication?.id}/revoke`, {
              reason: 'Synthetic revocation',
            })
          }
          onSuccess={trace.reload}
        />
      )}
      {data?.items.map((shipment) => (
        <article key={shipment.id} aria-label={`Shipment ${shipment.status}`}>
          <h3>Shipment · {humanize(shipment.status)}</h3>
          <p>
            {shipment.quantity} pieces. Shipped pieces are not buyer-accepted pieces. Carrier
            confirmation: no. Provenance: synthetic.
          </p>
          {shipment.windowStart && shipment.windowEnd && (
            <p>
              Pickup window {tunis(shipment.windowStart)} to {tunis(shipment.windowEnd)}{' '}
              (Africa/Tunis).
            </p>
          )}
          <p>
            Reported delivered {shipment.delivered}. Buyer accepted {shipment.buyerAccepted}.
            Damaged {shipment.damaged}.
          </p>
          <p>
            {shipment.provenanceComplete ? (
              <>
                {shipment.totalUnaccounted} pieces unaccounted for: {shipment.notReportedByOperator}{' '}
                not reported delivered by the operator; {shipment.buyerDeclaredMissing} declared
                missing by the buyer.
              </>
            ) : (
              <>
                Unaccounted-for pieces cannot be attributed: the recorded delivery quantities do not
                reconcile, so the operator gap and the buyer declaration are not separable.
              </>
            )}
          </p>
          {shipment.discrepancy && <p>Open discrepancy: {humanize(shipment.discrepancy)}.</p>}
          {shipment.status === 'PICKUP_SCHEDULED' &&
            shipment.coordinatorId &&
            !shipment.handovers.length && (
              <>
                <ActionForm
                  label="Cancel pickup"
                  confirm="Cancel this pickup? Prepared pieces return to the unallocated balance. This does not change accepted work."
                  action={() =>
                    post(`${root}/shipments/${shipment.id}/cancel`, { version: shipment.version })
                  }
                  onSuccess={resource.reload}
                />
                <ActionForm
                  label="Reschedule pickup"
                  confirm="Keep the earlier window on record and schedule a replacement? This does not collect the pieces."
                  action={(form) =>
                    post(`${root}/shipments/${shipment.id}/pickups`, {
                      version: shipment.version,
                      hub: text(form, 'hub'),
                      windowStart: new Date(text(form, 'windowStart')).toISOString(),
                      windowEnd: new Date(text(form, 'windowEnd')).toISOString(),
                      coordinatorId: text(form, 'coordinatorId'),
                    })
                  }
                  onSuccess={resource.reload}
                >
                  <Input name="hub" label="Replacement hub" required />
                  <Input
                    name="windowStart"
                    label="Replacement window start"
                    type="datetime-local"
                    required
                  />
                  <Input
                    name="windowEnd"
                    label="Replacement window end"
                    type="datetime-local"
                    required
                  />
                  <Input
                    name="coordinatorId"
                    label="Replacement coordinator"
                    value={shipment.coordinatorId}
                    required
                  />
                </ActionForm>
              </>
            )}
          {shipment.status === 'PICKUP_SCHEDULED' &&
            shipment.handovers.some(
              (row) =>
                row.eventType === 'COLLECTED_FROM_ASSOCIATION' &&
                row.confirmationStatus === 'PENDING',
            ) && (
              <ActionForm
                label="Confirm hub receipt"
                confirm="Confirm you received this collection? This does not dispatch it."
                action={() =>
                  post(`${root}/shipments/${shipment.id}/handovers`, {
                    version: shipment.version,
                    eventType: 'RECEIVED_AT_HUB',
                    quantity: shipment.quantity,
                    occurredAt: new Date().toISOString(),
                    priorHandoverId: shipment.handovers.find(
                      (row) => row.eventType === 'COLLECTED_FROM_ASSOCIATION',
                    )?.id,
                  })
                }
                onSuccess={resource.reload}
              />
            )}
          {shipment.status === 'COLLECTED' && (
            <ActionForm
              label="Record synthetic dispatch"
              confirm="Mark these pieces in transit? This is not a carrier confirmation."
              action={() =>
                post(`${root}/shipments/${shipment.id}/handovers`, {
                  version: shipment.version,
                  eventType: 'HANDED_TO_TRANSPORT',
                  quantity: shipment.quantity,
                  occurredAt: new Date().toISOString(),
                  note: 'Synthetic transport',
                })
              }
              onSuccess={resource.reload}
            />
          )}
          {shipment.status === 'IN_TRANSIT' && (
            <ActionForm
              label="Report delivery"
              confirm="Report this delivery? The buyer still confirms receipt."
              action={(form) =>
                post(`${root}/shipments/${shipment.id}/delivery-reports`, {
                  version: shipment.version,
                  quantity: Number(text(form, 'quantity')),
                  occurredAt: new Date().toISOString(),
                })
              }
              onSuccess={resource.reload}
            >
              <Input
                name="quantity"
                label="Pieces reported delivered"
                type="number"
                min="1"
                max={String(shipment.quantity)}
                required
              />
            </ActionForm>
          )}
          {shipment.status === 'DELIVERY_REPORTED' && (
            <ActionForm
              label="Confirm buyer receipt"
              confirm="Record the pieces you accept? This does not record a payment."
              action={(form) =>
                post(`${root}/shipments/${shipment.id}/buyer-confirmations`, {
                  version: shipment.version,
                  received: Number(text(form, 'received')),
                  accepted: Number(text(form, 'accepted')),
                  missing: Number(text(form, 'missing')),
                  damaged: Number(text(form, 'damaged') || '0'),
                  occurredAt: new Date().toISOString(),
                })
              }
              onSuccess={async () => {
                await resource.reload();
                announceLogisticsUpdate();
              }}
            >
              <Input name="received" label="Pieces received" type="number" min="0" required />
              <Input name="accepted" label="Pieces accepted" type="number" min="0" required />
              <Input name="missing" label="Pieces missing" type="number" min="0" required />
              <Input name="damaged" label="Pieces damaged" type="number" min="0" value="0" />
            </ActionForm>
          )}
        </article>
      ))}
      {firstPiece && (
        <ActionForm
          label="Schedule pickup"
          confirm="Schedule collection of prepared pieces? This does not ship them."
          action={(form) =>
            post(`${root}/orders/${orderId}/shipments`, {
              items: [
                { preparationItemId: firstPiece.id, quantity: Number(text(form, 'quantity')) },
              ],
              hub: text(form, 'hub'),
              windowStart: new Date(text(form, 'windowStart')).toISOString(),
              windowEnd: new Date(text(form, 'windowEnd')).toISOString(),
              coordinatorId: text(form, 'coordinatorId'),
            })
          }
          onSuccess={resource.reload}
        >
          <Input name="hub" label="Collection hub" required />
          <Input name="windowStart" label="Pickup window start" type="datetime-local" required />
          <Input name="windowEnd" label="Pickup window end" type="datetime-local" required />
          <Input name="coordinatorId" label="Coordinator reference" required />
          <Input
            name="quantity"
            label="Prepared pieces to collect"
            type="number"
            min="1"
            required
          />
        </ActionForm>
      )}
      {!data?.items.length && (
        <p>No shipment is scheduled. Prepared pieces stay prepared until a shipment is created.</p>
      )}
    </section>
  );
}
type ShipmentView = {
  id: string;
  status: string;
  version: number;
  quantity: number;
  delivered: number;
  buyerReceived: number;
  buyerAccepted: number;
  /** The buyer's own declaration. Distinct from the operator's reporting gap. */
  buyerDeclaredMissing: number;
  /** Pieces shipped but never reported delivered by the operator. */
  notReportedByOperator: number;
  /** The two above, summed. */
  totalUnaccounted: number;
  /** False when the recorded facts do not conserve and provenance cannot be reconstructed. */
  provenanceComplete: boolean;
  missing: number;
  damaged: number;
  coordinatorId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  discrepancy: string | null;
  handovers: { id: string; eventType: string; confirmationStatus: string }[];
};
function SettlementPanel({ orderId }: { orderId: string }) {
  const payables = useResource<{
    items: { id: string; amountTnd: string; quantity: number; status: string }[];
  }>(`${root}/orders/${orderId}/payables`);
  const simulations = useResource<{
    items: {
      id: string;
      payableId: string | null;
      status: string;
      amountTnd: string;
      side: string;
      bankVerified: boolean;
      label: string;
    }[];
  }>(`${root}/orders/${orderId}/payment-simulations`);
  const reload = () => Promise.all([payables.reload(), simulations.reload()]);
  const dueAt = () => new Date(Date.now() + 86_400_000).toISOString();
  const uncovered = payables.data?.items.find(
    (row) =>
      !simulations.data?.items.some(
        (item) => item.payableId === row.id && item.status !== 'SIMULATED_FAILED',
      ),
  );
  return (
    <article>
      <h3>Simulated settlement</h3>
      <p>A simulated settlement is not a bank transfer and does not verify a payment.</p>
      <ResourceState {...payables} retry={payables.reload} />
      <ResourceState {...simulations} retry={simulations.reload} />
      {!payables.loading && !payables.error && !payables.data?.items.length && (
        <p>No buyer-accepted payable is recognized. Quality approval does not create a payable.</p>
      )}
      {payables.data?.items.map((row) => (
        <p key={row.id}>
          Payable {row.quantity} pieces · {row.amountTnd} TND · {humanize(row.status)}. Bank
          verification: no.
        </p>
      ))}
      {simulations.data?.items.map((item) => (
        <div key={item.id}>
          <p>
            {humanize(item.side)} simulation · {item.amountTnd} TND · {humanize(item.status)}.{' '}
            {item.label} Bank verification: {item.bankVerified ? 'yes' : 'no'}.
          </p>
          {item.status === 'SCHEDULED' && (
            <ActionForm
              label="Record simulated initiation"
              confirm="Mark this simulation as initiated? This is not a bank transfer."
              action={() =>
                post(`${root}/payment-simulations/${item.id}/advance`, {
                  next: 'SIMULATED_INITIATED',
                })
              }
              onSuccess={reload}
            />
          )}
          {item.status === 'SIMULATED_INITIATED' && (
            <ActionForm
              label="Record simulated settlement"
              confirm="Mark this simulation as settled? This is not a verified payment."
              action={() =>
                post(`${root}/payment-simulations/${item.id}/advance`, {
                  next: 'SIMULATED_SETTLED',
                })
              }
              onSuccess={reload}
            />
          )}
          {item.status === 'SIMULATED_FAILED' && item.payableId && (
            <ActionForm
              label="Retry simulated settlement"
              confirm="Schedule another synthetic attempt? This is not a bank transfer."
              action={() =>
                post(`${root}/orders/${orderId}/payment-simulations`, {
                  side: 'ARTISAN',
                  payableId: item.payableId,
                  dueAt: dueAt(),
                  retryOf: item.id,
                })
              }
              onSuccess={reload}
            />
          )}
        </div>
      ))}
      {uncovered && (
        <ActionForm
          label="Schedule simulated artisan settlement"
          confirm="Schedule a synthetic settlement for this payable? This does not send money."
          action={() =>
            post(`${root}/orders/${orderId}/payment-simulations`, {
              side: 'ARTISAN',
              payableId: uncovered.id,
              dueAt: dueAt(),
            })
          }
          onSuccess={reload}
        />
      )}
    </article>
  );
}
type FinanceView = {
  buyerView?: boolean;
  canReconcile?: boolean;
  canSimulate?: boolean;
  agreedRevenueTnd: string;
  collectedTnd?: string;
  collectionStatus?: string;
  plannedCostTnd?: string | null;
  plannedContributionTnd?: string | null;
  agreedCompensationTnd?: string;
  recognizedPayableTnd?: string;
  paidVerifiedTnd?: string;
  taxStatus?: string;
  warnings?: string[];
};

export function CoordinatorPickups() {
  const resource = useResource<{
    items: {
      shipmentId: string;
      status: string;
      version: number;
      hub: string;
      quantity: number;
      windowStart: string;
      windowEnd: string;
    }[];
  }>(`${root}/pickups`);
  return (
    <Workspace
      title="Assigned pickups"
      description="Record collection for your association. Recording collection does not confirm hub receipt or buyer delivery."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && !resource.data?.items.length && (
        <p>No pickup is scheduled for your association.</p>
      )}
      {resource.data?.items.map((item) => (
        <article key={item.shipmentId}>
          <h2>
            {item.quantity} pieces · {humanize(item.status)}
          </h2>
          <p>
            Hub {item.hub}. Window {tunis(item.windowStart)} to {tunis(item.windowEnd)}{' '}
            (Africa/Tunis). Provenance: synthetic.
          </p>
          {item.status === 'PICKUP_SCHEDULED' && (
            <ActionForm
              label="Record collection"
              confirm="Record that your association handed these pieces over? The operator still confirms receipt."
              action={() =>
                post(`${root}/shipments/${item.shipmentId}/handovers`, {
                  version: item.version,
                  eventType: 'COLLECTED_FROM_ASSOCIATION',
                  quantity: item.quantity,
                  occurredAt: new Date().toISOString(),
                  note: 'Synthetic collection',
                })
              }
              onSuccess={resource.reload}
            />
          )}
        </article>
      ))}
    </Workspace>
  );
}
export function ArtisanCompensation() {
  const resource = useResource<{
    items: {
      accountAccess: string;
      lines: {
        agreedTnd: string;
        earnedTnd: string;
        payableTnd: string;
        paidVerifiedTnd: string;
        simulationStatus: string;
      }[];
    }[];
  }>(`${root}/my-compensation`);
  const statement = resource.data?.items[0];
  return (
    <Workspace
      title="Your compensation"
      description="Agreed, earned and verified-paid amounts stay separate. A simulated payment is not a bank transfer."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && !statement?.lines.length && (
        <p>No accepted compensation is on file.</p>
      )}
      {statement?.lines.map((line) => (
        <article key={line.agreedTnd + line.earnedTnd}>
          <p>
            Agreed {line.agreedTnd} TND. Earned {line.earnedTnd} TND. Payable {line.payableTnd} TND.
            Verified paid {line.paidVerifiedTnd} TND.
          </p>
          <p>Simulation: {humanize(line.simulationStatus)}. Bank verification: no.</p>
        </article>
      ))}
    </Workspace>
  );
}
