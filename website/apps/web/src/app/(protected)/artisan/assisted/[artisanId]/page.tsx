import { ArtisanWorkspace } from '@/components/artisan-workspace';
export default async function Page({ params }: { params: Promise<{ artisanId: string }> }) {
  const { artisanId } = await params;
  return <ArtisanWorkspace artisanId={artisanId} />;
}
