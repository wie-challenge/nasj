import type { Prisma, DelegationScope as DbDelegationScope } from '@prisma/client';
import type { ArtisanProfileView, DelegationGrantView, DelegationScope } from '@nasj/contracts';
export const profileSelect = {
  id: true,
  createdById: true,
  userId: true,
  displayName: true,
  region: true,
  preferredLanguage: true,
  contactPhone: true,
  contactVisibility: true,
  availabilityStatus: true,
  experienceDescription: true,
  equipment: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ArtisanProfileSelect;
export type ProfileRecord = Prisma.ArtisanProfileGetPayload<{ select: typeof profileSelect }>;
export function profileView(p: ProfileRecord, owner: boolean): ArtisanProfileView {
  return {
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    region: p.region,
    preferredLanguage: p.preferredLanguage as ArtisanProfileView['preferredLanguage'],
    contactPhone: owner || p.contactVisibility !== 'PRIVATE' ? (p.contactPhone ?? '') : '',
    contactVisibility: p.contactVisibility as ArtisanProfileView['contactVisibility'],
    availabilityStatus: p.availabilityStatus,
    experienceDescription: p.experienceDescription,
    equipment: p.equipment,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
export const scopeMap = {
  'artisan.profile.read': 'PROFILE_READ',
  'artisan.profile.update': 'PROFILE_UPDATE',
  'artisan.skills.manage': 'SKILLS_MANAGE',
  'artisan.capacity.read': 'CAPACITY_READ',
  'artisan.capacity.update': 'CAPACITY_UPDATE',
} as const;
const scopeActions: Record<DbDelegationScope, DelegationScope> = {
  PROFILE_READ: 'artisan.profile.read',
  PROFILE_UPDATE: 'artisan.profile.update',
  SKILLS_MANAGE: 'artisan.skills.manage',
  CAPACITY_READ: 'artisan.capacity.read',
  CAPACITY_UPDATE: 'artisan.capacity.update',
};
export function scopeView(scope: DbDelegationScope): DelegationScope {
  return scopeActions[scope];
}
export function delegationView(
  p: Prisma.DelegationGrantGetPayload<object> & { delegate?: { name: string } },
): DelegationGrantView {
  return {
    id: p.id,
    organizationId: p.organizationId,
    delegateUserId: p.delegateUserId,
    ...(p.delegate ? { delegateName: p.delegate.name } : {}),
    scopes: p.scopes.map(scopeView),
    status: p.status,
    grantedAt: p.grantedAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
    revokedAt: p.revokedAt?.toISOString() ?? null,
  };
}
