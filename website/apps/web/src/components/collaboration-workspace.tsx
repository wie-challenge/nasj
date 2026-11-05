'use client';
import { useState } from 'react';
import Image from 'next/image';
import { apiFetch } from '@/lib/api';
import { useResource, Workspace, ResourceState, humanize } from './workspace-ui';
import {
  notificationCategories,
  supportTicketCategories,
  type CollaborationWorkspaceView,
} from '@nasj/contracts';
import { CollaborationCreation, TermsComparison } from './collaboration-creation';
import { OrderFeedbackSection } from './order-feedback-support';

async function post(path: string, body: unknown) {
  return apiFetch(path, {
    method: 'POST',
    body,
    idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
  });
}

export function CollaborationWorkspace() {
  const resource = useResource<CollaborationWorkspaceView>('/api/v1/collaboration');
  const data = resource.data;
  return (
    <Workspace
      title="Collaboration and support"
      description="Production exceptions, schedule changes, counteroffers, availability and support cases. Every role sees only what it is entitled to."
    >
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
      <CollaborationCreation
        kind="counter"
        targets={data?.creation.counterOffers ?? []}
        reload={resource.reload}
      />
      <CollaborationCreation
        kind="exception"
        targets={data?.creation.exceptionBatches ?? []}
        reload={resource.reload}
      />
      <CollaborationCreation
        kind="schedule"
        targets={data?.creation.scheduleBatches ?? []}
        reload={resource.reload}
      />
      {data && (
        <>
          <ExceptionsSection data={data} reload={resource.reload} />
          <ScheduleSection data={data} reload={resource.reload} />
          <CounterofferSection data={data} reload={resource.reload} />
          <AvailabilitySection data={data} reload={resource.reload} />
          <OrderFeedbackSection data={data} reload={resource.reload} />
          <TicketSection data={data} reload={resource.reload} />
          <DiscussionSection data={data} reload={resource.reload} />
          <NotificationSection data={data} reload={resource.reload} />
          <p className="notice" role="note">
            {data.limitations.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </>
      )}
    </Workspace>
  );
}

type SectionProps = { data: CollaborationWorkspaceView; reload: () => unknown };

function useAction(reload: () => unknown) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function act(path: string, body: unknown, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await post(path, body);
      setMessage(success);
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to complete this action.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, act, reportError: setError };
}

