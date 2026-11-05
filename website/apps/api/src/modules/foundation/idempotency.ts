import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { Db } from './transaction.js';
import { fail } from '../../common/errors.js';

export function validateIdempotencyKey(value: string | undefined): string | undefined {
  if (value !== undefined && !/^[a-zA-Z0-9_-]{16,128}$/.test(value))
    fail(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Use an idempotency key of 16 to 128 letters, digits, underscores or hyphens.',
    );
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Expected a JSON request.');
  return encoded;
}
// Caller holds IAM transaction locks and checks current resource authorization BEFORE this call.
// Resource ID, actor and operation form the scope; keys are never global bearer credentials.
export async function replaySafe<T extends Prisma.InputJsonValue>(
  tx: Db,
  scope: { actorId: string; resourceId: string; operation: string; key?: string },
  input: Prisma.InputJsonValue,
  execute: () => Promise<T>,
): Promise<T> {
  const key = validateIdempotencyKey(scope.key);
  if (!key) return execute();
  const where = {
    actorId: scope.actorId,
    resourceId: scope.resourceId,
    operation: scope.operation,
    keyHash: createHash('sha256').update(key).digest('hex'),
  };
  const payloadHash = createHash('sha256').update(canonical(input)).digest('hex');
  const previous = await tx.commandOutcome.findUnique({
    where: { actorId_resourceId_operation_keyHash: where },
  });
  if (previous) {
    if (previous.payloadHash !== payloadHash)
      fail(409, 'IDEMPOTENCY_CONFLICT', 'This key was already used with a different request.');
    return previous.result as T;
  }
  const result = await execute();
  await tx.commandOutcome.create({ data: { ...where, payloadHash, result } });
  return result;
}
