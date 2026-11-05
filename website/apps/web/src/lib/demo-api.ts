import { ApiError } from './api';

import type {
  DemoFeedbackCreateInput,
  DemoFeedbackMineList,
  DemoFeedbackView,
  DemoSessionView,
  DemoScenarioView,
} from '@nasj/contracts';
export type DemoSession = DemoSessionView;
export type DemoScenario = DemoScenarioView;
export type DemoPersona = DemoSession['personas'][number];
// Anonymous demo entry uses its separate visitor-bound proof. Commercial writes still use /me CSRF.
export async function demoRequest<T>(
  operation: 'session' | 'start' | 'switch' | 'reset' | 'feedback',
  options?: {
    body: unknown;
    csrfToken: string;
    idempotencyKey: string;
  },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/demo/${operation}`, {
      method: options ? 'POST' : 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
      headers: options
        ? {
            'Content-Type': 'application/json',
            'X-Demo-CSRF': options.csrfToken,
            'Idempotency-Key': options.idempotencyKey,
          }
        : { Accept: 'application/json' },
      ...(options ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new Error(
      'The demonstration service is unavailable. Retry to recover your scenario safely.',
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.code && typeof body.message === 'string'
        ? body
        : {
            code: 'DEMO_UNAVAILABLE',
            message: 'Unable to update this demonstration. Refresh its status and try again.',
          },
    );
  return body as T;
}

/**
 * Visitor feedback about a synthetic demonstration. Uses the same visitor-bound CSRF proof as the
 * other showroom commands; a failure keeps the caller's draft and idempotency key intact.
 */
export async function demoFeedbackRequest(
  body: DemoFeedbackCreateInput,
  options: { csrfToken: string; idempotencyKey: string },
): Promise<DemoFeedbackView> {
  return demoRequest<DemoFeedbackView>('feedback', { body, ...options });
}

export async function demoFeedbackList(scenarioId?: string): Promise<DemoFeedbackMineList> {
  const query = new URLSearchParams();
  if (scenarioId) query.set('scenarioId', scenarioId);
  const response = await fetch(`/api/v1/demo/feedback?${query.toString()}`, {
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload?.code && typeof payload.message === 'string'
        ? payload
        : { code: 'DEMO_UNAVAILABLE', message: 'Unable to load your feedback.' },
    );
  return payload as DemoFeedbackMineList;
}

export const demoStageGuidance: Record<string, string> = {
  PROCUREMENT:
    'Start with the buyer request and its exact specification. Synthetic quote acceptance does not reserve artisan capacity.',
  COMMERCIAL_DECISION:
    'The buyer reviews and accepts the exact issued quote. Then the production operator assesses eligibility and prepares offers.',
  ARTISAN_OFFERS:
    'An offer is proposed work. Switch to the authenticated artisan for a voluntary decision. Coordinator-reported acceptance remains blocked.',
  PRODUCTION:
    'The production operator reviews release evidence. The artisan starts accepted work, reports cumulative progress and submits it for inspection.',
  QUALITY:
    'The QA operator inspects reported pieces. Only quality-approved quantities can be prepared for shipment.',
  LOGISTICS:
    'Record collection, hub receipt and synthetic dispatch separately. The buyer confirms the delivered quantities.',
  TRACEABILITY:
    'Publish only approved craft content. The QR record preserves synthetic provenance and privacy suppression.',
  FINANCE:
    'Review recognized compensation and simulated settlement. Verified paid remains zero; missing bank and legal evidence blocks live closure.',
};

// Coalesce overlapping initial effects (including React development Strict Mode) so
// an anonymous browser receives one visitor cookie and one matching proof.
let pendingSession: Promise<DemoSession> | null = null;
export function demoSessionRequest(): Promise<DemoSession> {
  pendingSession ??= demoRequest<DemoSession>('session').finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}
