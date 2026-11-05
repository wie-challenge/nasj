import { createHash } from 'node:crypto';
import type { Db } from '../foundation/transaction.js';
import { fail } from '../../common/errors.js';
export const demoVisitorCookie = 'nasj_demo_visitor';
export function visitorToken(cookie: string | undefined) {
  const value = (cookie ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${demoVisitorCookie}=`))
    ?.slice(demoVisitorCookie.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export const demoTokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function assertDemoSession(
  db: Db,
  userId: string,
  cookie: string | undefined,
  enabled: boolean,
) {
  const identity = await db.demoIdentity.findUnique({ where: { userId } });
  if (!identity) return;
  if (!enabled)
    fail(403, 'DEMO_ISOLATION', 'Synthetic showroom accounts cannot use this environment.');
  const token = visitorToken(cookie);
  const visitor = token
    ? await db.demoVisitor.findUnique({ where: { tokenHash: demoTokenHash(token) } })
    : null;
  const scenario = await db.demoScenario.findUnique({ where: { id: identity.scenarioId } });
  if (
    !visitor ||
    visitor.expiresAt <= new Date() ||
    visitor.activeScenarioId !== identity.scenarioId ||
    scenario?.visitorId !== visitor.id ||
    scenario.status !== 'ACTIVE'
  )
    fail(
      403,
      'DEMO_ISOLATION',
      'This synthetic session belongs to a different or archived visitor scenario.',
    );
}
