import { randomUUID } from 'node:crypto';
import { emailSchema, resourceIdSchema } from '../packages/contracts/src/index.js';
import { loadConfig } from '../apps/api/src/config/env.js';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';

const args = process.argv.slice(2).filter((value) => value !== '--');
const allowed = new Set(['--organization', '--email', '--operator', '--reason']);
const flags = new Map<string, string>();
let valid = args.length === 8;
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i];
  const value = args[i + 1];
  if (!allowed.has(flag) || flags.has(flag) || !value || value.startsWith('--')) valid = false;
  else flags.set(flag, value.trim());
}
const organization = resourceIdSchema.safeParse(flags.get('--organization'));
const email = emailSchema.safeParse(flags.get('--email'));
const operator = emailSchema.safeParse(flags.get('--operator'));
const reason = flags.get('--reason') ?? '';
if (
  !valid ||
  !organization.success ||
  !email.success ||
  !operator.success ||
  reason.length < 5 ||
  reason.length > 500
) {
  console.error(
    'Usage: pnpm db:recover-organization-manager -- --organization <id> --email <active-verified-account> --operator <active-verified-admin> --reason <5-500 characters>',
  );
  process.exit(1);
}
const db = new PrismaService(loadConfig());
try {
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
      const [target, actingOperator, org] = await Promise.all([
        tx.user.findUnique({
          where: { email: email.data },
          select: { id: true, emailVerified: true, status: true },
        }),
        tx.user.findUnique({
          where: { email: operator.data },
          select: { id: true, emailVerified: true, status: true, role: true },
        }),
        tx.organization.findUnique({
          where: { id: organization.data },
          select: { id: true, type: true },
        }),
      ]);
      if (
        !org ||
        !target?.emailVerified ||
        target.status !== 'ACTIVE' ||
        !actingOperator?.emailVerified ||
        actingOperator.status !== 'ACTIVE' ||
        actingOperator.role !== 'ADMIN'
      ) {
        throw new Error('Recovery prerequisites were not met.');
      }
      const existing = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: org.id, userId: target.id },
        },
      });
      const defaultRoles =
        org.type === 'BUYER_BUSINESS'
          ? ['BUYER' as const]
          : org.type === 'ASSOCIATION'
            ? ['ASSOCIATION_COORDINATOR' as const]
            : [];
      const membership = await tx.organizationMember.upsert({
        where: {
          organizationId_userId: { organizationId: org.id, userId: target.id },
        },
        create: {
          organizationId: org.id,
          userId: target.id,
          isManager: true,
          status: 'ACTIVE',
          roles: {
            create: defaultRoles.map((role) => ({ role, assignedByUserId: actingOperator.id })),
          },
        },
        update: { isManager: true, status: 'ACTIVE', suspendedAt: null, revokedAt: null },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actingOperator.id,
          targetType: 'OrganizationMember',
          targetId: membership.id,
          organizationId: org.id,
          action: 'organization.manager.recover',
          reason,
          correlationId: randomUUID(),
          before: {
            existed: Boolean(existing),
            status: existing?.status ?? null,
            isManager: existing?.isManager ?? false,
          },
          after: {
            userId: target.id,
            status: 'ACTIVE',
            isManager: true,
            source: 'TRUSTED_OPERATOR_CLI',
          },
        },
      });
      return { organizationId: org.id, userId: target.id };
    },
    { maxWait: 15000, timeout: 15000 },
  );
  console.log(
    `Organization manager recovered: organization=${result.organizationId} account=${result.userId}`,
  );
} catch {
  console.error(
    'Recovery failed. Verify database readiness, organization, active verified target account and active verified administrator operator.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
