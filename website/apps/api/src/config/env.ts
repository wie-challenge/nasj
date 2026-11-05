import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const positive = z.coerce.number().int().min(1).max(1000000);
const optional = (value: unknown) => (value === '' ? undefined : value);
export function trustedNetwork(value: string) {
  const [address, mask, extra] = value.split('/');
  const family = isIP(address);
  return Boolean(
    family &&
      extra === undefined &&
      (mask === undefined ||
        (/^\d+$/.test(mask) && Number(mask) >= 1 && Number(mask) <= (family === 4 ? 32 : 128))),
  );
}
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PUBLIC_APP_URL: z
    .url()
    .refine(
      (value) =>
        new URL(value).origin === value && !new URL(value).username && !new URL(value).password,
      'Use one HTTP(S) origin without a path or trailing slash.',
    )
    .refine((value) => /^https?:\/\//.test(value)),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//.test(value), 'Use a PostgreSQL URL.'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(48)
    .refine(
      (value) => !/generate|replace|example/i.test(value),
      'Generate a random authentication secret.',
    ),
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .refine(
      (values) => values.every(trustedNetwork),
      'Use explicit proxy IPs/CIDRs; never true, hop counts or wildcards.',
    ),
  DEMO_MODE: bool.default(false),
  REQUIRE_PRIVILEGED_MFA: bool.default(false),
  ARCJET_ENABLED: bool.default(false),
  ARCJET_KEY: z.preprocess(optional, z.string().optional()),
  ARCJET_MODE: z.enum(['DRY_RUN', 'LIVE']).default('DRY_RUN'),
  ARCJET_FAILURE_MODE: z.enum(['closed', 'open']).default('closed'),
  RATE_LOGIN_MAX: positive.default(10),
  RATE_LOGIN_WINDOW: positive.default(60),
  RATE_REGISTRATION_MAX: positive.default(5),
  RATE_REGISTRATION_WINDOW: positive.default(3600),
  RATE_RESET_MAX: positive.default(5),
  RATE_RESET_WINDOW: positive.default(3600),
  RATE_VERIFICATION_MAX: positive.default(10),
  RATE_VERIFICATION_WINDOW: positive.default(3600),
  RATE_API_MAX: positive.default(120),
  RATE_API_WINDOW: positive.default(60),
  RATE_ADMIN_MAX: positive.default(30),
  RATE_ADMIN_WINDOW: positive.default(60),
  RATE_FEEDBACK_MAX: positive.default(8),
  RATE_FEEDBACK_WINDOW: positive.default(300),
  NOTIFICATION_EMAIL_ENABLED: bool.default(false),
  SMTP_HOST: z.string().min(1).default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1026),
  SMTP_SECURE: bool.default(false),
  SMTP_REQUIRE_TLS: bool.default(false),
  SMTP_USER: z.preprocess(optional, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(optional, z.string().optional()),
  EMAIL_FROM: z.string().min(3).default('NASJ <noreply@nasj.local>'),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
});
export function validateEnvironment(values: Record<string, unknown>) {
  const parsed = envSchema.safeParse(values);
  if (!parsed.success)
    throw new Error(
      `Invalid environment fields: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const config = parsed.data;
  if (config.ARCJET_ENABLED && !config.ARCJET_KEY)
    throw new Error('ARCJET_KEY is required when ARCJET_ENABLED=true.');
  if (
    config.DEMO_MODE &&
    (new URL(config.DATABASE_URL).pathname !== '/nasj_demo' ||
      config.NODE_ENV === 'production' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.DATABASE_URL).hostname) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.PUBLIC_APP_URL).hostname) ||
      !['127.0.0.1', 'localhost', '::1'].includes(config.API_HOST))
  )
    throw new Error(
      'Demo mode requires the isolated nasj_demo database and nonproduction environment.',
    );
  if (config.NODE_ENV === 'production') {
    if (new URL(config.DATABASE_URL).pathname === '/nasj_demo')
      throw new Error('Production cannot use the synthetic showroom database.');
    if (!config.REQUIRE_PRIVILEGED_MFA)
      throw new Error('Production requires REQUIRE_PRIVILEGED_MFA=true.');
    if (!config.PUBLIC_APP_URL.startsWith('https://'))
      throw new Error('Production PUBLIC_APP_URL requires HTTPS.');
    if (!config.ARCJET_ENABLED || !config.ARCJET_KEY)
      throw new Error('Production requires configured Arcjet protection.');
    if (config.ARCJET_MODE !== 'LIVE') throw new Error('Production requires ARCJET_MODE=LIVE.');
    if (
      (!config.SMTP_REQUIRE_TLS && !config.SMTP_SECURE) ||
      !config.SMTP_USER ||
      !config.SMTP_PASSWORD
    )
      throw new Error('Production requires authenticated TLS SMTP.');
  }
  return config;
}
export function loadConfig() {
  dotenv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  return validateEnvironment(process.env);
}
export type AppConfig = ReturnType<typeof validateEnvironment>;
export const APP_CONFIG = Symbol('APP_CONFIG');
