import { z } from 'zod';

const resourceId = z.string().min(1).max(128);

export const marketOrderStatuses = [
  'SENT',
  'AWAITING_APPROVAL',
  'WORKING',
  'AT_NASJ',
  'ON_THE_WAY',
  'DELIVERED',
  'CANCELLED',
] as const;
export type MarketOrderStatus = (typeof marketOrderStatuses)[number];
export type MarketPriceStatus =
  | 'NOT_NEEDED'
  | 'WAITING_FOR_ASSOCIATION'
  | 'FINANCE_REVIEW'
  | 'COMPANY_REVIEW'
  | 'ACCEPTED';
export type MarketQualityStatus = 'NOT_CHECKED' | 'PASSED' | 'FAILED';

// Standard rates, kept in one place so an accountant can correct them.
export const MARKET_TVA_PERCENT = 19n;
export const MARKET_STAMP_MILLIMES = 1000n;
// Below this share of the price, finance sees a warning. A starting point to confirm with the team.
export const MARKET_MIN_ARTISAN_SHARE_PERCENT = 40n;
export function marketTotals(subtotal: bigint) {
  const tva = (subtotal * MARKET_TVA_PERCENT + 50n) / 100n;
  const stamp = subtotal > 0n ? MARKET_STAMP_MILLIMES : 0n;
  return { subtotal, tva, stamp, total: subtotal + tva + stamp };
}

const tnd = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/, 'Enter an amount in dinars, like 45 or 45.500.');
const note = z.string().trim().max(1000);
const requiredNote = z.string().trim().min(3).max(1000);
const quantity = z.coerce.number().int().min(1).max(100000);
const leadTime = z.coerce.number().int().min(1).max(365);
const phone = z.string().trim().min(6).max(30);
const imageLink = z
  .string()
  .trim()
  .url('Use a full image link starting with https://')
  .max(1000)
  .startsWith('https://', 'Use a full image link starting with https://');

// Files travel as base64 JSON, the same way procurement attachments do. 5.4M chars is about 4 MB.
export const marketFileSchema = z
  .object({
    purpose: z.enum(['PRODUCT_IMAGE', 'ORDER_PHOTO', 'ORG_PROOF', 'PAYMENT_PROOF']),
    organizationId: resourceId,
    filename: z.string().trim().min(1).max(120),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
    base64: z
      .string()
      .min(4)
      .max(5_400_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type MarketFileInput = z.infer<typeof marketFileSchema>;

const productFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(1000),
  craft: z.string().trim().min(2).max(60),
  price: tnd,
  artisanPay: tnd,
  leadTimeDays: leadTime,
  minQuantity: quantity,
  imageUrl: imageLink.optional(),
};
export const marketProductCreateSchema = z
  .object({ ...productFields, imageFileId: resourceId.optional() })
  .strict();
export type MarketProductCreate = z.infer<typeof marketProductCreateSchema>;
export const marketProductImportSchema = z
  .object({ rows: z.array(z.object(productFields).strict()).min(1).max(200) })
  .strict();
export type MarketProductImport = z.infer<typeof marketProductImportSchema>;
export const marketReviewSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), note })
  .strict()
  .refine((input) => input.decision === 'APPROVE' || input.note.length >= 3, {
    path: ['note'],
    message: 'Explain what needs to change.',
  });
export type MarketReview = z.infer<typeof marketReviewSchema>;

export const marketBillingSchema = z
  .object({
    legalName: z.string().trim().min(2).max(160),
    taxId: z.string().trim().min(3).max(40),
    billingAddress: z.string().trim().min(5).max(300),
    shippingAddress: z.string().trim().min(5).max(300),
    contactName: z.string().trim().min(2).max(120),
    contactPhone: phone,
    paymentMethod: z.enum(['DHMAD', 'BANK_TRANSFER']),
  })
  .strict();
export type MarketBilling = z.infer<typeof marketBillingSchema>;

export const marketCartSetSchema = z
  .object({ quantity: z.number().int().min(0).max(100000) })
  .strict();
export const marketCheckoutSchema = z
  .object({ note, neededBy: z.string().date().optional() })
  .strict();
export type MarketCheckout = z.infer<typeof marketCheckoutSchema>;
export const marketCustomOrderSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(2000),
    quantity,
    neededBy: z.string().date().optional(),
    photoFileId: resourceId,
  })
  .strict();
export type MarketCustomOrder = z.infer<typeof marketCustomOrderSchema>;
export const marketRouteSchema = z.object({ associationId: resourceId, note }).strict();
export const marketPriceSchema = z.object({ total: tnd, artisanPay: tnd, note }).strict();
export const marketPriceDecisionSchema = z
  .object({ decision: z.enum(['ACCEPT', 'REFUSE']), note })
  .strict();
export const marketAssignSchema = z
  .object({
    artisanIds: z.array(resourceId).min(1, 'Choose at least one artisane.').max(50),
    estimatedFinish: z.string().date(),
    note,
  })
  .strict();
export const marketDeliverySchema = z
  .object({
    carrier: z.string().trim().min(2).max(120),
    driverName: z.string().trim().min(2).max(120),
    driverPhone: phone,
    expectedOn: z.string().date(),
    tracking: z.string().trim().max(80).optional(),
  })
  .strict();
