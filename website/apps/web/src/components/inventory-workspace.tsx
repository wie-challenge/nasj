'use client';
import { useId, useState } from 'react';
import type { IdentityContext } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { stockQuantityMilli } from '@/lib/stock-quantity';
import { NativeSelect } from './ui/native-select';
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

const root = '/api/v1/inventory';
const units = ['METERS', 'PIECES', 'UNITS'] as const;
const post = (path: string, body: unknown) =>
  apiFetch(path, { method: 'POST', body, idempotencyKey: crypto.randomUUID() });
const quantity = (value: string) => {
  const milli = BigInt(value);
  return `${milli / 1000n}.${(milli % 1000n).toString().padStart(3, '0')}`;
};
type Movement = {
  id: string;
  kind: string;
  quantityMilli: string;
  createdAt: string;
  reason: string;
};
type Reservation = {
  id: string;
  lotId: string;
  batchId: string;
  quantityMilli: string;
  status: string;
  issuedMilli?: string;
};
type Return = {
  id: string;
  quantityMilli: string;
  condition: string;
  status: string;
  disposition?: string | null;
};
type Receipt = {
  id: string;
  receivedMilli: string;
  damagedMilli: string;
  verificationStatus: string;
  note: string;
  source?: string;
};
type Handover = {
  id: string;
  lotId: string;
  quantityMilli: string;
  unit?: string;
  status: string;
  receiverOrganizationId: string;
  canReceive?: boolean;
  receipts?: Receipt[];
  receipt?: Receipt | null;
  canDirectReceive?: boolean;
  returns?: Return[];
  evidenceReference?: string;
  provenance?: string;
};
type Lot = {
  id: string;
  name: string;
  unit: string;
  lotReference: string;
  provenance: string;
  evidenceReference: string;
  receivedMilli: string;
  availableMilli: string;
  reservedMilli: string;
  issuedMilli: string;
  consumedMilli: string;
  damagedMilli: string;
  returnedMilli: string;
  quarantineMilli: string;
  movements: Movement[];
};
type InventoryView = {
  lots: Lot[];
  reservations: Reservation[];
  handovers: Handover[];
  receipts: (Receipt & { handoverId: string })[];
  returns: (Return & { handoverId: string })[];
};

