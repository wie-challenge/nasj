import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';
import { disposableDatabase } from './support.js';
export async function runRoleUpgradeScenario(
  check: (name: string, run: () => Promise<void>) => Promise<void>,
) {
  await check(
    'role migration reports conflicting affiliations, preserves old identities and backfills explicit authority without deleting records',
    async () => {
      const database = await disposableDatabase({ foundationOnly: true });
      const db = new Client({ connectionString: database.url });
      try {
        await db.connect();
        const root = new URL('../prisma/migrations/', import.meta.url);
        const folders = (await readdir(root)).filter((n) => n !== 'migration_lock.toml').sort();
        for (const folder of folders) {
          if (folder === '202610150001_foundation' || folder >= '20261021010000_revised_foundation')
            continue;
          await db.query(await readFile(new URL(`${folder}/migration.sql`, root), 'utf8'));
        }
        await db.query(
          `INSERT INTO "User"(id,name,email,"emailVerified","updatedAt") VALUES('role-upgrade-user','Synthetic upgrade','role-upgrade@example.com',true,now());`,
        );
        await db.query(
          `INSERT INTO "Organization"(id,name,slug,type,region,description,"contactEmail","representativeName","createdByUserId","updatedAt") VALUES('role-upgrade-a','Synthetic A','role-upgrade-a','ASSOCIATION','Tunis','Synthetic fixture','fixture@example.com','Fixture','role-upgrade-user',now()),('role-upgrade-b','Synthetic B','role-upgrade-b','ASSOCIATION','Tunis','Synthetic fixture','fixture@example.com','Fixture','role-upgrade-user',now()),('role-upgrade-buyer','Synthetic Buyer','role-upgrade-buyer','BUYER_BUSINESS','Tunis','Synthetic fixture','fixture@example.com','Fixture','role-upgrade-user',now());`,
        );
        await db.query(
          `INSERT INTO "OrganizationMember"(id,"organizationId","userId","updatedAt") VALUES('role-upgrade-ma','role-upgrade-a','role-upgrade-user',now()),('role-upgrade-mb','role-upgrade-b','role-upgrade-user',now()),('role-upgrade-buyerm','role-upgrade-buyer','role-upgrade-user',now());`,
        );
        await db.query(
          `INSERT INTO "MembershipRole"(id,"membershipId",role,"assignedByUserId") VALUES('role-upgrade-ra','role-upgrade-ma','ASSOCIATION_COORDINATOR','role-upgrade-user'),('role-upgrade-rb','role-upgrade-mb','ASSOCIATION_COORDINATOR','role-upgrade-user'),('role-upgrade-buyerr','role-upgrade-buyerm','BUYER','role-upgrade-user');`,
        );
        const sql = await readFile(
          new URL('20261021010000_revised_foundation/migration.sql', root),
          'utf8',
        );
        await assert.rejects(db.query(sql), /Coordinator conflict report.*role-upgrade-user/);
        await db.query('ROLLBACK');
        assert.equal(
          (await db.query(`SELECT to_regclass('"ArtisanManagement"') AS value`)).rows[0].value,
          null,
        );
        await db.query(
          `UPDATE "OrganizationMember" SET status='REVOKED' WHERE id='role-upgrade-mb'`,
        );
        await db.query(
          `INSERT INTO "ArtisanProfile"(id,"userId","displayName",region,equipment,"updatedAt") VALUES('role-upgrade-artisan','role-upgrade-user','Synthetic existing artisan','Tunis','{}',now())`,
        );
        await db.query(
          `INSERT INTO "ConsentRecord"(id,"userId",purpose,"policyVersion",decision,"collectionContext") VALUES('role-upgrade-consent','role-upgrade-user','artisan.profile','synthetic-v1',true,'synthetic upgrade fixture')`,
        );
        await db.query(
          `INSERT INTO "AssociationMembership"(id,"artisanProfileId","organizationId","consentRecordId","updatedAt") VALUES('role-upgrade-aa','role-upgrade-artisan','role-upgrade-a','role-upgrade-consent',now()),('role-upgrade-ab','role-upgrade-artisan','role-upgrade-b','role-upgrade-consent',now())`,
        );
        await assert.rejects(
          db.query(sql),
          /Artisan management conflict report.*role-upgrade-artisan/,
        );
        await db.query('ROLLBACK');
        await db.query(
          `UPDATE "AssociationMembership" SET status='REVOKED',"endedAt"=now() WHERE id='role-upgrade-ab'`,
        );
        const before = (
          await db.query(
            `SELECT row_to_json(u) AS value FROM "User" u WHERE id='role-upgrade-user'`,
          )
        ).rows[0].value;
        await db.query(sql);
        for (const folder of folders.filter((f) => f > '20261021010000_revised_foundation'))
          await db.query(await readFile(new URL(`${folder}/migration.sql`, root), 'utf8'));
        assert.equal(
          (
            await db.query(
              `SELECT enabled FROM "MembershipPermission" WHERE "membershipId"='role-upgrade-buyerm'`,
            )
          ).rows[0].enabled,
          true,
        );
        assert.equal(
          (
            await db.query(
              `SELECT count(*)::int AS n FROM "AssociationMembership" WHERE "artisanProfileId"='role-upgrade-artisan'`,
            )
          ).rows[0].n,
          2,
        );
        assert.equal(
          (
            await db.query(
              `SELECT count(*)::int AS n FROM "ArtisanManagement" WHERE "artisanProfileId"='role-upgrade-artisan' AND "endedAt" IS NULL`,
            )
          ).rows[0].n,
          1,
        );
        assert.deepEqual(
          (
            await db.query(
              `SELECT row_to_json(u) AS value FROM "User" u WHERE id='role-upgrade-user'`,
            )
          ).rows[0].value,
          before,
        );
        assert.equal(
          (
            await db.query(
              `SELECT count(*)::int AS n FROM "OrganizationMember" WHERE "userId"='role-upgrade-user'`,
            )
          ).rows[0].n,
          3,
        );
        assert.equal(
          (
            await db.query(
              `SELECT permission FROM "MembershipPermission" WHERE "membershipId"='role-upgrade-buyerm'`,
            )
          ).rows[0].permission,
          'buyer.quotation.approve',
        );
        await db.query(
          `INSERT INTO "ArtisanProfile"(id,"displayName",region,equipment,"createdById","updatedAt") VALUES('role-upgrade-no-login','Synthetic assisted','Tunis','{}','role-upgrade-user',now())`,
        );
        assert.equal(
          (await db.query(`SELECT "userId" FROM "ArtisanProfile" WHERE id='role-upgrade-no-login'`))
            .rows[0].userId,
          null,
        );
      } finally {
        await db.end();
        await database.stop();
      }
    },
  );
}
