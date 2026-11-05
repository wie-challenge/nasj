'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  feedbackCategories,
  type FeedbackListResponse,
  type OrderFeedbackHistoryView,
  type OrderFeedbackView,
} from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { ResourceState, humanize, useResource } from './workspace-ui';
import { logisticsUpdatedEvent } from '@/lib/logistics-events';

/**
 * Private buyer satisfaction assessment. It is bound to a recorded receipt, never to an operator
 * delivery report or an accepted-piece projection, and it never creates a claim or a payment.
 */
const root = '/api/v1/collaboration';

function errorMessage(failure: unknown) {
  if (!(failure instanceof ApiError))
    return failure instanceof Error ? failure.message : 'Unable to complete this action.';
  if (failure.detail.code === 'STALE_VERSION')
    return 'Someone else changed this assessment. The latest version is loading; your unsent text is kept.';
  if (failure.detail.code === 'DUPLICATE_FEEDBACK')
    return 'You already assessed this order. Use the correction form below instead of a second assessment.';
  if (failure.detail.code === 'NO_CONFIRMED_RECEIPT')
    return 'Feedback follows your own confirmed receipt of this order. If nothing arrived, use a support claim instead.';
  if (failure.detail.code === 'RECEIPT_ORDER_MISMATCH')
    return 'That receipt belongs to another order. Choose a receipt confirmed for this order.';
  if (failure.detail.code === 'IDEMPOTENCY_CONFLICT')
    return 'This action was already submitted with different details. Reload and try again.';
  return failure.message;
}

type PendingFeedback = {
  readonly kind: 'create' | 'correction';
  readonly path: string;
  readonly key: string;
  readonly payload: Readonly<Record<string, string | number>>;
};

function useCommand() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = useCallback(async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
      return false;
    }
    setMessage(success);
    setBusy(false);
    return true;
  }, []);
  return { busy, error, message, run, setError };
}

export function BuyerOrderFeedback({ orderId }: { orderId: string }) {
  // A different order must never inherit private drafts or an uncertain command.
  return <BuyerFeedbackForm key={orderId} orderId={orderId} />;
}

