'use client';
import { useRef, useState } from 'react';
import type { CommercialOfferView } from '@nasj/contracts';
import { apiFetch, ApiError } from '@/lib/api';
import { offerCopy, offerDirection, offerLanguage } from '@/lib/offer-language';
import { Card } from './ui/card';
import { humanize } from './workspace-ui';

export function OfferReview({
  offer: o,
  own,
  decide,
  reload,
}: {
  offer: CommercialOfferView;
  own: boolean;
  decide: (path: string, next: string, version: number, extra: object) => Promise<unknown>;
  reload: () => unknown;
}) {
  const [language, setLanguage] = useState(() => offerLanguage(o.preferredLanguage));
  const [acknowledged, setAcknowledged] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const pendingQuestion = useRef<{ description: string; key: string } | null>(null);
  const t = offerCopy[language];
  const date = (value: string) =>
    `${new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Tunis' }).format(new Date(value))} (Africa/Tunis; ${value})`;
  const allowed = language === 'en' && (o.preferredLanguage === 'en' || acknowledged);
  const fields = [
    [t.quantity, `${o.quantity}`],
    [t.effort, o.estimatedHours],
    [t.rate, `${o.unitPayTnd ?? t.restricted} TND`],
    [t.total, `${o.totalPayTnd ?? t.restricted} TND`],
    [t.method, o.compensationMethod ? humanize(o.compensationMethod) : null],
    [t.specification, o.specification],
    [t.materials, o.materials],
    [t.rework, o.reworkTerms],
    [t.payment, o.paymentConditions],
    [t.collection, o.collectionArrangement],
    [t.instructions, o.instructions],
    [t.expires, date(o.expiresAt)],
    [t.deadline, date(o.deliveryAt)],
  ];
  async function run(next: 'ACCEPTED' | 'DECLINED' | 'CLARIFY') {
    if (lock.current || (next === 'ACCEPTED' && !allowed)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (next === 'CLARIFY') {
        // Retry an uncertain clarification with its immutable original payload and key.
        pendingQuestion.current ??= { description: question, key: crypto.randomUUID() };
        await apiFetch('/api/v1/collaboration/tickets', {
          method: 'POST',
          idempotencyKey: pendingQuestion.current.key,
          body: {
            category: 'COMMERCIAL',
            relatedType: 'OFFER',
            relatedId: o.id,
            description: pendingQuestion.current.description,
            privacyScope: 'SUPPORT_ONLY',
          },
        });
        pendingQuestion.current = null;
        setMessage(t.sent);
      } else {
        await decide(`offers/${o.id}`, next, o.version, {
          ...(o.termsSha256 ? { termsSha256: o.termsSha256 } : {}),
          ...(next === 'ACCEPTED'
            ? {
                reviewLanguage: 'en',
                sourceTermsLanguage: 'en',
                ...(acknowledged ? { acknowledgeOriginalTerms: true } : {}),
              }
            : {}),
        });
        await reload();
      }
    } catch (failure) {
      if (next === 'CLARIFY' && failure instanceof ApiError && failure.status === 400)
        pendingQuestion.current = null;
      setError(`${t.error} ${failure instanceof Error ? failure.message : ''}`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card
      role="article"
      className="panel commerce-card block gap-0 p-5"
      aria-label={`Artisan offer ${o.id}`}
      lang={language}
      dir={offerDirection(language)}
    >
      <h3>
        {language === 'en'
          ? `Artisan offer · ${humanize(o.status)}`
          : `${t.status}: ${humanize(o.status)}`}
      </h3>
      <p className="hint" lang="en" dir="ltr" style={{ overflowWrap: 'anywhere' }}>
        {o.id} · Synthetic · version {o.version}
      </p>
      <label>
        {t.language}
        <select
          aria-label="Offer language"
          value={language}
          disabled={busy}
          onChange={(event) => {
            setLanguage(offerLanguage(event.target.value));
            setAcknowledged(false);
            setError('');
          }}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="ar">العربية</option>
        </select>
      </label>
      <p role="note">{t.translation}</p>
      <dl className="commerce-facts">
        {fields
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd lang="en" dir="ltr" style={{ overflowWrap: 'anywhere' }}>
                {value}
              </dd>
            </div>
          ))}
      </dl>
      <p>{t.warning}</p>
      {own && o.status === 'OFFERED' && (
        <>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={busy || language !== 'en'}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            {t.acknowledge}
          </label>
          <button
            className="button"
            disabled={busy || !allowed}
            type="button"
            onClick={() => void run('ACCEPTED')}
          >
            {t.accept}
          </button>
          <button
            className="button"
            disabled={busy}
            type="button"
            onClick={() => void run('DECLINED')}
          >
            {t.decline}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run('CLARIFY');
            }}
          >
            <label>
              {t.question}
              <textarea
                aria-label={t.question}
                required
                minLength={2}
                maxLength={4000}
                value={question}
                disabled={busy || !!pendingQuestion.current}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy} type="submit">
              {t.clarify}
            </button>
          </form>
        </>
      )}
      {busy && <p role="status">{t.busy}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
