import type { Db } from './transaction.js';
import type { Actor } from '../../common/identity.js';
import { fail } from '../../common/errors.js';
export async function hasPrivilegedAccess(db: Db, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === 'ADMIN') return true;
  return Boolean(
    await db.organizationMember.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [
          { isManager: true },
          { roles: { some: { role: { notIn: ['BUYER', 'BUYER_REPRESENTATIVE', 'ARTISAN'] } } } },
        ],
      },
    }),
  );
}
export async function requireMfa(db: Db, actor: Actor, required: boolean) {
  if (!required) return;
  if (!(await hasPrivilegedAccess(db, actor.id))) return;
  const [user, session] = await Promise.all([
    db.user.findUnique({ where: { id: actor.id }, select: { twoFactorEnabled: true } }),
    db.session.findUnique({
      where: { id: actor.sessionId },
      select: { mfaVerifiedAt: true, userId: true },
    }),
  ]);
  if (!user?.twoFactorEnabled || !session?.mfaVerifiedAt || session.userId !== actor.id)
    fail(
      403,
      'MFA_REQUIRED',
      'Set up multi-factor authentication in Security settings and verify this session.',
    );
}
