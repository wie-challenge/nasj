'use client';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  feedbackFollowUpStatuses,
  type OrderFeedbackHistoryView,
  type OrderFeedbackView,
} from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { humanize } from './workspace-ui';
import type { CollaborationWorkspaceView } from '@nasj/contracts';

const root = '/api/v1/collaboration';

function message(failure: unknown) {
  if (!(failure instanceof ApiError))
    return failure instanceof Error ? failure.message : 'Unable to complete this action.';
  if (failure.detail.code === 'STALE_VERSION')
    return 'This assessment changed. Reload and retry; nothing you typed was submitted.';
  if (failure.detail.code === 'INVALID_OWNER')
    return 'Choose an active support manager with a current assignment to this buyer.';
  if (failure.detail.code === 'OWNER_REQUIRED')
    return 'A follow-up must have a named support owner.';
  if (failure.detail.code === 'REASON_REQUIRED')
    return 'State why the follow-up state is changing.';
  if (
    failure.detail.code === 'CASE_ORDER_MISMATCH' ||
    failure.detail.code === 'CASE_NOT_ORDER_RELATED'
  )
    return 'Link a support case that belongs to this exact order.';
  if (failure.detail.code === 'CASE_OPERATOR_MISMATCH')
    return 'That case belongs to a different operating organization.';
  if (failure.detail.code === 'INVALID_TRANSITION')
    return 'This follow-up state cannot move there. A resolved follow-up is reopened explicitly.';
  return failure.message;
}

/**
 * Support follow-up over a buyer's private assessment. The case link is a separate, explicit action
 * over an existing SupportTicket; nothing here creates, resolves or settles a claim.
 */
