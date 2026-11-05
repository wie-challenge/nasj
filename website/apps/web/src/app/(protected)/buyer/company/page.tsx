import Link from 'next/link';
import { FoundationGate } from '@/components/foundation-gate';
import { getIdentityContext } from '@/lib/server-api';
export default async function Page() {
  const context = await getIdentityContext();
  return (
    <FoundationGate persona="BUYER_REPRESENTATIVE">
      <h1>Company profile and representatives</h1>
      <p>Each company has its own representatives, invitations and approval authority.</p>
      {context?.organizations
        .filter((o) => o.type === 'BUYER_BUSINESS')
        .map((o) => (
          <section className="panel" key={o.id}>
            <h2>{o.name}</h2>
            <p>{o.approvalStatus}</p>
            <Link href={`/organizations/${o.id}/settings`}>Manage company and representatives</Link>
          </section>
        ))}
    </FoundationGate>
  );
}
