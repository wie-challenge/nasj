import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const { Client } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg') as {
  Client: new (options: {
    connectionString: string | undefined;
  }) => {
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  };
};
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const coordinators = await client.query(
    `SELECT m."userId",array_agg(m."organizationId") AS "organizationIds" FROM "OrganizationMember" m JOIN "MembershipRole" r ON r."membershipId"=m.id WHERE m.status='ACTIVE' AND r.role='ASSOCIATION_COORDINATOR' GROUP BY m."userId" HAVING count(*)>1`,
  );
  const artisans = await client.query(
    `SELECT "artisanProfileId",array_agg("organizationId") AS "organizationIds" FROM "AssociationMembership" WHERE status='ACTIVE' AND "endedAt" IS NULL GROUP BY "artisanProfileId" HAVING count(*)>1`,
  );
  const legacy = await client.query(
    `SELECT r.role,count(*)::int AS count FROM "MembershipRole" r WHERE r.role::text NOT IN ('BUYER_REPRESENTATIVE','NASJ_OPERATOR','ASSOCIATION_COORDINATOR') GROUP BY r.role`,
  );
  const counts = await client.query(
    `SELECT (SELECT count(*)::int FROM "User") AS users,(SELECT count(*)::int FROM "Account") AS accounts,(SELECT count(*)::int FROM "Session") AS sessions,(SELECT count(*)::int FROM "ArtisanProfile") AS artisans`,
  );
  const report = {
    coordinatorConflicts: coordinators.rows,
    artisanConflicts: artisans.rows,
    legacyRolesForReview: legacy.rows,
    counts: counts.rows[0],
    safeToMigrate: coordinators.rowCount === 0 && artisans.rowCount === 0,
  };
  await mkdir('.local', { recursive: true });
  await writeFile('.local/role-migration-preflight.json', JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      safeToMigrate: report.safeToMigrate,
      coordinatorConflictCount: coordinators.rowCount,
      artisanConflictCount: artisans.rowCount,
      counts: report.counts,
    }),
  );
  if (!report.safeToMigrate) process.exitCode = 1;
} finally {
  await client.end();
}
