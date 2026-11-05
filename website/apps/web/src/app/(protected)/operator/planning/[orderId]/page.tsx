import { ProductionPlanningWorkspace } from '@/components/production-planning-workspace';
export const metadata = { title: 'Production planning' };
export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <ProductionPlanningWorkspace orderId={orderId} />;
}
