'use client';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import type { MarketDelivery, MarketOrderStatus, MarketOrderView } from '@nasj/contracts';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { ActionForm, Input, text } from '../workspace-ui';
import styles from './market.module.css';

export const money = (value: string | null | undefined) =>
  value ? `${value} TND` : 'Price to confirm';
export const defaultImage = '/marketplace/default.jpg';
const maxFileBytes = 4 * 1024 * 1024;

export type OrderAudience = 'company' | 'association' | 'nasj';

const companySteps: { status: MarketOrderStatus; label: string }[] = [
  { status: 'SENT', label: 'Request sent' },
  { status: 'AWAITING_APPROVAL', label: 'Awaiting approval' },
  { status: 'WORKING', label: 'Working on it' },
  { status: 'AT_NASJ', label: 'Delivered to NASJ' },
  { status: 'ON_THE_WAY', label: 'Coming to you' },
  { status: 'DELIVERED', label: 'Delivered' },
];
// Everyone follows the same order, each from their own point of view.
export function journeyFor(order: MarketOrderView, audience: OrderAudience) {
  if (audience === 'association') {
    const labels = [
      'New request',
      'Accepted',
      'Artisanes working',
      'Almost ready',
      'Sent to NASJ',
      'Received by NASJ',
      `Sent to ${order.buyerName}`,
      'Delivered',
    ];
    let current = 0;
    if (order.acceptedAt) current = 1;
    if (order.assignedAt) current = 2;
    if (order.almostReadyAt) current = 3;
    if (order.associationDelivery) current = 4;
    if (order.status === 'AT_NASJ') current = 5;
    if (order.status === 'ON_THE_WAY') current = 6;
    if (order.status === 'DELIVERED') current = 8;
    return { labels, current };
  }
  if (audience === 'nasj') {
    const labels = [
      'Request received',
      'Sent to association',
      'In production',
      'Received at NASJ',
      'Quality checked',
      'Packed and shipped',
      'Delivered',
    ];
    let current = 0;
    if (order.status === 'AWAITING_APPROVAL') current = 1;
    if (order.status === 'WORKING') current = 2;
    if (order.status === 'AT_NASJ') current = order.qualityStatus === 'PASSED' ? 4 : 3;
    if (order.status === 'ON_THE_WAY') current = 5;
    if (order.status === 'DELIVERED') current = 7;
    return { labels, current };
  }
  const index = companySteps.findIndex((step) => step.status === order.status);
  return {
    labels: companySteps.map((step) => step.label),
    current: order.status === 'DELIVERED' ? companySteps.length : index,
  };
}
export function statusLabel(order: MarketOrderView, audience: OrderAudience) {
  if (order.status === 'CANCELLED') return 'Cancelled';
  const { labels, current } = journeyFor(order, audience);
  return current >= labels.length ? labels[labels.length - 1] : labels[current];
}
export function StatusBadge({
  order,
  audience,
}: {
  order: MarketOrderView;
  audience: OrderAudience;
}) {
  const tone =
    order.status === 'CANCELLED'
      ? styles.badgeRed
      : order.status === 'DELIVERED'
        ? styles.badgeGreen
        : '';
  return <span className={`${styles.badge} ${tone}`}>{statusLabel(order, audience)}</span>;
}
export function nextStepFor(order: MarketOrderView, audience: OrderAudience) {
  if (order.status === 'CANCELLED') return null;
  if (audience === 'company') {
    if (order.status === 'SENT' || order.status === 'AWAITING_APPROVAL')
      return order.priceStatus === 'COMPANY_REVIEW'
        ? 'Your price is ready. Please accept it to start.'
        : 'NASJ is arranging your request.';
    if (order.status === 'WORKING')
      return order.estimatedFinish
        ? `Being made by hand. Estimated ready on ${order.estimatedFinish}.`
        : 'Your order is being made by hand.';
    if (order.status === 'AT_NASJ') return 'NASJ is checking the quality.';
    if (order.status === 'ON_THE_WAY') return 'On the way to you.';
    return null;
  }
  if (audience === 'association') {
    if (order.status === 'AWAITING_APPROVAL' && !order.acceptedAt)
      return 'NASJ sent you this request.';
    if (order.status === 'AWAITING_APPROVAL' && order.priceStatus === 'WAITING_FOR_ASSOCIATION')
      return 'NASJ is waiting for your price.';
    if (order.status === 'WORKING' && !order.assignedAt)
      return 'Choose the artisanes who will make this.';
    if (order.status === 'AT_NASJ') return 'NASJ is checking the quality.';
    if (order.status === 'ON_THE_WAY') return `On the way to ${order.buyerName}.`;
  }
  if (order.status === 'SENT') return 'Waiting for a coordinator to choose an association.';
  if (order.status === 'AWAITING_APPROVAL') {
    if (!order.acceptedAt) return 'Waiting for the association to answer.';
    if (order.priceStatus === 'WAITING_FOR_ASSOCIATION')
      return 'Waiting for the association to propose a price.';
    if (order.priceStatus === 'FINANCE_REVIEW') return 'NASJ finance is checking the price.';
    if (order.priceStatus === 'COMPANY_REVIEW') return 'Waiting for the company to accept.';
  }
  if (order.status === 'WORKING') {
    if (!order.assignedAt) return 'Waiting for the association to assign artisanes.';
    if (order.associationDelivery) return 'On the way to NASJ.';
    return order.estimatedFinish
      ? `Being made. Estimated finish on ${order.estimatedFinish}.`
      : 'Being made.';
  }
  if (order.status === 'AT_NASJ')
    return order.qualityStatus === 'PASSED' ? 'Ready to pack and ship.' : 'Needs a quality check.';
  if (order.status === 'ON_THE_WAY') return 'On the way to the company.';
  return null;
}
export function JourneyTracker({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol
      className={styles.tracker}
      style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      aria-label="Order journey"
    >
      {labels.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.dot} aria-hidden="true">
              {state === 'done' ? '✓' : index + 1}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
export function ProductImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // biome-ignore lint/performance/noImgElement: images come from the API or from a public link
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(defaultImage)) event.currentTarget.src = defaultImage;
      }}
    />
  );
}
export function ModalAction({
  label,
  title,
  description,
  submitLabel,
  variant,
  disabled = false,
  action,
  onSuccess,
  children,
  successMessage,
}: {
  label: ReactNode;
  title: string;
  description?: string;
  submitLabel: string;
  variant?: ComponentProps<typeof Button>['variant'];
  disabled?: boolean;
  action: (data: FormData) => Promise<unknown>;
  onSuccess?: () => unknown;
  children?: ReactNode;
  successMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={description}>
        <ActionForm
          label={submitLabel}
          successMessage={successMessage}
          action={action}
          onSuccess={async () => {
            setOpen(false);
            await onSuccess?.();
          }}
        >
          {children}
        </ActionForm>
      </Modal>
    </>
  );
}
export function DeliveryFields({ withTracking = false }: { withTracking?: boolean }) {
  return (
    <>
      <Input name="carrier" label="Delivery company" required />
      <Input name="driverName" label="Delivery person" required />
      <Input name="driverPhone" label="Phone" type="tel" required />
      <Input name="expectedOn" label="Expected on" type="date" required />
      {withTracking && <Input name="tracking" label="Tracking number (optional)" />}
    </>
  );
}
export function deliveryInput(data: FormData): MarketDelivery {
  const tracking = text(data, 'tracking');
  return {
    carrier: text(data, 'carrier'),
    driverName: text(data, 'driverName'),
    driverPhone: text(data, 'driverPhone'),
    expectedOn: text(data, 'expectedOn'),
    ...(tracking ? { tracking } : {}),
  };
}
export function DeliveryCard({ title, delivery }: { title: string; delivery: MarketDelivery }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <dl className={styles.facts}>
        <dt>Delivery company</dt>
        <dd>{delivery.carrier}</dd>
        <dt>Delivery person</dt>
        <dd>{delivery.driverName}</dd>
        <dt>Phone</dt>
        <dd>
          <a href={`tel:${delivery.driverPhone}`}>{delivery.driverPhone}</a>
        </dd>
        <dt>Expected on</dt>
        <dd>{delivery.expectedOn}</dd>
        {delivery.tracking && (
          <>
            <dt>Tracking number</dt>
            <dd>{delivery.tracking}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
export function FileField({
  name,
  label,
  accept,
  required = false,
  hint,
}: {
  name: string;
  label: string;
  accept: string;
  required?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={styles.fileField}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="file" accept={accept} required={required} />
      {hint && <p className={styles.muted}>{hint}</p>}
    </div>
  );
}
function readBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}
// Phone photos are far larger than a product card needs, so shrink them before upload.
async function shrinkImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error('This image could not be prepared.');
  return blob;
}
function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_. -]/g, '_').slice(-100) || 'file';
}
export async function pdfPayload(file: File) {
  if (file.type !== 'application/pdf') throw new Error('Your proof must be a PDF file.');
  if (file.size > maxFileBytes) throw new Error('Choose a PDF under 4 MB.');
  return { filename: safeName(file.name), mime: 'application/pdf', base64: await readBase64(file) };
}
export async function proofPayload(file: File) {
  return file.type === 'application/pdf' ? pdfPayload(file) : imagePayload(file);
}
export async function imagePayload(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const image = await shrinkImage(file);
  if (image.size > maxFileBytes) throw new Error('Choose an image under 4 MB.');
  return {
    filename: `${safeName(file.name).replace(/\.[^.]+$/, '')}.jpg`,
    mime: 'image/jpeg',
    base64: await readBase64(image),
  };
}
export function chosenFile(data: FormData, name: string) {
  const value = data.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}
