import Link from 'next/link';
import { SiteFooter, Wordmark } from '@/components/brand';
import { FinancialSimulator } from '@/components/financial-simulator';
export const metadata = { title: 'Synthetic financial scenario simulator | NASJ' };
export default function SimulatorPage() {
  return (
    <>
      <header className="site-header">
        <Wordmark />
        <nav aria-label="Simulator navigation">
          <Link href="/demo">Live demo</Link>
        </nav>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-12">
        <FinancialSimulator />
      </main>
      <SiteFooter />
    </>
  );
}
