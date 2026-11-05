'use client';
import { Ban, Download, QrCode } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type {
  IdentityContext,
  MarketAssociationOption,
  MarketOrderView,
  MarketWomanView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { Button } from '../ui/button';
import { Input, ResourceState, Select, Workspace, text, useResource } from '../workspace-ui';
import {
  DeliveryCard,
  DeliveryFields,
  FileField,
  JourneyTracker,
  ModalAction,
  ProductImage,
  StatusBadge,
  chosenFile,
  deliveryInput,
  journeyFor,
  money,
  nextStepFor,
  proofPayload,
  type OrderAudience,
} from './market-ui';
import styles from './market.module.css';

const openStatuses = ['SENT', 'AWAITING_APPROVAL', 'WORKING', 'AT_NASJ', 'ON_THE_WAY'];
const starOptions = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`,
}));

function audienceFor(context: IdentityContext | null | undefined): OrderAudience {
  const personas = context?.personas ?? [];
  if (
    personas.some((persona) =>
      ['PLATFORM_ADMIN', 'NASJ_COORDINATOR', 'NASJ_FINANCE'].includes(persona),
    )
  )
    return 'nasj';
  if (personas.includes('ASSOCIATION_COORDINATOR')) return 'association';
  return 'company';
}

function OrderRow({ order, audience }: { order: MarketOrderView; audience: OrderAudience }) {
  const image = order.photoUrl ?? order.items[0]?.imageUrl ?? '/marketplace/default.jpg';
  return (
    <Link className={styles.row} href={`/orders/${order.id}`}>
      <ProductImage src={image} alt="" />
      <div>
        <h2>{order.title}</h2>
        <p className={styles.muted}>
          {order.code}
          {audience === 'company' ? '' : ` · ${order.buyerName}`}
          {audience === 'nasj' && order.associationName ? ` → ${order.associationName}` : ''}
        </p>
        <p className={styles.muted}>{nextStepFor(order, audience)}</p>
      </div>
      <div className={styles.rowEnd}>
        <StatusBadge order={order} audience={audience} />
        <strong>{money(order.totals?.total)}</strong>
      </div>
    </Link>
  );
}

export function OrderList({ title, description }: { title: string; description: string }) {
  const orders = useResource<MarketOrderView[]>('/api/v1/market/orders');
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const audience = audienceFor(context.data);
  const visible = orders.data?.filter((order) =>
    tab === 'open' ? openStatuses.includes(order.status) : !openStatuses.includes(order.status),
  );
  return (
    <Workspace title={title} description={description}>
      <div className={`${styles.chips} ${styles.tabs}`}>
        <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
          In progress
        </button>
        <button type="button" aria-pressed={tab === 'done'} onClick={() => setTab('done')}>
          Finished
        </button>
      </div>
      <ResourceState {...orders} retry={orders.reload} />
      {visible?.length === 0 && (
        <div className={styles.empty}>
          <p>Nothing here right now.</p>
        </div>
      )}
      <div className={styles.stack}>
        {context.data &&
          visible?.map((order) => <OrderRow key={order.id} order={order} audience={audience} />)}
      </div>
    </Workspace>
  );
}

function post(id: string, action: string, body: unknown = {}) {
  return apiFetch(`/api/v1/market/orders/${id}/${action}`, { method: 'POST', body });
}
type ActionProps = { order: MarketOrderView; reload: () => unknown };

function NextStep({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${styles.nextStep}`}>
      <h2>{title}</h2>
      {hint && <p className={styles.muted}>{hint}</p>}
      <div className={styles.actions}>{children}</div>
    </section>
  );
}

