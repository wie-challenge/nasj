'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { IdentityContext } from '@nasj/contracts';
import { initials, workspaceNavigation, workspaceRoleLabel } from '@/lib/app-navigation';
import { Wordmark, SiteFooter } from './brand';
import { Icon } from './icons';
import { LogoutButton } from './logout-button';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { NasoujWidget } from './assistant/nasouj-widget';
import { NotificationBell, useMarketCounts } from './market/notifications';
import type { NasoujRole } from './assistant/nasouj-demo-replies';
type Capabilities = { buyer: boolean; artisan: boolean; operator: boolean; admin: boolean };
function nasoujRole(context?: IdentityContext | null): NasoujRole {
  const personas = context?.personas ?? [];
  if (personas.includes('BUYER_REPRESENTATIVE')) return 'buyer';
  if (personas.includes('ASSOCIATION_COORDINATOR')) return 'association';
  if (personas.includes('NASJ_COORDINATOR')) return 'coordinator';
  if (personas.includes('NASJ_FINANCE')) return 'finance';
  if (personas.includes('NASJ_OPERATOR') || personas.includes('PLATFORM_ADMIN')) return 'operator';
  return 'welcome';
}
export function AppShell({
  name,
  capabilities,
  children,
  context,
}: {
  name: string;
  capabilities: Capabilities;
  children: ReactNode;
  context?: IdentityContext | null;
}) {
  const pathname = usePathname(),
    [open, setOpen] = useState(false);
  const sections = workspaceNavigation(context, capabilities);
  const bare = !context?.personas.length;
  const counts = useMarketCounts(!bare);
  const roleLabel = workspaceRoleLabel(context);
  const activeHref = sections
    .flatMap((s) => s.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  function navigation(mobile = false) {
    return (
      <>
        <div className="sidebar-brand">
          <Wordmark href={context?.landingPath ?? '/dashboard'} />
        </div>
        <nav aria-label={mobile ? 'Mobile account navigation' : 'Account navigation'}>
          {sections.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <p className="sidebar-label">{section.label}</p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={activeHref === item.href ? 'sidebar-link active' : 'sidebar-link'}
                      aria-current={activeHref === item.href ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <Icon name={item.icon} />
                      <span className="sidebar-link-label">{item.label}</span>
                      {item.count && counts?.[item.count] ? (
                        <span className="sidebar-count">
                          {counts[item.count]}
                          <span className="sr-only"> waiting</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shell-user">
          <div className="user-identity">
            <span className="user-avatar" aria-hidden="true">
              {name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <div>
              <strong title={name}>{name}</strong>
              <span title={roleLabel}>{roleLabel}</span>
            </div>
          </div>
          <LogoutButton iconOnly />
        </div>
      </>
    );
  }
  return (
    <div className="app-shell" data-bare={bare || undefined}>
      {!bare && <aside className="sidebar">{navigation()}</aside>}
      <div className="app-main">
        <header className="topbar shell-header">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sidebar-toggle mobile-menu-button hidden max-[900px]:inline-flex"
                aria-label="Open navigation"
              >
                <Icon name="menu" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="mobile-sidebar w-[min(85vw,300px)] gap-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>NASJ navigation</SheetTitle>
                <SheetDescription>Navigate your workspaces and account settings.</SheetDescription>
              </SheetHeader>
              {navigation(true)}
            </SheetContent>
          </Sheet>
          {bare ? (
            <Wordmark />
          ) : (
            <div className="workspace-identity">
              <strong>{roleLabel}</strong>
            </div>
          )}
          <div className="shell-profile">
            {bare ? <LogoutButton iconOnly /> : <NotificationBell />}
            <Link
              className="profile-trigger"
              href="/settings/profile"
              aria-label="Your profile"
              aria-current={pathname === '/settings/profile' ? 'page' : undefined}
            >
              <span className="avatar" aria-hidden="true">
                {initials(name)}
              </span>
            </Link>
          </div>
        </header>
        <main className="workspace" id="main-content">
          {children}
        </main>
        <SiteFooter />
      </div>
      <NasoujWidget role={nasoujRole(context)} />
    </div>
  );
}