function BuyerFeedbackForm({ orderId }: { orderId: string }) {
  const resource = useResource<FeedbackListResponse>(
    `${root}/order-feedback?orderId=${encodeURIComponent(orderId)}`,
  );
  const [refreshed, setRefreshed] = useState<FeedbackListResponse | null>(null);
  const data = refreshed ?? resource.data;
  useEffect(() => setRefreshed(null), [resource.data]);
  const reloadFeedback = resource.reload;
  useEffect(() => {
    const handler = () => void reloadFeedback();
    window.addEventListener(logisticsUpdatedEvent, handler);
    return () => window.removeEventListener(logisticsUpdatedEvent, handler);
  }, [reloadFeedback]);
  const [receiptId, setReceiptId] = useState('');
  const [category, setCategory] = useState<string>('OVERALL');
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<OrderFeedbackHistoryView | null>(null);
  const command = useCommand();
  const [pending, setPending] = useState<PendingFeedback | null>(null);
  const [accepted, setAccepted] = useState<{ id: string; version: number; comment: string } | null>(
    null,
  );
  const [preservedEdits, setPreservedEdits] = useState(false);
  const inFlight = useRef(false);
  const fieldId = useId();

  const own: OrderFeedbackView | undefined = data?.items.find(
    (item) => item.canCorrect || item.reporterId,
  );
  const eligible = data?.eligibleReceipts ?? [];
  const selectedReceipt = receiptId || eligible[0]?.confirmationId || '';

  const loadHistory = useCallback(async (feedbackId: string) => {
    try {
      setHistory(
        await apiFetch<OrderFeedbackHistoryView>(
          `${root}/order-feedback/${encodeURIComponent(feedbackId)}/history`,
        ),
      );
    } catch {
      setHistory(null);
    }
  }, []);

  useEffect(() => {
    if (own) void loadHistory(own.id);
  }, [own, loadHistory]);

  async function execute(operation: PendingFeedback) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(operation);
    const ok = await command.run(async () => {
      try {
        const result = await apiFetch<{ id: string; version: number }>(operation.path, {
          method: 'POST',
          idempotencyKey: operation.key,
          body: operation.payload,
        });
        // A replay receipt is not current authority or current state. Refresh through the scoped
        // read endpoint before enabling a new edited intent against its latest revision.
        const latest = await apiFetch<FeedbackListResponse>(
          `${root}/order-feedback?orderId=${encodeURIComponent(orderId)}`,
        );
        if (!latest.items.some((item) => item.id === result.id))
          throw new Error('Your accepted assessment is unavailable. Retry after restoring access.');
        const edited =
          comment !== operation.payload.comment ||
          category !== operation.payload.category ||
          rating !==
            (operation.payload.rating === undefined ? '' : String(operation.payload.rating)) ||
          (operation.kind === 'create' &&
            (selectedReceipt !== operation.payload.receiptConfirmationId || reason.length > 0)) ||
          (operation.kind === 'correction' &&
            (reason.trim() || 'Buyer correction') !== operation.payload.reason);
        setRefreshed(latest);
        setAccepted({
          id: result.id,
          version: result.version,
          comment: String(operation.payload.comment ?? ''),
        });
        setPending(null);
        setPreservedEdits(edited);
        if (!edited) {
          setComment('');
          setRating('');
          setReason('');
        }
        await resource.reload();
      } catch (failure) {
        if (
          failure instanceof ApiError &&
          (failure.status === 400 ||
            ['STALE_VERSION', 'DUPLICATE_FEEDBACK'].includes(failure.detail.code))
        ) {
          // These definitive rejections did not accept this command. Keep the draft; refresh
          // authoritative version before a deliberate fresh-key submission.
          setPending(null);
          setPreservedEdits(true);
          await resource.reload();
        }
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
          setRefreshed(null);
          setAccepted(null);
          setHistory(null);
          await resource.reload();
        }
        throw failure;
      }
    }, 'Accepted operation confirmed. Any edited draft remains separate until you submit it.');
    inFlight.current = false;
    return ok;
  }

  async function submitCreate() {
    if (pending) return execute(pending);
    return execute({
      kind: 'create',
      path: `${root}/orders/${encodeURIComponent(orderId)}/feedback`,
      key: crypto.randomUUID(),
      payload: Object.freeze({
        receiptConfirmationId: selectedReceipt,
        category,
        ...(rating ? { rating: Number(rating) } : {}),
        comment,
      }),
    });
  }

  async function submitCorrection() {
    if (pending) return execute(pending);
    if (!own) return;
    return execute({
      kind: 'correction',
      path: `${root}/order-feedback/${encodeURIComponent(own.id)}/corrections`,
      key: crypto.randomUUID(),
      payload: Object.freeze({
        expectedVersion: own.currentVersion,
        category,
        ...(rating ? { rating: Number(rating) } : {}),
        comment,
        reason: reason.trim() || 'Buyer correction',
      }),
    });
  }

  return (
    <section className="section-gap order-feedback-panel" aria-labelledby="buyer-feedback-heading">
      <h2 id="buyer-feedback-heading">Your delivery feedback</h2>
      <p>
        Feedback is private to you and the assigned support team. A recorded receipt is not payment
        or commercial acceptance, and feedback never resolves a claim or changes an amount.
      </p>
      <ResourceState {...resource} retry={resource.reload} />
      {data && !eligible.length && !own && (
        <p className="notice" role="status">
          Feedback becomes available after you confirm receipt of at least one piece on a shipment
          for this order. If nothing arrived, open a support claim instead.
        </p>
      )}
      {own && (
        <article aria-labelledby="current-assessment">
          <h3 id="current-assessment">Your current assessment (version {own.currentVersion})</h3>
          <p>
            {humanize(own.category)} · {own.rating ? `${own.rating} of 5` : 'No rating'} ·{' '}
            {new Date(own.createdAt).toLocaleString()}
          </p>
          {own.comment && <p>{own.comment}</p>}
          <p>
            Follow-up status: <strong>{humanize(own.followUpStatus)}</strong>
            {own.followUpOwnerName ? ` · owner ${own.followUpOwnerName}` : ''}
          </p>
          {own.linkedTicketId && (
            <p>
              Formal claim status: <strong>{humanize(own.linkedTicketStatus ?? 'OPEN')}</strong>.
              The claim keeps its own lifecycle; this assessment never resolves it.
            </p>
          )}
          <p className="notice" role="note">
            {own.sourceLabel}. This label does not prove a real purchase or verified satisfaction.
          </p>
          {history && (
            <details>
              <summary>Assessment history ({history.total} versions)</summary>
              {history.notesWithheld && <p>Internal support notes are not shown to buyers.</p>}
              <ol>
                {history.items.map((item) => (
                  <li key={item.id}>
                    <strong>v{item.version}</strong> {humanize(item.kind)} · {item.actorName} ·{' '}
                    {new Date(item.createdAt).toLocaleString()}
                    <br />
                    {humanize(item.category)}
                    {item.rating ? ` · ${item.rating} of 5` : ''} · {humanize(item.followUpStatus)}
                    {item.comment && <p>{item.comment}</p>}
                    {item.reason && <p>Reason: {item.reason}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <h3>Correct your assessment</h3>
          <p>
            A correction adds a new version. Your original words stay in the private history and
            support follow-up is carried forward.
          </p>
          <div className="field">
            <label htmlFor={`${fieldId}-category`}>Category</label>
            <select
              id={`${fieldId}-category`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={command.busy}
            >
              {feedbackCategories.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-rating`}>Rating (optional, 1 to 5)</label>
            <input
              id={`${fieldId}-rating`}
              type="number"
              min="1"
              max="5"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-comment`}>Comment (optional, plain text)</label>
            <textarea
              id={`${fieldId}-comment`}
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-reason`}>Why are you correcting this?</label>
            <input
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <button
            type="button"
            onClick={submitCorrection}
            disabled={command.busy || Boolean(pending)}
          >
            {preservedEdits ? 'Submit edited correction with a new key' : 'Save correction'}
          </button>
        </article>
      )}
      {data && eligible.length > 0 && !own && (
        <article aria-labelledby="new-assessment">
          <h3 id="new-assessment">Record a private assessment</h3>
          <div className="field">
            <label htmlFor={`${fieldId}-receipt`}>Confirmed receipt</label>
            <select
              id={`${fieldId}-receipt`}
              value={selectedReceipt}
              onChange={(event) => setReceiptId(event.target.value)}
              disabled={command.busy}
            >
              {eligible.map((receipt) => (
                <option key={receipt.confirmationId} value={receipt.confirmationId}>
                  Received {receipt.received}, accepted {receipt.accepted}, damaged{' '}
                  {receipt.damaged}.{' '}
                  {receipt.provenanceComplete
                    ? `${receipt.missing} unaccounted for: ${receipt.notReportedByOperator} not reported delivered by the operator; ${receipt.buyerDeclaredMissing} declared missing by the buyer.`
                    : `${receipt.missing} unaccounted for; operator and buyer attribution unavailable.`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-new-category`}>Category</label>
            <select
              id={`${fieldId}-new-category`}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={command.busy}
            >
              {feedbackCategories.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-new-rating`}>Rating (optional, 1 to 5)</label>
            <input
              id={`${fieldId}-new-rating`}
              type="number"
              min="1"
              max="5"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${fieldId}-new-comment`}>Comment (optional, plain text)</label>
            <textarea
              id={`${fieldId}-new-comment`}
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={command.busy}
            />
          </div>
          <p>
            Fragile or short delivery? You can still record feedback. Nothing received at all
            belongs in a support claim.
          </p>
          <button type="button" onClick={submitCreate} disabled={command.busy || Boolean(pending)}>
            Submit private assessment
          </button>
        </article>
      )}
      {pending && (
        <div className="notice">
          <p role="note">
            An earlier operation is uncertain. Retry sends its original words and key; your edits
            stay separate.
          </p>
          <button type="button" disabled={command.busy} onClick={() => execute(pending)}>
            Retry original {pending.kind === 'create' ? 'assessment' : 'correction'}
          </button>
        </div>
      )}
      {accepted && data?.items.some((item) => item.id === accepted.id) && (
        <section aria-label="Accepted feedback operation">
          <h3>Accepted operation (version {accepted.version})</h3>
          <p>{accepted.comment || 'No comment'}</p>
          {preservedEdits && (
            <p role="note">
              Your edited draft is preserved. Review the current version, then explicitly submit
              your edited correction with a new key.
            </p>
          )}
        </section>
      )}
      {command.error && (
        <p className="notice" role="alert">
          {command.error}
        </p>
      )}
      {command.message && (
        <p className="notice success" role="status">
          {command.message}
        </p>
      )}
      {data && (
        <p className="notice" role="note">
          {data.limitations.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
