// Runs PrismaClient against the wire-protocol PostgreSQL server.
import { bootPostgres } from './wire-session.mjs';

const REPO = '/home/ashenix/Projects/wie-challenge/website';
const env = await bootPostgres();

const { PrismaClient } = await import(
  `${REPO}/node_modules/.pnpm/@prisma+client@7.10.1_prisma@7.10.1_@types+node@24.19.2_@types+react-dom@19.3.0_@types+_9e72caf218d3f522373b8e6c9536cf3f/node_modules/@prisma/client/default.js`
);
const { PrismaPg } = await import(
  `${REPO}/node_modules/.pnpm/@prisma+adapter-pg@7.10.1/node_modules/@prisma/adapter-pg/dist/index.js`
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.connectionString, connectionTimeoutMillis: 10000 }),
  log: [],
});

try {
  const orgs = await prisma.organization.count();
  await prisma.user.create({
    data: {
      id: 'probe-user',
      email: 'probe@example.test',
      emailVerified: true,
      name: 'Probe',
      status: 'ACTIVE',
      updatedAt: new Date(),
    },
  });
  const readBack = await prisma.user.findUnique({ where: { id: 'probe-user' } });
  console.log(
    JSON.stringify({ prismaOk: true, organizationCount: orgs, readBack: readBack?.email }, null, 1),
  );
} catch (error) {
  console.log(JSON.stringify({ prismaOk: false, error: String(error).slice(0, 500) }, null, 1));
} finally {
  await prisma.$disconnect();
  await env.close();
}
