import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as C from '@nasj/contracts';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { audit } from '../foundation/audit.js';
import { replaySafe } from '../foundation/idempotency.js';
import { iamTransaction, type Db } from '../foundation/transaction.js';
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)));
@Injectable()
export class InventoryService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private async permission(tx: Db, actor: Actor, organizationId: string, permission: C.Permission) {
    const member = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.id } },
      include: { organization: true, roles: true, permissionGrants: true },
    });
    if (!member || !C.permissionsForMembership(member).includes(permission))
      fail(403, 'FORBIDDEN', 'A current scoped material authorization is required.');
    return member;
  }
  private async lot(tx: Db, id: string) {
    const lot = await tx.materialLot.findUnique({ where: { id } });
    if (!lot) fail(404, 'NOT_FOUND', 'Material lot not found.');
    return lot;
  }
  private async batch(tx: Db, actor: Actor, batchId: string, organizationId: string) {
    const batch = await tx.commercialBatch.findUnique({
      where: { id: batchId },
      include: { order: { include: { rfq: true } }, offer: true },
    });
    if (!batch || batch.order.rfq.operatorOrganizationId !== organizationId)
      fail(404, 'NOT_FOUND', 'Production batch not found in this stock organization.');
    if (
      !(await tx.operatorAssignment.findFirst({
        where: {
          operatorId: actor.id,
          organizationId: batch.order.rfq.buyerOrganizationId,
          revokedAt: null,
        },
      }))
    )
      fail(403, 'FORBIDDEN', 'A current buyer account assignment is required.');
    return batch;
  }
  private async receiver(
    tx: Db,
    actor: Actor,
    h: { artisanProfileId: string; receiverOrganizationId: string },
  ) {
    const artisan = await tx.artisanProfile.findUnique({ where: { id: h.artisanProfileId } });
    if (artisan?.userId === actor.id) return 'ARTISAN_DIRECT';
    await this.permission(tx, actor, h.receiverOrganizationId, 'inventory.stock.receive');
    const assignment = await tx.artisanAssignment.findFirst({
      where: {
        artisanProfileId: h.artisanProfileId,
        coordinatorId: actor.id,
        organizationId: h.receiverOrganizationId,
        endedAt: null,
      },
    });
    const management = await tx.artisanManagement.findFirst({
      where: {
        artisanProfileId: h.artisanProfileId,
        organizationId: h.receiverOrganizationId,
        endedAt: null,
      },
    });
    if (!assignment || !management)
      fail(
        403,
        'FORBIDDEN',
        'A current recipient assignment and management relationship are required.',
      );
    return 'COORDINATOR_REPORTED';
  }
  private command(
    tx: Db,
    actor: Actor,
    id: string,
    operation: string,
    key: string | undefined,
    input: unknown,
    fn: () => Promise<Prisma.InputJsonValue>,
  ) {
    if (!key) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
    return replaySafe(tx, { actorId: actor.id, resourceId: id, operation, key }, json(input), fn);
  }
  private async movement(
    tx: Db,
    actor: Actor,
    lotId: string,
    kind: string,
    quantityMilli: bigint,
    referenceId: string,
    reason: string,
  ) {
    await tx.inventoryMovement.create({
      data: { lotId, actorId: actor.id, kind, quantityMilli, referenceId, reason },
    });
    await audit(tx, actor, {
      action: `inventory.${kind.toLowerCase()}`,
      targetType: 'MaterialLot',
      targetId: lotId,
      reason,
      after: { referenceId, quantityMilli: quantityMilli.toString() },
    });
  }
  async workspace(actor: Actor, organizationId: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await this.permission(tx, actor, organizationId, 'inventory.stock.read');
      const lots = await tx.materialLot.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const ids = lots.map((l) => l.id);
      const movements = await tx.inventoryMovement.findMany({
        where: { lotId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });
      const reservations = await tx.materialReservation.findMany({
        where: { lotId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const handovers = await tx.materialHandover.findMany({
        where: { lotId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const returns = await tx.materialReturn.findMany({
        where: { lotId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const receipts = await tx.materialReceipt.findMany({
        where: { handoverId: { in: handovers.map((h) => h.id) } },
      });
      return json({
        lots: lots.map((l) => ({ ...l, movements: movements.filter((m) => m.lotId === l.id) })),
        reservations,
        handovers,
        returns,
        receipts,
        permissions: C.permissionsForMembership(member),
      });
    });
  }
  async mine(actor: Actor) {
    return iamTransaction(this.db, actor, async (tx) => {
      const own = await tx.artisanProfile.findUnique({ where: { userId: actor.id } });
      const assignments = await tx.artisanAssignment.findMany({
        where: { coordinatorId: actor.id, endedAt: null },
      });
      const rows = await tx.materialHandover.findMany({
        where: {
          artisanProfileId: {
            in: [...(own ? [own.id] : []), ...assignments.map((a) => a.artisanProfileId)],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      const items = [];
      for (const h of rows) {
        try {
          await this.receiver(tx, actor, h);
        } catch {
          continue;
        }
        const lot = await this.lot(tx, h.lotId);
        const receipt = await tx.materialReceipt.findUnique({ where: { handoverId: h.id } });
        const returns = await tx.materialReturn.findMany({ where: { handoverId: h.id } });
        items.push({
          ...h,
          materialCode: lot.materialCode,
          name: lot.name,
          unit: lot.unit,
          provenance: lot.provenance,
          canReceive: !receipt,
          receipt,
          returns,
        });
      }
      return json({ items });
    });
  }
  async register(actor: Actor, organizationId: string, input: C.MaterialLotInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const member = await this.permission(tx, actor, organizationId, 'inventory.stock.register');
      if (member.organization.type !== 'INTERNAL')
        fail(403, 'FORBIDDEN', 'Controlled stock belongs to an internal organization.');
      return this.command(tx, actor, organizationId, 'stock.register', key, input, async () => {
        const { quantityMilli, receivedAt, ...rest } = input;
        this.unitQuantity(input.unit, BigInt(quantityMilli));
        if (receivedAt && new Date(receivedAt) > new Date())
          fail(400, 'FUTURE_EVENT', 'Receipt cannot be in the future.');
        const lot = await tx.materialLot.create({
          data: {
            ...rest,
            receivedAt: receivedAt ? new Date(receivedAt) : undefined,
            organizationId,
            actorId: actor.id,
            receivedMilli: BigInt(quantityMilli),
            availableMilli: BigInt(quantityMilli),
          },
        });
        await this.movement(
          tx,
          actor,
          lot.id,
          'RECEIVED_RECORDED',
          lot.receivedMilli,
          lot.id,
          input.evidenceReference,
        );
        return { id: lot.id };
      });
    });
  }
  async reserve(actor: Actor, lotId: string, input: C.MaterialReservationInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const lot = await this.lot(tx, lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.reserve');
      const batch = await this.batch(tx, actor, input.batchId, lot.organizationId);
      return this.command(tx, actor, lotId, 'stock.reserve', key, input, async () => {
        if (batch.order.status !== 'APPROVED' || batch.offer.status !== 'ACCEPTED')
          fail(
            409,
            'ORDER_NOT_READY',
            'Reservation requires an approved order and accepted production commitment.',
          );
        if (lot.provenance === 'SYNTHETIC' && batch.order.provenance !== 'SYNTHETIC')
          fail(409, 'SYNTHETIC_STOCK', 'Demonstration stock cannot satisfy live requirements.');
        if (input.unit !== lot.unit)
          fail(409, 'INCOMPATIBLE_UNIT', 'Material units must match exactly.');
        const requirement = await tx.batchMaterialRequirement.findUnique({
          where: { batchId_materialCode: { batchId: batch.id, materialCode: lot.materialCode } },
        });
        if (!requirement || requirement.unit !== lot.unit)
          fail(
            409,
            'REQUIREMENT_MISMATCH',
            'A released batch material requirement with matching material and unit is required.',
          );
        const n = BigInt(input.quantityMilli);
        this.unitQuantity(lot.unit, n);
        const prior = await tx.materialReservation.findMany({
          where: { requirementId: requirement.id, status: { not: 'RELEASED' } },
        });
        let committed = prior.reduce((sum, r) => sum + r.remainingMilli, 0n);
        const handovers = await tx.materialHandover.findMany({
          where: { reservationId: { in: prior.map((row) => row.id) } },
        });
        for (const h of handovers) {
          const receipt = await tx.materialReceipt.findUnique({ where: { handoverId: h.id } });
          const returns = await tx.materialReturn.findMany({
            where: { handoverId: h.id, condition: { not: 'DAMAGED' } },
          });
          committed += receipt
            ? receipt.receivedMilli -
              receipt.damagedMilli -
              returns.reduce((sum, row) => sum + row.quantityMilli, 0n)
            : h.quantityMilli;
        }
        if (committed + n > BigInt(requirement.requiredMilli))
          fail(
            409,
            'EXCESS_REQUIREMENT',
            'Net usable receipts, in-transit stock and reservations cannot exceed the production requirement.',
          );
        if (n > lot.availableMilli)
          fail(409, 'INSUFFICIENT_STOCK', 'Reservation exceeds available stock.');
        const r = await tx.materialReservation.create({
          data: {
            lotId,
            batchId: batch.id,
            requirementId: requirement.id,
            quantityMilli: n,
            remainingMilli: n,
            actorId: actor.id,
            reason: input.reason,
          },
        });
        await tx.materialLot.update({
          where: { id: lotId },
          data: { availableMilli: { decrement: n }, reservedMilli: { increment: n } },
        });
        await this.movement(tx, actor, lotId, 'RESERVED', n, r.id, input.reason);
        await this.readiness(tx, batch.id);
        return { id: r.id };
      });
    });
  }
  async release(actor: Actor, id: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const r = await tx.materialReservation.findUnique({ where: { id } });
      if (!r) fail(404, 'NOT_FOUND', 'Reservation not found.');
      const lot = await this.lot(tx, r.lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.reserve');
      await this.batch(tx, actor, r.batchId, lot.organizationId);
      return this.command(tx, actor, id, 'stock.release', key, input, async () => {
        if (r.remainingMilli === 0n)
          fail(409, 'NOT_RESERVED', 'There is no unissued reserved stock to release.');
        const n = r.remainingMilli;
        await tx.materialReservation.update({
          where: { id },
          data: {
            remainingMilli: 0n,
            status: r.quantityMilli === n ? 'RELEASED' : 'PARTIALLY_ISSUED_RELEASED',
          },
        });
        await tx.materialLot.update({
          where: { id: lot.id },
          data: { reservedMilli: { decrement: n }, availableMilli: { increment: n } },
        });
        await this.movement(tx, actor, lot.id, 'RELEASED', n, id, input.reason);
        await this.readiness(tx, r.batchId);
        return { id };
      });
    });
  }
  async handover(actor: Actor, id: string, input: C.MaterialHandoverInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const r = await tx.materialReservation.findUnique({ where: { id } });
      if (!r) fail(404, 'NOT_FOUND', 'Reservation not found.');
      const lot = await this.lot(tx, r.lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.handover');
      const batch = await this.batch(tx, actor, r.batchId, lot.organizationId);
      return this.command(tx, actor, id, 'stock.handover', key, input, async () => {
        const n = BigInt(input.quantityMilli);
        this.unitQuantity(lot.unit, n);
        if (n > r.remainingMilli)
          fail(409, 'INSUFFICIENT_RESERVED', 'Handover exceeds remaining reservation.');
        if (
          !(await tx.artisanManagement.findFirst({
            where: {
              artisanProfileId: batch.artisanProfileId,
              organizationId: input.receiverOrganizationId,
              endedAt: null,
            },
          }))
        )
          fail(
            409,
            'RECIPIENT_MISMATCH',
            'The receiving organization must currently manage this batch artisan.',
          );
        if (new Date(input.occurredAt) > new Date())
          fail(400, 'FUTURE_EVENT', 'A handover cannot be recorded in the future.');
        const h = await tx.materialHandover.create({
          data: {
            reservationId: id,
            lotId: lot.id,
            batchId: batch.id,
            artisanProfileId: batch.artisanProfileId,
            receiverOrganizationId: input.receiverOrganizationId,
            actorId: actor.id,
            quantityMilli: n,
            evidenceReference: input.evidenceReference,
            occurredAt: new Date(input.occurredAt),
          },
        });
        await tx.materialReservation.update({
          where: { id },
          data: {
            remainingMilli: { decrement: n },
            status: r.remainingMilli === n ? 'ISSUED' : 'PARTIALLY_ISSUED',
          },
        });
        await tx.materialLot.update({
          where: { id: lot.id },
          data: { reservedMilli: { decrement: n }, issuedMilli: { increment: n } },
        });
        await this.movement(tx, actor, lot.id, 'ISSUED', n, h.id, input.evidenceReference);
        return { id: h.id };
      });
    });
  }
  async receipt(actor: Actor, id: string, input: C.MaterialReceiptInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const h = await tx.materialHandover.findUnique({ where: { id } });
      if (!h) fail(404, 'NOT_FOUND', 'Handover not found.');
      const source = await this.receiver(tx, actor, h);
      return this.command(tx, actor, id, 'stock.receipt', key, input, async () => {
        const received = BigInt(input.receivedMilli),
          damaged = BigInt(input.damagedMilli);
        const lot = await this.lot(tx, h.lotId);
        this.unitQuantity(lot.unit, received);
        this.unitQuantity(lot.unit, damaged);
        if (received > h.quantityMilli || damaged > received)
          fail(
            409,
            'RECEIPT_MISMATCH',
            'Received cannot exceed issued quantity; damage is a subset of receipt.',
          );
        if (source === 'ARTISAN_DIRECT' && input.method !== 'DIRECT')
          fail(400, 'INVALID_METHOD', 'Authenticated artisans record direct acknowledgements.');
        if (source === 'COORDINATOR_REPORTED' && input.method === 'DIRECT')
          fail(400, 'INVALID_METHOD', 'Assisted reports must identify the communication method.');
        const shortage = h.quantityMilli - received;
        const receipt = await tx.materialReceipt.create({
          data: {
            handoverId: id,
            artisanProfileId: h.artisanProfileId,
            actorId: actor.id,
            receivedMilli: received,
            damagedMilli: damaged,
            shortageMilli: shortage,
            method: input.method,
            source,
            verificationStatus:
              source === 'ARTISAN_DIRECT'
                ? 'AUTHENTICATED_ACKNOWLEDGEMENT'
                : 'PENDING_INDEPENDENT_VERIFICATION',
            evidenceReference: input.evidenceReference,
            note: input.note,
          },
        });
        await tx.materialHandover.update({
          where: { id },
          data: {
            status:
              shortage > 0n || damaged > 0n
                ? 'DISCREPANCY_REPORTED'
                : source === 'ARTISAN_DIRECT'
                  ? 'RECEIVED_CONFIRMED'
                  : 'PENDING_INDEPENDENT_VERIFICATION',
          },
        });
        if (damaged > 0n)
          await tx.materialLot.update({
            where: { id: h.lotId },
            data: { issuedMilli: { decrement: damaged }, damagedMilli: { increment: damaged } },
          });
        await this.movement(
          tx,
          actor,
          h.lotId,
          'RECEIPT_REPORTED',
          received,
          receipt.id,
          input.note,
        );
        await this.readiness(tx, h.batchId);
        return { id: receipt.id };
      });
    });
  }
  async returnMaterial(actor: Actor, id: string, input: C.MaterialReturnInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const h = await tx.materialHandover.findUnique({ where: { id } });
      if (!h) fail(404, 'NOT_FOUND', 'Handover not found.');
      const lot = await this.lot(tx, h.lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.adjust');
      await this.batch(tx, actor, h.batchId, lot.organizationId);
      return this.command(tx, actor, id, 'stock.return', key, input, async () => {
        const n = BigInt(input.quantityMilli);
        this.unitQuantity(lot.unit, n);
        const receipt = await tx.materialReceipt.findUnique({ where: { handoverId: id } });
        if (!receipt) fail(409, 'RETURN_EXCEEDS_CUSTODY', 'Record receipt before return.');
        const priorReturns = await tx.materialReturn.findMany({ where: { handoverId: id } });
        const damagedReturned = priorReturns
          .filter((row) => row.condition === 'DAMAGED')
          .reduce((sum, row) => sum + row.quantityMilli, 0n);
        const unusedReturned = priorReturns
          .filter((row) => row.condition !== 'DAMAGED')
          .reduce((sum, row) => sum + row.quantityMilli, 0n);
        const eligible =
          input.condition === 'DAMAGED'
            ? receipt.damagedMilli - damagedReturned
            : receipt.receivedMilli - receipt.damagedMilli - unusedReturned - h.consumedMilli;
        if (n > eligible)
          fail(
            409,
            'RETURN_EXCEEDS_CUSTODY',
            'Return exceeds recorded unconsumed received material in this condition.',
          );
        const r = await tx.materialReturn.create({
          data: {
            handoverId: id,
            lotId: lot.id,
            quantityMilli: n,
            condition: input.condition,
            reason: input.reason,
            evidenceReference: input.evidenceReference,
            actorId: actor.id,
          },
        });
        await tx.materialHandover.update({
          where: { id },
          data: { returnedMilli: { increment: n } },
        });
        await tx.materialLot.update({
          where: { id: lot.id },
          data: {
            ...(input.condition === 'DAMAGED'
              ? { damagedMilli: { decrement: n } }
              : { issuedMilli: { decrement: n } }),
            returnedMilli: { increment: n },
            quarantineMilli: { increment: n },
          },
        });
        await this.movement(tx, actor, lot.id, 'RETURN_QUARANTINED', n, r.id, input.reason);
        await this.readiness(tx, h.batchId);
        return { id: r.id };
      });
    });
  }
  async disposition(actor: Actor, id: string, input: C.MaterialDispositionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const r = await tx.materialReturn.findUnique({ where: { id } });
      if (!r) fail(404, 'NOT_FOUND', 'Return not found.');
      const lot = await this.lot(tx, r.lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.adjust');
      return this.command(tx, actor, id, 'stock.disposition', key, input, async () => {
        if (r.disposition !== 'AWAITING_INSPECTION')
          fail(409, 'ALREADY_DISPOSED', 'This return already has an audited disposition.');
        if (input.disposition === 'RESTOCK' && r.condition !== 'UNUSED')
          fail(
            409,
            'DAMAGED_STOCK',
            'Damaged or defective materials cannot be restored to production stock.',
          );
        await tx.materialReturn.update({
          where: { id },
          data: {
            disposition: input.disposition,
            dispositionActorId: actor.id,
            dispositionReason: input.reason,
          },
        });
        await tx.materialLot.update({
          where: { id: lot.id },
          data: {
            quarantineMilli: { decrement: r.quantityMilli },
            ...(input.disposition === 'RESTOCK'
              ? { availableMilli: { increment: r.quantityMilli } }
              : { damagedMilli: { increment: r.quantityMilli } }),
          },
        });
        await this.movement(
          tx,
          actor,
          lot.id,
          input.disposition,
          r.quantityMilli,
          id,
          input.reason,
        );
        return { id };
      });
    });
  }
  async consume(actor: Actor, id: string, input: C.MaterialConsumptionInput, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const h = await tx.materialHandover.findUnique({ where: { id } });
      if (!h) fail(404, 'NOT_FOUND', 'Handover not found.');
      const lot = await this.lot(tx, h.lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.adjust');
      await this.batch(tx, actor, h.batchId, lot.organizationId);
      return this.command(tx, actor, id, 'stock.consume', key, input, async () => {
        const receipt = await tx.materialReceipt.findUnique({ where: { handoverId: id } }),
          n = BigInt(input.quantityMilli);
        this.unitQuantity(lot.unit, n);
        const priorReturns = await tx.materialReturn.findMany({
          where: { handoverId: id, condition: { not: 'DAMAGED' } },
        });
        const unusedReturned = priorReturns.reduce((sum, row) => sum + row.quantityMilli, 0n);
        if (
          !receipt ||
          !['RECEIVED_CONFIRMED', 'DISCREPANCY_RECONCILED'].includes(h.status) ||
          n > receipt.receivedMilli - receipt.damagedMilli - unusedReturned - h.consumedMilli
        )
          fail(
            409,
            'INSUFFICIENT_RECEIVED',
            'Consumption requires sufficient acknowledged undamaged stock.',
          );
        await tx.materialHandover.update({
          where: { id },
          data: { consumedMilli: { increment: n } },
        });
        await tx.materialLot.update({
          where: { id: lot.id },
          data: { issuedMilli: { decrement: n }, consumedMilli: { increment: n } },
        });
        await this.movement(tx, actor, lot.id, 'CONSUMED', n, id, input.reason);
        return { id };
      });
    });
  }
  private unitQuantity(unit: string, n: bigint) {
    if (unit !== 'METERS' && n % 1000n !== 0n)
      fail(400, 'FRACTIONAL_STOCK_UNIT', 'Pieces and units require whole quantities.');
  }
  async reconcile(actor: Actor, id: string, input: { reason: string }, key?: string) {
    return iamTransaction(this.db, actor, async (tx) => {
      const h = await tx.materialHandover.findUnique({ where: { id } });
      if (!h) fail(404, 'NOT_FOUND', 'Handover not found.');
      const lot = await this.lot(tx, h.lotId);
      await this.permission(tx, actor, lot.organizationId, 'inventory.stock.adjust');
      await this.batch(tx, actor, h.batchId, lot.organizationId);
      return this.command(tx, actor, id, 'stock.reconcile', key, input, async () => {
        const receipt = await tx.materialReceipt.findUnique({ where: { handoverId: id } });
        if (!receipt || h.status !== 'DISCREPANCY_REPORTED')
          fail(409, 'NO_DISCREPANCY', 'An unresolved receipt discrepancy is required.');
        const record = await tx.materialReconciliation.create({
          data: { handoverId: id, actorId: actor.id, reason: input.reason },
        });
        if (receipt.shortageMilli > 0n)
          await tx.materialLot.update({
            where: { id: lot.id },
            data: {
              issuedMilli: { decrement: receipt.shortageMilli },
              damagedMilli: { increment: receipt.shortageMilli },
            },
          });
        await tx.materialHandover.update({
          where: { id },
          data: { status: 'DISCREPANCY_RECONCILED' },
        });
        await this.movement(
          tx,
          actor,
          lot.id,
          'DISCREPANCY_LOSS_SEGREGATED',
          receipt.shortageMilli,
          record.id,
          input.reason,
        );
        await this.readiness(tx, h.batchId);
        return { id: record.id };
      });
    });
  }
  private async readiness(tx: Db, batchId: string) {
    const batch = await tx.commercialBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { order: true },
    });
    const requirements = await tx.batchMaterialRequirement.findMany({ where: { batchId } });
    for (const requirement of requirements) {
      const handovers = await tx.materialHandover.findMany({ where: { batchId } });
      let confirmed = 0n,
        discrepancy = false,
        pendingVerification = batch.order.provenance !== 'SYNTHETIC';
      for (const h of handovers) {
        const lot = await this.lot(tx, h.lotId);
        if (lot.materialCode !== requirement.materialCode || lot.unit !== requirement.unit)
          continue;
        const receipt = await tx.materialReceipt.findUnique({ where: { handoverId: h.id } });
        if (h.status === 'DISCREPANCY_REPORTED') discrepancy = true;
        if (
          receipt &&
          receipt.source === 'ARTISAN_DIRECT' &&
          ['RECEIVED_CONFIRMED', 'DISCREPANCY_RECONCILED'].includes(h.status)
        ) {
          const priorReturns = await tx.materialReturn.findMany({
            where: { handoverId: h.id, condition: { not: 'DAMAGED' } },
          });
          const usable =
            receipt.receivedMilli -
            receipt.damagedMilli -
            priorReturns.reduce((sum, row) => sum + row.quantityMilli, 0n);
          if (usable > 0n && lot.provenance !== 'SYNTHETIC') pendingVerification = true;
          confirmed +=
            receipt.receivedMilli -
            receipt.damagedMilli -
            priorReturns.reduce((sum, row) => sum + row.quantityMilli, 0n);
        }
      }
      await tx.materialReadiness.upsert({
        where: { requirementId: requirement.id },
        create: {
          requirementId: requirement.id,
          batchId,
          materialCode: requirement.materialCode,
          readiness: discrepancy
            ? 'DISCREPANCY_BLOCKED'
            : confirmed >= BigInt(requirement.requiredMilli)
              ? pendingVerification
                ? 'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION'
                : 'SYNTHETIC_RECEIPT_ACKNOWLEDGED'
              : 'RECEIPT_INCOMPLETE',
        },
        update: {
          readiness: discrepancy
            ? 'DISCREPANCY_BLOCKED'
            : confirmed >= BigInt(requirement.requiredMilli)
              ? pendingVerification
                ? 'RECEIPT_ACKNOWLEDGED_PENDING_STOCK_VERIFICATION'
                : 'SYNTHETIC_RECEIPT_ACKNOWLEDGED'
              : 'RECEIPT_INCOMPLETE',
        },
      });
    }
  }
}
