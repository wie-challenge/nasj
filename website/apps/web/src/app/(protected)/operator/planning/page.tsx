'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useResource, Workspace, ResourceState } from '@/components/workspace-ui';
import { apiFetch } from '@/lib/api';
import type { ProcurementList } from '@nasj/contracts';

type Resolved = { orderId: string | null; error: string | null };

export default function Page() {
  const list = useResource<ProcurementList>('/api/v1/procurement/rfqs');
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(rfqId: string) {
    setBusy(rfqId);
    try {
      const detail = await apiFetch<{ orderId: string | null }>(
        `/api/v1/procurement/rfqs/${encodeURIComponent(rfqId)}`,
      );
      setResolved((current) => ({
        ...current,
        [rfqId]: { orderId: detail.orderId, error: null },
      }));
    } catch (failure) {
      setResolved((current) => ({
        ...current,
        [rfqId]: {
          orderId: null,
          error: failure instanceof Error ? failure.message : 'Unable to resolve this request.',
        },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Workspace
      title="Production planning"
      description="Choose an accepted order to rank eligible groups, allocate quantities and compare delivery plans."
    >
      <ResourceState loading={list.loading} error={list.error} retry={list.reload} />
      {list.data && (
        <>
          <h2>Procurement requests</h2>
          <p>
            Planning starts from an accepted order. A request without an order has not yet been
            accepted and cannot be planned.
          </p>
          {!list.data.requests.length && (
            <p className="notice" role="status">
              No procurement requests are assigned to you.
            </p>
          )}
          <ul>
            {list.data.requests.map((request) => {
              const result = resolved[request.id];
              return (
                <li key={request.id}>
                  <strong>{request.title}</strong> — {request.status}
                  {!result && (
                    <button
                      type="button"
                      onClick={() => resolve(request.id)}
                      disabled={busy === request.id}
                    >
                      {busy === request.id ? 'Resolving…' : 'Open planning'}
                    </button>
                  )}
                  {result?.orderId && (
                    <Link href={`/operator/planning/${encodeURIComponent(result.orderId)}`}>
                      Plan this order
                    </Link>
                  )}
                  {result && !result.orderId && !result.error && (
                    <span> No accepted order exists yet.</span>
                  )}
                  {result?.error && <span role="alert"> {result.error}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Workspace>
  );
}
