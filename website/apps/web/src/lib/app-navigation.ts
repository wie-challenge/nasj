// Single source of truth for signed-in navigation. Add a route here, not in the layout.
import type { OperationalPersona } from '@nasj/contracts';
export type NavIcon =
  | 'organization'
  | 'artisan'
  | 'support'
  | 'approval'
  | 'users'
  | 'audit'
  | 'privacy'
  | 'catalog'
  | 'custom'
  | 'cart'
  | 'orders'
  | 'requests'
  | 'products'
  | 'finance'
  | 'profile'
  | 'delivery'
  | 'tasks';
export type NavCount = 'requests' | 'finance' | 'organizations' | 'orders' | 'cart';
export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  match?: string;
  count?: NavCount;
};
export type NavSection = { label: string; items: NavItem[]; adminOnly?: boolean };

export type WorkspaceCapabilities = {
  buyer: boolean;
  artisan: boolean;
  operator: boolean;
  admin: boolean;
};
export type WorkspaceAction = NavItem & { description: string };
export const dashboardActions: Record<
  'admin' | 'buyer' | 'association' | 'operator',
  WorkspaceAction[]
> = {
  admin: [
    {
      href: '/admin/retention',
      label: 'Retention and purpose',
      icon: 'privacy',
      description: 'Review dataset purpose, preservation and pending retention policy.',
    },
    {
      href: '/admin/users',
      label: 'User accounts',
      icon: 'users',
      description: 'Find people, manage account access and revoke sessions.',
    },
    {
      href: '/admin/organizations',
      label: 'Organization approvals',
      icon: 'approval',
      description: 'Review buyer businesses, associations and approval requests.',
    },
    {
      href: '/admin/coordinators',
      label: 'Coordinator access',
      icon: 'artisan',
      description: 'Invite coordinators and manage their association affiliations.',
    },
    {
      href: '/admin/operators',
      label: 'Internal personnel',
      icon: 'organization',
      description: 'Invite NASJ operators and assign buyer and partner accounts.',
    },
    {
      href: '/admin/participant-concerns',
      label: 'Participant concerns',
      icon: 'support',
      description: 'Review concerns independently of association operations.',
    },
    {
      href: '/admin/privacy-requests',
      label: 'Privacy requests',
      icon: 'privacy',
      description: 'Review correction, export and deletion requests.',
    },
    {
      href: '/admin/authorizations',
      label: 'Authorization policies',
      icon: 'approval',
      description: 'Record reviewed participation and evidence policies.',
    },
    {
      href: '/admin/access',
      label: 'Access diagnostics',
      icon: 'users',
      description: 'Check effective roles, permissions and affiliations.',
    },
    {
      href: '/admin/audit',
      label: 'Audit history',
      icon: 'audit',
      description: 'Inspect attributable platform governance actions.',
    },
  ],
  buyer: [
    {
      href: '/procurement',
      label: 'Procurement requests',
      icon: 'organization',
      description: 'Prepare a request, answer questions and follow your company’s orders.',
    },
    {
      href: '/commerce/catalog',
      label: 'Craft catalog',
      icon: 'artisan',
      description: 'Explore craft categories and example products for your next request.',
    },
    {
      href: '/directory',
      label: 'Production directory',
      icon: 'artisan',
      description: 'Search privacy-safe declared capacity by craft, region and period.',
    },
    {
      href: '/procurement/documents',
      label: 'Procurement documents',
      icon: 'audit',
      description: 'Find your company’s quote, contract and delivery records.',
    },
    {
      href: '/procurement/products',
      label: 'Approved products',
      icon: 'approval',
      description: 'Start a fresh request from a previously approved product.',
    },
    {
      href: '/buyer/company',
      label: 'Company profile and representatives',
      icon: 'users',
      description: 'Manage your company and independently authorized purchasing access.',
    },
    {
      href: '/product-design',
      label: 'Product design and sampling',
      icon: 'organization',
      description: 'Review specification versions and approve or reject production samples.',
    },
  ],
  association: [
    {
      href: '/association/materials',
      label: 'Materials and receipts',
      icon: 'artisan',
      description: 'Review assigned materials and report receipt discrepancies.',
    },
    {
      href: '/directory',
      label: 'Production directory',
      icon: 'artisan',
      description: 'Review your group capacity and search other declared production periods.',
    },
    {
      href: '/association/pickups',
      label: 'Assigned pickups',
      icon: 'artisan',
      description: 'See collection windows and record handover for your association.',
    },
    {
      href: '/association/production',
      label: 'Assigned production work',
      icon: 'artisan',
      description: 'Record progress for assigned artisans without accepting work for them.',
    },
    {
      href: '/association/offers',
      label: 'Assigned production offers',
      icon: 'artisan',
      description: 'Explain issued work and record a reported decision for an assigned artisan.',
    },
    {
      href: '/association/artisans',
      label: 'Assigned artisan registry',
      icon: 'artisan',
      description: 'View your assigned artisans, profiles and declared capacity.',
    },
    {
      href: '/association/artisans/new',
      label: 'Add artisan',
      icon: 'users',
      description: 'Record a participant and their authorization without creating a login.',
    },
    {
      href: '/association/coordinators',
      label: 'Association coordinators',
      icon: 'organization',
      description: 'See the coordinators affiliated with your organization.',
    },
    {
      href: '/procurement/discussions',
      label: 'Order discussions',
      icon: 'support',
      description: 'Discuss accepted orders involving your assigned participants.',
    },
  ],
  operator: [
    {
      href: '/operator/sales',
      label: 'Commercial pipeline',
      icon: 'organization',
      description: 'Qualify prospects and preserve pilot proposal history.',
    },
    {
      href: '/operator/inventory',
      label: 'Materials inventory',
      icon: 'organization',
      description: 'Manage scoped material lots, reservations and custody.',
    },
    {
      href: '/operator/finance',
      label: 'Finance and closure',
      icon: 'audit',
      description: 'Review deposits, payout approvals, disputes and closure blockers.',
    },
    {
      href: '/procurement',
      label: 'Procurement requests',
      icon: 'organization',
      description: 'Review assigned buyer requests, clarify specifications and prepare quotations.',
    },
    {
      href: '/directory',
      label: 'Production directory',
      icon: 'artisan',
      description: 'Search privacy-safe declared capacity by craft, region and period.',
    },
    {
      href: '/product-design',
      label: 'Product design and sampling',
      icon: 'organization',
      description: 'Versioned specifications, paid sample terms and buyer sample approval.',
    },
    {
      href: '/operator/planning',
      label: 'Production planning',
      icon: 'artisan',
      description:
        'Rank eligible groups, allocate an order across groups and compare delivery plans.',
    },
    {
      href: '/collaboration',
      label: 'Collaboration and support',
      icon: 'support',
      description: 'Exceptions, schedule changes, counteroffers, support cases and notifications.',
    },
    {
      href: '/intelligence',
      label: 'Production intelligence',
      icon: 'audit',
      description: 'Delay risk, forecast comparison, fairness review and business metrics.',
    },
    {
      href: '/operator/activity',
      label: 'Assigned account activity',
      icon: 'audit',
      description: 'Follow activity across your assigned buyers and partner organizations.',
    },
  ],
};
const people: NavSection = {
  label: 'People',
  items: [
    {
      href: '/nasj/organizations',
      label: 'Companies and associations',
      icon: 'organization',
      count: 'organizations',
    },
  ],
};
const delivery: NavSection = {
  label: 'Delivery',
  items: [{ href: '/nasj/requests', label: 'Requests', icon: 'requests', count: 'requests' }],
};
const finance: NavSection = {
  label: 'Finance',
  items: [
    { href: '/nasj/finance', label: 'Prices and invoices', icon: 'finance', count: 'finance' },
  ],
};
const personaNavigation: Record<OperationalPersona, NavSection[]> = {
  // The NASJ admin can do the work of the operator, the coordinator and finance.
  PLATFORM_ADMIN: [
    people,
    delivery,
    finance,
    {
      label: 'Platform',
      items: [
        { href: '/admin/users', label: 'Users', icon: 'users' },
        { href: '/admin/audit', label: 'Activity history', icon: 'audit' },
      ],
    },
  ],
  NASJ_OPERATOR: [people],
  NASJ_COORDINATOR: [delivery],
  NASJ_FINANCE: [finance],
  BUYER_REPRESENTATIVE: [
    {
      label: 'Buy',
      items: [
        { href: '/catalog', label: 'Catalog', icon: 'catalog' },
        { href: '/custom-request', label: 'Custom request', icon: 'custom' },
        { href: '/cart', label: 'Cart', icon: 'cart', count: 'cart' },
        { href: '/orders', label: 'Your orders', icon: 'orders', count: 'orders' },
      ],
    },
  ],
  ASSOCIATION_COORDINATOR: [
    {
      label: 'Association',
      items: [
        { href: '/association/requests', label: 'Requests', icon: 'requests', count: 'requests' },
        { href: '/association/products', label: 'Your products', icon: 'products' },
        { href: '/association/artisanes', label: 'Artisanes', icon: 'artisan' },
      ],
    },
  ],
};
export function workspaceNavigation(
  context: import('@nasj/contracts').IdentityContext | null | undefined,
  _legacy: WorkspaceCapabilities,
): NavSection[] {
  const personas = context?.personas ?? [];
  const sections = [...new Set(personas.flatMap((persona) => personaNavigation[persona]))];
  const own = context?.organizations.find(
    (org) => org.type !== 'INTERNAL' && org.approvalStatus === 'APPROVED',
  );
  sections.push({
    label: 'Account',
    items: [
      ...(own ? [{ href: '/team', label: 'Your team', icon: 'users' as const }] : []),
      { href: '/settings/profile', label: 'Your profile', icon: 'profile' },
    ],
  });
  return sections;
}
export function workspaceRoleLabel(
  context: import('@nasj/contracts').IdentityContext | null | undefined,
) {
  const labels = {
    PLATFORM_ADMIN: 'NASJ admin',
    NASJ_OPERATOR: 'NASJ operator',
    NASJ_COORDINATOR: 'NASJ coordinator',
    NASJ_FINANCE: 'NASJ finance',
    BUYER_REPRESENTATIVE: 'Company representative',
    ASSOCIATION_COORDINATOR: 'Association representative',
  };
  return context?.personas.map((p) => labels[p]).join(' · ') || 'Your account';
}

export function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true;
  // Admin and member organization pages share a segment; keep them in their own sections.
  if (!item.match) return false;
  if (item.match === '/organizations')
    return pathname.startsWith('/organizations/') || pathname === '/settings/organizations';
  return pathname.startsWith(item.match);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}
