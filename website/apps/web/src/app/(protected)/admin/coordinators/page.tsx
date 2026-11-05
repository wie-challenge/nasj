import { PersonnelAdmin } from '@/components/foundation-admin';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="PLATFORM_ADMIN">
      <PersonnelAdmin coordinators />
    </FoundationGate>
  );
}
