import { AccessReport } from '@/components/foundation-admin';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="PLATFORM_ADMIN">
      <AccessReport />
    </FoundationGate>
  );
}
