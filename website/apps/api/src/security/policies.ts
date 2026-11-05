import type { AppConfig } from '../config/env.js';
export type PolicyName =
  | 'login'
  | 'registration'
  | 'reset'
  | 'verification'
  | 'api'
  | 'admin'
  | 'feedback';
export function policyName(path: string): PolicyName {
  if (path === '/api/auth/sign-in/email' || path.startsWith('/api/auth/two-factor/'))
    return 'login';
  if (path === '/api/auth/sign-up/email' || path === '/api/v1/participant-concerns')
    return 'registration';
  if (
    [
      '/api/auth/request-password-reset',
      '/api/auth/reset-password',
      '/api/auth/change-password',
      '/api/auth/change-email',
    ].includes(path)
  )
    return 'reset';
  if (['/api/auth/send-verification-email', '/api/auth/verify-email'].includes(path))
    return 'verification';
  if (path.startsWith('/api/v1/admin/')) return 'admin';
  // A showroom feedback write is bounded separately so anonymous submissions cannot consume the
  // generic API budget needed to explore the demonstration.
  if (path === '/api/v1/demo/feedback') return 'feedback';
  return 'api';
}
export function ratePolicy(config: AppConfig, name: PolicyName) {
  const map = {
    login: [config.RATE_LOGIN_MAX, config.RATE_LOGIN_WINDOW],
    registration: [config.RATE_REGISTRATION_MAX, config.RATE_REGISTRATION_WINDOW],
    reset: [config.RATE_RESET_MAX, config.RATE_RESET_WINDOW],
    verification: [config.RATE_VERIFICATION_MAX, config.RATE_VERIFICATION_WINDOW],
    api: [config.RATE_API_MAX, config.RATE_API_WINDOW],
    admin: [config.RATE_ADMIN_MAX, config.RATE_ADMIN_WINDOW],
    feedback: [config.RATE_FEEDBACK_MAX, config.RATE_FEEDBACK_WINDOW],
  };
  const [max, window] = map[name];
  return { max, window };
}
export function botProtected(path: string) {
  return [
    '/api/v1/participant-concerns',
    '/api/auth/sign-in/email',
    '/api/auth/sign-up/email',
    '/api/auth/request-password-reset',
    '/api/auth/send-verification-email',
  ].includes(path);
}
export function healthProbe(path: string, method: string) {
  return method === 'GET' && ['/api/health/live', '/api/health/ready'].includes(path);
}
