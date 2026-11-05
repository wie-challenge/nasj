import {
  capacityDecimal,
  capacityHundredths,
  reconcileCapacity,
  isCapacityRevision,
  type CapacitySummary,
  type CapacityConstraint,
  type CapacityDeclarationView,
} from '@nasj/contracts';
import type { Prisma } from '@prisma/client';
import type { Db } from '../foundation/transaction.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { replaySafe } from '../foundation/idempotency.js';
import { audit } from '../foundation/audit.js';

type Declaration = Prisma.CapacityDeclarationGetPayload<object>;
// A declared period is a production budget. Reservations are temporary; accepted work that was
// produced, including a COMPLETED batch or a closed order, stays consumed until the period ends.
// Cancelling before any production releases the hold. Declined and expired offers do not reserve.
export function capacityOfferEffect(
  offer: {
    status: string;
    expiresAt: Date;
    quantity: number;
    orderStatus: string;
    batchStatus: string | null;
    produced: number;
  },
  now: Date,
): { kind: 'skip' | 'reserved' | 'committed'; quantity: number } {
  const accepted = offer.status === 'ACCEPTED';
  if (!accepted) {
    if (
      !['PLANNED', 'OFFERED'].includes(offer.status) ||
      offer.expiresAt <= now ||
      offer.orderStatus === 'CANCELLED' ||
      offer.orderStatus === 'CLOSED'
    )
      return { kind: 'skip', quantity: 0 };
    return { kind: 'reserved', quantity: offer.quantity };
  }
  const produced = offer.batchStatus === 'COMPLETED' || offer.produced > 0;
  if (offer.orderStatus === 'CANCELLED' && !produced) return { kind: 'skip', quantity: 0 };
  return { kind: 'committed', quantity: offer.quantity };
}
// No source price, contact, financial terms or health data enters this projection.
export async function projectCapacity(
  db: Db,
  declaration: Declaration,
  now = new Date(),
  acceptingOfferId?: string,
): Promise<CapacitySummary> {
  const period = {
    artisanProfileId: declaration.artisanProfileId,
    craftSkillId: declaration.craftSkillId,
    effectiveFrom: { lt: declaration.effectiveTo },
    effectiveTo: { gt: declaration.effectiveFrom },
  };
  const current = await db.capacityDeclaration.findMany({
    where: { ...period, unitType: declaration.unitType, supersededAt: null },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
  const latest = current.find((c) => samePeriod(c, declaration)) ?? declaration;
  const constraints: CapacityConstraint[] = [];
  const effectivePause = await db.availabilityPause.findFirst({
    where: {
      artisanProfileId: declaration.artisanProfileId,
      effectiveFrom: { lte: now },
      resumedAt: null,
    },
  });
  if (effectivePause) constraints.push('AVAILABILITY_PAUSED');
  if (current.length > 1 || current.some((c) => !samePeriod(c, declaration)))
    constraints.push('OVERLAPPING_DECLARATIONS');
  const offers = await db.commercialOffer.findMany({
    where: {
      artisanProfileId: declaration.artisanProfileId,
      capacityDeclaration: period,
      status: { in: ['PLANNED', 'OFFERED', 'ACCEPTED'] },
      // Acceptance converts this existing reservation; every other hold still counts.
      ...(acceptingOfferId
        ? { NOT: { id: acceptingOfferId, status: { in: ['PLANNED', 'OFFERED'] } } }
        : {}),
    },
    select: {
      quantity: true,
      status: true,
      expiresAt: true,
      batch: { select: { status: true, produced: true } },
      order: { select: { status: true } },
      capacityDeclaration: { select: { unitType: true, effectiveFrom: true, effectiveTo: true } },
    },
  });
  let reserved = 0n,
    committed = 0n;
  for (const offer of offers) {
    const effect = capacityOfferEffect(
      {
        status: offer.status,
        expiresAt: offer.expiresAt,
        quantity: offer.quantity,
        orderStatus: offer.order.status,
        batchStatus: offer.batch?.status ?? null,
        produced: offer.batch?.produced ?? 0,
      },
      now,
    );
    if (effect.kind === 'skip') continue;
    // Commercial quantities are pieces even if a malformed legacy relation points at HOURS.
    if (latest.unitType !== 'PIECES' || offer.capacityDeclaration.unitType !== 'PIECES') {
      constraints.push('INCOMPATIBLE_COMMITMENT_UNIT');
      continue;
    }
    if (!samePeriod(offer.capacityDeclaration, latest)) {
      constraints.push('PERIOD_ALLOCATION_UNKNOWN');
      continue;
    }
    if (effect.kind === 'committed') committed += BigInt(effect.quantity) * 100n;
    else reserved += BigInt(effect.quantity) * 100n;
  }
  return {
    declarationId: latest.id,
    artisanProfileId: latest.artisanProfileId,
    craftSkillId: latest.craftSkillId,
    unitType: latest.unitType,
    effectiveFrom: latest.effectiveFrom.toISOString(),
    effectiveTo: latest.effectiveTo.toISOString(),
    version: latest.version,
    ...reconcileCapacity({
      declared: latest.quantity.toFixed(2),
      reserved: capacityDecimal(reserved),
      committed: capacityDecimal(committed),
      constraints,
    }),
    timezone: 'Africa/Tunis',
    allocationPolicy: 'DECLARED_PERIOD_BUDGET',
    asOf: now.toISOString(),
  };
}
function samePeriod(
  a: { effectiveFrom: Date; effectiveTo: Date },
  b: { effectiveFrom: Date; effectiveTo: Date },
) {
  return (
    a.effectiveFrom.getTime() === b.effectiveFrom.getTime() &&
    a.effectiveTo.getTime() === b.effectiveTo.getTime()
  );
}
export async function capacityView(db: Db, row: Declaration): Promise<CapacityDeclarationView> {
  return (await capacityViews(db, [row]))[0];
}
export async function capacityViews(
  db: Db,
  rows: Declaration[],
): Promise<CapacityDeclarationView[]> {
  const [profiles, actors] = await Promise.all([
    db.artisanProfile.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.artisanProfileId))] } },
      select: { id: true, userId: true },
    }),
    db.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.declaredByUserId))] } },
      select: { id: true, name: true },
    }),
  ]);
  const projections = new Map<string, Promise<CapacitySummary>>();
  return Promise.all(
    rows.map(async (row) => {
      const key = [
        row.artisanProfileId,
        row.craftSkillId,
        row.unitType,
        row.effectiveFrom.toISOString(),
        row.effectiveTo.toISOString(),
      ].join('|');
      if (!projections.has(key)) projections.set(key, projectCapacity(db, row));
      return {
        id: row.id,
        artisanProfileId: row.artisanProfileId,
        craftSkillId: row.craftSkillId,
        unitType: row.unitType,
        quantity: row.quantity.toString(),
        effectiveFrom: row.effectiveFrom.toISOString(),
        effectiveTo: row.effectiveTo.toISOString(),
        supersededAt: row.supersededAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        declaredByUserId: row.declaredByUserId,
        version: row.version,
        previousDeclarationId: row.previousDeclarationId,
        authorizationId: row.authorizationId,
        recordedByName:
          actors.find((actor) => actor.id === row.declaredByUserId)?.name ?? 'Recorded participant',
        recordingMode:
          row.declaredByUserId ===
          profiles.find((profile) => profile.id === row.artisanProfileId)?.userId
            ? 'SELF'
            : 'ASSISTED',
        summary: await projections.get(key)!,
      };
    }),
  );
}

