import assert from 'node:assert/strict';
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
type Member = { client: Client; me: { user: { id: string } } };
type Harness = {
  db: PrismaService;
  register(email: string, name: string): Promise<Member>;
  mutate(client: Client, path: string, method: string, body: unknown): Promise<Result>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
};
const value = <T>(result: Result) => result.body as T;
export async function runArtisanScenarios({ db, register, mutate, check }: Harness) {
  const artisan = await register('artisan-foundation@example.com', 'Independent Artisan');
  const coordinator = await register(
    'coordinator-foundation@example.com',
    'Association Coordinator',
  );
  const outsider = await register('outsider-artisan@example.com', 'Unrelated Artisan');
  const profile = {
    processingConsent: true,
    policyVersion: 'artisan-profile-v1',
    displayName: 'Synthetic Artisan',
    region: 'Tunis',
    preferredLanguage: 'fr',
    contactPhone: '+21600000000',
    contactVisibility: 'PRIVATE',
    availabilityStatus: 'AVAILABLE',
    experienceDescription: 'Synthetic craft experience',
    equipment: ['Loom'],
  };
  let artisanId = '';
  const craftSkillId = 'weaving';
  await check(
    'independent artisan profile, safe projection and strict mass assignment',
    async () => {
      assert.equal((await artisan.client.request('/api/v1/artisans/me')).status, 404);
      assert.equal(
        (
          await mutate(artisan.client, '/api/v1/artisans/me', 'PATCH', {
            ...profile,
            userId: outsider.me.user.id,
          })
        ).status,
        400,
      );
      const { processingConsent: _consent, policyVersion: _policy, ...withoutConsent } = profile;
      assert.equal(
        (await mutate(artisan.client, '/api/v1/artisans/me', 'PATCH', withoutConsent)).status,
        400,
      );
      const created = await mutate(artisan.client, '/api/v1/artisans/me', 'PATCH', profile);
      assert.equal(created.status, 200);
      const body = value<{ id: string; userId: string }>(created);
      artisanId = body.id;
      assert.equal(body.userId, artisan.me.user.id);
      assert.equal(
        await db.associationMembership.count({ where: { artisanProfileId: artisanId } }),
        0,
      );
      assert.equal('email' in value<object>(created), false);
      assert.equal((await outsider.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
      const catalog = await artisan.client.request('/api/v1/craft-skills');
      assert.equal(catalog.status, 200);
      assert.ok(
        value<{ items: { id: string }[] }>(catalog).items.some((s) => s.id === craftSkillId),
      );
    },
  );
  await check('artisan skill replacement validates catalog, duplicates and ownership', async () => {
    assert.equal(
      (
        await mutate(artisan.client, '/api/v1/artisans/me/skills', 'PUT', {
          items: [{ craftSkillId: 'missing' }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(artisan.client, '/api/v1/artisans/me/skills', 'PUT', {
          items: [{ craftSkillId }, { craftSkillId }],
        })
      ).status,
      400,
    );
    const result = await mutate(artisan.client, '/api/v1/artisans/me/skills', 'PUT', {
      items: [{ craftSkillId, proficiency: 'ADVANCED', evidence: 'Synthetic training' }],
    });
    assert.equal(result.status, 200);
    assert.equal(value<{ items: unknown[] }>(result).items.length, 1);
    assert.equal(
      (await mutate(outsider.client, `/api/v1/artisans/${artisanId}/skills`, 'PUT', { items: [] }))
        .status,
      403,
    );
  });
  const capacity = {
    craftSkillId,
    unitType: 'HOURS',
    quantity: 12.5,
    effectiveFrom: '2027-01-01T00:00:00Z',
    effectiveTo: '2027-01-08T00:00:00Z',
  };
  await check(
    'voluntary capacity preserves history and rejects wearable or health fields',
    async () => {
      for (const forbidden of ['sensorData', 'strainReason', 'healthStatus', 'wearableSummary']) {
        assert.equal(
          (
            await mutate(artisan.client, '/api/v1/artisans/me/capacity', 'POST', {
              ...capacity,
              [forbidden]: 'forbidden',
            })
          ).status,
          400,
        );
      }
      assert.equal(
        (
          await mutate(artisan.client, '/api/v1/artisans/me/capacity', 'POST', {
            ...capacity,
            quantity: -1,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await mutate(artisan.client, '/api/v1/artisans/me/capacity', 'POST', {
            ...capacity,
            effectiveTo: capacity.effectiveFrom,
          })
        ).status,
        400,
      );
      const first = await mutate(artisan.client, '/api/v1/artisans/me/capacity', 'POST', capacity);
      assert.equal(first.status, 201);
      assert.equal(value<{ quantity: string }>(first).quantity, '12.5');
      const second = await mutate(artisan.client, '/api/v1/artisans/me/capacity', 'POST', {
        ...capacity,
        quantity: 8,
      });
      assert.equal(second.status, 201);
      const history = await artisan.client.request('/api/v1/artisans/me/capacity');
      assert.equal(value<{ items: unknown[] }>(history).items.length, 2);
      const versions = await db.capacityDeclaration.findMany({
        where: { artisanProfileId: artisanId },
      });
      assert.equal(versions.filter((row) => row.supersededAt === null).length, 1);
      assert.equal(
        versions.find((row) => row.id === value<{ id: string }>(first).id)?.supersededAt instanceof
          Date,
        true,
      );
      assert.equal(
        (
          await mutate(artisan.client, '/api/v1/artisans/me/capacity', 'POST', {
            ...capacity,
            effectiveFrom: new Date(
              new Date(capacity.effectiveFrom).getTime() + 86400000,
            ).toISOString(),
          })
        ).status,
        409,
      );
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: artisanId } }),
        2,
      );

      assert.equal(
        (
          await db.capacityDeclaration.findUniqueOrThrow({
            where: { id: value<{ id: string }>(first).id },
          })
        ).quantity.toString(),
        '12.5',
      );
      await mutate(artisan.client, '/api/v1/artisans/me', 'PATCH', {
        ...profile,
        availabilityStatus: 'PAUSED',
      });
      assert.equal(
        await db.capacityDeclaration.count({ where: { artisanProfileId: artisanId } }),
        2,
      );
    },
  );
  const association = await db.organization.create({
    data: {
      name: 'Synthetic Artisan Association',
      slug: 'artisan-test-association',
      type: 'ASSOCIATION',
      approvalStatus: 'APPROVED',
      country: 'TN',
      region: 'Tunis',
      description: 'Synthetic test association',
      representativeName: 'Test Representative',
      contactEmail: 'association@example.com',
      createdByUserId: coordinator.me.user.id,
    },
  });
  const otherAssociation = await db.organization.create({
    data: {
      name: 'Unrelated Synthetic Association',
      slug: 'artisan-test-other-association',
      type: 'ASSOCIATION',
      approvalStatus: 'APPROVED',
      country: 'TN',
      region: 'Tunis',
      description: 'Synthetic test association',
      representativeName: 'Test Representative',
      contactEmail: 'other-association@example.com',
      createdByUserId: outsider.me.user.id,
    },
  });
  const membership = await db.organizationMember.create({
    data: {
      organizationId: association.id,
      userId: coordinator.me.user.id,
      roles: {
        create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: coordinator.me.user.id },
      },
    },
  });
  await db.organizationMember.create({
    data: {
      organizationId: otherAssociation.id,
      userId: outsider.me.user.id,
      roles: { create: { role: 'ASSOCIATION_COORDINATOR', assignedByUserId: outsider.me.user.id } },
    },
  });
  let relationshipId = '';
  await check(
    'association participation requires explicit consent and an approved association',
    async () => {
      assert.equal(
        (
          await mutate(artisan.client, '/api/v1/artisans/me/associations', 'POST', {
            organizationId: association.id,
            policyVersion: 'association-v1',
            consent: false,
          })
        ).status,
        400,
      );
      const linked = await mutate(artisan.client, '/api/v1/artisans/me/associations', 'POST', {
        organizationId: association.id,
        policyVersion: 'association-v1',
        consent: true,
      });
      assert.equal(linked.status, 201);
      relationshipId = value<{ items: { id: string }[] }>(linked).items[0].id;
      assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
      const choices = await artisan.client.request(
        `/api/v1/artisans/me/associations/${relationshipId}/coordinators`,
      );
      assert.equal(value<{ items: { id: string }[] }>(choices).items[0].id, coordinator.me.user.id);
    },
  );
  const grantInput = {
    organizationId: association.id,
    delegateUserId: coordinator.me.user.id,
    scopes: ['artisan.profile.read', 'artisan.profile.update', 'artisan.capacity.update'],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    policyVersion: 'delegation-v1',
    consent: true,
  };
  let grantId = '';
  await check(
    'delegation is precise, audited, email-private and restricted to linked association',
    async () => {
      assert.equal(
        (
          await mutate(artisan.client, '/api/v1/artisans/me/delegations', 'POST', {
            ...grantInput,
            organizationId: otherAssociation.id,
            delegateUserId: outsider.me.user.id,
          })
        ).status,
        403,
      );
      const grant = await mutate(
        artisan.client,
        '/api/v1/artisans/me/delegations',
        'POST',
        grantInput,
      );
      assert.equal(grant.status, 201);
      grantId = value<{ id: string }>(grant).id;
      const read = await coordinator.client.request(`/api/v1/artisans/${artisanId}`);
      assert.equal(read.status, 200);
      assert.equal(value<{ contactPhone: string }>(read).contactPhone, '');
      const {
        contactVisibility: _visibility,
        processingConsent: _consent,
        policyVersion: _policy,
        ...assistedInput
      } = profile;
      const assistedUpdate = await mutate(
        coordinator.client,
        `/api/v1/artisans/${artisanId}`,
        'PATCH',
        {
          ...assistedInput,
          contactPhone: '',
          displayName: 'Assisted Synthetic Artisan',
        },
      );
      assert.equal(assistedUpdate.status, 200);
      assert.equal(
        (await db.artisanProfile.findUniqueOrThrow({ where: { id: artisanId } })).contactPhone,
        profile.contactPhone,
      );
      assert.equal(
        (await mutate(coordinator.client, `/api/v1/artisans/${artisanId}`, 'PATCH', profile))
          .status,
        400,
      );

      assert.equal(
        (await coordinator.client.request(`/api/v1/artisans/${artisanId}/capacity`)).status,
        403,
      );
      assert.equal(
        (
          await mutate(coordinator.client, `/api/v1/artisans/${artisanId}/skills`, 'PUT', {
            items: [],
          })
        ).status,
        403,
      );
      const update = await mutate(
        coordinator.client,
        `/api/v1/artisans/${artisanId}/capacity`,
        'POST',
        { ...capacity, quantity: 9 },
      );
      assert.equal(update.status, 201);
      assert.equal(
        value<{ declaredByUserId: string }>(update).declaredByUserId,
        coordinator.me.user.id,
      );
      const event = await db.auditEvent.findFirstOrThrow({
        where: { targetId: value<{ id: string }>(update).id },
      });
      assert.equal(event.actorId, coordinator.me.user.id);
      assert.equal(event.organizationId, association.id);
      assert.equal(JSON.stringify(event.after).includes(grantId), true);
      assert.equal(JSON.stringify(event.after).includes(profile.contactPhone), false);
    },
  );
  await check(
    'E04-09 aggregate capacity requires explicit sharing, deduplicates grants and reflects revocation',
    async () => {
      const url = `/api/v1/associations/${association.id}/capacity`;
      const empty = await coordinator.client.request(url);
      assert.equal(empty.status, 200);
      assert.equal(value<{ population: number }>(empty).population, 0);
      assert.equal((await outsider.client.request(url)).status, 403);
      const input = { ...grantInput, scopes: ['artisan.capacity.read'] };
      const first = await mutate(artisan.client, '/api/v1/artisans/me/delegations', 'POST', input);
      const second = await mutate(artisan.client, '/api/v1/artisans/me/delegations', 'POST', input);
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      const visible = await coordinator.client.request(url);
      const data = value<{
        population: number;
        items: { declared: string; committed: string; free: string | null }[];
      }>(visible);
      assert.equal(visible.status, 200);
      assert.equal(data.population, 1);
      assert.ok(data.items.length);
      assert.equal(JSON.stringify(data).includes(artisanId), false);
      assert.equal(JSON.stringify(data).includes(profile.contactPhone), false);
      assert.equal(JSON.stringify(data).includes('unitPayMillimes'), false);
      for (const grant of [first, second])
        assert.equal(
          (
            await mutate(
              artisan.client,
              `/api/v1/artisans/me/delegations/${value<{ id: string }>(grant).id}`,
              'DELETE',
              {},
            )
          ).status,
          200,
        );
      assert.equal(
        value<{ population: number }>(await coordinator.client.request(url)).population,
        0,
      );
    },
  );
  await check(
    'delegate membership suspension removes access immediately and leaves owner access',
    async () => {
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'SUSPENDED' },
      });
      assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
      assert.equal((await artisan.client.request('/api/v1/artisans/me')).status, 200);
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
      assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 200);
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'REVOKED' },
      });
      assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
      await db.organizationMember.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
      await db.organization.update({
        where: { id: association.id },
        data: { approvalStatus: 'SUSPENDED' },
      });
      assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
      await db.organization.update({
        where: { id: association.id },
        data: { approvalStatus: 'APPROVED' },
      });
    },
  );
  await check('revoked delegation and expired delegation lose access immediately', async () => {
    assert.equal(
      (await mutate(artisan.client, `/api/v1/artisans/me/delegations/${grantId}`, 'DELETE', {}))
        .status,
      200,
    );
    assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
    const next = await mutate(
      artisan.client,
      '/api/v1/artisans/me/delegations',
      'POST',
      grantInput,
    );
    grantId = value<{ id: string }>(next).id;
    await db.delegationGrant.update({ where: { id: grantId }, data: { expiresAt: new Date(0) } });
    assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
    assert.equal(
      (
        await mutate(artisan.client, '/api/v1/artisans/me/delegations', 'POST', {
          ...grantInput,
          expiresAt: '2000-01-01T00:00:00Z',
        })
      ).status,
      400,
    );
  });
  await check('consent withdrawal and relationship withdrawal revoke assisted access', async () => {
    const next = await mutate(
      artisan.client,
      '/api/v1/artisans/me/delegations',
      'POST',
      grantInput,
    );
    grantId = value<{ id: string }>(next).id;
    await db.consentRecord.updateMany({
      where: { userId: artisan.me.user.id, purpose: `delegation:${grantId}` },
      data: { withdrawnAt: new Date() },
    });
    assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
    const last = await mutate(
      artisan.client,
      '/api/v1/artisans/me/delegations',
      'POST',
      grantInput,
    );
    grantId = value<{ id: string }>(last).id;
    assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 200);
    assert.equal(
      (
        await mutate(
          artisan.client,
          `/api/v1/artisans/me/associations/${relationshipId}`,
          'DELETE',
          {},
        )
      ).status,
      200,
    );
    assert.equal((await coordinator.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
    assert.equal(
      (await db.delegationGrant.findUniqueOrThrow({ where: { id: grantId } })).status,
      'REVOKED',
    );
    assert.equal((await artisan.client.request('/api/v1/artisans/me')).status, 200);
  });
  await check('platform administrator has no implicit artisan or delegation access', async () => {
    await db.user.update({ where: { id: outsider.me.user.id }, data: { role: 'ADMIN' } });
    assert.equal((await outsider.client.request(`/api/v1/artisans/${artisanId}`)).status, 403);
    assert.equal(
      (await mutate(outsider.client, `/api/v1/artisans/${artisanId}/capacity`, 'POST', capacity))
        .status,
      403,
    );
    await db.user.update({ where: { id: outsider.me.user.id }, data: { role: 'USER' } });
  });
}
