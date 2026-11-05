import { OrganizationSettings } from '@/components/organizations';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <OrganizationSettings id={organizationId} />;
}
