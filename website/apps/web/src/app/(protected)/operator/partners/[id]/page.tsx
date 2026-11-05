import { PartnerReview } from '@/components/foundation-workspace';
import { FoundationGate } from '@/components/foundation-gate';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <FoundationGate persona="NASJ_OPERATOR">
      <PartnerReview id={id} />
    </FoundationGate>
  );
}
