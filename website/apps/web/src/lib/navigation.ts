export function safeNext(value: string | null | undefined) {
  const fallback = '/dashboard';
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes('\\') || decoded.startsWith('//') || /[\r\n]/.test(decoded))
      return fallback;
    const url = new URL(value, 'https://nasj.invalid');
    if (url.origin !== 'https://nasj.invalid' || !isWorkspacePath(url.pathname)) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
export function safeApiPath(path: string) {
  try {
    const decoded = decodeURIComponent(path);
    return (
      (path.startsWith('/api/v1/') || path.startsWith('/api/auth/')) &&
      !/[\\\r\n]/.test(decoded) &&
      !decoded.split('/').some((part) => part === '.' || part === '..')
    );
  } catch {
    return false;
  }
}

function isWorkspacePath(path: string) {
  return (
    [
      '/dashboard',
      '/admin',
      '/operator',
      '/operator/activity',
      '/operator/inventory',
      '/operator/finance',
      '/operator/sales',
      '/admin/retention',
      '/operator/planning',
      '/catalog',
      '/intelligence',
      '/collaboration',
      '/buyer',
      '/buyer/company',
      '/buyer/representatives',
      '/association',
      '/association/pickups',
      '/association/materials',
      '/association/artisans',
      '/association/artisans/new',
      '/association/coordinators',
      '/admin/coordinators',
      '/admin/operators',
      '/admin/participant-concerns',
      '/admin/authorizations',
      '/admin/access',
      '/commerce/buyer',
      '/commerce/catalog',
      '/commerce/artisan',
      '/commerce/operator',
      '/directory',
      '/settings/profile',
      '/settings/account',
      '/settings/security',
      '/settings/privacy',
      '/artisan/assisted',
      '/settings/organizations',
      '/settings/notifications',
      '/artisan/profile',
      '/artisan/skills',
      '/artisan/capacity',
      '/artisan/compensation',
      '/artisan/materials',
      '/artisan/associations',
      '/artisan/delegations',
      '/invitations/accept',
      '/admin/users',
      '/admin/organizations',
      '/admin/approvals',
      '/admin/audit',
      '/admin/privacy-requests',
      '/support/cases',
      '/support/privacy',
    ].includes(path) ||
    /^\/operator\/planning\/[a-zA-Z0-9_-]+$/.test(path) ||
    /^\/procurement(?:\/[a-zA-Z0-9_-]+(?:\/discussion)?)?$/.test(path) ||
    /^\/association\/artisans\/[a-zA-Z0-9_-]+(?:\/history)?$/.test(path) ||
    /^\/directory\/[A-Za-z0-9_-]+$/.test(path) ||
    /^\/operator\/partners\/[a-zA-Z0-9_-]+$/.test(path) ||
    /^\/organizations\/[a-zA-Z0-9_-]+\/settings$/.test(path) ||
    /^\/artisan\/assisted\/[a-zA-Z0-9_-]+$/.test(path) ||
    /^\/organizations\/[a-zA-Z0-9_-]+\/audit$/.test(path) ||
    /^\/admin\/organizations\/[a-zA-Z0-9_-]+$/.test(path)
  );
}
