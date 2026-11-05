'use client';
import Link from 'next/link';
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="workspace" id="main-content">
      <h1>A little interruption.</h1>
      <p>The service is temporarily unavailable. Please try again.</p>
      <button type="button" className="button" onClick={() => retry()}>
        Try again
      </button>{' '}
      <Link href="/auth/login">Back to sign in</Link>
    </main>
  );
}
