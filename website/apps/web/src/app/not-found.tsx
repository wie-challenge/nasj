import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="workspace" id="main-content">
      <p className="eyebrow">404</p>
      <h1>This page isn’t here.</h1>
      <Link className="button" href="/">
        Back to NASJ
      </Link>
    </main>
  );
}
