import Image from 'next/image';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AuthForm, type AuthMode } from '@/components/auth-form';
import { Weave, Wordmark } from '@/components/brand';
import { safeNext } from '@/lib/navigation';
export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { mode } = await params;
  if (!['login', 'register', 'forgot-password', 'reset-password', 'verify-email'].includes(mode))
    notFound();
  const query = await searchParams;
  return (
    <main className="auth-layout" id="main-content">
      <aside className="auth-aside">
        <Wordmark light />
        <div className="auth-aside-body">
          <div className="arch arch-small">
            <Image src="/brand/artisan-weaving.jpg" alt="" width={685} height={753} sizes="420px" />
          </div>
          <h2>
            Every thread
            <br />
            tells a story.
          </h2>
          <p>
            {mode === 'register'
              ? 'Create your account, verify your email, then register a company or association, and accept your team invitation.'
              : 'Sign in to manage your organization, your team and your assigned work.'}
          </p>
        </div>
        <Weave />
      </aside>
      <div className="auth-main">
        <Link className="back-link" href="/">
          <span aria-hidden="true">←</span> Back to home
        </Link>
        <AuthForm mode={mode as AuthMode} next={safeNext(query.next)} />
      </div>
    </main>
  );
}
