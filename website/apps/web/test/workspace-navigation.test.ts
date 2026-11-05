import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IdentityContext, OperationalPersona } from '@nasj/contracts';
import { workspaceNavigation, workspaceRoleLabel } from '../src/lib/app-navigation';
const legacy = { buyer: false, artisan: false, operator: false, admin: false };
function context(persona?: OperationalPersona): IdentityContext {
  return {
    personas: persona ? [persona] : [],
    organizations: [],
    coordinatorOrganizationId: null,
    linkedArtisanProfileId: null,
    landingPath: '/dashboard',
    realPayoutsEnabled: false,
    independentContactPath: '/participant-support',
  };
}
function routes(persona?: OperationalPersona) {
  return workspaceNavigation(context(persona), legacy).flatMap((s) => s.items.map((i) => i.href));
}
test('the NASJ admin can reach the operator, coordinator and finance work', () => {
  const links = routes('PLATFORM_ADMIN');
  for (const path of ['/nasj/organizations', '/nasj/requests', '/nasj/finance', '/admin/users'])
    assert(links.includes(path));
  assert(!links.includes('/catalog') && !links.includes('/association/artisanes'));
});
test('each NASJ role sees only its own job', () => {
  const operator = routes('NASJ_OPERATOR');
  const coordinator = routes('NASJ_COORDINATOR');
  const finance = routes('NASJ_FINANCE');
  assert(operator.includes('/nasj/organizations'));
  assert(!operator.includes('/nasj/requests') && !operator.includes('/nasj/finance'));
  assert(coordinator.includes('/nasj/requests'));
  assert(!coordinator.includes('/nasj/organizations') && !coordinator.includes('/nasj/finance'));
  assert(finance.includes('/nasj/finance'));
  assert(!finance.includes('/nasj/organizations') && !finance.includes('/nasj/requests'));
  for (const links of [operator, coordinator, finance])
    assert(!links.some((p) => p.startsWith('/admin') || p.startsWith('/association')));
});
test('company and association navigation stay separate', () => {
  const company = routes('BUYER_REPRESENTATIVE'),
    association = routes('ASSOCIATION_COORDINATOR');
  for (const path of ['/catalog', '/custom-request', '/cart', '/orders'])
    assert(company.includes(path));
  assert(!company.some((p) => p.startsWith('/association') || p.startsWith('/nasj')));
  for (const path of ['/association/requests', '/association/products', '/association/artisanes'])
    assert(association.includes(path));
  assert(!association.includes('/catalog') && !association.includes('/cart'));
});
test('missing identity context never invents operational access from legacy capability flags', () => {
  const sections = workspaceNavigation(null, { ...legacy, admin: true, buyer: true });
  assert(
    !sections
      .flatMap((s) => s.items)
      .some((i) => i.href.startsWith('/admin') || i.href === '/catalog'),
  );
  assert.equal(
    workspaceRoleLabel(context('ASSOCIATION_COORDINATOR')),
    'Association representative',
  );
  assert.equal(workspaceRoleLabel(null), 'Your account');
});
