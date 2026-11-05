import { ParticipantConcernsAdmin } from '@/components/participant-support';
import { FoundationGate } from '@/components/foundation-gate';
export default function Page() {
  return (
    <FoundationGate persona="PLATFORM_ADMIN">
      <ParticipantConcernsAdmin />
    </FoundationGate>
  );
}
