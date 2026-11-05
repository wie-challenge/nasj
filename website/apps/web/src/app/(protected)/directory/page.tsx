import { DirectoryWorkspace } from '@/components/directory-workspace';
import { DeniedWorkspace } from '@/components/foundation-gate';
import { getIdentityContext } from '@/lib/server-api';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getIdentityContext();
  const allowed = context?.personas.some((persona) =>
    ['BUYER_REPRESENTATIVE', 'ASSOCIATION_COORDINATOR', 'NASJ_OPERATOR'].includes(persona),
  );
  if (!allowed) return <DeniedWorkspace />;
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return (
    <DirectoryWorkspace
      initial={{
        craft: first(query.craft),
        region: first(query.region),
        unit: first(query.unit),
        effectiveFrom: first(query.effectiveFrom),
        effectiveTo: first(query.effectiveTo),
        minRemaining: first(query.minRemaining),
      }}
    />
  );
}
