import { CoordinatorPickups } from '@/components/logistics-workspace';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="ASSOCIATION_COORDINATOR">
      <CoordinatorPickups />
    </FoundationGate>
  );
}
