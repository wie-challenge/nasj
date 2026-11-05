import { CoordinatorProduction } from '@/components/execution-workspace';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="ASSOCIATION_COORDINATOR">
      <CoordinatorProduction />
    </FoundationGate>
  );
}
