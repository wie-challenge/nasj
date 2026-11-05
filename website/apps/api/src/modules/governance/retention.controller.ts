import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { PrismaService } from '../../database/prisma.service.js';
import { iamTransaction } from '../foundation/transaction.js';
import { replaySafe, validateIdempotencyKey } from '../foundation/idempotency.js';
import { audit } from '../foundation/audit.js';
import { RETENTION_VERSION, RETENTION_INVENTORY, RETENTION_BOUNDARY } from './retention.js';
const review = z
  .object({
    version: z.literal(RETENTION_VERSION),
    purpose: z.string().trim().min(10).max(500),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
@Controller('api/v1/governance/retention')
export class RetentionController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Get() get(@CurrentUser() a: Actor) {
    return iamTransaction(this.db, a, async (tx) => {
      if (a.role !== 'ADMIN') fail(404, 'NOT_FOUND', 'Governance inventory unavailable.');
      const reviews = await tx.auditEvent.findMany({
        where: { action: 'privacy.retention.review', targetId: RETENTION_VERSION },
        select: { id: true, actorId: true, timestamp: true, reason: true },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });
      return {
        version: RETENTION_VERSION,
        inventory: RETENTION_INVENTORY,
        boundary: RETENTION_BOUNDARY,
        reviewStatus: 'PENDING_QUALIFIED_POLICY_REVIEW',
        purgeEnabled: false,
        reviews,
      };
    });
  }
  @Post('review') review(
    @CurrentUser() a: Actor,
    @Body(new ZodValidationPipe(review)) i: z.infer<typeof review>,
    @Headers('idempotency-key') k?: string,
  ) {
    return iamTransaction(this.db, a, async (tx) => {
      if (a.role !== 'ADMIN') fail(404, 'NOT_FOUND', 'Governance inventory unavailable.');
      if (!k) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'An Idempotency-Key is required.');
      validateIdempotencyKey(k);
      return replaySafe(
        tx,
        {
          actorId: a.id,
          resourceId: RETENTION_VERSION,
          operation: 'privacy.retention.review',
          key: k,
        },
        i,
        async () => {
          await audit(tx, a, {
            action: 'privacy.retention.review',
            targetType: 'RetentionInventory',
            targetId: RETENTION_VERSION,
            reason: i.reason,
            after: { purpose: i.purpose, legalApproved: false, purgeEnabled: false },
          });
          return {
            version: RETENTION_VERSION,
            reviewStatus: 'OPERATIONAL_REVIEW_RECORDED_LEGAL_POLICY_PENDING',
            purgeEnabled: false,
          };
        },
      );
    });
  }
}
