import { ProcurementDiscussion } from '@/components/procurement';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProcurementDiscussion id={id} />;
}
