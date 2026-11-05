'use client';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type {
  IdentityContext,
  MarketBilling,
  MarketCartView,
  MarketProductView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  ActionForm,
  Input,
  ResourceState,
  Select,
  Workspace,
  text,
  useResource,
} from '../workspace-ui';
import { FileField, ModalAction, ProductImage, chosenFile, imagePayload, money } from './market-ui';
import styles from './market.module.css';

export const paymentLabels = {
  DHMAD: 'Dhmad secure payment',
  BANK_TRANSFER: 'Bank transfer',
};

function ProductCard({
  product,
  onAdd,
}: {
  product: MarketProductView;
  onAdd: (id: string, quantity: number) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(product.minQuantity);
  const [state, setState] = useState<'idle' | 'saving' | 'added'>('idle');
  const [error, setError] = useState('');
  return (
    <article className={styles.card}>
      <ProductImage className={styles.cardImage} src={product.imageUrl} alt={product.name} />
      <div className={styles.cardBody}>
        <h2>{product.name}</h2>
        <p className={styles.muted}>{product.craft}</p>
        <p className={styles.muted}>{product.description}</p>
        <p className={styles.price}>{money(product.price)}</p>
        <p className={styles.muted}>
          Minimum {product.minQuantity} · Ready in about {product.leadTimeDays} days
        </p>
        <div className={styles.cardFoot}>
          <input
            className={styles.qty}
            type="number"
            min={product.minQuantity}
            value={quantity}
            aria-label={`Quantity of ${product.name}`}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
          <Button
            type="button"
            disabled={state === 'saving'}
            onClick={async () => {
              setState('saving');
              setError('');
              try {
                await onAdd(product.id, quantity);
                setState('added');
              } catch (failure) {
                setState('idle');
                setError(failure instanceof Error ? failure.message : 'Could not add this item.');
              }
            }}
          >
            {state === 'added' ? 'Added ✓' : state === 'saving' ? 'Adding…' : 'Add to cart'}
          </Button>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

export function Catalog() {
  const [q, setQ] = useState('');
  const [craft, setCraft] = useState('');
  const products = useResource<MarketProductView[]>('/api/v1/market/products');
  const cart = useResource<MarketCartView>('/api/v1/market/cart');
  const crafts = useMemo(
    () => [...new Set(products.data?.map((product) => product.craft) ?? [])],
    [products.data],
  );
  const visible = products.data?.filter(
    (product) =>
      (!craft || product.craft === craft) &&
      `${product.name} ${product.description}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const count = cart.data?.lines.length ?? 0;
  return (
    <Workspace title="Catalog" description="Handmade gifts, made by women artisans.">
      <div className={styles.toolbar}>
        <input
          type="search"
          value={q}
          placeholder="Search products"
          aria-label="Search products"
          onChange={(event) => setQ(event.target.value)}
        />
        <Button asChild variant="outline">
          <Link href="/custom-request">Request something custom</Link>
        </Button>
        <Button asChild>
          <Link href="/cart">
            <ShoppingCart size={18} aria-hidden="true" />
            Cart{count ? ` (${count})` : ''}
          </Link>
        </Button>
      </div>
      <div className={`${styles.chips} ${styles.tabs}`}>
        <button type="button" aria-pressed={!craft} onClick={() => setCraft('')}>
          All crafts
        </button>
        {crafts.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={craft === item}
            onClick={() => setCraft(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <ResourceState {...products} retry={products.reload} />
      {visible?.length === 0 && (
        <div className={styles.empty}>
          <p>No products match your search.</p>
          <Button asChild variant="outline">
            <Link href="/custom-request">Request it as a custom order</Link>
          </Button>
        </div>
      )}
      <div className={styles.grid}>
        {visible?.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAdd={async (id, quantity) => {
              await apiFetch(`/api/v1/market/cart/${id}`, { method: 'PUT', body: { quantity } });
              await cart.reload();
            }}
          />
        ))}
      </div>
    </Workspace>
  );
}

function BillingFields({ billing }: { billing: MarketBilling | null }) {
  return (
    <>
      <Input name="legalName" label="Legal company name" value={billing?.legalName} required />
      <Input name="taxId" label="Tax ID" value={billing?.taxId} required />
      <Input
        name="billingAddress"
        label="Billing address"
        value={billing?.billingAddress}
        required
      />
      <Input
        name="shippingAddress"
        label="Shipping address"
        value={billing?.shippingAddress}
        required
      />
      <Input
        name="contactName"
        label="Person receiving the delivery"
        value={billing?.contactName}
        required
      />
      <Input name="contactPhone" label="Phone" type="tel" value={billing?.contactPhone} required />
      <Select
        name="paymentMethod"
        label="Payment method"
        value={billing?.paymentMethod}
        options={[
          { value: 'DHMAD', label: paymentLabels.DHMAD },
          { value: 'BANK_TRANSFER', label: paymentLabels.BANK_TRANSFER },
        ]}
      />
    </>
  );
}
function billingInput(data: FormData) {
  return {
    legalName: text(data, 'legalName'),
    taxId: text(data, 'taxId'),
    billingAddress: text(data, 'billingAddress'),
    shippingAddress: text(data, 'shippingAddress'),
    contactName: text(data, 'contactName'),
    contactPhone: text(data, 'contactPhone'),
    paymentMethod: text(data, 'paymentMethod'),
  };
}
export function BillingButton({
  billing,
  onSaved,
}: {
  billing: MarketBilling | null;
  onSaved: () => unknown;
}) {
  return (
    <ModalAction
      label={billing ? 'Edit details' : 'Add billing and delivery details'}
      variant={billing ? 'outline' : 'default'}
      title="Billing and delivery details"
      description="These details appear on your invoices and tell us where to deliver."
      submitLabel="Save details"
      successMessage="Details saved."
      onSuccess={onSaved}
      action={(data) =>
        apiFetch('/api/v1/market/billing', { method: 'PUT', body: billingInput(data) })
      }
    >
      <BillingFields billing={billing} />
    </ModalAction>
  );
}

export function Cart() {
  const router = useRouter();
  const cart = useResource<MarketCartView>('/api/v1/market/cart');
  const [error, setError] = useState('');
  async function change(id: string, quantity: number) {
    setError('');
    try {
      await apiFetch(`/api/v1/market/cart/${id}`, { method: 'PUT', body: { quantity } });
      await cart.reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update your cart.');
    }
  }
  const billing = cart.data?.billing ?? null;
  return (
    <Workspace
      title="Your cart"
      description="Check your items and details, then send your request."
    >
      <ResourceState {...cart} retry={cart.reload} />
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {cart.data?.lines.length === 0 && (
        <div className={styles.empty}>
          <ShoppingCart size={32} aria-hidden="true" />
          <p>Your cart is empty.</p>
          <Button asChild>
            <Link href="/catalog">Browse the catalog</Link>
          </Button>
        </div>
      )}
      {cart.data && cart.data.lines.length > 0 && (
        <div className={styles.layout}>
          <div className={styles.stack}>
            {cart.data.lines.map(({ product, quantity, lineTotal }) => (
              <div className={styles.row} key={product.id}>
                <ProductImage src={product.imageUrl} alt="" />
                <div>
                  <h2>{product.name}</h2>
                  <p className={styles.muted}>
                    {money(product.price)} each · minimum {product.minQuantity}
                  </p>
                </div>
                <div className={styles.rowEnd}>
                  <input
                    className={styles.qty}
                    type="number"
                    min={product.minQuantity}
                    defaultValue={quantity}
                    aria-label={`Quantity of ${product.name}`}
                    onBlur={(event) => {
                      const next = Number(event.target.value);
                      if (next !== quantity) void change(product.id, next);
                    }}
                  />
                  <strong>{money(lineTotal)}</strong>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => change(product.id, 0)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.stack}>
            <section className="panel">
              <h2>Billing and delivery</h2>
              {billing ? (
                <dl className={styles.facts}>
                  <dt>Company</dt>
                  <dd>
                    {billing.legalName} · Tax ID {billing.taxId}
                  </dd>
                  <dt>Billing address</dt>
                  <dd>{billing.billingAddress}</dd>
                  <dt>Shipping address</dt>
                  <dd>{billing.shippingAddress}</dd>
                  <dt>Payment method</dt>
                  <dd>{paymentLabels[billing.paymentMethod]}</dd>
                </dl>
              ) : (
                <p className={styles.muted}>Add these before you can get an invoice or send.</p>
              )}
              <BillingButton billing={billing} onSaved={cart.reload} />
            </section>
            <section className="panel">
              <h2>Summary</h2>
              <dl className={styles.sums}>
                <dt>Subtotal excl. tax</dt>
                <dd>{money(cart.data.totals.subtotal)}</dd>
                <dt>TVA 19%</dt>
                <dd>{money(cart.data.totals.tva)}</dd>
                <dt>Stamp duty</dt>
                <dd>{money(cart.data.totals.stamp)}</dd>
                <dt className={styles.sumTotal}>Total</dt>
                <dd className={styles.sumTotal}>{money(cart.data.totals.total)}</dd>
              </dl>
              {cart.data.deliveries > 1 && (
                <p className={styles.muted}>
                  Your items will arrive in {cart.data.deliveries} separate deliveries.
                </p>
              )}
              <div className={styles.stackTight}>
                {billing ? (
                  <Button asChild variant="outline">
                    <a href="/api/v1/market/cart/invoice.pdf" download>
                      Download pro forma invoice (PDF)
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Download pro forma invoice (PDF)
                  </Button>
                )}
                <ModalAction
                  label="Send request"
                  disabled={!billing}
                  title="Send your request"
                  description="You can still cancel until your request is approved."
                  submitLabel="Confirm and send"
                  successMessage="Your request was sent."
                  action={async (data) => {
                    const neededBy = text(data, 'neededBy');
                    await apiFetch('/api/v1/market/cart/checkout', {
                      method: 'POST',
                      body: { note: text(data, 'note'), ...(neededBy ? { neededBy } : {}) },
                    });
                    router.push('/orders');
                  }}
                >
                  <Input name="neededBy" label="Needed by (optional)" type="date" />
                  <Input name="note" label="Note for NASJ (optional)" />
                </ModalAction>
              </div>
            </section>
          </div>
        </div>
      )}
    </Workspace>
  );
}

export function CustomOrder() {
  const router = useRouter();
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const cart = useResource<MarketCartView>('/api/v1/market/cart');
  const company = context.data?.organizations.find((org) => org.type === 'BUYER_BUSINESS');
  const billing = cart.data?.billing ?? null;
  return (
    <Workspace
      title="Request something custom"
      description="Show us what you have in mind. NASJ will send you a price, and you decide before work starts."
    >
      <ResourceState {...cart} retry={cart.reload} />
      {cart.data && !billing && (
        <section className="panel">
          <h2>First, your billing and delivery details</h2>
          <p className={styles.muted}>We need these before we can take a request.</p>
          <BillingButton billing={billing} onSaved={cart.reload} />
        </section>
      )}
      {billing && (
        <section className="panel">
          <ActionForm
            label="Send custom request"
            successMessage="Your custom request was sent."
            action={async (data) => {
              const file = chosenFile(data, 'photo');
              if (!file) throw new Error('Add a photo of the product you have in mind.');
              if (!company) throw new Error('An approved company account is required.');
              const photo = await apiFetch<{ id: string }>('/api/v1/market/files', {
                method: 'POST',
                body: {
                  purpose: 'ORDER_PHOTO',
                  organizationId: company.id,
                  ...(await imagePayload(file)),
                },
              });
              const neededBy = text(data, 'neededBy');
              const order = await apiFetch<{ id: string }>('/api/v1/market/orders/custom', {
                method: 'POST',
                body: {
                  title: text(data, 'title'),
                  description: text(data, 'description'),
                  quantity: Number(text(data, 'quantity')),
                  photoFileId: photo.id,
                  ...(neededBy ? { neededBy } : {}),
                },
              });
              router.push(`/orders/${order.id}`);
            }}
          >
            <Input name="title" label="What do you need?" required />
            <div className="field">
              <Label htmlFor="custom-description">Describe it</Label>
              <Textarea
                id="custom-description"
                name="description"
                required
                rows={4}
                placeholder="Size, colours, materials, your logo, the occasion…"
              />
            </div>
            <FileField
              name="photo"
              label="Photo of the product"
              accept="image/png,image/jpeg,image/webp"
              required
            />
            <Input name="quantity" label="Quantity" type="number" min="1" required />
            <Input name="neededBy" label="Needed by (optional)" type="date" />
          </ActionForm>
        </section>
      )}
    </Workspace>
  );
}
