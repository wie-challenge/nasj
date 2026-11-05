import { OperatorActivity } from '@/components/foundation-workspace';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="NASJ_OPERATOR">
      <OperatorActivity />
    </FoundationGate>
  );
}