export function InventoryWorkspace() {
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const [selected, select] = useState('');
  const organizations =
    context.data?.organizations.filter((org) =>
      org.permissions.some((p) => p === 'inventory.stock.read'),
    ) ?? [];
  const organization = organizations.find((org) => org.id === selected) ?? organizations[0];
  return (
    <Workspace
      title="Materials inventory"
      description="Recorded lots, reservations and custody. Pending and synthetic stock are never independently verified physical receipts."
    >
      <ResourceState {...context} retry={context.reload} />
      {organizations.length > 1 && (
        <label className="field">
          Stock organization
          <select value={organization?.id ?? ''} onChange={(event) => select(event.target.value)}>
            {organizations.map((org) => (
              <option value={org.id} key={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {organization ? (
        <OrganizationInventory key={organization.id} organization={organization} />
      ) : (
        !context.loading &&
        !context.error && (
          <p>
            No organization grants you inventory access. Ask your organization administrator for the
            appropriate scoped permission.
          </p>
        )
      )}
    </Workspace>
  );
}
function OrganizationInventory({
  organization,
}: {
  organization: IdentityContext['organizations'][number];
}) {
  const resource = useResource<InventoryView>(`${root}/organizations/${organization.id}`);
  const [registrationUnit, setRegistrationUnit] = useState<string>('METERS');
  const unitId = useId();
  const allowed = (permission: string) => organization.permissions.some((p) => p === permission);
  return (
    <>
      <h2>{organization.name}</h2>
      <ResourceState {...resource} retry={resource.reload} />
      {allowed('inventory.stock.register') && (
        <details>
          <summary>Register a material lot</summary>
          <ActionForm
            label="Register material lot"
            onSuccess={resource.reload}
            action={(form) =>
              post(`${root}/organizations/${organization.id}/lots`, {
                materialCode: text(form, 'materialCode'),
                name: text(form, 'name'),
                unit: text(form, 'unit'),
                lotReference: text(form, 'lotReference'),
                supplierReference: text(form, 'supplierReference'),
                evidenceReference: text(form, 'evidenceReference'),
                provenance: text(form, 'provenance'),
                quantityMilli: stockQuantityMilli(text(form, 'quantity'), text(form, 'unit')),
                ...(text(form, 'warehouse') ? { warehouse: text(form, 'warehouse') } : {}),
                ...(text(form, 'receivedAt')
                  ? { receivedAt: new Date(text(form, 'receivedAt')).toISOString() }
                  : {}),
              })
            }
          >
            <Input name="materialCode" label="Material identity code" required />
            <Input name="name" label="Material name" required />
            <label className="field" htmlFor={unitId}>
              Stock unit
              <NativeSelect
                id={unitId}
                name="unit"
                value={registrationUnit}
                onChange={(event) => setRegistrationUnit(event.target.value)}
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {humanize(unit)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Input name="lotReference" label="Lot reference" required />
            <Input name="supplierReference" label="Supplier reference" required />
            <Input name="warehouse" label="Warehouse or stock location" />
            <Input name="receivedAt" label="Reported stock receipt date" type="datetime-local" />
            <QuantityInput name="quantity" label="Received quantity" unit={registrationUnit} />
            <Select
              name="provenance"
              label="Evidence provenance"
              options={['PENDING_VERIFICATION', 'SYNTHETIC']}
            />
            <Input
              name="evidenceReference"
              label="Receipt evidence reference (operator reported)"
              required
            />
          </ActionForm>
        </details>
      )}
      {!resource.loading && !resource.error && !resource.data?.lots.length && (
        <p>No material lots recorded for this organization.</p>
      )}
      {resource.data?.lots.map((lot) => (
        <article
          key={lot.id}
          aria-label={`Material lot ${lot.lotReference}`}
          className="section-gap"
        >
          <h3>
            {lot.name} · {lot.lotReference}
          </h3>
          <p>
            Source: {humanize(lot.provenance)}. Evidence: {lot.evidenceReference}. Independent
            physical verification: unavailable.
          </p>
          <p>
            Received {quantity(lot.receivedMilli)} · Available {quantity(lot.availableMilli)} ·
            Reserved {quantity(lot.reservedMilli)} {humanize(lot.unit)}.
          </p>
          <p>
            Issued {quantity(lot.issuedMilli)} · Consumed {quantity(lot.consumedMilli)} · Damaged{' '}
            {quantity(lot.damagedMilli)} · Returned {quantity(lot.returnedMilli)} · Awaiting
            inspection {quantity(lot.quarantineMilli)}.
          </p>
          {allowed('inventory.stock.reserve') && (
            <ActionForm
              label={`Reserve ${lot.lotReference}`}
              action={(form) =>
                post(`${root}/lots/${lot.id}/reservations`, {
                  batchId: text(form, 'batchId'),
                  quantityMilli: stockQuantityMilli(text(form, 'quantity'), lot.unit),
                  unit: lot.unit,
                  reason: text(form, 'reason'),
                })
              }
              onSuccess={resource.reload}
            >
              <Input name="batchId" label="Approved production batch reference" required />
              <QuantityInput name="quantity" label="Quantity to reserve" unit={lot.unit} />
              <Input name="reason" label="Reservation reason" required />
            </ActionForm>
          )}
          <details>
            <summary>Stock movement history</summary>
            {lot.movements?.length ? (
              lot.movements.map((movement) => (
                <p key={movement.id}>
                  {humanize(movement.kind)} · {quantity(movement.quantityMilli)} · {movement.reason}{' '}
                  ·{' '}
                  {new Date(movement.createdAt).toLocaleString('en-GB', {
                    timeZone: 'Africa/Tunis',
                  })}
                </p>
              ))
            ) : (
              <p>No movements available.</p>
            )}
          </details>
        </article>
      ))}
      <h2>Reservations</h2>
      {!resource.loading && !resource.error && !resource.data?.reservations.length && (
        <p>No reservations.</p>
      )}
      {resource.data?.reservations.map((reservation) => (
        <article key={reservation.id}>
          <h3>Batch {reservation.batchId}</h3>
          <p>
            {quantity(reservation.quantityMilli)} reserved · {humanize(reservation.status)}
          </p>
          {['RESERVED', 'PARTIALLY_ISSUED'].includes(reservation.status) &&
            allowed('inventory.stock.reserve') && (
              <ActionForm
                label="Release unissued reservation"
                action={(form) =>
                  post(`${root}/reservations/${reservation.id}/release`, {
                    reason: text(form, 'reason'),
                  })
                }
                onSuccess={resource.reload}
              >
                <Input name="reason" label="Release reason" required />
              </ActionForm>
            )}
          {['RESERVED', 'PARTIALLY_ISSUED'].includes(reservation.status) &&
            allowed('inventory.stock.handover') && (
              <ActionForm
                label="Record outgoing handover"
                action={(form) =>
                  post(`${root}/reservations/${reservation.id}/handovers`, {
                    receiverOrganizationId: text(form, 'receiverOrganizationId'),
                    quantityMilli: stockQuantityMilli(
                      text(form, 'quantity'),
                      resource.data?.lots.find((lot) => lot.id === reservation.lotId)?.unit ??
                        'UNITS',
                    ),
                    evidenceReference: text(form, 'evidenceReference'),
                    occurredAt: new Date().toISOString(),
                  })
                }
                onSuccess={resource.reload}
              >
                <Input
                  name="receiverOrganizationId"
                  label="Receiving association reference"
                  required
                />
                <QuantityInput
                  name="quantity"
                  label="Handed over quantity"
                  unit={
                    resource.data?.lots.find((lot) => lot.id === reservation.lotId)?.unit ?? 'UNITS'
                  }
                />
                <Input
                  name="evidenceReference"
                  label="Sender handover evidence reference"
                  required
                />
              </ActionForm>
            )}
        </article>
      ))}
      <h2>Material custody and returns</h2>
      {!resource.loading && !resource.error && !resource.data?.handovers.length && (
        <p>No outgoing handovers.</p>
      )}
      {resource.data?.handovers.map((handover) => (
        <HandoverCard
          key={handover.id}
          handover={{
            ...handover,
            unit: resource.data?.lots.find((lot) => lot.id === handover.lotId)?.unit,
            receipts: resource.data?.receipts?.filter((row) => row.handoverId === handover.id),
            returns: resource.data?.returns?.filter((row) => row.handoverId === handover.id),
          }}
          reload={resource.reload}
          canReturn={allowed('inventory.stock.adjust')}
          canAdjust={allowed('inventory.stock.adjust')}
        />
      ))}
    </>
  );
}
export function MaterialReceipts() {
  const resource = useResource<{ items: Handover[] }>(`${root}/my-handovers`);
  const context = useResource<IdentityContext>('/api/v1/me/context');
  return (
    <Workspace
      title="Expected materials and receipts"
      description="Confirm materials you received or report shortages. A coordinator report remains attributed to the coordinator and does not impersonate an artisan."
    >
      <ResourceState {...resource} retry={resource.reload} />
      {!resource.loading && !resource.error && !resource.data?.items.length && (
        <p>No material handovers are assigned to you.</p>
      )}
      {resource.data?.items.map((handover) => (
        <HandoverCard
          key={handover.id}
          handover={{
            ...handover,
            canDirectReceive: Boolean(context.data?.linkedArtisanProfileId),
            receipts: handover.receipt ? [handover.receipt] : [],
          }}
          reload={resource.reload}
        />
      ))}
    </Workspace>
  );
}
function HandoverCard({
  handover,
  reload,
  canReturn = false,
  canAdjust = false,
}: {
  handover: Handover;
  reload: () => unknown;
  canReturn?: boolean;
  canAdjust?: boolean;
}) {
  return (
    <article aria-label={`Material handover ${handover.id}`} className="section-gap">
      <h3>Material handover · {humanize(handover.status)}</h3>
      <p>
        Expected {quantity(handover.quantityMilli)} {humanize(handover.unit ?? 'UNITS')}. Recipient
        organization {handover.receiverOrganizationId}.
      </p>
      <p>
        Sender evidence: {handover.evidenceReference ?? 'Not supplied'}. A recorded outgoing
        handover does not confirm receipt.
      </p>
      {handover.canReceive && !handover.receipts?.length && (
        <ActionForm
          label="Record material receipt or discrepancy"
          onSuccess={reload}
          action={(form) =>
            post(`${root}/handovers/${handover.id}/receipts`, {
              receivedMilli: stockQuantityMilli(
                text(form, 'receivedQuantity'),
                handover.unit ?? 'UNITS',
              ),
              damagedMilli: stockQuantityMilli(
                text(form, 'damagedQuantity'),
                handover.unit ?? 'UNITS',
              ),
              method: text(form, 'method'),
              evidenceReference: text(form, 'evidenceReference'),
              note: text(form, 'note'),
            })
          }
        >
          <QuantityInput
            name="receivedQuantity"
            label="Quantity received"
            unit={handover.unit ?? 'UNITS'}
          />
          <QuantityInput
            name="damagedQuantity"
            label="Damaged quantity"
            unit={handover.unit ?? 'UNITS'}
            value="0"
          />
          <Select
            name="method"
            label="Receipt reporting method"
            options={handover.canDirectReceive ? ['DIRECT'] : ['PHONE', 'IN_PERSON']}
          />
          <Input name="evidenceReference" label="Recipient evidence reference" required />
          <Input name="note" label="Receipt note or shortage description" required />
        </ActionForm>
      )}
      {handover.receipts?.map((receipt) => (
        <p key={receipt.id}>
          Receipt {humanize(receipt.verificationStatus)} · received{' '}
          {quantity(receipt.receivedMilli)} · damaged {quantity(receipt.damagedMilli)}.{' '}
          {receipt.note}
        </p>
      ))}
      {canAdjust && handover.status === 'DISCREPANCY_REPORTED' && (
        <ActionForm
          label="Reconcile reported material shortage"
          onSuccess={reload}
          action={(form) =>
            post(`${root}/handovers/${handover.id}/reconcile`, { reason: text(form, 'reason') })
          }
        >
          <p>
            This preserves the receipt discrepancy and segregates the recorded shortage. Replacement
            stock requires another reservation.
          </p>
          <Input name="reason" label="Shortage reconciliation reason" required />
        </ActionForm>
      )}
      {canAdjust && handover.receipts?.length && (
        <ActionForm
          label="Record material consumption"
          onSuccess={reload}
          action={(form) =>
            post(`${root}/handovers/${handover.id}/consumption`, {
              quantityMilli: stockQuantityMilli(text(form, 'quantity'), handover.unit ?? 'UNITS'),
              reason: text(form, 'reason'),
            })
          }
        >
          <QuantityInput
            name="quantity"
            label="Consumed quantity"
            unit={handover.unit ?? 'UNITS'}
          />
          <Input name="reason" label="Material consumption reason" required />
        </ActionForm>
      )}
      {canReturn && (
        <ActionForm
          label="Record returned materials"
          onSuccess={reload}
          action={(form) =>
            post(`${root}/handovers/${handover.id}/returns`, {
              quantityMilli: stockQuantityMilli(text(form, 'quantity'), handover.unit ?? 'UNITS'),
              condition: text(form, 'condition'),
              reason: text(form, 'reason'),
              evidenceReference: text(form, 'evidenceReference'),
            })
          }
        >
          <QuantityInput
            name="quantity"
            label="Returned quantity"
            unit={handover.unit ?? 'UNITS'}
          />
          <Select
            name="condition"
            label="Returned material condition"
            options={['UNUSED', 'DAMAGED', 'DEFECTIVE']}
          />
          <Input name="reason" label="Return reason" required />
          <Input name="evidenceReference" label="Return evidence" required />
        </ActionForm>
      )}
      {handover.returns?.map((returned) => (
        <div key={returned.id}>
          <p>
            Return {quantity(returned.quantityMilli)} · {humanize(returned.condition)} ·{' '}
            {humanize(returned.disposition ?? returned.status)}. Returned materials remain
            unavailable until disposition.
          </p>
          {canAdjust && returned.disposition === 'AWAITING_INSPECTION' && (
            <ActionForm
              label="Record inspected return disposition"
              onSuccess={reload}
              action={(form) =>
                post(`${root}/returns/${returned.id}/disposition`, {
                  disposition: text(form, 'disposition'),
                  reason: text(form, 'reason'),
                })
              }
            >
              <Select
                name="disposition"
                label="Inspected disposition"
                options={['DAMAGED', 'RESTOCK']}
              />
              <Input name="reason" label="Inspection and disposition reason" required />
            </ActionForm>
          )}
        </div>
      ))}
    </article>
  );
}

function QuantityInput({
  name,
  label,
  unit,
  value,
}: {
  name: string;
  label: string;
  unit: string;
  value?: string;
}) {
  return (
    <div>
      <Input name={name} label={label} value={value} required />
      <p className="field-hint">
        {humanize(unit)} ·{' '}
        {unit === 'METERS'
          ? 'Up to three decimal places, for example 1.250.'
          : 'Whole quantities only.'}
      </p>
    </div>
  );
}
