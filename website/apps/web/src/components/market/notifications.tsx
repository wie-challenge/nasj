'use client';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Popover } from 'radix-ui';
import { useCallback, useEffect, useState } from 'react';
import type { MarketCounts, MarketNotificationsView } from '@nasj/contracts';
import { apiFetch } from '@/lib/api';
import styles from './market.module.css';

const pollMs = 20000;

// Keeps a small value from the API fresh while the page stays open.
function usePolled<T>(path: string | null) {
  const pathname = usePathname();
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await apiFetch<T>(path));
    } catch {
      // These are conveniences, so a failed refresh just waits for the next one.
    }
  }, [path]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, pollMs);
    return () => clearInterval(timer);
  }, [load, pathname]);
  return { data, load };
}

export function useMarketCounts(enabled: boolean) {
  return usePolled<MarketCounts>(enabled ? '/api/v1/market/counts' : null).data;
}

export function NotificationBell() {
  const { data, load } = usePolled<MarketNotificationsView>('/api/v1/market/notifications');
  const unread = data?.unread ?? 0;
  return (
    <Popover.Root
      onOpenChange={async (open) => {
        if (!open || !unread) return;
        await apiFetch('/api/v1/market/notifications/read', { method: 'POST' }).catch(() => null);
        await load();
      }}
    >
      <Popover.Trigger
        className={styles.bell}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
        {unread > 0 && <span className={styles.bellCount}>{unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.bellPanel} align="end" sideOffset={8}>
          <h2>Notifications</h2>
          {data?.items.length ? (
            <ul>
              {data.items.map((item) => (
                <li key={item.id} data-unread={item.unread || undefined}>
                  <Popover.Close asChild>
                    <Link href={item.link}>
                      <span>{item.title}</span>
                      <small>{new Date(item.at).toLocaleString()}</small>
                    </Link>
                  </Popover.Close>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Nothing new right now.</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
