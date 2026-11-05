import { CommerceGate } from '@/components/foundation-gate';
import { CommerceWorkspace } from '@/components/commerce-workspace';
export const metadata = { title: 'Operator synthetic commerce' };
export default function Page() {
  return (
    <CommerceGate mode="operator">
      <CommerceWorkspace mode="operator" />
    </CommerceGate>
  );
}
