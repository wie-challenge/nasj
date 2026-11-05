import { CommerceGate } from '@/components/foundation-gate';
import { CommerceWorkspace } from '@/components/commerce-workspace';
export const metadata = { title: 'Artisan synthetic commerce' };
export default function Page() {
  return (
    <CommerceGate mode="artisan">
      <CommerceWorkspace mode="artisan" />
    </CommerceGate>
  );
}
