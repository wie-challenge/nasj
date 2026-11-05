import { AcceptInvitation } from '@/components/organizations';
import { SiteFooter, Wordmark } from '@/components/brand';
export default function Page() {
  return (
    <>
      <header className="app-header">
        <Wordmark />
      </header>
      <main className="workspace" id="main-content">
        <AcceptInvitation />
      </main>
      <SiteFooter />
    </>
  );
}
