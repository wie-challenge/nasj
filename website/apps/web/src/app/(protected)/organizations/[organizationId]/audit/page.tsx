import { AuditLog } from '@/components/governance';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <AuditLog organizationId={organizationId} />;
}
