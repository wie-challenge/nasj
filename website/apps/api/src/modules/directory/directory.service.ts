import { Inject, Injectable } from '@nestjs/common';
import {
  DIRECTORY_COHORT_MINIMUM,
  aggregateDirectoryCapacity,
  capacityDecimal,
  capacityHundredths,
  type CapacitySummary,
  type DirectoryConstraint,
  type DirectoryContributorView,
  type DirectoryDetail,
  type DirectoryGroupView,
  type DirectoryPage,
  type DirectoryQuery,
} from '@nasj/contracts';
import type { OrganizationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AccessService, partnerTypes } from '../foundation/access.service.js';
import { PolicyService } from '../foundation/policy.service.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { projectCapacity } from '../artisans/capacity.js';
const scanLimit = 400;
type Profile = {
  id: string;
  displayName: string;
  userId: string | null;
  skills: { craftSkillId: string; craftSkill: { isActive: boolean; category: string } }[];
  managements: {
    organizationId: string;
    organization: {
      id: string;
      name: string;
      region: string;
      approvalStatus: string;
      type: string;
    };
  }[];
  assignments: { coordinatorId: string; organizationId: string }[];
};
type GroupDraft = {
  organizationId: string;
  name: string;
  region: string;
  craftSkillId: string;
  craftName: string;
  craftCategory: string;
  unitType: string;
  effectiveFrom: string;
  effectiveTo: string;
  updatedAt: string;
  summaries: { profile: Profile; summary: CapacitySummary }[];
  missing: Profile[];
  cohort: number;
};
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(PolicyService) private readonly policy: PolicyService,
  ) {}
  async list(actor: Actor, query: DirectoryQuery, knownOnly = false): Promise<DirectoryPage> {
    const viewer = await this.viewer(actor);
    const { groups, truncated } = await this.collect(query);
    const items = groups
      .map((group) => this.present(group, viewer.coordinatorOrganizationId))
      .filter((group) => this.matchesAvailability(group, query, knownOnly))
      .sort(byDirectoryOrder);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
      filters: echo(query),
      provenance: 'SYNTHETIC_DECLARED_CAPACITY',
      truncated,
      cohortMinimum: DIRECTORY_COHORT_MINIMUM,
      reservation: false,
    };
  }
  async detail(actor: Actor, id: string): Promise<DirectoryDetail> {
    const viewer = await this.viewer(actor);
    const key = decodeDirectoryGroupId(id);
    if (!key)
      fail(400, 'INVALID_DIRECTORY_GROUP', 'Choose a directory result from the current search.');
    const { groups } = await this.collect({
      page: 1,
      pageSize: 1,
      craft: key.craftSkillId,
      unit: key.unitType as DirectoryQuery['unit'],
      organizationId: key.organizationId,
      effectiveFrom: key.effectiveFrom,
      effectiveTo: key.effectiveTo,
    });
    const group = groups.find(
      (item) =>
        item.organizationId === key.organizationId &&
        item.craftSkillId === key.craftSkillId &&
        item.unitType === key.unitType &&
        item.effectiveFrom === key.effectiveFrom &&
        item.effectiveTo === key.effectiveTo,
    );
    if (!group) fail(404, 'NOT_FOUND', 'Production group not found.');
    const home = viewer.coordinatorOrganizationId === group.organizationId;
    return {
      group: this.present(group, viewer.coordinatorOrganizationId),
      contributors: home ? this.contributors(group, actor.id) : null,
      provenance: 'SYNTHETIC_DECLARED_CAPACITY',
      reservation: false,
    };
  }
  async crafts(actor: Actor) {
    await this.viewer(actor);
    return {
      items: await this.db.craftSkill.findMany({
        where: { isActive: true },
        select: { id: true, name: true, category: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        take: 100,
      }),
    };
  }
  async publishedCapacity(query: {
    craft: string;
    unit: 'HOURS' | 'PIECES';
    effectiveFrom: string;
    effectiveTo: string;
    region?: string;
  }) {
    const { groups, truncated } = await this.collect({
      page: 1,
      pageSize: 50,
      craft: query.craft,
      unit: query.unit,
      effectiveFrom: query.effectiveFrom,
      effectiveTo: query.effectiveTo,
      region: query.region,
    });
    if (truncated)
      return {
        capacityKnown: false,
        knownRemaining: null,
        constraints: ['SCAN_LIMIT'],
        groupCount: groups.length,
      };
    const items = groups.map((group) => this.present(group, null));
    const constraints = [...new Set(items.flatMap((item) => item.constraints))];
    const known =
      items.length > 0 && items.every((item) => item.availabilityKnown && item.remaining !== null);
    if (!known)
      return { capacityKnown: false, knownRemaining: null, constraints, groupCount: items.length };
    const total = items.reduce((sum, item) => sum + capacityHundredths(item.remaining!), 0n);
    return {
      capacityKnown: true,
      knownRemaining: capacityDecimal(total),
      constraints,
      groupCount: items.length,
    };
  }
  async regions(actor: Actor) {
    await this.viewer(actor);
    const rows = await this.db.organization.findMany({
      where: {
        approvalStatus: 'APPROVED',
        type: { in: [...partnerTypes] as OrganizationType[] },
      },
      select: { region: true },
      distinct: ['region'],
      orderBy: { region: 'asc' },
      take: 100,
    });
    return { items: rows.map((row) => row.region) };
  }
  private async viewer(actor: Actor) {
    await this.policy.requireActive(actor);
    const context = await this.access.context(actor);
    if (
      !context.personas.some((persona) =>
        [
          'PLATFORM_ADMIN',
          'NASJ_OPERATOR',
          'BUYER_REPRESENTATIVE',
          'ASSOCIATION_COORDINATOR',
        ].includes(persona),
      )
    )
      fail(
        403,
        'DIRECTORY_ACCESS_DENIED',
        'An approved commercial or association affiliation is required.',
      );
    return context;
  }
  private async collect(query: DirectoryQuery) {
    const profiles = await this.db.artisanProfile.findMany({
      where: {
        participantStatus: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        managements: {
          some: {
            endedAt: null,
            ...(query.organizationId ? { organizationId: query.organizationId } : {}),
            organization: {
              approvalStatus: 'APPROVED',
              type: { in: [...partnerTypes] as OrganizationType[] },
              ...(query.region
                ? { region: { equals: query.region, mode: 'insensitive' as const } }
                : {}),
            },
          },
        },
        ...(query.craft ? { skills: { some: craftMatch(query.craft) } } : {}),
      },
      select: {
        id: true,
        displayName: true,
        userId: true,
        skills: {
          select: {
            craftSkillId: true,
            craftSkill: { select: { isActive: true, category: true } },
          },
        },
        managements: {
          where: { endedAt: null },
          select: {
            organizationId: true,
            organization: {
              select: { id: true, name: true, region: true, approvalStatus: true, type: true },
            },
          },
          orderBy: { id: 'asc' },
        },
        assignments: {
          where: { endedAt: null },
          select: { coordinatorId: true, organizationId: true },
        },
        user: { select: { status: true, emailVerified: true } },
      },
      orderBy: { id: 'asc' },
      take: scanLimit + 1,
    });
    const truncated = profiles.length > scanLimit;
    const loaded = profiles.slice(0, scanLimit);
    const eligible = await this.eligible(loaded);
    const ids = eligible.map((profile) => profile.id);
    const declarations = ids.length
      ? await this.db.capacityDeclaration.findMany({
          where: {
            supersededAt: null,
            artisanProfileId: { in: ids },
            ...(query.unit ? { unitType: query.unit } : {}),
            ...(query.effectiveFrom && query.effectiveTo
              ? {
                  effectiveFrom: new Date(query.effectiveFrom),
                  effectiveTo: new Date(query.effectiveTo),
                }
              : {}),
            ...(query.craft
              ? {
                  OR: [
                    { craftSkillId: query.craft },
                    {
                      craftSkill: {
                        category: { equals: query.craft, mode: 'insensitive' as const },
                      },
                    },
                  ],
                }
              : {}),
            craftSkill: { isActive: true },
          },
          include: { craftSkill: { select: { id: true, name: true, category: true } } },
          orderBy: { id: 'asc' },
          take: scanLimit,
        })
      : [];
    const byProfile = new Map(eligible.map((profile) => [profile.id, profile]));
    const groups = new Map<string, GroupDraft>();
    for (const declaration of declarations) {
      const profile = byProfile.get(declaration.artisanProfileId);
      const organization = profile?.managements.find((item) =>
        partnerTypes.includes(item.organization.type),
      )?.organization;
      if (!profile || !organization || organization.approvalStatus !== 'APPROVED') continue;
      const summary = await projectCapacity(this.db, declaration);
      const draft = this.bucket(groups, organization, declaration.craftSkill, summary);
      draft.summaries.push({ profile, summary });
      if (declaration.createdAt.toISOString() > draft.updatedAt)
        draft.updatedAt = declaration.createdAt.toISOString();
    }
    for (const group of groups.values()) {
      const peers = eligible.filter(
        (profile) =>
          profile.managements.some((item) => item.organizationId === group.organizationId) &&
          profile.skills.some(
            (skill) => skill.craftSkill.isActive && skill.craftSkillId === group.craftSkillId,
          ),
      );
      group.cohort = peers.length;
      const declared = new Set(group.summaries.map((item) => item.profile.id));
      group.missing = peers.filter((profile) => !declared.has(profile.id));
    }
    return { groups: [...groups.values()], truncated };
  }
  private bucket(
    groups: Map<string, GroupDraft>,
    organization: { id: string; name: string; region: string },
    craft: { id: string; name: string; category: string },
    summary: CapacitySummary,
  ) {
    const key = [
      organization.id,
      craft.id,
      summary.unitType,
      summary.effectiveFrom,
      summary.effectiveTo,
    ].join('|');
    const existing = groups.get(key);
    if (existing) return existing;
    const created: GroupDraft = {
      organizationId: organization.id,
      name: organization.name,
      region: organization.region,
      craftSkillId: craft.id,
      craftName: craft.name,
      craftCategory: craft.category,
      unitType: summary.unitType,
      effectiveFrom: summary.effectiveFrom,
      effectiveTo: summary.effectiveTo,
      updatedAt: summary.asOf,
      summaries: [],
      missing: [],
      cohort: 0,
    };
    groups.set(key, created);
    return created;
  }
  private present(group: GroupDraft, homeOrganizationId: string | null): DirectoryGroupView {
    const aggregate = aggregateDirectoryCapacity(group.summaries.map((item) => item.summary));
    const constraints = new Set<DirectoryConstraint>(aggregate.constraints);
    if (group.missing.length) constraints.add('INCOMPLETE_AGGREGATE');
    const known = aggregate.availabilityKnown && group.missing.length === 0;
    const home = homeOrganizationId === group.organizationId;
    if (!home && group.cohort < DIRECTORY_COHORT_MINIMUM) constraints.add('SMALL_GROUP_SUPPRESSED');
    const show = home || (known && group.cohort >= DIRECTORY_COHORT_MINIMUM);
    return {
      id: encodeDirectoryGroupId(group),
      organizationId: group.organizationId,
      name: group.name,
      region: group.region,
      craftSkillId: group.craftSkillId,
      craftName: group.craftName,
      craftCategory: group.craftCategory,
      unitType: group.unitType,
      effectiveFrom: group.effectiveFrom,
      effectiveTo: group.effectiveTo,
      declared: show ? aggregate.declared : null,
      reserved: show ? aggregate.reserved : null,
      committed: show ? aggregate.committed : null,
      remaining: show ? aggregate.remaining : null,
      deficit: show ? aggregate.deficit : null,
      availabilityKnown: show && known,
      knownSubtotal: show && !known,
      constraints: [...constraints],
      contributorCount: show ? group.cohort : null,
      unknownContributorCount: home
        ? aggregate.unknownContributorCount + group.missing.length
        : null,
      updatedAt: group.updatedAt,
      provenance: 'SYNTHETIC_DECLARED_CAPACITY',
      detail: 'AGGREGATE',
    };
  }
  private contributors(group: GroupDraft, coordinatorId: string): DirectoryContributorView[] {
    const assigned = (profile: Profile) =>
      profile.assignments.some(
        (assignment) =>
          assignment.coordinatorId === coordinatorId &&
          assignment.organizationId === group.organizationId,
      );
    const declared = group.summaries
      .filter((item) => assigned(item.profile))
      .map((item) => ({
        artisanProfileId: item.summary.artisanProfileId,
        displayName: item.profile.displayName,
        missingDeclaration: false,
        declarationId: item.summary.declarationId,
        declared: item.summary.declared,
        reserved: item.summary.reserved,
        committed: item.summary.committed,
        remaining: item.summary.remaining,
        deficit: item.summary.deficit,
        availabilityKnown: item.summary.availabilityKnown,
        constraints: item.summary.constraints,
        updatedAt: item.summary.asOf,
      }));
    const missing = group.missing.filter(assigned).map((profile) => ({
      artisanProfileId: profile.id,
      displayName: profile.displayName,
      missingDeclaration: true,
      declarationId: null,
      declared: null,
      reserved: null,
      committed: null,
      remaining: null,
      deficit: null,
      availabilityKnown: false,
      constraints: [],
      updatedAt: null,
    }));
    return [...declared, ...missing].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  private matchesAvailability(
    group: DirectoryGroupView,
    query: DirectoryQuery,
    knownOnly: boolean,
  ) {
    if ((knownOnly || query.minRemaining) && !group.availabilityKnown) return false;
    if (!query.minRemaining || group.remaining === null) return !query.minRemaining;
    return capacityHundredths(group.remaining) >= capacityHundredths(query.minRemaining);
  }
  private async eligible(
    profiles: (Profile & { user: { status: string; emailVerified: boolean } | null })[],
  ) {
    const linked = profiles.filter((profile) => profile.userId);
    const accountless = profiles.filter((profile) => !profile.userId);
    const [consents, authorizations] = await Promise.all([
      this.db.consentRecord.findMany({
        where: {
          userId: { in: linked.map((profile) => profile.userId!) },
          purpose: 'artisan.profile',
          decision: true,
          withdrawnAt: null,
        },
        select: { userId: true },
      }),
      this.db.onboardingAuthorization.findMany({
        where: {
          artisanProfileId: { in: accountless.map((profile) => profile.id) },
          purpose: 'PARTICIPATION',
          withdrawnAt: null,
          policy: { active: true },
        },
        select: { artisanProfileId: true },
      }),
    ]);
    const consented = new Set(consents.map((row) => row.userId));
    const authorized = new Set(authorizations.map((row) => row.artisanProfileId));
    return profiles.filter((profile) =>
      profile.userId
        ? profile.user?.status === 'ACTIVE' &&
          profile.user.emailVerified &&
          consented.has(profile.userId)
        : authorized.has(profile.id),
    );
  }
}
function craftMatch(craft: string) {
  return {
    OR: [
      { craftSkillId: craft, craftSkill: { isActive: true } },
      {
        craftSkill: {
          isActive: true,
          category: { equals: craft, mode: 'insensitive' as const },
        },
      },
    ],
  };
}
function echo(query: DirectoryQuery): DirectoryPage['filters'] {
  return {
    craft: query.craft ?? null,
    region: query.region ?? null,
    unit: query.unit ?? null,
    effectiveFrom: query.effectiveFrom ?? null,
    effectiveTo: query.effectiveTo ?? null,
    minRemaining: query.minRemaining ?? null,
    organizationId: query.organizationId ?? null,
  };
}
function byDirectoryOrder(a: DirectoryGroupView, b: DirectoryGroupView) {
  return (
    a.name.localeCompare(b.name) ||
    a.craftName.localeCompare(b.craftName) ||
    a.unitType.localeCompare(b.unitType) ||
    a.effectiveFrom.localeCompare(b.effectiveFrom) ||
    a.id.localeCompare(b.id)
  );
}
export function encodeDirectoryGroupId(input: {
  organizationId: string;
  craftSkillId: string;
  unitType: string;
  effectiveFrom: string;
  effectiveTo: string;
}) {
  return Buffer.from(
    [
      input.organizationId,
      input.craftSkillId,
      input.unitType,
      input.effectiveFrom,
      input.effectiveTo,
    ].join('\u001f'),
    'utf8',
  ).toString('base64url');
}
export function decodeDirectoryGroupId(id: string) {
  let text = '';
  try {
    text = Buffer.from(id, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const parts = text.split('\u001f');
  if (parts.length !== 5 || parts.some((part) => !part || part.length > 200)) return null;
  const [organizationId, craftSkillId, unitType, effectiveFrom, effectiveTo] = parts;
  if (!['HOURS', 'PIECES'].includes(unitType)) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(organizationId) || !/^[a-zA-Z0-9_-]+$/.test(craftSkillId))
    return null;
  const from = new Date(effectiveFrom);
  const to = new Date(effectiveTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
  return {
    organizationId,
    craftSkillId,
    unitType,
    effectiveFrom: from.toISOString(),
    effectiveTo: to.toISOString(),
  };
}
