export const businessRoles = [
  'BUYER_REPRESENTATIVE',
  'NASJ_OPERATOR',
  'BUYER',
  'ARTISAN',
  'ASSOCIATION_COORDINATOR',
  'PRODUCTION_MANAGER',
  'FINANCE_MANAGER',
  'QUALITY_INSPECTOR',
  'INVENTORY_LOGISTICS_COORDINATOR',
  'SUPPORT',
  'RESEARCHER_ANALYST',
  'PRODUCT_DESIGNER',
  'BUSINESS_DEVELOPMENT',
] as const;
export type BusinessRole = (typeof businessRoles)[number];
export const foundationPermissions = [
  'platform.users.manage',
  'platform.organizations.approve',
  'platform.roles.manage',
  'buyer.rfq.create',
  'buyer.rfq.read',
  'buyer.quotation.negotiate',
  'buyer.quotation.approve',
  'buyer.invoice.read',
  'buyer.delivery.confirm',
  'operator.quotation.prepare',
  'operator.production.manage',
  'operator.quality.approve',
  'operator.logistics.manage',
  'operator.traceability.publish',
  'operator.payment.record',
  'operator.payout.initiate',
  'operator.payout.approve',
  'operator.accounts.read',
  'association.artisan.create',
  'association.artisan.read',
  'association.artisan.update',
  'association.capacity.record',
  'association.offer.recordDecision',
  'association.production.update',
  'association.handover.record',
  'artisan.consent.record',
  'artisan.consent.review',
  'artisan.affiliation.transfer',
  'audit.read.scoped',
  'privacy.request.manage',
] as const;
export type FoundationPermission = (typeof foundationPermissions)[number];
export const operationalPersonas = [
  'PLATFORM_ADMIN',
  'NASJ_OPERATOR',
  'NASJ_COORDINATOR',
  'NASJ_FINANCE',
  'BUYER_REPRESENTATIVE',
  'ASSOCIATION_COORDINATOR',
] as const;
export type OperationalPersona = (typeof operationalPersonas)[number];
export const permissionCatalog = [
  ...foundationPermissions,
  'organization.create',
  'organization.read',
  'organization.update',
  'organization.approval.request',
  'organization.approval.review',
  'organization.members.read',
  'organization.members.invite',
  'organization.members.update',
  'organization.members.remove',
  'organization.roles.assign',
  'organization.roles.revoke',
  'artisan.profile.read',
  'artisan.profile.update',
  'artisan.skills.manage',
  'artisan.capacity.read',
  'artisan.capacity.update',
  'artisan.associations.manage',
  'delegation.create',
  'delegation.read',
  'delegation.revoke',
  'finance.quotation.read',
  'finance.payout.read',
  'finance.payable.reconcile',
  'finance.deposit.record',
  'finance.deposit.review',
  'finance.payout.request',
  'finance.payout.execute',
  'finance.dispute.manage',
  'finance.adjustment.propose',
  'finance.adjustment.approve',
  'finance.closure.assess',
  'finance.accounting.export',
  'inventory.stock.read',
  'inventory.stock.register',
  'inventory.stock.reserve',
  'inventory.stock.handover',
  'inventory.stock.receive',
  'inventory.stock.adjust',

  'finance.payout.approve',
  'quality.inspection.read',
  'quality.inspection.create',
  'support.case.read',
  'support.case.manage',
  'privacy.request.create',
  'privacy.request.review',
  'audit.read',
  'production.manage',
  'inventory.manage',
  'analytics.aggregate.read',
  'product.specification.manage',
  'buyer.relationship.manage',
] as const;
export type Permission = (typeof permissionCatalog)[number];
const orgManagement: Permission[] = [
  'organization.read',
  'organization.update',
  'organization.approval.request',
  'organization.members.read',
  'organization.members.invite',
  'organization.members.update',
  'organization.members.remove',
  'organization.roles.assign',
  'organization.roles.revoke',
  'audit.read',
];
export const rolePermissions: Record<BusinessRole, readonly Permission[]> = {
  BUYER_REPRESENTATIVE: [
    'organization.read',
    'buyer.rfq.create',
    'buyer.rfq.read',
    'buyer.quotation.negotiate',
    'buyer.invoice.read',
    'buyer.delivery.confirm',
  ],
  NASJ_OPERATOR: [
    'organization.read',
    'operator.accounts.read',
    'inventory.stock.read',
    'operator.quotation.prepare',
    'operator.production.manage',
    'operator.quality.approve',
    'operator.logistics.manage',
    'operator.traceability.publish',
    'operator.payment.record',
    'audit.read.scoped',
  ],
  BUYER: [
    'organization.read',
    'finance.quotation.read',
    'buyer.rfq.create',
    'buyer.rfq.read',
    'buyer.quotation.negotiate',
    'buyer.invoice.read',
    'buyer.delivery.confirm',
  ],
  ARTISAN: ['organization.read'],
  ASSOCIATION_COORDINATOR: [
    'organization.read',
    'association.artisan.create',
    'association.artisan.read',
    'association.artisan.update',
    'association.capacity.record',
    'association.offer.recordDecision',
    'association.production.update',
    'association.handover.record',
    'inventory.stock.receive',
    'artisan.consent.record',
  ],
  PRODUCTION_MANAGER: ['organization.read', 'production.manage'],
  FINANCE_MANAGER: [
    'organization.read',
    'finance.quotation.read',
    'finance.payout.read',
    'finance.payout.approve',
  ],
  QUALITY_INSPECTOR: ['organization.read', 'quality.inspection.read', 'quality.inspection.create'],
  INVENTORY_LOGISTICS_COORDINATOR: [
    'organization.read',
    'inventory.manage',
    'inventory.stock.read',
    'inventory.stock.register',
    'inventory.stock.reserve',
    'inventory.stock.handover',
    'inventory.stock.adjust',
  ],
  SUPPORT: ['organization.read', 'support.case.read', 'support.case.manage'],
  RESEARCHER_ANALYST: ['organization.read', 'analytics.aggregate.read'],
  PRODUCT_DESIGNER: ['organization.read', 'product.specification.manage'],
  BUSINESS_DEVELOPMENT: ['organization.read', 'buyer.relationship.manage'],
};
export function rolesForOrganization(type: string): BusinessRole[] {
  if (type === 'BUYER_BUSINESS') return ['BUYER_REPRESENTATIVE'];
  if (['ASSOCIATION', 'PARTNER_COOPERATIVE'].includes(type)) return ['ASSOCIATION_COORDINATOR'];
  if (type === 'INTERNAL') return ['NASJ_OPERATOR'];
  return [];
}
export function grantAllowed(type: string, permission: string) {
  return (
    (type === 'BUYER_BUSINESS' &&
      ['buyer.rfq.create', 'buyer.quotation.negotiate', 'buyer.quotation.approve'].includes(
        permission,
      )) ||
    (type === 'INTERNAL' &&
      [
        'operator.payout.initiate',
        'operator.payout.approve',
        'finance.payout.approve',
        'finance.payable.reconcile',
        'finance.deposit.record',
        'finance.deposit.review',
        'finance.payout.request',
        'finance.payout.execute',
        'finance.dispute.manage',
        'finance.adjustment.propose',
        'finance.adjustment.approve',
        'finance.closure.assess',
        'finance.accounting.export',
        'inventory.stock.read',
        'inventory.stock.register',
        'inventory.stock.reserve',
        'inventory.stock.handover',
        'inventory.stock.receive',
        'inventory.stock.adjust',
      ].includes(permission))
  );
}
export function permissionsForMembership(member: {
  isManager: boolean;
  roles: { role: BusinessRole }[];
  status: string;
  organization?: { approvalStatus: string; type?: string };
  permissionGrants?: { permission: string; enabled?: boolean }[];
}): Permission[] {
  if (member.status !== 'ACTIVE') return [];
  const permissions = new Set<Permission>(['organization.read']);
  for (const role of member.roles) {
    if (
      member.organization?.type &&
      !rolesForOrganization(member.organization.type).includes(role.role) &&
      !(member.organization.type === 'BUYER_BUSINESS' && role.role === 'BUYER') &&
      !(
        member.organization.type === 'INTERNAL' &&
        !['BUYER', 'BUYER_REPRESENTATIVE', 'ARTISAN', 'ASSOCIATION_COORDINATOR'].includes(role.role)
      )
    )
      continue;
    for (const permission of rolePermissions[role.role] ?? []) permissions.add(permission);
  }
  for (const grant of member.permissionGrants ?? [])
    if (
      grantAllowed(member.organization?.type ?? '', grant.permission) &&
      member.roles.some((r) =>
        member.organization?.type === 'BUYER_BUSINESS'
          ? ['BUYER', 'BUYER_REPRESENTATIVE'].includes(r.role)
          : ['NASJ_OPERATOR', 'FINANCE_MANAGER', 'INVENTORY_LOGISTICS_COORDINATOR'].includes(
              r.role,
            ),
      )
    ) {
      if (grant.enabled === false) permissions.delete(grant.permission as Permission);
      else permissions.add(grant.permission as Permission);
    }
  if (member.isManager)
    for (const permission of orgManagement) {
      if (
        member.organization?.type &&
        member.organization.type !== 'BUYER_BUSINESS' &&
        permission !== 'organization.read' &&
        permission !== 'organization.update' &&
        permission !== 'organization.approval.request' &&
        permission !== 'organization.members.read' &&
        permission !== 'audit.read'
      )
        continue;
      permissions.add(permission);
    }
  if (member.organization && member.organization.approvalStatus !== 'APPROVED') {
    const governance: Permission[] = [
      'organization.read',
      'organization.update',
      'organization.approval.request',
      'organization.members.read',
    ];
    return [...permissions].filter((p) => governance.includes(p));
  }
  return [...permissions];
}