export function OrderFeedbackSection({
  data,
  reload,
}: {
  data: CollaborationWorkspaceView;
  reload: () => unknown;
}) {
  const items = data.orderFeedback ?? [];
  const owners = data.followUpOwners ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [ownerChoice, setOwnerChoice] = useState<Record<string, string>>({});
  const [ticketChoice, setTicketChoice] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, OrderFeedbackHistoryView>>({});
  const fieldId = useId();

  const manageable = items.filter((item) => item.canManageFollowUp);
  const candidatesFor = useCallback(
    (item: OrderFeedbackView) =>
      data.tickets.filter(
        (ticket) => ticket.relatedType === 'ORDER' && ticket.relatedId === item.orderId,
      ),
    [data.tickets],
  );

  const loadHistory = useCallback(async (feedbackId: string) => {
    try {
      const view = await apiFetch<OrderFeedbackHistoryView>(
        `${root}/order-feedback/${encodeURIComponent(feedbackId)}/history`,
      );
      setHistory((current) => ({ ...current, [feedbackId]: view }));
    } catch {
      setError('Unable to load this assessment history.');
    }
  }, []);

  useEffect(() => {
    for (const item of manageable) if (!history[item.id]) void loadHistory(item.id);
  }, [manageable, history, loadHistory]);

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(done);
      await reload();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!manageable.length) return null;

  return (
    <section className="order-feedback-support" aria-labelledby="order-feedback">
      <h2 id="order-feedback">Buyer delivery feedback</h2>
      <p>
        Private assessments for buyers you are assigned to. Feedback is not a claim: linking an
        existing case never changes its status, and resolving a follow-up never resolves a claim.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice success" role="status">
          {success}
        </p>
      )}
      <ul>
        {manageable.map((item) => {
          const note = notes[item.id] ?? '';
          const reason = reasons[item.id] ?? '';
          const owner = ownerChoice[item.id] ?? item.followUpOwnerId ?? owners[0]?.id ?? '';
          const candidates = candidatesFor(item);
          const ticket = ticketChoice[item.id] ?? candidates[0]?.id ?? '';
          const versions = history[item.id];
          return (
            <li key={item.id}>
              <strong>{humanize(item.category)}</strong>
              {item.rating ? ` · ${item.rating} of 5` : ' · no rating'} · version{' '}
              {item.currentVersion}
              <p>{item.comment || 'No comment was given.'}</p>
              <p>
                Follow-up: <strong>{humanize(item.followUpStatus)}</strong>
                {item.followUpOwnerName ? ` · ${item.followUpOwnerName}` : ' · unassigned'} · case:{' '}
                {item.linkedTicketId
                  ? `${item.linkedTicketId} (${humanize(item.linkedTicketStatus ?? 'OPEN')})`
                  : 'not linked'}
              </p>
              <p className="notice" role="note">
                {item.sourceLabel}. This is not verified customer satisfaction and is never
                published.
              </p>
              <div className="field">
                <label htmlFor={`${fieldId}-${item.id}-owner`}>Follow-up owner</label>
                <select
                  id={`${fieldId}-${item.id}-owner`}
                  value={owner}
                  onChange={(event) =>
                    setOwnerChoice((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  disabled={busy}
                >
                  {owners.length === 0 && <option value="">No assigned support manager</option>}
                  {owners.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${fieldId}-${item.id}-note`}>Internal follow-up note</label>
                <textarea
                  id={`${fieldId}-${item.id}-note`}
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <p>Buyers never see these notes.</p>
              <div className="field">
                <label htmlFor={`${fieldId}-${item.id}-reason`}>Reason for this change</label>
                <input
                  id={`${fieldId}-${item.id}-reason`}
                  value={reason}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <fieldset>
                <legend>Follow-up actions</legend>
                {feedbackFollowUpStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={busy || status === item.followUpStatus}
                    onClick={() =>
                      act(
                        () =>
                          apiFetch(
                            `${root}/order-feedback/${encodeURIComponent(item.id)}/follow-up`,
                            {
                              method: 'POST',
                              idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
                              body: {
                                expectedVersion: item.currentVersion,
                                status,
                                ...(status === 'FOLLOW_UP' && owner ? { ownerId: owner } : {}),
                                note,
                                reason: reason || `Follow-up set to ${status}`,
                              },
                            },
                          ),
                        'Follow-up updated. The buyer assessment fields are unchanged.',
                      )
                    }
                  >
                    Set {humanize(status)}
                  </button>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor={`${fieldId}-${item.id}-ticket`}>
                  Existing order claim for this order
                </label>
                <select
                  id={`${fieldId}-${item.id}-ticket`}
                  value={ticket}
                  onChange={(event) =>
                    setTicketChoice((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  disabled={busy}
                >
                  {candidates.length === 0 && <option value="">No order claim available</option>}
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {humanize(candidate.category)} — {humanize(candidate.status)} —{' '}
                      {candidate.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <p>
                Create a claim with the case form below first; the buyer is the reporter of their
                own claim. Linking is a separate authorized step.
              </p>
              <button
                type="button"
                disabled={busy || !ticket}
                onClick={() =>
                  act(
                    () =>
                      apiFetch(`${root}/order-feedback/${encodeURIComponent(item.id)}/case-link`, {
                        method: 'POST',
                        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
                        body: {
                          expectedVersion: item.currentVersion,
                          ticketId: ticket,
                          reason: reason || 'Link the existing order claim',
                        },
                      }),
                    'Case linked. The claim keeps its own status and lifecycle.',
                  )
                }
              >
                Link existing claim
              </button>
              {versions && (
                <details>
                  <summary>Assessment history ({versions.total} versions)</summary>
                  <ol>
                    {versions.items.map((entry) => (
                      <li key={entry.id}>
                        <strong>v{entry.version}</strong> {humanize(entry.kind)} · {entry.actorName}{' '}
                        · {new Date(entry.createdAt).toLocaleString()} ·{' '}
                        {humanize(entry.followUpStatus)}
                        {entry.comment && <p>{entry.comment}</p>}
                        {entry.followUpNote && <p>Internal: {entry.followUpNote}</p>}
                        {entry.reason && <p>Reason: {entry.reason}</p>}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
