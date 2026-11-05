import { z } from 'zod';
import { materialUnits } from './execution.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const text = z.string().trim().min(1).max(1000);
export const stockQuantitySchema = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
const positive = stockQuantitySchema.refine(
  (value) => /^(0|[1-9][0-9]{0,11})$/.test(value) && BigInt(value) > 0n,
  'Quantity must be positive.',
);
const unit = z.enum(materialUnits);
export const materialLotSchema = z
  .object({
    materialCode: z.string().regex(/^[a-z0-9-]{2,40}$/),
    name: text,
    unit,
    lotReference: text,
    supplierReference: text,
    evidenceReference: text,
    provenance: z.enum(['SYNTHETIC', 'PENDING_VERIFICATION']),
    quantityMilli: positive,
    receivedAt: z.iso.datetime().optional(),
    warehouse: text.optional(),
  })
  .strict();
export const materialReservationSchema = z
  .object({ batchId: id, quantityMilli: positive, unit, reason: text })
  .strict();
export const inventoryReasonSchema = z.object({ reason: text }).strict();
export const materialHandoverSchema = z
  .object({
    receiverOrganizationId: id,
    quantityMilli: positive,
    evidenceReference: text,
    occurredAt: z.iso.datetime(),
  })
  .strict();
export const materialReceiptSchema = z
  .object({
    receivedMilli: stockQuantitySchema,
    damagedMilli: stockQuantitySchema,
    method: z.enum(['DIRECT', 'PHONE', 'IN_PERSON']),
    evidenceReference: text,
    note: text,
  })
  .strict();
export const materialReturnSchema = z
  .object({
    quantityMilli: positive,
    condition: z.enum(['DAMAGED', 'UNUSED', 'DEFECTIVE']),
    reason: text,
    evidenceReference: text,
  })
  .strict();
export const materialDispositionSchema = z
  .object({ disposition: z.enum(['RESTOCK', 'DAMAGED']), reason: text })
  .strict();
export const materialConsumptionSchema = z
  .object({ quantityMilli: positive, reason: text })
  .strict();
export type MaterialLotInput = z.infer<typeof materialLotSchema>;
export type MaterialReservationInput = z.infer<typeof materialReservationSchema>;
export type MaterialHandoverInput = z.infer<typeof materialHandoverSchema>;
export type MaterialReceiptInput = z.infer<typeof materialReceiptSchema>;
export type MaterialReturnInput = z.infer<typeof materialReturnSchema>;
export type MaterialDispositionInput = z.infer<typeof materialDispositionSchema>;
export type MaterialConsumptionInput = z.infer<typeof materialConsumptionSchema>;
// All stock buckets are integer thousandths. Returned is cumulative; quarantine is current.
export function stockInvariant(stock: {
  receivedMilli: bigint;
  availableMilli: bigint;
  reservedMilli: bigint;
  issuedMilli: bigint;
  consumedMilli: bigint;
  damagedMilli: bigint;
  quarantineMilli: bigint;
}) {
  return (
    Object.values(stock).every((value) => value >= 0n) &&
    stock.receivedMilli ===
      stock.availableMilli +
        stock.reservedMilli +
        stock.issuedMilli +
        stock.consumedMilli +
        stock.damagedMilli +
        stock.quarantineMilli
  );
}