// Caller must hold IAM advisory locks and authorize the current actor/resource BEFORE replay.
export async function writeCapacity(
  db: Db,
  actor: Actor,
  input: {
    artisanProfileId: string;
    craftSkillId: string;
    unitType: string;
    quantity: string;
    effectiveFrom: string;
    effectiveTo: string;
    expectedVersion?: number;
    authorizationId?: string;
    delegationId?: string;
    organizationId?: string;
  },
  key?: string,
  originalPayload?: Prisma.InputJsonObject,
) {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
  const outcome = await replaySafe(
    db,
    { actorId: actor.id, resourceId: input.artisanProfileId, operation: 'capacity.declare', key },
    originalPayload ?? payload,
    async () => {
      const quantity = capacityHundredths(input.quantity);
      if (quantity > 10000000n || !['HOURS', 'PIECES'].includes(input.unitType))
        fail(400, 'INVALID_CAPACITY', 'Choose a supported unit and quantity up to 100000.');
      const effectiveFrom = new Date(input.effectiveFrom),
        effectiveTo = new Date(input.effectiveTo);
      const rows = await db.capacityDeclaration.findMany({
        where: {
          artisanProfileId: input.artisanProfileId,
          craftSkillId: input.craftSkillId,
          unitType: input.unitType,
          supersededAt: null,
          effectiveFrom: { lt: effectiveTo },
          effectiveTo: { gt: effectiveFrom },
        },
      });
      if (rows.length > 1 || !isCapacityRevision({ effectiveFrom, effectiveTo }, rows))
        fail(
          409,
          'CAPACITY_OVERLAP',
          'Revise the same exact period or choose a non-overlapping period.',
        );
      const previous = rows[0];
      if (input.expectedVersion !== undefined && input.expectedVersion !== (previous?.version ?? 0))
        fail(409, 'STALE_CAPACITY', 'Capacity changed. Refresh and review the current version.');
      // Unkeyed legacy retries of the same declaration do not create another history entry.
      if (
        previous &&
        previous.quantity.toFixed(2) === capacityDecimal(quantity) &&
        previous.declaredByUserId === actor.id &&
        previous.authorizationId === (input.authorizationId ?? null)
      )
        return capacityView(db, previous);
      if (previous)
        await db.capacityDeclaration.update({
          where: { id: previous.id },
          data: { supersededAt: new Date() },
        });
      const row = await db.capacityDeclaration.create({
        data: {
          artisanProfileId: input.artisanProfileId,
          craftSkillId: input.craftSkillId,
          unitType: input.unitType,
          quantity: capacityDecimal(quantity),
          effectiveFrom,
          effectiveTo,
          declaredByUserId: actor.id,
          authorizationId: input.authorizationId,
          version: (previous?.version ?? 0) + 1,
          previousDeclarationId: previous?.id,
        },
      });
      await audit(db, actor, {
        action: input.organizationId ? 'association.capacity.record' : 'artisan.capacity.update',
        targetType: 'CapacityDeclaration',
        targetId: row.id,
        organizationId: input.organizationId,
        after: {
          artisanProfileId: input.artisanProfileId,
          declaredByUserId: actor.id,
          version: row.version,
          quantity: row.quantity.toFixed(2),
          unitType: row.unitType,
          effectiveFrom: row.effectiveFrom.toISOString(),
          effectiveTo: row.effectiveTo.toISOString(),
          previousDeclarationId: previous?.id ?? null,
          authorizationId: input.authorizationId ?? null,
          delegationId: input.delegationId ?? null,
          source: 'VOLUNTARY_DECLARATION',
        },
      });
      return capacityView(db, row);
    },
  );
  // Pre-upgrade outcomes retain their original response; enrich only the missing additive view fields.
  if ('summary' in outcome) return outcome;
  const legacy = outcome as { id?: string };
  if (!legacy.id)
    fail(409, 'CAPACITY_REPLAY_UNAVAILABLE', 'Refresh the declaration before retrying.');
  const record = await db.capacityDeclaration.findFirst({
    where: { id: legacy.id, artisanProfileId: input.artisanProfileId },
  });
  if (!record) fail(409, 'CAPACITY_REPLAY_UNAVAILABLE', 'Refresh the declaration before retrying.');
  return { ...(await capacityView(db, record)), ...(outcome as Partial<CapacityDeclarationView>) };
}