export type MarketDelivery = z.infer<typeof marketDeliverySchema>;
export const marketRatingSchema = z
  .object({
    stars: z.number().int().min(1).max(5),
    qualityStars: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000),
  })
  .strict();
export type MarketRating = z.infer<typeof marketRatingSchema>;
export const marketPaymentSchema = z.object({ proofFileId: resourceId }).strict();
export const marketReasonSchema = z.object({ reason: requiredNote }).strict();
export const marketNoteSchema = z.object({ note }).strict();
export const marketQualitySchema = z
  .object({ passed: z.boolean(), note })
  .strict()
  .refine((input) => input.passed || input.note.length >= 3, {
    path: ['note'],
    message: 'Explain what failed so the association can fix it.',
  });
export const marketProductQuerySchema = z
  .object({ q: z.string().trim().max(80).optional(), craft: z.string().trim().max(60).optional() })
  .strict();
export const marketOrgQuerySchema = z
  .object({ status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']).default('PENDING_REVIEW') })
  .strict();
export const marketWomanSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    region: z.string().trim().min(1).max(120),
    idNumber: z.string().trim().min(4).max(40),
    phone: z.string().trim().max(30),
    craftIds: z.array(resourceId).max(20),
    agreed: z.literal(true, { message: 'Confirm that she agreed before adding her.' }),
  })
  .strict();
export type MarketWoman = z.infer<typeof marketWomanSchema>;

export type MarketProductView = {
  id: string;
  name: string;
  description: string;
  craft: string;
  price: string;
  artisanPay?: string;
  leadTimeDays: number;
  minQuantity: number;
  imageUrl: string;
  associationId?: string;
  associationName?: string;
  associationRegion?: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  reviewNote: string | null;
};
export type MarketTotalsView = { subtotal: string; tva: string; stamp: string; total: string };
export type MarketCartView = {
  lines: { product: MarketProductView; quantity: number; lineTotal: string }[];
  totals: MarketTotalsView;
  deliveries: number;
  billing: MarketBilling | null;
};
export type MarketOrderView = {
  id: string;
  code: string;
  kind: 'CATALOG' | 'CUSTOM';
  status: MarketOrderStatus;
  title: string;
  description: string | null;
  note: string | null;
  neededBy: string | null;
  photoUrl: string | null;
  quantity: number;
  buyerName: string;
  associationId?: string | null;
  associationName?: string | null;
  totals: MarketTotalsView | null;
  artisanPay?: string | null;
  priceStatus: MarketPriceStatus;
  qualityStatus: MarketQualityStatus;
  invoiceCheckedAt?: string | null;
  invoiceAvailable: boolean;
  invoiceFinal: boolean;
  billing?: MarketBilling | null;
  acceptedAt?: string | null;
  assignedAt?: string | null;
  almostReadyAt?: string | null;
  estimatedFinish: string | null;
  associationDelivery?: MarketDelivery | null;
  nasjDelivery: MarketDelivery | null;
  packed: boolean;
  items: {
    id: string;
    name: string;
    imageUrl: string;
    quantity: number;
    unitPrice: string;
    unitPay?: string;
  }[];
  women?: {
    id: string;
    name: string;
    pay: string;
    paidRecorded: boolean;
    paymentChecked: boolean;
    proofUrl: string | null;
  }[];
  ratings: {
    role: 'COMPANY' | 'ASSOCIATION';
    stars: number;
    qualityStars: number | null;
    comment: string;
  }[];
  canRate: boolean;
  events: {
    id: string;
    status: MarketOrderStatus;
    title: string;
    note: string | null;
    actor: string;
    at: string;
  }[];
  createdAt: string;
};
export type MarketWomanView = {
  id: string;
  name: string;
  region: string;
  idNumber: string;
  phone: string;
  skills: string[];
  craftIds: string[];
  activeOrders: number;
  owed: string;
  paid: string;
};
export type MarketPaymentView = {
  orderId: string;
  code: string;
  associationName: string;
  artisanId: string;
  artisanName: string;
  pay: string;
  paidRecorded: boolean;
  paymentChecked: boolean;
  proofUrl: string | null;
};
export type MarketOrganizationView = {
  id: string;
  name: string;
  type: string;
  region: string;
  description: string;
  representativeName: string;
  contactEmail: string;
  contactPhone: string | null;
  approvalStatus: string;
  approvalReason: string | null;
  createdAt: string;
  proof: { id: string; filename: string; url: string } | null;
  people: { name: string; email: string; manager: boolean }[];
};
export type MarketTrackView = {
  title: string;
  craft: string | null;
  status: MarketOrderStatus;
  madeBy: string;
};
export type MarketAssociationOption = {
  id: string;
  name: string;
  region: string;
  crafts: string[];
  rating: number | null;
};
export type MarketCounts = {
  requests: number;
  finance: number;
  organizations: number;
  orders: number;
  cart: number;
};
export type MarketNotificationsView = {
  unread: number;
  items: { id: string; title: string; link: string; at: string; unread: boolean }[];
};
