import {
  Building2,
  ChevronDown,
  ClipboardList,
  HandHeart,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  Lock,
  Menu,
  Package,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tags,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { NavIcon } from '@/lib/app-navigation';

const icons: Record<NavIcon | 'menu' | 'close' | 'chevron', LucideIcon> = {
  organization: Building2,
  artisan: HandHeart,
  support: LifeBuoy,
  approval: ShieldCheck,
  users: Users,
  audit: ScrollText,
  privacy: Lock,
  catalog: LayoutGrid,
  custom: Sparkles,
  cart: ShoppingCart,
  orders: Package,
  requests: Inbox,
  products: Tags,
  finance: ReceiptText,
  profile: UserRound,
  delivery: ClipboardList,
  tasks: ListChecks,
  menu: Menu,
  close: X,
  chevron: ChevronDown,
};
export function Icon({ name, size = 20 }: { name: keyof typeof icons; size?: number }) {
  const Glyph = icons[name];
  return <Glyph size={size} strokeWidth={1.7} aria-hidden="true" />;
}
