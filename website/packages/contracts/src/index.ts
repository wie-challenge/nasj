import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const nameSchema = z.string().trim().min(2).max(120);
export const passwordSchema = z.string().min(12).max(128);
export const roleSchema = z.enum(['USER', 'ADMIN']);
export const statusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']);
export const registerSchema = z
  .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
  .strict();
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const emailRequestSchema = z.object({ email: emailSchema }).strict();
export const resetPasswordSchema = z
  .object({ token: z.string().min(1).max(2048), newPassword: passwordSchema })
  .strict();
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    revokeOtherSessions: z.literal(true).default(true),
  })
  .strict();
export const profileSchema = z.object({ name: nameSchema }).strict();
export const emptySchema = z.object({}).strict();
export const deactivateSchema = z.object({ confirmation: z.literal('DEACTIVATE') }).strict();
export const accountUpdateSchema = z
  .object({ role: roleSchema.optional(), status: statusSchema.optional() })
  .strict()
  .refine((value) => value.role || value.status, 'Choose an account change.');
export const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().max(120).default(''),
  })
  .strict();
export const resourceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const userViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: roleSchema,
  status: statusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserView = z.infer<typeof userViewSchema>;
export type PageInput = z.infer<typeof pageSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type MeView = {
  user: UserView;
  session: { id: string; createdAt: string; expiresAt: string };
  csrfToken: string;
};
export type SessionView = { id: string; createdAt: string; expiresAt: string; current: boolean };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ApiFailure = {
  code: string;
  message: string;
  requestId?: string;
  fieldErrors?: Record<string, string[]>;
};

export * from './permissions.js';
export * from './organizations.js';
export * from './artisans.js';
export * from './capacity.js';
export * from './directory.js';
export * from './governance.js';

export * from './domain.js';
export * from './commerce/domain.js';
export * from './commerce/contracts.js';
export * from './commerce/metrics.js';
export * from './commerce/catalog.js';

export * from './foundation.js';

export * from './procurement.js';
export * from './commercial.js';
export * from './eligibility.js';
export * from './planning.js';
export * from './catalog.js';
export * from './intelligence.js';
export * from './collaboration.js';
export * from './execution.js';
export * from './logistics.js';
export * from './inventory.js';

export * from './finance.js';

export * from './provenance.js';
export * from './demo.js';

export * from './scenario-finance.js';

export * from './batch12.js';
export * from './market.js';
