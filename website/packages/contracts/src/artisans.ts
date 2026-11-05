import { z } from 'zod';
import { capacityFields, validCapacityPeriod, type CapacitySummary } from './capacity.js';

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().trim();
export const languageSchema = z.enum(['fr', 'ar', 'en']);
export const contactVisibilitySchema = z.enum(['PRIVATE', 'ASSOCIATION', 'PUBLIC']);
export const availabilitySchema = z.enum(['AVAILABLE', 'PAUSED']);
export const artisanProfileSchema = z
  .object({
    displayName: text.min(2).max(120),
    region: text.min(2).max(120),
    preferredLanguage: languageSchema.default('fr'),
    contactPhone: text.max(40).default(''),
    contactVisibility: contactVisibilitySchema.default('PRIVATE'),
    availabilityStatus: availabilitySchema.default('AVAILABLE'),
    experienceDescription: text.max(2000).default(''),
    equipment: z.array(text.min(1).max(120)).max(40).default([]),
    processingConsent: z.literal(true).optional(),
    policyVersion: z.literal('artisan-profile-v1').optional(),
  })
  .strict();
export const artisanSkillsSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            craftSkillId: id,
            proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
            evidence: text.max(1000).optional(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.craftSkillId)).size === v.items.length,
    'Choose each craft skill once.',
  );
export const capacityDeclarationSchema = z
  .object({
    ...capacityFields,
    quantity: z.number().finite().min(0).max(100000).multipleOf(0.01),
  })
  .strict()
  .refine(validCapacityPeriod, 'The end date must follow the start date.');
export const associationLinkSchema = z
  .object({
    organizationId: id,
    policyVersion: z.literal('association-v1'),
    consent: z.literal(true),
  })
  .strict();
export const delegationScopeSchema = z.enum([
  'artisan.profile.read',
  'artisan.profile.update',
  'artisan.skills.manage',
  'artisan.capacity.read',
  'artisan.capacity.update',
]);
export const delegationGrantSchema = z
  .object({
    organizationId: id,
    delegateUserId: id,
    scopes: z.array(delegationScopeSchema).min(1).max(5),
    expiresAt: z.iso.datetime({ offset: true }),
    policyVersion: z.literal('delegation-v1'),
    consent: z.literal(true),
  })
  .strict()
  .refine((v) => new Set(v.scopes).size === v.scopes.length, 'Choose each scope once.');
export type ArtisanProfileInput = z.infer<typeof artisanProfileSchema>;
export type ArtisanSkillsInput = z.infer<typeof artisanSkillsSchema>;
export type CapacityDeclarationInput = z.infer<typeof capacityDeclarationSchema>;
export type AssociationLinkInput = z.infer<typeof associationLinkSchema>;
export type DelegationGrantInput = z.infer<typeof delegationGrantSchema>;
export type DelegationScope = z.infer<typeof delegationScopeSchema>;
export type ArtisanProfileView = Omit<
  ArtisanProfileInput,
  'processingConsent' | 'policyVersion'
> & {
  id: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CraftSkillView = {
  id: string;
  name: string;
  category: string;
  description: string | null;
};
export type ArtisanSkillView = {
  craftSkillId: string;
  proficiency: string | null;
  evidence: string | null;
  craftSkill: CraftSkillView;
};
export type CapacityDeclarationView = {
  version: number;
  previousDeclarationId: string | null;
  authorizationId: string | null;
  recordingMode: 'SELF' | 'ASSISTED';
  recordedByName: string;
  summary: CapacitySummary;
  supersededAt: string | null;
  id: string;
  artisanProfileId: string;
  craftSkillId: string;
  unitType: string;
  quantity: string;
  effectiveFrom: string;
  effectiveTo: string;
  declaredByUserId: string;
  createdAt: string;
};
export type AssociationMembershipView = {
  id: string;
  organizationId: string;
  organizationName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  consentRecordId: string;
};
export type DelegationGrantView = {
  id: string;
  organizationId: string;
  delegateUserId: string;
  delegateName?: string;
  scopes: DelegationScope[];
  status: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
export const assistedProfileSchema = artisanProfileSchema.omit({
  contactVisibility: true,
  processingConsent: true,
  policyVersion: true,
});
export type AssistedProfileInput = z.infer<typeof assistedProfileSchema>;
