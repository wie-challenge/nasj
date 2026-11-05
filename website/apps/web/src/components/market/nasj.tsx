'use client';
import Link from 'next/link';
import { useState } from 'react';
import { MARKET_MIN_ARTISAN_SHARE_PERCENT, parseTnd } from '@nasj/contracts';
import type {
  MarketOrderView,
  MarketOrganizationView,
  MarketPaymentView,
  MarketProductView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { Input, ResourceState, Select, Workspace, text, useResource } from '../workspace-ui';
import { ModalAction, ProductImage, StatusBadge, money } from './market-ui';
import styles from './market.module.css';

const typeLabel: Record<string, string> = {
  BUYER_BUSINESS: 'Company',
  ASSOCIATION: 'Association',
  PARTNER_COOPERATIVE: 'Association',
};
const decisions = [
  { value: 'APPROVE', label: 'Accept' },
  { value: 'REJECT', label: 'Reject' },
];

export function OrganizationReview() {
  const [status, setStatus] = useState<'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'>(
    'PENDING_REVIEW',
  );
  const organizations = useResource<MarketOrganizationView[]>(
    `/api/v1/market/organizations?status=${status}`,
  );
  return (
    <Workspace
      title="Companies and associations"
      description="Check who is applying and their proof. Accepted organizations get a welcome email automatically."
    >
      <div className={`${styles.chips} ${styles.tabs}`}>
        {(
          [
            ['PENDING_REVIEW', 'Waiting for review'],
            ['APPROVED', 'Accepted'],
            ['REJECTED', 'Rejected'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <ResourceState {...organizations} retry={organizations.reload} />
      {organizations.data?.length === 0 && (
        <div className={styles.empty}>
          <p>Nothing here right now.</p>
        </div>
      )}
      {organizations.data && organizations.data.length > 0 && (
        <div className={`panel ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Organization</th>
                <th scope="col">Type</th>
                <th scope="col">Representative</th>
                <th scope="col">Team</th>
                <th scope="col">Proof</th>
                <th scope="col">
                  <span className="sr-only">Decision</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {organizations.data.map((org) => (
                <tr key={org.id}>
                  <td>
                    {org.name}
                    <p className={styles.muted}>{org.region}</p>
                  </td>
                  <td>{typeLabel[org.type] ?? org.type}</td>
                  <td>
                    {org.representativeName}
                    <p className={styles.muted}>{org.contactEmail}</p>
                  </td>
                  <td>
                    {org.people.length} {org.people.length === 1 ? 'person' : 'people'}
                  </td>
                  <td>
                    {org.proof ? (
                      <a href={org.proof.url} target="_blank" rel="noreferrer">
                        Open PDF
                      </a>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeRed}`}>Missing</span>
                    )}
                  </td>
                  <td>
                    {org.approvalStatus === 'PENDING_REVIEW' ? (
                      <ModalAction
                        label="Review"
                        title={`Review ${org.name}`}
                        description={org.description}
                        submitLabel="Save decision"
                        successMessage="Decision saved and the email was sent."
                        onSuccess={organizations.reload}
                        action={(data) =>
                          apiFetch(`/api/v1/market/organizations/${org.id}/review`, {
                            method: 'POST',
                            body: { decision: text(data, 'decision'), note: text(data, 'note') },
                          })
                        }
                      >
                        <Select name="decision" label="Decision" options={decisions} />
                        <Input name="note" label="Note (required to reject)" />
                      </ModalAction>
                    ) : (
                      <span className={styles.muted}>{org.approvalReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Workspace>
  );
}

function Share({ pay, total }: { pay?: string | null; total?: string | null }) {
  if (!pay || !total) return null;
  const whole = parseTnd(total);
  if (whole <= 0n) return null;
  const percent = (parseTnd(pay) * 100n) / whole;
  if (percent >= MARKET_MIN_ARTISAN_SHARE_PERCENT) return <>{`${percent}%`}</>;
  return (
    <span className={styles.shareLow}>
      {percent}% · below the {`${MARKET_MIN_ARTISAN_SHARE_PERCENT}%`} minimum
    </span>
  );
}
const tabs = [
  ['prices', 'Prices'],
  ['invoices', 'Orders and invoices'],
  ['payments', "Artisanes' payments"],
] as const;

export function FinanceReview() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('prices');
  const products = useResource<MarketProductView[]>('/api/v1/market/products/review');
  const orders = useResource<MarketOrderView[]>('/api/v1/market/orders');
  const payments = useResource<MarketPaymentView[]>('/api/v1/market/payments');
  const priced = orders.data?.filter((order) => order.totals && order.status !== 'CANCELLED');
  return (
    <Workspace
      title="Finance"
      description="Check that every price is fair, that the artisanes are paid properly and that every invoice is right."
    >
      <div className={`${styles.chips} ${styles.tabs}`}>
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'prices' && (
        <>
          <ResourceState {...products} retry={products.reload} />
          {products.data && (
            <div className={`panel ${styles.tableWrap}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Photo</th>
                    <th scope="col">Product</th>
                    <th scope="col">Price</th>
                    <th scope="col">Artisanes' pay</th>
                    <th scope="col">Their share</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.data.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <ProductImage src={product.imageUrl} alt="" />
                      </td>
                      <td>
                        {product.name}
                        <p className={styles.muted}>{product.associationName}</p>
                      </td>
                      <td>{money(product.price)}</td>
                      <td>{money(product.artisanPay)}</td>
                      <td>
                        <Share pay={product.artisanPay} total={product.price} />
                      </td>
                      <td>
                        {product.status === 'PENDING_REVIEW' ? (
                          <ModalAction
                            label="Review"
                            title={`Review ${product.name}`}
                            description={`Price ${money(product.price)}, artisanes' pay ${money(product.artisanPay)}.`}
                            submitLabel="Save decision"
                            successMessage="Decision saved."
                            onSuccess={products.reload}
                            action={(data) =>
                              apiFetch(`/api/v1/market/products/${product.id}/review`, {
                                method: 'POST',
                                body: {
                                  decision: text(data, 'decision'),
                                  note: text(data, 'note'),
                                },
                              })
                            }
                          >
                            <Select name="decision" label="Decision" options={decisions} />
                            <Input name="note" label="Note (required to reject)" />
                          </ModalAction>
                        ) : (
                          'In the catalog'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === 'invoices' && (
        <>
          <ResourceState {...orders} retry={orders.reload} />
          <p className={styles.muted}>Payments are not collected yet.</p>
          {priced?.length === 0 && <p className={styles.muted}>No priced orders yet.</p>}
          {priced && priced.length > 0 && (
            <div className={`panel ${styles.tableWrap}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Status</th>
                    <th scope="col">Excl. tax</th>
                    <th scope="col">Total</th>
                    <th scope="col">Artisanes' pay</th>
                    <th scope="col">Their share</th>
                    <th scope="col">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/orders/${order.id}`}>{order.code}</Link>
                        <p className={styles.muted}>{order.buyerName}</p>
                      </td>
                      <td>
                        <StatusBadge order={order} audience="nasj" />
                      </td>
                      <td>{money(order.totals?.subtotal)}</td>
                      <td>{money(order.totals?.total)}</td>
                      <td>{money(order.artisanPay)}</td>
                      <td>
                        <Share pay={order.artisanPay} total={order.totals?.subtotal} />
                      </td>
                      <td>
                        {order.invoiceCheckedAt ? (
                          'Checked'
                        ) : (
                          <ModalAction
                            label="Check"
                            variant="outline"
                            title={`Check the invoice for ${order.code}?`}
                            description={`Total ${money(order.totals?.total)}.`}
                            submitLabel="Mark as checked"
                            successMessage="Invoice checked."
                            onSuccess={orders.reload}
                            action={() =>
                              apiFetch(`/api/v1/market/orders/${order.id}/invoice-check`, {
                                method: 'POST',
                              })
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === 'payments' && (
        <>
          <ResourceState {...payments} retry={payments.reload} />
          {payments.data?.length === 0 && (
            <p className={styles.muted}>No artisanes assigned yet.</p>
          )}
          {payments.data && payments.data.length > 0 && (
            <div className={`panel ${styles.tableWrap}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Artisane</th>
                    <th scope="col">Association</th>
                    <th scope="col">Order</th>
                    <th scope="col">Pay</th>
                    <th scope="col">Proof</th>
                    <th scope="col">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.map((row) => (
                    <tr key={`${row.orderId}-${row.artisanId}`}>
                      <td>{row.artisanName}</td>
                      <td>{row.associationName}</td>
                      <td>
                        <Link href={`/orders/${row.orderId}`}>{row.code}</Link>
                      </td>
                      <td>{money(row.pay)}</td>
                      <td>
                        {row.proofUrl ? (
                          <a href={row.proofUrl} target="_blank" rel="noreferrer">
                            View proof
                          </a>
                        ) : (
                          <span className={styles.muted}>None yet</span>
                        )}
                      </td>
                      <td>
                        {row.paymentChecked ? (
                          'Checked'
                        ) : row.paidRecorded ? (
                          <ModalAction
                            label="Check payment"
                            variant="outline"
                            title="Check this payment?"
                            description={`The association recorded ${money(row.pay)} paid to ${row.artisanName}.`}
                            submitLabel="Mark as checked"
                            successMessage="Payment checked."
                            onSuccess={payments.reload}
                            action={() =>
                              apiFetch(
                                `/api/v1/market/orders/${row.orderId}/artisanes/${row.artisanId}/payment-check`,
                                { method: 'POST' },
                              )
                            }
                          />
                        ) : (
                          'Not paid yet'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Workspace>
  );
}
