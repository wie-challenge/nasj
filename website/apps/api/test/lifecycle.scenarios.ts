import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../src/config/env.js';
import type { PrismaService } from '../src/database/prisma.service.js';

type Result = { status: number; body: unknown };
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<Result>;
};
type Registered = { client: Client; me: { user: { id: string } } };
type Harness = {
  db: PrismaService;
  config: AppConfig;
  client(): Client;
  register(email: string, name: string): Promise<Registered>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Result>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
const value = <T>(result: Result) => result.body as T;
export async function runLifecycleScenarios({
  db,
  config,
  client,
  register,
  mutate,
  check,
}: Harness) {
  const manager = await register('lifecycle-manager@example.com', 'Synthetic Manager');
  const colleague = await register('lifecycle-colleague@example.com', 'Synthetic Colleague');
  const administrator = await register('lifecycle-admin@example.com', 'Synthetic Administrator');
  await db.user.update({ where: { id: administrator.me.user.id }, data: { role: 'ADMIN' } });
  const organization = await db.organization.create({
    data: {
      name: 'Synthetic Lifecycle Organization',
      slug: 'synthetic-lifecycle',
      type: 'BUYER_BUSINESS',
      region: 'Tunis',
      description: 'Synthetic lifecycle fixture',
      contactEmail: 'lifecycle@example.com',
      representativeName: 'Synthetic Manager',
      createdByUserId: manager.me.user.id,
    },
  });
  await db.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: manager.me.user.id,
      isManager: true,
      roles: { create: { role: 'BUYER', assignedByUserId: manager.me.user.id } },
    },
  });
  await check(
    'organization responsibility summary blocks last-manager self-deactivation',
    async () => {
      const responsibilities = await manager.client.request('/api/v1/me/responsibilities');
      assert.equal(responsibilities.status, 200);
      assert.deepEqual(value<{ items: unknown[] }>(responsibilities).items, [
        {
          organizationId: organization.id,
          name: organization.name,
          reason: 'LAST_ACTIVE_MANAGER',
        },
      ]);
      assert.deepEqual(
        value<{ items: unknown[] }>(await colleague.client.request('/api/v1/me/responsibilities'))
          .items,
        [],
      );
      const blocked = await mutate(manager.client, '/api/v1/me/deactivate', 'POST', {
        confirmation: 'DEACTIVATE',
      });
      assert.equal(blocked.status, 409);
      assert.equal(value<{ code: string }>(blocked).code, 'LAST_ORGANIZATION_MANAGER');
      assert.equal((await manager.client.request('/api/v1/me')).status, 200);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: manager.me.user.id } })).status,
        'ACTIVE',
      );
    },
  );
  await check(
    'emergency administrator suspension remains possible and audits unmanaged organizations',
    async () => {
      const suspended = await mutate(
        administrator.client,
        `/api/v1/admin/users/${manager.me.user.id}`,
        'PATCH',
        { status: 'SUSPENDED' },
      );
      assert.equal(suspended.status, 200);
      assert.equal('unmanagedOrganizationIds' in value<object>(suspended), false);
      assert.equal((await manager.client.request('/api/v1/me')).status, 401);
      const event = await db.auditEvent.findFirstOrThrow({
        where: { targetId: manager.me.user.id, action: 'account.access.update' },
        orderBy: { timestamp: 'desc' },
      });
      assert.deepEqual(
        (event.after as { unmanagedOrganizationIds: string[] }).unmanagedOrganizationIds,
        [organization.id],
      );
      assert.equal(JSON.stringify(event.after).includes('password'), false);
      assert.equal(
        (
          await mutate(administrator.client, `/api/v1/admin/users/${manager.me.user.id}`, 'PATCH', {
            status: 'ACTIVE',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await manager.client.request('/api/auth/sign-in/email', 'POST', {
            email: 'lifecycle-manager@example.com',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        200,
      );
    },
  );
  await check(
    'profile updates record field names without recording submitted personal values',
    async () => {
      const name = 'Private Synthetic Name';
      assert.equal((await mutate(colleague.client, '/api/v1/me', 'PATCH', { name })).status, 200);
      const event = await db.auditEvent.findFirstOrThrow({
        where: { actorId: colleague.me.user.id, action: 'account.profile.update' },
      });
      assert.deepEqual(event.after, { fields: ['name'] });
      assert.equal(JSON.stringify(event).includes(name), false);
    },
  );
  await check(
    'revoke-other-sessions preserves current login and writes safe audit atomically',
    async () => {
      const second = client();
      assert.equal(
        (
          await second.request('/api/auth/sign-in/email', 'POST', {
            email: 'lifecycle-colleague@example.com',
            password: 'Foundation-test-password-2026!',
          })
        ).status,
        200,
      );
      assert.equal((await second.request('/api/v1/me')).status, 200);
      const before = await db.session.findMany({ where: { userId: colleague.me.user.id } });
      assert.ok(before.length >= 2);
      assert.equal(
        (
          await mutate(colleague.client, '/api/v1/me/sessions/revoke-others', 'POST', {
            userId: manager.me.user.id,
          })
        ).status,
        400,
      );
      const revoked = await mutate(
        colleague.client,
        '/api/v1/me/sessions/revoke-others',
        'POST',
        {},
      );
      assert.equal(revoked.status, 200);
      assert.ok(value<{ revokedCount: number }>(revoked).revokedCount >= 1);
      assert.equal((await second.request('/api/v1/me')).status, 401);
      assert.equal((await colleague.client.request('/api/v1/me')).status, 200);
      assert.equal((await manager.client.request('/api/v1/me')).status, 200);
      const event = await db.auditEvent.findFirstOrThrow({
        where: { actorId: colleague.me.user.id, action: 'account.sessions.revoke_others' },
      });
      for (const session of before)
        assert.equal(JSON.stringify(event).includes(session.token), false);
    },
  );
  await check(
    'reassigned organization responsibility permits deactivation and retains memberships/audit',
    async () => {
      await db.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: colleague.me.user.id,
          isManager: true,
          roles: { create: { role: 'BUYER', assignedByUserId: manager.me.user.id } },
        },
      });
      assert.deepEqual(
        value<{ items: unknown[] }>(await manager.client.request('/api/v1/me/responsibilities'))
          .items,
        [],
      );
      const result = await mutate(manager.client, '/api/v1/me/deactivate', 'POST', {
        confirmation: 'DEACTIVATE',
      });
      assert.equal(result.status, 200);
      assert.equal((await manager.client.request('/api/v1/me')).status, 401);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: manager.me.user.id } })).status,
        'DISABLED',
      );
      assert.equal(
        await db.organizationMember.count({
          where: { organizationId: organization.id, userId: manager.me.user.id },
        }),
        1,
      );
      const audit = await db.auditEvent.findFirstOrThrow({
        where: { actorId: manager.me.user.id, action: 'account.deactivate' },
      });
      assert.deepEqual(audit.after, { status: 'DISABLED' });
      assert.equal((await colleague.client.request('/api/v1/me')).status, 200);
    },
  );
  await check(
    'individual session revocation records safe durable history before ending current access',
    async () => {
      const current = await colleague.client.request('/api/v1/me');
      const id = value<{ session: { id: string } }>(current).session.id;
      const token = (await db.session.findUniqueOrThrow({ where: { id } })).token;
      assert.equal(
        (await mutate(administrator.client, `/api/v1/me/sessions/${id}`, 'DELETE', {})).status,
        404,
      );
      assert.equal(
        (await mutate(colleague.client, `/api/v1/me/sessions/${id}`, 'DELETE', {})).status,
        200,
      );
      assert.equal((await colleague.client.request('/api/v1/me')).status, 401);
      const event = await db.auditEvent.findFirstOrThrow({
        where: { targetId: id, action: 'account.session.revoke' },
      });
      assert.deepEqual(event.after, { current: true });
      assert.equal(JSON.stringify(event).includes(token), false);
    },
  );
  await check(
    'trusted recovery CLI validates operator and target before scoped audited handover',
    async () => {
      const replacement = await register(
        'lifecycle-replacement@example.com',
        'Synthetic Replacement',
      );
      const environment = Object.fromEntries(
        Object.entries(config).map(([key, item]) => [
          key,
          Array.isArray(item) ? item.join(',') : String(item ?? ''),
        ]),
      );
      const exec = promisify(execFile);
      const command = (args: string[]) =>
        exec(
          'pnpm',
          [
            'exec',
            'tsx',
            '--tsconfig',
            'apps/api/tsconfig.json',
            'scripts/recover-organization-manager.ts',
            ...args,
          ],
          {
            cwd: fileURLToPath(new URL('../../../', import.meta.url)),
            env: { ...process.env, ...environment, DATABASE_URL: config.DATABASE_URL },
            maxBuffer: 1024 * 1024,
          },
        );
      const argumentsFor = (operator: string, target = 'lifecycle-replacement@example.com') => [
        '--organization',
        organization.id,
        '--email',
        target,
        '--operator',
        operator,
        '--reason',
        'Synthetic incident manager handover',
      ];
      await assert.rejects(command(argumentsFor('lifecycle-colleague@example.com')));
      await assert.rejects(command(['--organization', organization.id]));
      await db.user.update({
        where: { id: replacement.me.user.id },
        data: { status: 'SUSPENDED' },
      });
      await assert.rejects(command(argumentsFor('lifecycle-admin@example.com')));
      await db.user.update({
        where: { id: replacement.me.user.id },
        data: { status: 'ACTIVE', emailVerified: false },
      });
      await assert.rejects(command(argumentsFor('lifecycle-admin@example.com')));
      assert.equal(
        await db.organizationMember.count({
          where: { organizationId: organization.id, userId: replacement.me.user.id },
        }),
        0,
      );
      await db.user.update({
        where: { id: replacement.me.user.id },
        data: { emailVerified: true },
      });
      const recovered = await command(argumentsFor('lifecycle-admin@example.com'));
      assert.match(recovered.stdout, /Organization manager recovered/);
      assert.equal(recovered.stdout.includes('lifecycle-replacement@example.com'), false);
      const membership = await db.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: replacement.me.user.id,
          },
        },
        include: { roles: true },
      });
      assert.equal(membership.status, 'ACTIVE');
      assert.equal(membership.isManager, true);
      assert.deepEqual(
        membership.roles.map((role) => role.role),
        ['BUYER'],
      );
      const event = await db.auditEvent.findFirstOrThrow({
        where: { targetId: membership.id, action: 'organization.manager.recover' },
      });
      assert.equal(event.actorId, administrator.me.user.id);
      assert.equal(event.reason, 'Synthetic incident manager handover');
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'SUSPENDED', isManager: false },
      });
      await command(argumentsFor('lifecycle-admin@example.com'));
      assert.equal(await db.membershipRole.count({ where: { membershipId: membership.id } }), 1);
      assert.equal(
        await db.auditEvent.count({
          where: { targetId: membership.id, action: 'organization.manager.recover' },
        }),
        2,
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: replacement.me.user.id } })).role,
        'USER',
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: manager.me.user.id } })).status,
        'DISABLED',
      );
    },
  );
}
