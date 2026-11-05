import { AdminOrganizations } from '@/components/governance';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrganizations id={id} />;
}
