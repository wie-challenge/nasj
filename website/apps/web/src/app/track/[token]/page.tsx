import type { MarketTrackView } from '@nasj/contracts';
import { Wordmark } from '@/components/brand';
import { headers } from 'next/headers';

async function load(token: string) {
  const host = (await headers()).get('host');
  const response = await fetch(`http://${host}/api/v1/market/track/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  }).catch(() => null);
  return response?.ok ? ((await response.json()) as MarketTrackView) : null;
}
const statusText: Record<string, string> = {
  ON_THE_WAY: 'On its way',
  DELIVERED: 'Delivered',
};
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const item = await load(token);
  return (
    <main
      id="main-content"
      style={{ maxWidth: 560, margin: '0 auto', padding: '40px 16px', display: 'grid', gap: 18 }}
    >
      <Wordmark />
      {item ? (
        <>
          <h1>{item.title}</h1>
          {item.craft && <p>Craft: {item.craft}</p>}
          <p>{item.madeBy}</p>
          <p>Status: {statusText[item.status] ?? 'In preparation'}</p>
        </>
      ) : (
        <>
          <h1>We don't recognise this code</h1>
          <p>Check the QR code on your package and try again.</p>
        </>
      )}
    </main>
  );
}