function CompanySteps({ order, reload }: ActionProps) {
  if (order.priceStatus === 'COMPANY_REVIEW')
    return (
      <NextStep
        title="Your price is ready"
        hint={`Total ${money(order.totals?.total)}, including TVA and stamp duty.`}
      >
        <ModalAction
          label="Accept price"
          title="Accept this price?"
          description={`Work starts once you accept ${money(order.totals?.total)}.`}
          submitLabel="Accept price"
          successMessage="Price accepted."
          onSuccess={reload}
          action={() => post(order.id, 'company-price', { decision: 'ACCEPT', note: '' })}
        />
        <ModalAction
          label="Ask for a new price"
          variant="outline"
          title="Ask for a new price"
          submitLabel="Send"
          successMessage="We asked for a new price."
          onSuccess={reload}
          action={(data) =>
            post(order.id, 'company-price', { decision: 'REFUSE', note: text(data, 'note') })
          }
        >
          <Input name="note" label="What would work for you? (optional)" />
        </ModalAction>
      </NextStep>
    );
  if (order.status === 'ON_THE_WAY')
    return (
      <NextStep title="Did it arrive?">
        <ModalAction
          label="Confirm delivery"
          title="Confirm delivery"
          description="Confirm that your order arrived."
          submitLabel="Yes, it arrived"
          successMessage="Delivery confirmed. Thank you."
          onSuccess={reload}
          action={() => post(order.id, 'confirm', { note: '' })}
        />
      </NextStep>
    );
  return null;
}

function CancelButton({ order, reload }: ActionProps) {
  const cancellable = ['SENT', 'AWAITING_APPROVAL'].includes(order.status);
  if (order.status === 'CANCELLED' || order.status === 'DELIVERED') return null;
  return (
    <ModalAction
      label={
        <>
          <Ban size={16} aria-hidden="true" />
          Cancel order
        </>
      }
      variant="destructive"
      disabled={!cancellable}
      title="Cancel this order?"
      description="This can't be undone."
      submitLabel="Cancel the order"
      successMessage="Your order was cancelled."
      onSuccess={reload}
      action={(data) => post(order.id, 'cancel', { reason: text(data, 'reason') })}
    >
      <Input name="reason" label="Why are you cancelling?" required />
    </ModalAction>
  );
}

