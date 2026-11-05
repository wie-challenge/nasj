import { z } from 'zod';
const language = z.enum(['en', 'fr', 'ar']);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const settingsSchema = z.object({ preferredLanguage: language }).strict();
export const notificationCategorySchema = z.enum([
  'PRODUCT_UPDATES',
  'OPPORTUNITIES',
  'SUPPORT_UPDATES',
]);
export const notificationPreferencesSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            category: notificationCategorySchema,
            language,
            channel: z.literal('EMAIL'),
            optedIn: z.boolean(),
          })
          .strict(),
      )
      .max(3),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.category)).size === v.items.length,
    'Choose each category once.',
  );
export const privacyCreateSchema = z
  .object({
    type: z.enum(['EXPORT', 'CORRECTION', 'DELETION']),
    details: z.string().trim().min(5).max(3000),
  })
  .strict();
export const privacyReviewSchema = z
  .object({
    status: z.enum(['IN_REVIEW', 'RESOLVED', 'REJECTED']),
    resolutionNotes: z.string().trim().min(5).max(3000),
    retentionExceptions: z.string().trim().max(3000).default(''),
  })
  .strict();
export const supportCreateSchema = z
  .object({
    subject: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(5000),
    organizationId: id.optional(),
  })
  .strict();
export const supportUpdateSchema = z
  .object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
    resolution: z.string().trim().max(3000).optional(),
    assignedToUserId: id.nullable().optional(),
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine(
    (v) => v.status !== 'RESOLVED' || Boolean(v.resolution && v.resolution.length >= 5),
    'Provide a resolution before closing the case.',
  );
export const consentCreateSchema = z
  .object({
    purpose: z.enum(['PROFILE_PROCESSING', 'CONTACT_SHARING', 'MARKETING']),
    policyVersion: z.literal('2026-10'),
    decision: z.boolean(),
  })
  .strict();
export type SettingsInput = z.infer<typeof settingsSchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type PrivacyCreateInput = z.infer<typeof privacyCreateSchema>;
export type PrivacyReviewInput = z.infer<typeof privacyReviewSchema>;
export type SupportCreateInput = z.infer<typeof supportCreateSchema>;
export type SupportUpdateInput = z.infer<typeof supportUpdateSchema>;
export type ConsentCreateInput = z.infer<typeof consentCreateSchema>;
export type PrivacyRequestView = {
  id: string;
  userId: string;
  type: 'EXPORT' | 'CORRECTION' | 'DELETION';
  status: 'SUBMITTED' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  details: string;
  submittedAt: string;
  assignedReviewerId: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  retentionExceptions: string | null;
};
export type SupportCaseView = {
  id: string;
  userId: string;
  organizationId: string | null;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assignedToUserId: string | null;
  resolution: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};
export type NotificationPreferenceView = {
  category: z.infer<typeof notificationCategorySchema>;
  language: 'en' | 'fr' | 'ar';
  channel: 'EMAIL';
  optedIn: boolean;
};
export type ConsentView = {
  id: string;
  purpose: string;
  policyVersion: string;
  decision: boolean;
  collectedAt: string;
  withdrawnAt: string | null;
  collectionContext: string;
};
export type AuditEventView = {
  id: string;
  actorId: string;
  targetType: string;
  targetId: string;
  organizationId: string | null;
  action: string;
  timestamp: string;
  correlationId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
};
export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
