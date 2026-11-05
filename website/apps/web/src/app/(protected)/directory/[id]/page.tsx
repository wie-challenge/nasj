import { DirectoryGroup } from '@/components/directory-workspace';
import { DeniedWorkspace } from '@/components/foundation-gate';
import { getIdentityContext } from '@/lib/server-api';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const context = await getIdentityContext();
  const allowed = context?.personas.some((persona) =>
    ['BUYER_REPRESENTATIVE', 'ASSOCIATION_COORDINATOR', 'NASJ_OPERATOR'].includes(persona),
  );
  if (!allowed) return <DeniedWorkspace />;
  const { id } = await params;
  return <DirectoryGroup id={id} />;
}
