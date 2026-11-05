import { z } from 'zod';
import { businessRoles, type BusinessRole } from './permissions.js';

export const organizationTypeSchema = z.enum([
  'BUYER_BUSINESS',
  'ASSOCIATION',
  'PARTNER_COOPERATIVE',
  'INTERNAL',
]);
export const organizationApprovalSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
]);
export const businessRoleSchema = z.enum(businessRoles);
export const membershipStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED', 'LEFT']);
const contactEmail = z.string().trim().toLowerCase().email().max(254);
const organizationFields = {
  name: z.string().trim().min(2).max(160),
  representativeName: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(80),
  region: z.string().trim().min(1).max(120),
  description: z.string().trim().min(10).max(3000),
  contactEmail,
  contactPhone: z.string().trim().max(40),
};
export const organizationCreateSchema = z
  .object({
    ...organizationFields,
    country: organizationFields.country.default('TN'),
    contactPhone: organizationFields.contactPhone.default(''),
    type: organizationTypeSchema,
  })
  .strict();
export const organizationUpdateSchema = z
  .object(organizationFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, 'Choose an organization change.');
export const invitationCreateSchema = z
  .object({
    email: contactEmail,
    roles: z
      .array(businessRoleSchema)
      .max(13)
      .refine((roles) => new Set(roles).size === roles.length, 'Duplicate roles are not allowed.'),
    isManager: z.boolean().default(false),
  })
  .strict()
  .refine(
    (input) => input.roles.length > 0 || input.isManager,
    'Choose a role or organization manager access.',
  );
export const invitationAcceptSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const membershipUpdateSchema = z
  .object({
    status: membershipStatusSchema.optional(),
    isManager: z.boolean().optional(),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict()
  .refine(
    (input) => input.status !== undefined || input.isManager !== undefined,
    'Choose a membership change.',
  );
export const membershipRolesSchema = z
  .object({
    roles: z
      .array(businessRoleSchema)
      .max(13)
      .refine((roles) => new Set(roles).size === roles.length, 'Duplicate roles are not allowed.'),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export const organizationReviewSchema = z
  .object({ reason: z.string().trim().min(5).max(1000) })
  .strict();
export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type InvitationCreateInput = z.infer<typeof invitationCreateSchema>;
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;
export type MembershipRolesInput = z.infer<typeof membershipRolesSchema>;
export type OrganizationView = {
  id: string;
  name: string;
  slug: string;
  type: z.infer<typeof organizationTypeSchema>;
  approvalStatus: z.infer<typeof organizationApprovalSchema>;
  country: string;
  region: string;
  description: string;
  contactEmail: string;
  contactPhone: string | null;
  representativeName: string;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type MembershipView = {
  id: string;
  userId: string;
  organizationId: string;
  status: z.infer<typeof membershipStatusSchema>;
  isManager: boolean;
  explicitPermissions?: string[];
  roles: BusinessRole[];
  joinedAt: string | null;
};
export type OrganizationMembershipView = OrganizationView & { myMembership: MembershipView };
export type OrganizationMemberView = MembershipView & {
  user: { id: string; name: string; email: string; status: string };
};
export type InvitationView = {
  id: string;
  organizationId: string;
  email: string;
  roles: BusinessRole[];
  isManager: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type OrganizationListView = Pick<
  OrganizationView,
  'id' | 'name' | 'slug' | 'type' | 'approvalStatus'
> & { myMembership: MembershipView };
