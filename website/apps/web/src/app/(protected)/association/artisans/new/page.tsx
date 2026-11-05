import { AddArtisan } from '@/components/foundation-workspace';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="ASSOCIATION_COORDINATOR">
      <AddArtisan />
    </FoundationGate>
  );
}
