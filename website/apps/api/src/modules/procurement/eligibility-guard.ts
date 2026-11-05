import { HttpException } from '@nestjs/common';
import type { Db } from '../foundation/transaction.js';
import { projectCapacity } from '../artisans/capacity.js';
import * as C from '@nasj/contracts';

/**
 * Eligibility is assessed once, when candidates are ranked, and again when an offer is prepared.
 * Neither moment is the commitment boundary: an artisan can be suspended, withdraw consent, let a
 * delegation expire or fill their capacity in between. Rechecking the authoritative current state
 * inside the accepting transaction is the only thing that stops a stale snapshot from becoming a
 * contractual obligation.
 *
 * Each rule reports a distinct code so the caller can explain exactly what changed rather than
 * returning one opaque rejection.
 */
export type CommitmentDenial = { code: string; detail: string };

export async function commitmentDenials(
  tx: Db,
  input: {
    artisanProfileId: string;
    userId: string | null;
    orderId: string;
    craftSkillId: string;
    capacityDeclarationId: string;
    quantity: number;
    periodFrom: Date | null;
    periodTo: Date | null;
    acceptingOfferId?: string;
  },
): Promise<CommitmentDenial[]> {
  const denied: CommitmentDenial[] = [];
  const profile = await tx.artisanProfile.findUnique({
    where: { id: input.artisanProfileId },
    include: { user: { select: { status: true, emailVerified: true } }, skills: true },
  });
  if (!profile)
    return [{ code: 'PROFILE_UNAVAILABLE', detail: 'The artisan profile no longer exists.' }];

  if (profile.participantStatus !== 'ACTIVE')
    denied.push({
      code: 'PARTICIPATION_INACTIVE',
      detail: 'Participation is no longer active.',
    });
  if (profile.availabilityStatus !== 'AVAILABLE')
    denied.push({
      code: 'AVAILABILITY_PAUSED',
      detail: 'Availability is paused, so no new commitment can be taken.',
    });

  // Consent is checked against the record that exists now, not the one that existed at ranking.
  if (profile.userId) {
    if (!(profile.user?.status === 'ACTIVE' && profile.user.emailVerified))
      denied.push({
        code: 'ACCOUNT_INACTIVE',
        detail: 'The linked account is not active and verified.',
      });
    const consent = await tx.consentRecord.findFirst({
      where: {
        userId: profile.userId,
        purpose: 'artisan.profile',
        decision: true,
        withdrawnAt: null,
      },
      orderBy: { collectedAt: 'desc' },
    });
    if (!consent)
      denied.push({
        code: 'PARTICIPATION_UNAUTHORIZED',
        detail: 'Active artisan profile consent is missing or has been withdrawn.',
      });
  } else {
    const authorization = await tx.artisanProfile.findFirst({
      where: { id: profile.id, authorizations: { some: {} } },
      select: { id: true },
    });
    if (!authorization)
      denied.push({
        code: 'PARTICIPATION_UNAUTHORIZED',
        detail: 'A current participation authorization is missing.',
      });
  }

  // A delegation is only usable while it is active, unexpired and unrevoked.
  const delegation = await tx.delegationGrant.findFirst({
    where: {
      artisanProfileId: profile.id,
      status: 'ACTIVE',
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (profile.userId && !delegation) {
    const anyGrant = await tx.delegationGrant.count({
      where: { artisanProfileId: profile.id },
    });
    if (anyGrant > 0)
      denied.push({
        code: 'DELEGATION_EXPIRED',
        detail: 'The delegation that authorized this participation has expired or been revoked.',
      });
  }

  if (profile.skills.length === 0)
    denied.push({ code: 'CRAFT_MISMATCH', detail: 'The required craft is no longer held.' });

  // Capacity and equipment are read from the declaration bound to this offer, then re-projected so
  // that reservations taken since preparation are included.
  const declaration = await tx.capacityDeclaration.findFirst({
    where: {
      id: input.capacityDeclarationId,
      artisanProfileId: profile.id,
      craftSkillId: input.craftSkillId,
      // An issued offer keeps its declaration reference across revisions of the same period.
      // projectCapacity and the period check below still require sufficient current capacity.
      ...(input.acceptingOfferId ? {} : { supersededAt: null }),
    },
  });
  if (!declaration)
    denied.push({
      code: 'CAPACITY_UNAVAILABLE',
      detail: 'The capacity declaration behind this offer is no longer current.',
    });
  else {
    const projection = await projectCapacity(tx, declaration, new Date(), input.acceptingOfferId);
    if (!projection.availabilityKnown)
      denied.push({
        code: 'CAPACITY_UNKNOWN',
        detail: 'Remaining capacity is unknown, so a commitment cannot be taken.',
      });
    else if (
      projection.constraints.length > 0 ||
      C.capacityHundredths(projection.remaining) < BigInt(input.quantity) * 100n
    )
      denied.push({
        code: 'CAPACITY_EXCEEDED',
        detail: 'This commitment exceeds currently remaining capacity.',
      });
  }

  // The offer period must still be the declared period: a declaration re-issued for another window
  // means the offer terms describe availability that no longer exists.
  if (input.periodFrom && input.periodTo) {
    const matching = await tx.capacityDeclaration.findFirst({
      where: {
        artisanProfileId: profile.id,
        craftSkillId: input.craftSkillId,
        unitType: 'PIECES',
        supersededAt: null,
        effectiveFrom: input.periodFrom,
        effectiveTo: input.periodTo,
      },
      select: { id: true },
    });
    if (!matching)
      denied.push({
        code: 'PERIOD_SUPERSEDED',
        detail: 'The declared production period behind this offer has been superseded.',
      });
  }

  return denied;
}

/**
 * Fails the transaction when any current-state rule is violated, so a stale eligibility snapshot
 * can never become a commitment. Every denial is reported so the caller learns all of what changed,
 * not just the first rule that tripped.
 */
export async function requireCurrentEligibility(
  tx: Db,
  input: Parameters<typeof commitmentDenials>[1],
): Promise<void> {
  const denied = await commitmentDenials(tx, input);
  if (denied.length === 0) return;
  const ordered = denied.sort((a, b) => a.code.localeCompare(b.code));
  const detail = ordered.map((row) => `${row.code}: ${row.detail}`).join(' ');
  throw new HttpException(
    { code: 'ELIGIBILITY_STALE', message: `Eligibility changed. ${detail}`, reasons: ordered },
    409,
  );
}
