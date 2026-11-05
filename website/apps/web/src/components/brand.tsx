import Image from 'next/image';
import Link from 'next/link';
export function Wordmark({ href = '/', light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="wordmark">
      <Image
        src={light ? '/brand/nasj-logo-white.png' : '/brand/nasj-logo.png'}
        alt="NASJ | نسج"
        width={960}
        height={219}
        loading="eager"
      />
    </Link>
  );
}
export function Weave({ className = '' }: { className?: string }) {
  return <div className={`weave ${className}`.trim()} aria-hidden="true" />;
}
export function SiteFooter() {
  return (
    <footer className="app-footer">
      <span>NASJ · Weaving Connections. Creating Impact.</span>
      <span lang="ar" dir="rtl">
        نسج
      </span>
    </footer>
  );
}
