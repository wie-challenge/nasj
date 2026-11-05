import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { emailSchema } from '@nasj/contracts';
import { loadConfig } from './config/env.js';
const args = process.argv.slice(2).filter((value) => value !== '--');
const email = emailSchema.safeParse(args[0]);
if (args.length !== 1 || !email.success) {
  console.error('Usage: pnpm db:bootstrap-admin -- verified-account@example.com');
  process.exit(1);
}
const config = loadConfig();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) });
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
    const user = await tx.user.findUnique({ where: { email: email.data } });
    if (!user?.emailVerified || user.status !== 'ACTIVE')
      throw new Error('An existing active verified account is required.');
    await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
  console.log('Administrator access granted. Sign in again.');
} catch {
  console.error(
    'Administrator bootstrap failed. Check database readiness and use an existing active verified account.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
