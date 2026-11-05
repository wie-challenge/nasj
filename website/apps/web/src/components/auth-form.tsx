'use client';
import { useHydrated } from '@/lib/use-hydrated';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  emailRequestSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@nasj/contracts';
import type { IdentityContext } from '@nasj/contracts';
import { ApiError, apiFetch } from '@/lib/api';
import { Field } from './field';
export type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email';
const titles: Record<AuthMode, string> = {
  login: 'Welcome back.',
  register: 'Make yourself at home.',
  'forgot-password': 'Forgot your password?',
  'reset-password': 'Choose a new password.',
  'verify-email': 'Verify your email.',
};
const descriptions: Record<AuthMode, string> = {
  login: 'Sign in to your NASJ account.',
  register: 'Create an account and verify your email to get started.',
  'forgot-password': 'We’ll send a recovery link if an account matches this address.',
  'reset-password': 'Use at least 12 characters. Your other sessions will be signed out.',
  'verify-email': 'Open your verification link, or request another email below.',
};
export function AuthForm({
  mode,
  next,
  embedded = false,
  onAuthenticated,
  onRegistered,
}: {
  mode: AuthMode;
  next: string;
  embedded?: boolean;
  onAuthenticated?: () => void | Promise<void>;
  onRegistered?: () => void;
}) {
  const ready = useHydrated();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const autoVerified = useRef(false);
  useEffect(() => {
    if (mode !== 'reset-password' && mode !== 'verify-email') return;
    const url = new URL(window.location.href);
    const value = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
    if (!value) return;
    setToken(value);
    url.hash = '';
    url.searchParams.delete('token');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [mode]);
  useEffect(() => {
    if (mode !== 'verify-email' || !token || autoVerified.current) return;
    autoVerified.current = true;
    verify();
  });
  function handleError(error: unknown) {
    setMessage(
      error instanceof ApiError
        ? error.message
        : 'Unable to complete this request. Please try again.',
    );
    if (error instanceof ApiError) setErrors(error.detail.fieldErrors ?? {});
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setErrors({});
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const schema =
      mode === 'register'
        ? registerSchema
        : mode === 'login'
          ? loginSchema
          : mode === 'reset-password'
            ? resetPasswordSchema
            : emailRequestSchema;
    const parsed = schema.safeParse(mode === 'reset-password' ? { ...input, token } : input);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      setMessage('Check the highlighted fields.');
      return;
    }
    start(async () => {
      try {
        const endpoints: Record<AuthMode, string> = {
          login: '/sign-in/email',
          register: '/sign-up/email',
          'forgot-password': '/request-password-reset',
          'reset-password': '/reset-password',
          'verify-email': '/send-verification-email',
        };
        const response = await apiFetch<{ twoFactorRedirect?: boolean }>(
          `/api/auth${endpoints[mode]}`,
          { method: 'POST', body: parsed.data },
        );
        if (mode === 'login' && response?.twoFactorRedirect) {
          setTwoFactorChallenge(true);
          return;
        }
        if (mode === 'login') {
          if (onAuthenticated) await onAuthenticated();
          else {
            router.replace(
              next === '/dashboard'
                ? (await apiFetch<IdentityContext>('/api/v1/me/context')).landingPath
                : next,
            );
            router.refresh();
          }
          return;
        }
        if (mode === 'register' && onRegistered) {
          onRegistered();
          return;
        }
        setSuccess(true);
        setToken('');
        setMessage(
          mode === 'reset-password'
            ? 'Your password has been updated. Sign in with your new password.'
            : 'If this address is eligible, check your inbox for the next step.',
        );
      } catch (error) {
        handleError(error);
      }
    });
  }
  function verify() {
    setMessage('');
    start(async () => {
      try {
        await apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        setToken('');
        setSuccess(true);
        setMessage('Your email is verified. You can sign in now.');
      } catch (error) {
        handleError(error);
      }
    });
  }
  return (
    <section className="auth-card">
      {embedded ? <h2>{titles[mode]}</h2> : <h1>{titles[mode]}</h1>}
      <p className="lead">{descriptions[mode]}</p>
      {message && (
        <p className={success ? 'notice success' : 'notice'} role={success ? 'status' : 'alert'}>
          {message}
        </p>
      )}
      {twoFactorChallenge ? (
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setMessage('');
            start(async () => {
              try {
                await apiFetch(
                  `/api/auth/two-factor/${useBackupCode ? 'verify-backup-code' : 'verify-totp'}`,
                  { method: 'POST', body: { code: String(data.get('code') ?? '').trim() } },
                );
                if (onAuthenticated) await onAuthenticated();
                else {
                  router.replace(
                    next === '/dashboard'
                      ? (await apiFetch<IdentityContext>('/api/v1/me/context')).landingPath
                      : next,
                  );
                  router.refresh();
                }
              } catch (error) {
                handleError(error);
              }
            });
          }}
        >
          <fieldset disabled={pending || !ready}>
            <Field
              name="code"
              label={useBackupCode ? 'Recovery code' : 'Authenticator code'}
              autoComplete="one-time-code"
            />
            <button className="button" type="submit">
              Verify sign-in
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setUseBackupCode((value) => !value)}
            >
              {useBackupCode ? 'Use authenticator code' : 'Use recovery code'}
            </button>
          </fieldset>
        </form>
      ) : success ? (
        <Link className="button" href="/auth/login">
          Continue to sign in
        </Link>
      ) : mode === 'verify-email' && token ? (
        <button type="button" className="button" disabled={pending || !ready} onClick={verify}>
          {pending ? 'Verifying…' : 'Verify email address'}
        </button>
      ) : mode === 'reset-password' && !token ? (
        <p className="notice">
          Open the password reset link from your email.{' '}
          <Link href="/auth/forgot-password">Request a new link</Link>.
        </p>
      ) : (
        <form method="post" onSubmit={submit} noValidate>
          <fieldset disabled={pending || !ready} aria-busy={pending}>
            {mode === 'register' && (
              <Field name="name" label="Your name" autoComplete="name" error={errors.name} />
            )}
            {mode !== 'reset-password' && (
              <Field
                name="email"
                label="Email address"
                type="email"
                autoComplete="email"
                error={errors.email}
              />
            )}
            {(mode === 'login' || mode === 'register') && (
              <div className="auth-password">
                <Field
                  name="password"
                  label="Password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  error={errors.password}
                  hint={mode === 'register' ? 'At least 12 characters.' : undefined}
                />
                {mode === 'login' && !embedded && (
                  <Link className="auth-forgot" href="/auth/forgot-password">
                    Forgot password?
                  </Link>
                )}
              </div>
            )}
            {mode === 'reset-password' && (
              <Field
                name="newPassword"
                label="New password"
                type="password"
                autoComplete="new-password"
                error={errors.newPassword}
              />
            )}
            <button className="button" type="submit">
              {pending
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create account'
                    : mode === 'reset-password'
                      ? 'Update password'
                      : mode === 'verify-email'
                        ? 'Send verification email'
                        : 'Send recovery link'}
            </button>
          </fieldset>
        </form>
      )}
      {!embedded && !success && (
        <nav className="auth-links" aria-label="Account options">
          {mode === 'login' ? (
            <span>
              New here? <Link href="/auth/register">Create an account</Link>
            </span>
          ) : mode === 'register' ? (
            <span>
              Already have an account? <Link href="/auth/login">Sign in</Link>
            </span>
          ) : (
            <Link href="/auth/login">Back to sign in</Link>
          )}
          {mode === 'login' && message && (
            <span>
              Email not verified? <Link href="/auth/verify-email">Resend the link</Link>
            </span>
          )}
        </nav>
      )}
    </section>
  );
}
