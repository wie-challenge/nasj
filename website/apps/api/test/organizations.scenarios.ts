import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type {
  OrganizationMembershipView,
  InvitationView,
  MembershipView,
  OrganizationView,
  Page,
  OrganizationMemberView,
} from '@nasj/contracts';
import type { PrismaService } from '../src/database/prisma.service.js';

type Reply = { status: number; body: unknown };
type Client = {
  request(
    path: string,
    method?: string,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<Reply>;
};
type Fixture = { client: Client; me: { user: { id: string } } };
type ScenarioContext = {
  db: PrismaService;
  register(email: string, name: string): Promise<Fixture>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Reply>;
  check(name: string, run: () => Promise<void>): Promise<void>;
  mail: { token(email: string, path: string): Promise<string> };
};
export async function runOrganizationScenarios({
  db,
  register,
  mutate,
  check,
  mail,
}: ScenarioContext) {
  const owner = await register('org-owner@example.com', 'Organization Owner');
  const invitee = await register('org-invitee@example.com', 'Organization Invitee');
  const outsider = await register('org-outsider@example.com', 'Organization Outsider');
  const reviewer = await register('org-reviewer@example.com', 'Organization Reviewer');
  await db.user.update({ where: { id: reviewer.me.user.id }, data: { role: 'ADMIN' } });
  const base = {
    name: 'Synthetic Buyer Cooperative',
    type: 'BUYER_BUSINESS',
    region: 'Tunis',
    description: 'Synthetic buyer organization for access regression tests.',
    contactEmail: 'org-owner@example.com',
    representativeName: 'Organization Owner',
    country: 'TN',
    contactPhone: '+216 70000000',
  };
  let organization: OrganizationMembershipView;
  let otherOrganization: OrganizationMembershipView;
  const lastTokens = new Map<string, string>();
  const freshToken = async (email: string) => {
    const previous = lastTokens.get(email);
    for (let attempt = 0; attempt < 100; attempt++) {
      const token = await mail.token(email, '/invitations/accept');
      if (token !== previous) {
        lastTokens.set(email, token);
        return token;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('A newly rotated invitation email was not received.');
  };
  const invite = async (email: string, isManager = false) => {
    const reply = await mutate(
      owner.client,
      `/api/v1/organizations/${organization.id}/invitations`,
      'POST',
      { email, roles: ['BUYER_REPRESENTATIVE'], isManager },
    );
    assert.equal(reply.status, 201);
    const data = reply.body as { invitation: InvitationView; delivery: string };
    assert.equal(data.delivery, 'QUEUED');
    assert.equal('tokenHash' in data.invitation, false);
    return { invitation: data.invitation, token: await freshToken(email) };
  };
  await check(
    'organization onboarding denies public internal-operator creation, mass assignment and cross-tenant access',
    async () => {
      assert.equal(
        (await mutate(owner.client, '/api/v1/organizations', 'POST', { ...base, type: 'INTERNAL' }))
          .status,
        403,
      );
      assert.equal(
        (
          await mutate(owner.client, '/api/v1/organizations', 'POST', {
            ...base,
            approvalStatus: 'APPROVED',
          })
        ).status,
        400,
      );
      const created = await mutate(owner.client, '/api/v1/organizations', 'POST', base);
      assert.equal(created.status, 201);
      organization = created.body as OrganizationMembershipView;
      assert.equal(organization.approvalStatus, 'DRAFT');
      assert.equal(organization.myMembership.isManager, true);
      assert.deepEqual(organization.myMembership.roles, ['BUYER_REPRESENTATIVE']);
      assert.equal(
        (await outsider.client.request(`/api/v1/organizations/${organization.id}`)).status,
        403,
      );
      assert.equal(
        (await reviewer.client.request(`/api/v1/organizations/${organization.id}`)).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/invitations`,
            'POST',
            { email: 'org-invitee@example.com', roles: ['BUYER_REPRESENTATIVE'] },
          )
        ).status,
        403,
      );
      const other = await mutate(invitee.client, '/api/v1/organizations', 'POST', {
        ...base,
        name: 'Other Synthetic Buyer',
        contactEmail: 'org-invitee@example.com',
      });
      assert.equal(other.status, 201);
      otherOrganization = other.body as OrganizationMembershipView;
      assert.equal(
        (
          await mutate(owner.client, `/api/v1/organizations/${otherOrganization.id}`, 'PATCH', {
            name: 'Unauthorized change',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/submit-approval`,
            'POST',
            {},
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/admin/organizations/${organization.id}/approve`,
            'POST',
            { reason: 'Cannot approve own organization' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            reviewer.client,
            `/api/v1/admin/organizations/${organization.id}/reject`,
            'POST',
            { reason: 'Synthetic profile needs correction' },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(owner.client, `/api/v1/organizations/${organization.id}`, 'PATCH', {
            description: 'Corrected synthetic profile for approval.',
          })
        ).status,
        200,
      );
      const corrected = await owner.client.request(`/api/v1/organizations/${organization.id}`);
      assert.equal((corrected.body as OrganizationView).contactPhone, base.contactPhone);
      assert.equal((corrected.body as OrganizationView).country, base.country);
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/submit-approval`,
            'POST',
            {},
          )
        ).status,
        200,
      );
      const approved = await mutate(
        reviewer.client,
        `/api/v1/admin/organizations/${organization.id}/approve`,
        'POST',
        { reason: 'Synthetic verification approved' },
      );
      assert.equal(approved.status, 200);
      assert.equal((approved.body as OrganizationView).approvedByUserId, reviewer.me.user.id);
    },
  );
  await check(
    'invitation email binding, hashed secrets, type-specific roles and concurrent single-use acceptance',
    async () => {
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/invitations`,
            'POST',
            { email: 'org-outsider@example.com', roles: ['FINANCE_MANAGER'] },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            reviewer.client,
            `/api/v1/organizations/${organization.id}/invitations`,
            'POST',
            { email: 'org-outsider@example.com', roles: ['BUYER_REPRESENTATIVE'] },
          )
        ).status,
        403,
      );
      const invitation = await invite('org-invitee@example.com');
      const stored = await db.invitation.findUniqueOrThrow({
        where: { id: invitation.invitation.id },
      });
      assert.notEqual(stored.tokenHash, invitation.token);
      assert.equal(stored.tokenHash, createHash('sha256').update(invitation.token).digest('hex'));
      assert.equal(
        (
          await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
            token: invitation.token,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(invitee.client, '/api/v1/invitations/accept', 'POST', {
            token: '0'.repeat(64),
          })
        ).status,
        400,
      );
      const results = await Promise.all([
        mutate(invitee.client, '/api/v1/invitations/accept', 'POST', { token: invitation.token }),
        mutate(invitee.client, '/api/v1/invitations/accept', 'POST', { token: invitation.token }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      assert.equal(
        await db.organizationMember.count({
          where: { organizationId: organization.id, userId: invitee.me.user.id },
        }),
        1,
      );
      const detail = await invitee.client.request(`/api/v1/organizations/${organization.id}`);
      assert.equal(detail.status, 200);
      assert.deepEqual((detail.body as OrganizationMembershipView).myMembership.roles, [
        'BUYER_REPRESENTATIVE',
      ]);
      assert.equal((detail.body as OrganizationMembershipView).myMembership.isManager, false);
      assert.equal(
        (
          await mutate(
            invitee.client,
            `/api/v1/organizations/${organization.id}/members/${organization.myMembership.id}`,
            'PATCH',
            { isManager: true, reason: 'Attempted self escalation' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/invitations`,
            'POST',
            { email: 'org-invitee@example.com', roles: ['BUYER_REPRESENTATIVE'] },
          )
        ).status,
        409,
      );
      const auditText = JSON.stringify(
        await db.auditEvent.findMany({ where: { organizationId: organization.id } }),
      );
      assert.equal(auditText.includes(invitation.token), false);
      assert.equal(auditText.includes(stored.tokenHash), false);
    },
  );
  await check('expired, cancelled and rotated invitations deny stale links', async () => {
    const pending = await invite('org-outsider@example.com');
    await db.invitation.update({
      where: { id: pending.invitation.id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (
        await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
          token: pending.token,
        })
      ).status,
      400,
    );
    const rotated = await mutate(
      owner.client,
      `/api/v1/organizations/${organization.id}/invitations/${pending.invitation.id}/resend`,
      'POST',
      {},
    );
    assert.equal(rotated.status, 200);
    const fresh = await freshToken('org-outsider@example.com');
    assert.notEqual(fresh, pending.token);
    assert.equal(
      (
        await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
          token: pending.token,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          owner.client,
          `/api/v1/organizations/${organization.id}/invitations/${pending.invitation.id}`,
          'DELETE',
          {},
        )
      ).status,
      200,
    );
    assert.equal(
      (await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', { token: fresh }))
        .status,
      400,
    );
  });
  await check(
    'invitation acceptance rechecks suspended organization, inviter status and current manager authority',
    async () => {
      const pending = await invite('org-outsider@example.com');
      await db.user.update({ where: { id: owner.me.user.id }, data: { status: 'SUSPENDED' } });
      assert.equal(
        (
          await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
            token: pending.token,
          })
        ).status,
        403,
      );
      await db.user.update({ where: { id: owner.me.user.id }, data: { status: 'ACTIVE' } });
      await db.organizationMember.update({
        where: { id: organization.myMembership.id },
        data: { isManager: false },
      });
      assert.equal(
        (
          await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
            token: pending.token,
          })
        ).status,
        403,
      );
      await db.organizationMember.update({
        where: { id: organization.myMembership.id },
        data: { isManager: true },
      });
      assert.equal(
        (
          await mutate(
            reviewer.client,
            `/api/v1/admin/organizations/${organization.id}/suspend`,
            'POST',
            { reason: 'Synthetic suspension to verify access' },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
            token: pending.token,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            reviewer.client,
            `/api/v1/admin/organizations/${organization.id}/approve`,
            'POST',
            { reason: 'Synthetic suspension completed' },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await mutate(outsider.client, '/api/v1/invitations/accept', 'POST', {
            token: pending.token,
          })
        ).status,
        200,
      );
    },
  );
  await check(
    'membership revocation is immediate and isolated while last manager and self role changes are protected',
    async () => {
      const members = await owner.client.request(
        `/api/v1/organizations/${organization.id}/members`,
      );
      assert.equal(members.status, 200);
      const target = (members.body as Page<OrganizationMemberView>).items.find(
        (m) => m.userId === invitee.me.user.id,
      );
      assert.ok(target);
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/members/${organization.myMembership.id}/roles`,
            'PUT',
            { roles: ['BUYER_REPRESENTATIVE'], reason: 'Self role edit prohibited' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/members/${organization.myMembership.id}`,
            'DELETE',
            { reason: 'Cannot leave without successor' },
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/members/${target.id}`,
            'PATCH',
            { status: 'SUSPENDED', reason: 'Scoped synthetic suspension' },
          )
        ).status,
        200,
      );
      assert.equal(
        (await invitee.client.request(`/api/v1/organizations/${organization.id}`)).status,
        403,
      );
      assert.equal(
        (await invitee.client.request(`/api/v1/organizations/${otherOrganization.id}`)).status,
        200,
      );
      assert.equal((await invitee.client.request('/api/v1/me')).status, 200);
      const summary = await invitee.client.request('/api/v1/organizations');
      assert.equal(summary.status, 200);
      assert.equal(JSON.stringify(summary.body).includes('contactEmail'), false);
      assert.equal(JSON.stringify(summary.body).includes('description'), false);
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/members/${target.id}`,
            'DELETE',
            { reason: 'Scoped synthetic revocation' },
          )
        ).status,
        200,
      );
      const revoked = await db.organizationMember.findUniqueOrThrow({ where: { id: target.id } });
      assert.equal(revoked.status, 'REVOKED');
      assert.equal(
        (await invitee.client.request(`/api/v1/organizations/${organization.id}`)).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/members/${otherOrganization.myMembership.id}`,
            'PATCH',
            { status: 'SUSPENDED', reason: 'Cross organization member substitution' },
          )
        ).status,
        404,
      );
      const restored = await mutate(
        owner.client,
        `/api/v1/organizations/${organization.id}/members/${target.id}`,
        'PATCH',
        { status: 'ACTIVE', isManager: true, reason: 'Assign replacement organization manager' },
      );
      assert.equal(restored.status, 200);
      assert.equal((restored.body as MembershipView).isManager, true);
      assert.equal(
        (
          await mutate(
            owner.client,
            `/api/v1/organizations/${organization.id}/members/${organization.myMembership.id}`,
            'DELETE',
            { reason: 'Leave with replacement manager present' },
          )
        ).status,
        200,
      );
      assert.equal(
        (await owner.client.request(`/api/v1/organizations/${organization.id}`)).status,
        403,
      );
      assert.equal((await owner.client.request('/api/v1/me')).status, 200);
    },
  );
  await check(
    'concurrent manager departures preserve a verified organization manager',
    async () => {
      const memberships = await db.organizationMember.findMany({
        where: { organizationId: organization.id },
      });
      const inviteeMembership = memberships.find((member) => member.userId === invitee.me.user.id);
      const outsiderMembership = memberships.find(
        (member) => member.userId === outsider.me.user.id,
      );
      assert.ok(inviteeMembership);
      assert.ok(outsiderMembership);
      assert.equal(
        (
          await mutate(
            invitee.client,
            `/api/v1/organizations/${organization.id}/members/${outsiderMembership.id}`,
            'PATCH',
            { isManager: true, reason: 'Assign second manager for safe handover' },
          )
        ).status,
        200,
      );
      const results = await Promise.all([
        mutate(
          invitee.client,
          `/api/v1/organizations/${organization.id}/members/${inviteeMembership.id}`,
          'DELETE',
          { reason: 'Concurrent synthetic manager departure' },
        ),
        mutate(
          outsider.client,
          `/api/v1/organizations/${organization.id}/members/${outsiderMembership.id}`,
          'DELETE',
          { reason: 'Concurrent synthetic manager departure' },
        ),
      ]);
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      assert.equal(
        await db.organizationMember.count({
          where: {
            organizationId: organization.id,
            status: 'ACTIVE',
            isManager: true,
            user: { status: 'ACTIVE', emailVerified: true },
          },
        }),
        1,
      );
    },
  );
}
