import { FoundationGate } from '@/components/foundation-gate';
import { FoundationDashboard } from '@/components/foundation-workspace';
import { getIdentityContext } from '@/lib/server-api';
export default async function Page() {
  const context = await getIdentityContext();
  return (
    <FoundationGate persona="BUYER_REPRESENTATIVE">
      {context && <FoundationDashboard context={context} mode="buyer" />}
    </FoundationGate>
  );
}
