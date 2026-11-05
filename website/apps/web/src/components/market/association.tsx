'use client';
import { FileSpreadsheet, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  IdentityContext,
  MarketProductImport,
  MarketProductView,
  MarketWomanView,
} from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Modal } from '../ui/modal';
import { Textarea } from '../ui/textarea';
import { ActionForm, Input, ResourceState, Workspace, text, useResource } from '../workspace-ui';
import { FileField, ModalAction, ProductImage, chosenFile, imagePayload, money } from './market-ui';
import styles from './market.module.css';

const columns = [
  'name',
  'description',
  'craft',
  'price',
  'artisan_pay',
  'lead_time_days',
  'min_quantity',
  'image_url',
] as const;
const template = `${columns.join(',')}\nEmbroidered table runner,"Cotton runner, 40 x 150 cm",Embroidery,85,48,14,5,https://example.com/photo.jpg\n`;
type Row = MarketProductImport['rows'][number];

// Handles quoted cells, so descriptions may contain commas.
function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
async function readSheet(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const { default: readXlsx } = await import('read-excel-file/browser');
    const sheets = await readXlsx(file);
    const sheet = (sheets[0]?.data ?? []) as unknown[][];
    return sheet.map((line) => line.map((value) => (value === null ? '' : String(value))));
  }
  return parseCsv((await file.text()).replace(/^﻿/, ''));
}
function rowsFromSheet(table: string[][]): Row[] {
  const [head, ...lines] = table.filter((line) => line.some((value) => value.trim()));
  const names = head?.map((name) => name.trim().toLowerCase()) ?? [];
  const missing = columns.filter((column) => column !== 'image_url' && !names.includes(column));
  if (missing.length) throw new Error(`This sheet is missing: ${missing.join(', ')}.`);
  if (!lines.length) throw new Error('This sheet has no products in it.');
  return lines.map((line) => {
    const cell = (column: (typeof columns)[number]) => line[names.indexOf(column)]?.trim() ?? '';
    const imageUrl = cell('image_url');
    return {
      name: cell('name'),
      description: cell('description'),
      craft: cell('craft'),
      price: cell('price').replace(',', '.'),
      artisanPay: cell('artisan_pay').replace(',', '.'),
      leadTimeDays: Number(cell('lead_time_days')),
      minQuantity: Number(cell('min_quantity')),
      ...(imageUrl ? { imageUrl } : {}),
    };
  });
}

const statusText = {
  PENDING_REVIEW: 'Waiting for NASJ finance',
  APPROVED: 'In the catalog',
  REJECTED: 'Needs changes',
  ARCHIVED: 'Removed',
};

function ProductFields({ product }: { product?: MarketProductView }) {
  const local = product?.imageUrl.startsWith('https://') ? product.imageUrl : '';
  return (
    <>
      <Input name="name" label="Product name" value={product?.name} required />
      <div className="field">
        <Label htmlFor="product-description">Description</Label>
        <Textarea
          id="product-description"
          name="description"
          rows={3}
          defaultValue={product?.description}
          required
        />
      </div>
      <Input name="craft" label="Craft" value={product?.craft} required />
      <FileField
        name="image"
        label="Photo"
        accept="image/png,image/jpeg,image/webp"
        hint="Upload a photo, or paste a public link below. Without either we use a default picture."
      />
      <Input name="imageUrl" label="Or a public photo link" type="url" value={local} />
      <Input
        name="price"
        label="Price per piece, excl. tax (TND)"
        value={product?.price}
        required
      />
      <Input
        name="artisanPay"
        label="Artisanes' pay per piece (TND)"
        value={product?.artisanPay}
        required
      />
      <Input
        name="leadTimeDays"
        label="Days to make an order"
        type="number"
        min="1"
        value={product?.leadTimeDays}
        required
      />
      <Input
        name="minQuantity"
        label="Minimum quantity"
        type="number"
        min="1"
        value={product?.minQuantity ?? 1}
        required
      />
    </>
  );
}
async function productBody(data: FormData, organizationId: string | null | undefined) {
  if (!organizationId) throw new Error('An approved association account is required.');
  const file = chosenFile(data, 'image');
  const image = file
    ? await apiFetch<{ id: string }>('/api/v1/market/files', {
        method: 'POST',
        body: { purpose: 'PRODUCT_IMAGE', organizationId, ...(await imagePayload(file)) },
      })
    : null;
  const imageUrl = text(data, 'imageUrl');
  return {
    name: text(data, 'name'),
    description: text(data, 'description'),
    craft: text(data, 'craft'),
    price: text(data, 'price'),
    artisanPay: text(data, 'artisanPay'),
    leadTimeDays: Number(text(data, 'leadTimeDays')),
    minQuantity: Number(text(data, 'minQuantity')),
    ...(image ? { imageFileId: image.id } : imageUrl ? { imageUrl } : {}),
  };
}

