import { DemoSessionProvider, DemoShowroom } from '@/components/demo-showroom';
export default function DemoPage() {
  const showroom = (
    <main id="main-content">
      <DemoShowroom />
    </main>
  );
  // Normal deployments explain the isolated-demo boundary without enabling any persona action.
  return process.env.DEMO_MODE === 'true' ? (
    showroom
  ) : (
    <DemoSessionProvider>{showroom}</DemoSessionProvider>
  );
}