function Feedback({ busy, message, error }: { busy: boolean; message: string; error: string }) {
  return (
    <>
      {busy && (
        <p role="status">
          <span>Working…</span>
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
    </>
  );
}

function ExceptionsSection({ data, reload }: SectionProps) {
  const { busy, message, error, act } = useAction(reload);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  return (
    <section aria-labelledby="exceptions">
      <h2 id="exceptions">Production exceptions</h2>
      {!data.exceptions.length && (
        <p className="notice" role="status">
          No production exception is recorded for your work.
        </p>
      )}
      <section
        className="table-scroll"
        aria-label="Production exception reports"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the overflowing report table.
        tabIndex={0}
      >
        <table className="data-table">
          {data.exceptions.length > 0 && (
            <>
              <caption>Exception reports keep the original statement intact</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reported by</th>
                  <th scope="col">Readiness</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.exceptions.map((exception) => (
                  <tr key={exception.id}>
                    <th scope="row">
                      {humanize(exception.category)}
                      <p>{exception.description}</p>
                      <p>
                        Affected quantity: {exception.affectedQuantity ?? 'Not specified'}. Date:{' '}
                        {exception.affectedDate
                          ? new Date(exception.affectedDate).toLocaleString()
                          : 'Not specified'}
                        .
                      </p>
                      {exception.evidenceReference && (
                        <p>Evidence: {exception.evidenceReference}</p>
                      )}
                      <p>
                        Responsible coordinator:{' '}
                        {exception.coordinator ??
                          'Assigned coordinator will be identified on acknowledgement'}
                        .
                      </p>
                      {exception.resolution && <p>Resolution: {exception.resolution}</p>}
                    </th>
                    <td>{humanize(exception.severity)}</td>
                    <td>{humanize(exception.status)}</td>
                    <td>{humanize(exception.reporterRole)}</td>
                    <td>{exception.blocksReadiness ? 'Blocks readiness' : 'Does not block'}</td>
                    <td>
                      {exception.canManage && exception.status === 'OPEN' && (
                        <button
                          className="button"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(
                              `/api/v1/collaboration/exceptions/${encodeURIComponent(exception.id)}`,
                              { status: 'ACKNOWLEDGED', resolution: '' },
                              'Exception acknowledged.',
                            )
                          }
                        >
                          Acknowledge
                        </button>
                      )}
                      {exception.canManage &&
                        ['ACKNOWLEDGED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].includes(
                          exception.status,
                        ) && (
                          <>
                            <label>
                              Resolution for {humanize(exception.category)}
                              <textarea
                                value={resolutions[exception.id] ?? ''}
                                onChange={(e) =>
                                  setResolutions({ ...resolutions, [exception.id]: e.target.value })
                                }
                                maxLength={2000}
                              />
                            </label>
                            <button
                              className="button"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  `/api/v1/collaboration/exceptions/${encodeURIComponent(exception.id)}`,
                                  {
                                    status: 'RESOLVED',
                                    resolution: resolutions[exception.id] ?? '',
                                  },
                                  'Exception resolved. The original report is preserved.',
                                )
                              }
                            >
                              Resolve
                            </button>
                          </>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </section>
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function ScheduleSection({ data, reload }: SectionProps) {
  const { busy, message, error, act } = useAction(reload);
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <section aria-labelledby="schedule">
      <h2 id="schedule">Schedule revisions</h2>
      <p>
        A proposed schedule never changes the agreed deadline. Every change requires the buyer and
        affected artisan to approve; old commitments remain until both approvals exist.
      </p>
      {!data.scheduleRevisions.length && (
        <p className="notice" role="status">
          No schedule change is proposed.
        </p>
      )}
      <ul>
        {data.scheduleRevisions.map((revision) => (
          <li key={revision.id}>
            <strong>{humanize(revision.status)}</strong> — proposed{' '}
            {new Date(revision.proposedDeadline).toLocaleDateString()} (was{' '}
            {new Date(revision.previousDeadline).toLocaleDateString()}, {revision.effect.deltaDays}{' '}
            day change). Effective deadline:{' '}
            {new Date(revision.effect.effectiveDeadline).toLocaleDateString()}.
            {revision.canDecide &&
              ['PENDING_APPROVAL', 'AWAITING_ARTISAN'].includes(revision.status) && (
                <>
                  <label>
                    Schedule decision note
                    <textarea
                      value={notes[revision.id] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [revision.id]: e.target.value })}
                      maxLength={2000}
                    />
                  </label>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        `/api/v1/collaboration/schedule-revisions/${encodeURIComponent(revision.id)}/decision`,
                        { decision: 'APPROVED', note: notes[revision.id] ?? '' },
                        'Your decision is recorded. The effective deadline changes only after all parties approve.',
                      )
                    }
                  >
                    Approve change
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        `/api/v1/collaboration/schedule-revisions/${encodeURIComponent(revision.id)}/decision`,
                        { decision: 'REJECTED', note: notes[revision.id] ?? '' },
                        'Schedule change rejected. The original deadline stands.',
                      )
                    }
                  >
                    Reject change
                  </button>
                </>
              )}
            <p>Reason: {revision.reason}</p>
            <ul aria-label="Schedule decision history">
              {revision.decisions.map((decision) => (
                <li key={`${decision.at}-${decision.party}-${decision.decision}`}>
                  {decision.party}: {humanize(decision.decision)} — {decision.note || 'No note'} (
                  {new Date(decision.at).toLocaleString()})
                </li>
              ))}
            </ul>
            <p>
              Buyer approval: {revision.buyerApproved ? 'recorded' : 'pending'}. Artisan approval:{' '}
              {revision.artisanApproved ? 'recorded' : 'pending'}.
            </p>
            <details>
              <summary>Capacity, material and transport impact</summary>
              <ScheduleImpact impact={revision.impact} />
            </details>
          </li>
        ))}
      </ul>
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function CounterofferSection({ data, reload }: SectionProps) {
  const { busy, message, error, act } = useAction(reload);
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <section aria-labelledby="counteroffers">
      <h2 id="counteroffers">Counteroffers</h2>
      <p>
        A counteroffer is a proposal, not an acceptance. Only your own final acceptance creates an
        agreement.
      </p>
      {!data.counteroffers.length && (
        <p className="notice" role="status">
          No counteroffer is open.
        </p>
      )}
      <ul>
        {data.counteroffers.map((counteroffer) => (
          <li key={counteroffer.id}>
            <strong>{humanize(counteroffer.status)}</strong> — {counteroffer.proposedQuantity}{' '}
            pieces by {new Date(counteroffer.proposedDeadline).toLocaleDateString()}. Agreement
            created: {counteroffer.createsAgreement ? 'Yes' : 'No'}.
            <TermsComparison original={counteroffer.original} proposed={counteroffer.proposed} />
            <p>Clarification: {counteroffer.clarification || 'None'}</p>
            <p>
              Decision history: {humanize(counteroffer.status)}. {counteroffer.reviewNote}
            </p>
            {counteroffer.canReview && counteroffer.status === 'PROPOSED' && (
              <>
                <label>
                  Review note
                  <textarea
                    value={notes[counteroffer.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [counteroffer.id]: e.target.value })}
                    maxLength={2000}
                  />
                </label>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      `/api/v1/collaboration/counteroffers/${encodeURIComponent(counteroffer.id)}/review`,
                      { decision: 'APPROVE_TERMS', note: notes[counteroffer.id] ?? '' },
                      'Changed terms accepted for review. The artisan must still accept them.',
                    )
                  }
                >
                  Manager approves terms
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      `/api/v1/collaboration/counteroffers/${encodeURIComponent(counteroffer.id)}/review`,
                      { decision: 'DECLINE', note: notes[counteroffer.id] ?? '' },
                      'Counteroffer declined. Original offer terms remain.',
                    )
                  }
                >
                  Decline counteroffer
                </button>
              </>
            )}
            {counteroffer.canConfirm && counteroffer.status === 'MANAGER_REVIEW' && (
              <>
                <p>
                  Review the newly issued offer in My offers and accept its exact terms there. This
                  confirmation checks that acceptance.
                </p>
                <a href="/commerce/artisan">Review my offers</a>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      `/api/v1/collaboration/counteroffers/${encodeURIComponent(counteroffer.id)}/accept`,
                      {},
                      'The authoritative offer acceptance is confirmed.',
                    )
                  }
                >
                  Confirm my offer acceptance
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function AvailabilitySection({ data, reload }: SectionProps) {
  const { busy, message, error, act } = useAction(reload);
  const [reason, setReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  return (
    <section aria-labelledby="availability">
      <h2 id="availability">Availability</h2>
      {data.availabilityPause ? (
        <>
          <p>
            Availability pause takes effect on{' '}
            {new Date(data.availabilityPause.effectiveFrom).toLocaleString()}. Accepted commitments
            and agreed compensation are unchanged, and this pause does not affect fairness
            eligibility.
          </p>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() =>
              act('/api/v1/collaboration/availability/resume', {}, 'Availability restored.')
            }
          >
            Resume availability
          </button>
        </>
      ) : (
        <>
          <p>
            You are available for new offers unless you pause. Accepted work requires a negotiated
            amendment; statements and support remain available.
          </p>
          <label>
            Pause effective date (leave empty for now)
            <input
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </label>
          <label>
            Reason for pausing (optional; no health details needed)
            <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                '/api/v1/collaboration/availability/pause',
                {
                  reason,
                  ...(effectiveFrom
                    ? { effectiveFrom: new Date(effectiveFrom).toISOString() }
                    : {}),
                },
                'Availability paused. Existing commitments are unchanged.',
              )
            }
          >
            Pause availability
          </button>
        </>
      )}
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function TicketSection({ data, reload }: SectionProps) {
  const { busy, message, error, act, reportError } = useAction(reload);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('SUPPORT_REQUEST');
  const [relatedType, setRelatedType] = useState('NONE');
  const [relatedId, setRelatedId] = useState('');
  const [correction, setCorrection] = useState('');
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  return (
    <section aria-labelledby="tickets">
      <h2 id="tickets">Support cases</h2>
      {!data.tickets.length && (
        <p className="notice" role="status">
          You have no open support case.
        </p>
      )}
      <ul>
        {data.tickets.map((ticket) => (
          <li key={ticket.id}>
            <strong>{humanize(ticket.category)}</strong> — {humanize(ticket.status)} (
            {humanize(ticket.priority)})<p>{ticket.description}</p>
            <label>
              Correction or clarification for this case
              <textarea
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
              />
            </label>
            <button
              className="button"
              type="button"
              disabled={busy || correction.trim().length < 2}
              onClick={() =>
                act(
                  `/api/v1/collaboration/tickets/${encodeURIComponent(ticket.id)}/corrections`,
                  { detail: correction },
                  'Correction recorded. The original facts are preserved.',
                )
              }
            >
              Add correction
            </button>
            <label>
              Add a case image (PNG, JPEG or WebP, up to 256 KiB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 262144) {
                    reportError('Use a PNG, JPEG or WebP image up to 256 KiB.');
                    return;
                  }
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                  });
                  await act(
                    `/api/v1/collaboration/tickets/${encodeURIComponent(ticket.id)}/attachments`,
                    { filename: file.name, mime: file.type, base64 },
                    'Private case image added.',
                  );
                }}
              />
            </label>
            {ticket.attachments.length > 0 && (
              <ul>
                {ticket.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    {attachment.filename} ({attachment.mime}){' '}
                    <button
                      className="button"
                      type="button"
                      onClick={async () => {
                        try {
                          const file = await apiFetch<{
                            base64: string;
                            mime: string;
                            filename: string;
                          }>(
                            `/api/v1/collaboration/tickets/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`,
                          );
                          setPreview({
                            src: `data:${file.mime};base64,${file.base64}`,
                            alt: `Support evidence: ${file.filename}`,
                          });
                        } catch {
                          reportError('Unable to load this private image.');
                        }
                      }}
                    >
                      View private image
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>Case history</summary>
              <ul>
                {ticket.events.map((event) => (
                  <li key={event.id}>
                    {humanize(event.kind)}: {event.detail}
                  </li>
                ))}
              </ul>
            </details>
            <p>
              Privacy: {humanize(ticket.privacyScope)}. Response due:{' '}
              {ticket.dueAt ? new Date(ticket.dueAt).toLocaleString() : 'Unassigned'}.
            </p>
            {!['CLOSED', 'WITHDRAWN', 'RESOLVED'].includes(ticket.status) && (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    `/api/v1/collaboration/tickets/${encodeURIComponent(ticket.id)}`,
                    { status: 'WITHDRAWN', resolution: '' },
                    'Request withdrawn. Original facts remain in the private audit history.',
                  )
                }
              >
                Withdraw request
              </button>
            )}
            {['OPEN', 'ASSIGNED', 'IN_REVIEW', 'ESCALATED'].includes(ticket.status) && (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    `/api/v1/collaboration/tickets/${encodeURIComponent(ticket.id)}`,
                    { status: 'IN_PROGRESS', resolution: '' },
                    'Support case moved to in progress.',
                  )
                }
              >
                Start work
              </button>
            )}
            {['IN_PROGRESS', 'WAITING_ON_REPORTER'].includes(ticket.status) && (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    `/api/v1/collaboration/tickets/${encodeURIComponent(ticket.id)}`,
                    { status: 'RESOLVED', resolution: 'Resolved with the reporter.' },
                    'Support case resolved.',
                  )
                }
              >
                Resolve
              </button>
            )}
          </li>
        ))}
      </ul>
      {preview && (
        <figure>
          <Image
            unoptimized
            width={800}
            height={600}
            src={preview.src}
            alt={preview.alt}
            style={{ maxWidth: '100%', height: 'auto' }}
          />
          <figcaption>{preview.alt}</figcaption>
        </figure>
      )}
      <h3>Open a support case</h3>
      <label>
        Case category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {supportTicketCategories.map((item) => (
            <option key={item} value={item}>
              {humanize(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Related resource type
        <select value={relatedType} onChange={(event) => setRelatedType(event.target.value)}>
          {['NONE', 'ORDER', 'BATCH', 'OFFER', 'PAYABLE'].map((item) => (
            <option key={item} value={item}>
              {humanize(item)}
            </option>
          ))}
        </select>
      </label>
      {relatedType !== 'NONE' && (
        <label>
          Related resource reference
          <input value={relatedId} onChange={(event) => setRelatedId(event.target.value)} />
        </label>
      )}
      <p>
        Case details and images remain private to you and authorized support staff. A case
        resolution does not itself change payment or accepted quantity.
      </p>
      {category === 'SUPPORT_REQUEST' && (
        <p>You can request support without providing a justification. Details are optional.</p>
      )}
      <label>
        Describe the issue
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </label>
      <button
        className="button"
        type="button"
        disabled={busy || (category !== 'SUPPORT_REQUEST' && description.trim().length < 2)}
        onClick={() =>
          act(
            '/api/v1/collaboration/tickets',
            {
              category,
              relatedType,
              ...(relatedType !== 'NONE' ? { relatedId } : {}),
              description,
              evidenceReference: '',
              priority: 'NORMAL',
            },
            'Support case opened.',
          )
        }
      >
        Open case
      </button>
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function DiscussionSection({ data, reload }: SectionProps) {
  const { busy, message, error, act } = useAction(reload);
  const [body, setBody] = useState('');
  return (
    <section aria-labelledby="discussions">
      <h2 id="discussions">Order discussions</h2>
      <p>
        Only participants of the order can read or post. Internal financial detail never appears in
        a buyer-facing thread.
      </p>
      {!data.discussions.length && (
        <p className="notice" role="status">
          No discussion exists yet.
        </p>
      )}
      <ul>
        {data.discussions.map((discussion) => (
          <li key={discussion.id}>
            <p>{discussion.body}</p>
            <ul>
              {discussion.messages.map((entry) => (
                <li key={entry.id}>
                  {entry.internalOnly ? '[Internal] ' : ''}
                  {entry.body} — {humanize(entry.deliveryStatus)} —{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {data.discussions[0] && (
        <>
          <label>
            Post to this order discussion
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
          </label>
          <button
            className="button"
            type="button"
            disabled={busy || body.trim().length < 2}
            onClick={() =>
              act(
                `/api/v1/collaboration/orders/${encodeURIComponent(
                  data.discussions[0].orderId,
                )}/discussions`,
                { body, internalOnly: false },
                'Message posted to the order discussion.',
              )
            }
          >
            Post message
          </button>
        </>
      )}
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function NotificationSection({ data, reload }: SectionProps) {
  const { busy, message, error, act } = useAction(reload);
  const [category, setCategory] = useState('PRODUCTION_EXCEPTION');
  const [channel, setChannel] = useState('IN_APP');
  const [language, setLanguage] = useState('en');
  return (
    <section aria-labelledby="notifications">
      <h2 id="notifications">Notifications</h2>
      <p>
        Only channels you opt in to are used. An external channel without a configured provider is
        recorded as undeliverable, never as sent.
      </p>
      <label>
        Notification category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {notificationCategories.map((item) => (
            <option key={item} value={item}>
              {humanize(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Preferred notification channel
        <select value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="IN_APP">In app</option>
          <option value="EMAIL">Email</option>
        </select>
      </label>
      <label>
        Notification language
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
        </select>
      </label>
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() =>
          act(
            '/api/v1/collaboration/notifications/preferences',
            { category, channel, language, optedIn: true },
            'Your explicit notification preference is saved.',
          )
        }
      >
        Opt in to this category
      </button>
      <table className="data-table">
        <caption>Notification preferences</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Channel</th>
            <th scope="col">Opted in</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {data.notificationPreferences.map((preference) => (
            <tr key={`${preference.category}-${preference.channel}`}>
              <th scope="row">{humanize(preference.category)}</th>
              <td>{humanize(preference.channel)}</td>
              <td>{preference.optedIn ? 'Yes' : 'No'}</td>
              <td>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      '/api/v1/collaboration/notifications/preferences',
                      {
                        category: preference.category,
                        channel: preference.channel,
                        optedIn: !preference.optedIn,
                      },
                      'Notification preference saved.',
                    )
                  }
                >
                  {preference.optedIn ? 'Opt out' : 'Opt in'}
                </button>
              </td>
            </tr>
          ))}
          {!data.notificationPreferences.length && (
            <tr>
              <td colSpan={4}>No preference is recorded. Nothing is sent until you opt in.</td>
            </tr>
          )}
        </tbody>
      </table>
      <h3>Recent deliveries</h3>
      {!data.notifications.length && (
        <p className="notice" role="status">
          No notification has been recorded.
        </p>
      )}
      <ul>
        {data.notifications.map((notification) => (
          <li key={notification.id}>
            {notification.subject} — {humanize(notification.status)} via{' '}
            {humanize(notification.channel)} on {new Date(notification.createdAt).toLocaleString()}
            {notification.status !== 'DELIVERED' && (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    `/api/v1/collaboration/notifications/${encodeURIComponent(notification.id)}/retry`,
                    {},
                    'Delivery rechecked against your current preference. An unavailable provider cannot send.',
                  )
                }
              >
                Retry delivery
              </button>
            )}
          </li>
        ))}
      </ul>
      <Feedback busy={busy} message={message} error={error} />
    </section>
  );
}

function ScheduleImpact({ impact }: { impact: unknown }) {
  const value = impact as {
    buyerDeadline?: string;
    deltaDays?: number;
    capacityPeriod?: { from?: string; to?: string; requiresReassessment?: boolean };
    materialImpact?: { unresolvedExceptions?: string[] };
  };
  return (
    <>
      <p>
        Buyer delivery deadline:{' '}
        {value.buyerDeadline ? new Date(value.buyerDeadline).toLocaleString() : 'Unknown'}. Change:{' '}
        {value.deltaDays ?? 'Unknown'} days.
      </p>
      <p>
        Capacity period:{' '}
        {value.capacityPeriod?.from
          ? new Date(value.capacityPeriod.from).toLocaleDateString()
          : 'Unknown'}{' '}
        to{' '}
        {value.capacityPeriod?.to
          ? new Date(value.capacityPeriod.to).toLocaleDateString()
          : 'Unknown'}
        .{' '}
        {value.capacityPeriod?.requiresReassessment
          ? 'Reassessment required; final approval is blocked.'
          : 'Within the recorded capacity period.'}
      </p>
      <p>
        Material shortages: {value.materialImpact?.unresolvedExceptions?.length ?? 'Unknown'}{' '}
        unresolved; coordinator confirmation required.
      </p>
      <p>Transport impact: unknown; coordinator review required.</p>
      <p>Agreed quantity and compensation remain unchanged.</p>
    </>
  );
}