function SheetButton({ onDone }: { onDone: () => unknown }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<{ rows: Row[] } | null>(null);
  const [error, setError] = useState('');
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet size={16} aria-hidden="true" />
        Upload a sheet
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Upload a sheet"
        description="Use an Excel (.xlsx) or CSV file. Add a public photo link for each product, or we use a default picture."
      >
        <p>
          <a
            download="nasj-products.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
          >
            Download the template
          </a>
        </p>
        <div className={styles.fileField}>
          <label htmlFor="product-sheet">Your sheet</label>
          <input
            id="product-sheet"
            type="file"
            accept=".csv,.xlsx,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setSheet(null);
              setError('');
              if (!file) return;
              try {
                setSheet({ rows: rowsFromSheet(await readSheet(file)) });
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : 'This sheet could not be read.',
                );
              }
            }}
          />
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {sheet && (
          <ActionForm
            label={`Import ${sheet.rows.length} products`}
            successMessage="Imported. NASJ finance will review the prices."
            onSuccess={async () => {
              setSheet(null);
              setOpen(false);
              await onDone();
            }}
            action={() =>
              apiFetch('/api/v1/market/products/import', {
                method: 'POST',
                body: { rows: sheet.rows },
              })
            }
          >
            <ul className={styles.muted}>
              {sheet.rows.slice(0, 5).map((row) => (
                <li key={row.name}>
                  {row.name}: {row.price} TND
                </li>
              ))}
              {sheet.rows.length > 5 && <li>and {sheet.rows.length - 5} more</li>}
            </ul>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}

export function AssociationProducts() {
  const products = useResource<MarketProductView[]>('/api/v1/market/products/mine');
  const context = useResource<IdentityContext>('/api/v1/me/context');
  const organizationId = context.data?.coordinatorOrganizationId;
  return (
    <Workspace
      title="Your products"
      description="Everything your association can make. NASJ finance checks each price and the artisanes' pay before it appears in the catalog."
      actions={
        <div className={styles.actions}>
          <SheetButton onDone={products.reload} />
          <ModalAction
            label={
              <>
                <Plus size={16} aria-hidden="true" />
                Add product
              </>
            }
            title="Add a product"
            submitLabel="Add product"
            successMessage="Added. NASJ finance will review the price."
            onSuccess={products.reload}
            action={async (data) =>
              apiFetch('/api/v1/market/products', {
                method: 'POST',
                body: await productBody(data, organizationId),
              })
            }
          >
            <ProductFields />
          </ModalAction>
        </div>
      }
    >
      <ResourceState {...products} retry={products.reload} />
      {products.data?.length === 0 && (
        <div className={styles.empty}>
          <p>You have no products yet. Add your first one above.</p>
        </div>
      )}
      {products.data && products.data.length > 0 && (
        <div className={`panel ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Photo</th>
                <th scope="col">Product</th>
                <th scope="col">Price</th>
                <th scope="col">Artisanes' pay</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Manage</span>
                  <MoreHorizontal size={16} aria-hidden="true" />
                </th>
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
                    <p className={styles.muted}>{product.craft}</p>
                  </td>
                  <td>{money(product.price)}</td>
                  <td>{money(product.artisanPay)}</td>
                  <td>
                    {statusText[product.status]}
                    {product.reviewNote && <p className={styles.muted}>{product.reviewNote}</p>}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <ModalAction
                        label={<Pencil size={16} aria-label={`Edit ${product.name}`} />}
                        variant="outline"
                        title={`Edit ${product.name}`}
                        description="Your changes go back to NASJ finance before they appear in the catalog."
                        submitLabel="Save changes"
                        successMessage="Saved. NASJ finance will review it."
                        onSuccess={products.reload}
                        action={async (data) =>
                          apiFetch(`/api/v1/market/products/${product.id}`, {
                            method: 'PUT',
                            body: await productBody(data, organizationId),
                          })
                        }
                      >
                        <ProductFields product={product} />
                      </ModalAction>
                      <ModalAction
                        label={<Trash2 size={16} aria-label={`Remove ${product.name}`} />}
                        variant="outline"
                        title={`Remove ${product.name}?`}
                        description="It leaves the catalog. Past orders keep their records."
                        submitLabel="Remove product"
                        successMessage="Product removed."
                        onSuccess={products.reload}
                        action={() =>
                          apiFetch(`/api/v1/market/products/${product.id}/archive`, {
                            method: 'POST',
                          })
                        }
                      />
                    </div>
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

type Craft = { id: string; name: string };
function ArtisaneFields({ crafts, woman }: { crafts: Craft[]; woman?: MarketWomanView }) {
  return (
    <>
      <Input name="name" label="Full name" value={woman?.name} required />
      <Input name="idNumber" label="ID number" value={woman?.idNumber} required />
      <Input name="phone" label="Phone (optional)" type="tel" value={woman?.phone} />
      <Input name="region" label="Region" value={woman?.region} required />
      <p className={styles.muted}>What can she make?</p>
      <div className={styles.choiceList}>
        {crafts.map((craft) => (
          <label key={craft.id}>
            <input
              type="checkbox"
              name="craftIds"
              value={craft.id}
              defaultChecked={woman?.craftIds.includes(craft.id)}
            />
            <span>{craft.name}</span>
          </label>
        ))}
      </div>
      <div className={styles.choiceList}>
        <label>
          <input type="checkbox" name="agreed" required defaultChecked={Boolean(woman)} />
          <span>She agreed to work with us and to have these details recorded.</span>
        </label>
      </div>
    </>
  );
}
const artisaneBody = (data: FormData) => ({
  name: text(data, 'name'),
  idNumber: text(data, 'idNumber'),
  phone: text(data, 'phone'),
  region: text(data, 'region'),
  craftIds: data.getAll('craftIds').map(String),
  agreed: data.get('agreed') === 'on',
});

export function AssociationArtisanes() {
  const women = useResource<MarketWomanView[]>('/api/v1/market/women');
  const crafts = useResource<Craft[]>('/api/v1/market/crafts');
  return (
    <Workspace
      title="Artisanes"
      description="The women who work with your association, what each one can make, and what they are owed."
      actions={
        crafts.data && (
          <ModalAction
            label={
              <>
                <Plus size={16} aria-hidden="true" />
                Add artisane
              </>
            }
            title="Add an artisane"
            submitLabel="Add artisane"
            successMessage="Added."
            onSuccess={women.reload}
            action={(data) =>
              apiFetch('/api/v1/market/women', { method: 'POST', body: artisaneBody(data) })
            }
          >
            <ArtisaneFields crafts={crafts.data} />
          </ModalAction>
        )
      }
    >
      <ResourceState {...women} retry={women.reload} />
      {women.data?.length === 0 && (
        <div className={styles.empty}>
          <p>Nobody yet. Add your first artisane above.</p>
        </div>
      )}
      {women.data && women.data.length > 0 && (
        <div className={`panel ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">ID</th>
                <th scope="col">Region</th>
                <th scope="col">Can make</th>
                <th scope="col">Active orders</th>
                <th scope="col">Owed</th>
                <th scope="col">Paid</th>
                <th scope="col">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {women.data.map((woman) => (
                <tr key={woman.id}>
                  <td>{woman.name}</td>
                  <td>{woman.idNumber || 'Not set'}</td>
                  <td>{woman.region}</td>
                  <td>{woman.skills.join(', ') || 'Not set'}</td>
                  <td>{woman.activeOrders}</td>
                  <td>{money(woman.owed)}</td>
                  <td>{money(woman.paid)}</td>
                  <td>
                    {crafts.data && (
                      <ModalAction
                        label={<Pencil size={16} aria-label={`Edit ${woman.name}`} />}
                        variant="outline"
                        title={`Edit ${woman.name}`}
                        submitLabel="Save changes"
                        successMessage="Saved."
                        onSuccess={women.reload}
                        action={(data) =>
                          apiFetch(`/api/v1/market/women/${woman.id}`, {
                            method: 'PUT',
                            body: artisaneBody(data),
                          })
                        }
                      >
                        <ArtisaneFields crafts={crafts.data} woman={woman} />
                      </ModalAction>
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
