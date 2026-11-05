import { CoordinatorOffers } from '@/components/production-offers';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="ASSOCIATION_COORDINATOR">
      <CoordinatorOffers />
    </FoundationGate>
  );
}
