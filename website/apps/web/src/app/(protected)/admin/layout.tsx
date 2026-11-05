import { FoundationGate } from '@/components/foundation-gate';
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <FoundationGate persona="PLATFORM_ADMIN">{children}</FoundationGate>;
}