function CoordinatorSteps({ order, reload }: ActionProps) {
  const associations = useResource<MarketAssociationOption[]>('/api/v1/market/associations');
  if (order.status === 'SENT')
    return (
      <NextStep title="Send it to an association">
        {associations.data && (
          <ModalAction
            label="Choose an association"
            title="Send to an association"
            submitLabel="Send request"
            successMessage="Request sent to the association."
            onSuccess={reload}
            action={(data) =>
              post(order.id, 'route', {
                associationId: text(data, 'associationId'),
                note: text(data, 'note'),
              })
            }
          >
            <Select
              name="associationId"
              label="Association"
              value={order.associationId ?? undefined}
              options={associations.data.map((item) => ({
                value: item.id,
                label: [
                  item.name,
                  item.region,
                  item.crafts.join(', '),
                  item.rating ? `★ ${item.rating}` : '',
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
            <Input name="note" label="Note for the association (optional)" />
          </ModalAction>
        )}
      </NextStep>
    );
  if (order.status === 'WORKING' && order.associationDelivery)
    return (
      <NextStep title="Has it reached NASJ?">
        <ModalAction
          label="Mark as received"
          title="Received at NASJ"
          description="Confirm that the package reached NASJ."
          submitLabel="Yes, we received it"
          successMessage="Marked as received."
          onSuccess={reload}
          action={() => post(order.id, 'arrived', { note: '' })}
        />
      </NextStep>
    );
  if (order.status === 'AT_NASJ' && order.qualityStatus !== 'PASSED')
    return (
      <NextStep title="Check the quality">
        <ModalAction
          label="Quality check"
          title="Quality check"
          submitLabel="Save result"
          successMessage="Quality check saved."
          onSuccess={reload}
          action={(data) =>
            post(order.id, 'quality', {
              passed: text(data, 'result') === 'PASS',
              note: text(data, 'note'),
            })
          }
        >
          <Select
            name="result"
            label="Result"
            options={[
              { value: 'PASS', label: 'Passed' },
              { value: 'FAIL', label: 'Failed, send back to the association' },
            ]}
          />
          <Input name="note" label="Note (required if it failed)" />
        </ModalAction>
      </NextStep>
    );
  if (order.status === 'AT_NASJ')
    return (
      <NextStep
        title="Pack and ship"
        hint="This creates the package QR code and shares the delivery details with the company."
      >
        <ModalAction
          label="Pack and ship"
          title="Delivery details"
          submitLabel="Create QR code and ship"
          successMessage="On the way to the company."
          onSuccess={reload}
          action={(data) => post(order.id, 'pack', deliveryInput(data))}
        >
          <DeliveryFields withTracking />
        </ModalAction>
      </NextStep>
    );
  return null;
}

function AssociationSteps({ order, reload }: ActionProps) {
  const women = useResource<MarketWomanView[]>('/api/v1/market/women');
  if (order.status === 'AWAITING_APPROVAL' && !order.acceptedAt)
    return (
      <NextStep title="Can your association make this?">
        <ModalAction
          label="Accept"
          title="Accept this request?"
          description="You choose who will make it in the next step."
          submitLabel="Accept request"
          successMessage="Request accepted."
          onSuccess={reload}
          action={() => post(order.id, 'accept')}
        />
        <ModalAction
          label="Decline"
          variant="destructive"
          title="Decline this request?"
          description="NASJ will look for another association."
          submitLabel="Decline request"
          successMessage="Declined."
          onSuccess={reload}
          action={(data) => post(order.id, 'decline', { reason: text(data, 'reason') })}
        >
          <Input name="reason" label="Why?" required />
        </ModalAction>
      </NextStep>
    );
  if (order.status === 'AWAITING_APPROVAL' && order.priceStatus === 'WAITING_FOR_ASSOCIATION')
    return (
      <NextStep title="Propose a price" hint="NASJ finance checks it before the company sees it.">
        <ModalAction
          label="Propose a price"
          title="Propose a price"
          description="Enter amounts without tax. TVA is added on the invoice."
          submitLabel="Send price"
          successMessage="Price sent to NASJ finance."
          onSuccess={reload}
          action={(data) =>
            post(order.id, 'price', {
              total: text(data, 'total'),
              artisanPay: text(data, 'artisanPay'),
              note: text(data, 'note'),
            })
          }
        >
          <Input name="total" label="Total price, excl. tax (TND)" required />
          <Input name="artisanPay" label="Total pay for the artisanes (TND)" required />
          <Input name="note" label="Note (optional)" />
        </ModalAction>
      </NextStep>
    );
  if (order.status === 'WORKING' && !order.assignedAt)
    return (
      <NextStep
        title="Assign the artisanes"
        hint="Choose who agreed to make this and when it will be ready."
      >
        <ModalAction
          label="Assign artisanes"
          title="Assign the artisanes"
          description="Only choose artisanes who have agreed to this work and its pay."
          submitLabel="Start work"
          successMessage="Work has started."
          onSuccess={reload}
          action={(data) =>
            post(order.id, 'assign', {
              artisanIds: data.getAll('artisanIds').map(String),
              estimatedFinish: text(data, 'estimatedFinish'),
              note: '',
            })
          }
        >
          {women.data?.length === 0 && (
            <p className={styles.muted}>
              <Link href="/association/artisanes">Add your artisanes</Link> first.
            </p>
          )}
          <div className={styles.choiceList}>
            {women.data?.map((woman) => (
              <label key={woman.id}>
                <input type="checkbox" name="artisanIds" value={woman.id} />
                <span>
                  {woman.name}
                  {woman.skills.length ? ` · ${woman.skills.join(', ')}` : ''}
                </span>
              </label>
            ))}
          </div>
          <Input name="estimatedFinish" label="Estimated finish date" type="date" required />
        </ModalAction>
      </NextStep>
    );
  if (order.status === 'WORKING' && !order.associationDelivery)
    return (
      <NextStep title="How is the work going?">
        {!order.almostReadyAt && (
          <ModalAction
            label="Mark almost ready"
            variant="outline"
            title="Almost ready?"
            description="Let NASJ know the work is nearly finished."
            submitLabel="Mark almost ready"
            successMessage="Marked as almost ready."
            onSuccess={reload}
            action={() => post(order.id, 'almost-ready')}
          />
        )}
        <ModalAction
          label="Send to NASJ"
          title="Send to NASJ"
          description="Who is bringing the package to NASJ?"
          submitLabel="Confirm delivery to NASJ"
          successMessage="On the way to NASJ."
          onSuccess={reload}
          action={(data) => post(order.id, 'send-to-nasj', deliveryInput(data))}
        >
          <DeliveryFields />
        </ModalAction>
      </NextStep>
    );
  return null;
}

function FinanceSteps({ order, reload }: ActionProps) {
  if (order.priceStatus !== 'FINANCE_REVIEW') return null;
  return (
    <NextStep
      title="Check this price"
      hint={`Price ${money(order.totals?.subtotal)} excl. tax. Artisanes' pay ${money(order.artisanPay)}.`}
    >
      <ModalAction
        label="Review price"
        title="Review this price"
        submitLabel="Save decision"
        successMessage="Decision saved."
        onSuccess={reload}
        action={(data) =>
          post(order.id, 'finance-price', {
            decision: text(data, 'decision'),
            note: text(data, 'note'),
          })
        }
      >
        <Select
          name="decision"
          label="Decision"
          options={[
            { value: 'APPROVE', label: 'Price is fine, send to the company' },
            { value: 'REJECT', label: 'Ask the association for a new price' },
          ]}
        />
        <Input name="note" label="Note (required to ask for a new price)" />
      </ModalAction>
    </NextStep>
  );
}

function RateOrder({ order, reload, audience }: ActionProps & { audience: OrderAudience }) {
  if (!order.canRate) return null;
  return (
    <NextStep title="How did it go?" hint="Your rating helps everyone improve.">
      <ModalAction
        label="Rate this order"
        title="Rate this order"
        submitLabel="Send rating"
        successMessage="Thank you for your rating."
        onSuccess={reload}
        action={(data) =>
          post(order.id, 'rate', {
            stars: Number(text(data, 'stars')),
            ...(audience === 'company' ? { qualityStars: Number(text(data, 'qualityStars')) } : {}),
            comment: text(data, 'comment'),
          })
        }
      >
        <Select name="stars" label="Overall experience" options={starOptions} />
        {audience === 'company' && (
          <Select name="qualityStars" label="Product quality" options={starOptions} />
        )}
        <Input name="comment" label="Comment (optional)" />
      </ModalAction>
    </NextStep>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const order = useResource<MarketOrderView>(`/api/v1/market/orders/${encodeURIComponent(id)}`);
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const data = order.data;
  const personas = context.data?.personas ?? [];
  const admin = personas.includes('PLATFORM_ADMIN');
  const audience = audienceFor(context.data);
  const back =
    audience === 'nasj'
      ? '/nasj/requests'
      : audience === 'association'
        ? '/association/requests'
        : '/orders';
  const journey = data && journeyFor(data, audience);
  return (
    <Workspace
      title={data ? data.title : 'Order'}
      description={
        data ? `${data.code}${audience === 'company' ? '' : ` · ${data.buyerName}`}` : ''
      }
      back={back}
      actions={
        data && context.data && audience === 'company' ? (
          <CancelButton order={data} reload={order.reload} />
        ) : null
      }
    >
      <ResourceState {...order} retry={order.reload} />
      {data && journey && context.data && (
        <div className={styles.stack}>
          <section className="panel">
            {data.status === 'CANCELLED' ? (
              <StatusBadge order={data} audience={audience} />
            ) : (
              <JourneyTracker labels={journey.labels} current={journey.current} />
            )}
            {nextStepFor(data, audience) && (
              <p className={`${styles.muted} ${styles.trackerNote}`}>
                {nextStepFor(data, audience)}
              </p>
            )}
          </section>
          {audience === 'company' && <CompanySteps order={data} reload={order.reload} />}
          {(personas.includes('NASJ_COORDINATOR') || admin) && (
            <CoordinatorSteps order={data} reload={order.reload} />
          )}
          {audience === 'association' && <AssociationSteps order={data} reload={order.reload} />}
          {(personas.includes('NASJ_FINANCE') || admin) && (
            <FinanceSteps order={data} reload={order.reload} />
          )}
          {audience !== 'nasj' && (
            <RateOrder order={data} reload={order.reload} audience={audience} />
          )}
          <div className={styles.layout}>
            <div className={styles.stack}>
              <section className="panel">
                <h2>{data.kind === 'CUSTOM' ? 'Custom request' : 'Items'}</h2>
                {data.photoUrl && (
                  <ProductImage
                    className={styles.photo}
                    src={data.photoUrl}
                    alt="Reference for this request"
                  />
                )}
                {data.description && <p>{data.description}</p>}
                {data.kind === 'CUSTOM' && (
                  <p className={styles.muted}>Quantity: {data.quantity}</p>
                )}
                <div className={styles.stack}>
                  {data.items.map((item) => (
                    <div className={styles.row} key={item.id}>
                      <ProductImage src={item.imageUrl} alt="" />
                      <div>
                        <h3>{item.name}</h3>
                        <p className={styles.muted}>
                          {item.quantity} × {money(item.unitPrice)}
                          {item.unitPay ? ` · artisanes' pay ${money(item.unitPay)} each` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {data.neededBy && <p className={styles.muted}>Needed by {data.neededBy}</p>}
                {data.note && <p className={styles.muted}>Note: {data.note}</p>}
              </section>
              {data.women && data.women.length > 0 && (
                <section className="panel">
                  <h2>Artisanes on this order</h2>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Pay</th>
                          <th scope="col">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.women.map((woman) => (
                          <tr key={woman.id}>
                            <td>{woman.name}</td>
                            <td>{money(woman.pay)}</td>
                            <td>
                              {woman.paidRecorded ? (
                                <>
                                  {woman.paymentChecked ? 'Checked by finance' : 'Recorded as paid'}
                                  {woman.proofUrl && (
                                    <p className={styles.muted}>
                                      <a href={woman.proofUrl} target="_blank" rel="noreferrer">
                                        View proof
                                      </a>
                                    </p>
                                  )}
                                </>
                              ) : audience === 'association' ? (
                                <ModalAction
                                  label="Record payment"
                                  variant="outline"
                                  title={`Record payment to ${woman.name}`}
                                  description={`Add proof that ${woman.name} received ${money(woman.pay)}. NASJ finance and admins will check it.`}
                                  submitLabel="Record payment"
                                  successMessage="Payment recorded."
                                  onSuccess={order.reload}
                                  action={async (form) => {
                                    const file = chosenFile(form, 'proof');
                                    if (!file) throw new Error('Add the payment proof.');
                                    const proof = await apiFetch<{ id: string }>(
                                      '/api/v1/market/files',
                                      {
                                        method: 'POST',
                                        body: {
                                          purpose: 'PAYMENT_PROOF',
                                          organizationId: data.associationId,
                                          ...(await proofPayload(file)),
                                        },
                                      },
                                    );
                                    await post(data.id, `artisanes/${woman.id}/paid`, {
                                      proofFileId: proof.id,
                                    });
                                  }}
                                >
                                  <FileField
                                    name="proof"
                                    label="Payment proof (PDF or photo)"
                                    accept="application/pdf,image/png,image/jpeg,image/webp"
                                    required
                                    hint="For example a signed receipt or a transfer confirmation. Up to 4 MB."
                                  />
                                </ModalAction>
                              ) : (
                                'Not paid yet'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <section className="panel">
                <h2>History</h2>
                <ol className={styles.timeline}>
                  {[...data.events].reverse().map((event) => (
                    <li key={event.id}>
                      <p>
                        <strong>{event.title}</strong>
                      </p>
                      <p className={styles.muted}>
                        {new Date(event.at).toLocaleString()} · {event.actor}
                      </p>
                      {event.note && <p className={styles.muted}>{event.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <div className={styles.stack}>
              <section className="panel">
                <h2>
                  {audience === 'association'
                    ? 'Amounts'
                    : data.invoiceFinal
                      ? 'Invoice'
                      : 'Pro forma'}
                </h2>
                {data.totals ? (
                  <dl className={styles.sums}>
                    <dt>Subtotal excl. tax</dt>
                    <dd>{money(data.totals.subtotal)}</dd>
                    {audience !== 'association' && (
                      <>
                        <dt>TVA 19%</dt>
                        <dd>{money(data.totals.tva)}</dd>
                        <dt>Stamp duty</dt>
                        <dd>{money(data.totals.stamp)}</dd>
                        <dt className={styles.sumTotal}>Total</dt>
                        <dd className={styles.sumTotal}>{money(data.totals.total)}</dd>
                      </>
                    )}
                    {data.artisanPay && (
                      <>
                        <dt>Artisanes' pay</dt>
                        <dd>{money(data.artisanPay)}</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  <p className={styles.muted}>The price is not set yet.</p>
                )}
                {data.invoiceAvailable && (
                  <Button asChild variant="outline">
                    <a href={`/api/v1/market/orders/${data.id}/invoice.pdf`} download>
                      <Download size={16} aria-hidden="true" />
                      {data.invoiceFinal ? 'Download invoice (PDF)' : 'Download pro forma (PDF)'}
                    </a>
                  </Button>
                )}
                {(personas.includes('NASJ_FINANCE') || admin) &&
                  data.totals &&
                  data.status !== 'CANCELLED' &&
                  (data.invoiceCheckedAt ? (
                    <p className={styles.muted}>Invoice checked by finance.</p>
                  ) : (
                    <ModalAction
                      label="Mark invoice as checked"
                      title="Mark invoice as checked?"
                      submitLabel="Mark as checked"
                      successMessage="Invoice checked."
                      onSuccess={order.reload}
                      action={() => post(data.id, 'invoice-check')}
                    />
                  ))}
              </section>
              {data.associationDelivery && audience !== 'company' && (
                <DeliveryCard title="Delivery to NASJ" delivery={data.associationDelivery} />
              )}
              {data.nasjDelivery && (
                <DeliveryCard
                  title={audience === 'company' ? 'Your delivery' : 'Delivery to the company'}
                  delivery={data.nasjDelivery}
                />
              )}
              {data.packed && audience !== 'association' && (
                <section className="panel">
                  <h2>
                    <QrCode size={18} aria-hidden="true" /> Package QR code
                  </h2>
                  {/* biome-ignore lint/performance/noImgElement: generated by the API */}
                  <img
                    className={styles.qr}
                    src={`/api/v1/market/orders/${data.id}/qr.png`}
                    alt="QR code for this package"
                  />
                </section>
              )}
              {data.ratings.length > 0 && (
                <section className="panel">
                  <h2>Ratings</h2>
                  {data.ratings.map((rating) => (
                    <div key={rating.role} className={styles.rating}>
                      <p>
                        <strong>{rating.role === 'COMPANY' ? 'Company' : 'Association'}</strong>{' '}
                        {'★'.repeat(rating.stars)}
                      </p>
                      {rating.qualityStars && (
                        <p className={styles.muted}>Quality {'★'.repeat(rating.qualityStars)}</p>
                      )}
                      {rating.comment && <p className={styles.muted}>{rating.comment}</p>}
                    </div>
                  ))}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </Workspace>
  );
}
