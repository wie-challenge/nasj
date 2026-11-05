import type { ProductSampleRequest } from '@prisma/client';
import type { Db } from '../foundation/transaction.js';
import { fail } from '../../common/errors.js';

/** Completion milestone in the existing payable ledger; no transfer or verified-payment claim. */
export async function recognizeSampleObligation(tx: Db, sample: ProductSampleRequest) {
  if (
    !sample.responsibleArtisanProfileId ||
    !sample.acceptedAt ||
    !sample.termsSha256 ||
    sample.acceptedTermsSha256 !== sample.termsSha256 ||
    sample.compensationMillimes === null ||
    sample.materialCostMillimes === null
  )
    fail(
      409,
      'SAMPLE_TERMS_REQUIRED',
      'The artisan must accept the exact paid sample terms before completion.',
    );
  const amount =
    sample.compensationMillimes + (sample.reimburseMaterials ? sample.materialCostMillimes : 0n);
  const existing = await tx.artisanPayable.findUnique({ where: { sampleRequestId: sample.id } });
  if (existing) return existing;
  return tx.artisanPayable.create({
    data: {
      sampleRequestId: sample.id,
      artisanProfileId: sample.responsibleArtisanProfileId,
      milestone: 'SAMPLE_COMPLETION',
      policyVersion: 1,
      quantity: 1,
      unitPayMillimes: amount,
      amountMillimes: amount,
      sourceEventId: `sample.completed:${sample.id}`,
      provenance: sample.timeEvidence === 'SYNTHETIC' ? 'SYNTHETIC' : 'DECLARED',
      termsSnapshot: JSON.stringify({
        termsSha256: sample.acceptedTermsSha256,
        compensationMillimes: sample.compensationMillimes.toString(),
        materialCostMillimes: sample.materialCostMillimes.toString(),
        reimburseMaterials: sample.reimburseMaterials,
        milestone: 'COMPLETION',
        sampleQuantity: sample.sampleQuantity,
        compensationScope: 'TOTAL_AGREED_SAMPLE_JOB',
        payment: 'RECOGNIZED_NOT_PAID',
      }),
    },
  });
}
