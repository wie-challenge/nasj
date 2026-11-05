import type { User } from '@prisma/client';
import type { UserView } from '@nasj/contracts';
export const userSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;
export function publicUser(user: Pick<User, keyof typeof userSelect>): UserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
