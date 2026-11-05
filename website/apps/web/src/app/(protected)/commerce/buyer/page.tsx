import { CommerceGate } from '@/components/foundation-gate';
import { CommerceWorkspace } from '@/components/commerce-workspace';
export const metadata = { title: 'Buyer synthetic commerce' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ example?: string | string[] }>;
}) {
  const { example } = await searchParams;
  const catalogExampleId = Array.isArray(example) ? '' : example;
  return (
    <CommerceGate mode="buyer">
      <CommerceWorkspace
        key={catalogExampleId ?? 'manual'}
        mode="buyer"
        catalogExampleId={catalogExampleId}
      />
    </CommerceGate>
  );
}
