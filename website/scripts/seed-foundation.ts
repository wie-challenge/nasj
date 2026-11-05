import { mkdir, readFile, writeFile, chmod, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createApp } from '../apps/api/src/app.js';
import { validateEnvironment } from '../apps/api/src/config/env.js';
import { AuthService } from '../apps/api/src/modules/auth/auth.service.js';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';
import { logger } from '../apps/api/src/common/logging.js';
import type { BusinessRole } from '../packages/contracts/src/permissions.js';
import { assertLocalDevelopment } from './local-development.js';

const personas = [
  { key: 'admin', name: 'Demo Platform Admin', email: 'admin@nasj-demo.invalid' },
  { key: 'operator', name: 'Demo NASJ Operator', email: 'operator@nasj-demo.invalid' },
  { key: 'buyer', name: 'Demo Buyer Representative', email: 'buyer@nasj-demo.invalid' },
  {
    key: 'coordinator',
    name: 'Demo Association Coordinator',
    email: 'coordinator@nasj-demo.invalid',
  },
] as const;
type Credential = { persona: string; name: string; email: string; password: string };
export async function seedFoundation(mode: 'demo' | 'development') {
  const demo = mode === 'demo';
  const credentialsFile = new URL(
    demo ? '../.local/demo-credentials.json' : '../.local/dev-credentials.json',
    import.meta.url,
  );
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  logger.level = 'silent';
  try {
    // These checks precede Nest/Prisma startup and every possible database write.
    if (!demo) assertLocalDevelopment(process.env);
    const database = new URL(process.env.DATABASE_URL ?? '');
    if (
      demo &&
      (process.env.DEMO_MODE !== 'true' ||
        process.env.NODE_ENV === 'production' ||
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        database.pathname !== '/nasj_demo' ||
        database.hostname !== '127.0.0.1' ||
        database.port !== '5542' ||
        database.username !== 'nasj_demo' ||
        database.search ||
        database.hash ||
        process.env.PUBLIC_APP_URL !== 'http://127.0.0.1:3200')
    )
      throw new Error('Refusing to seed outside the isolated local demo database.');
    const config = validateEnvironment(process.env);
    await mkdir(new URL('../.local/', import.meta.url), { recursive: true, mode: 0o700 });
    const generated = {
      version: 1,
      environment: demo ? 'isolated-local-demo' : 'local-development',
      appUrl: config.PUBLIC_APP_URL,
      personas: personas.map((persona) => ({
        persona: persona.key,
        name: persona.name,
        email: persona.email,
        password: randomBytes(24).toString('base64url'),
      })),
    };
    const credentialsExist = await access(credentialsFile).then(
      () => true,
      (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      },
    );
    if (credentialsExist) {
      // Preserve synthetic passwords while normalizing manifests from the former project name.
      try {
        const previous = JSON.parse(await readFile(credentialsFile, 'utf8')) as {
          environment?: string;
          personas?: Credential[];
        };
        if (
          previous.environment !== (demo ? 'isolated-local-demo' : 'local-development') ||
          !Array.isArray(previous.personas)
        )
          throw new Error('Invalid synthetic credential manifest.');
        for (const entry of generated.personas) {
          const old = previous.personas.find((item) => item.persona === entry.persona);
          if (!old) continue; // New personas receive a generated password once.
          if (typeof old.password !== 'string' || old.password.length < 24)
            throw new Error('Invalid synthetic credential entry.');
          entry.password = old.password;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    app = await createApp({ config });
    const db = app.get(PrismaService);
    const auth = app.get(AuthService);
    const previousEntries: Credential[] = credentialsExist
      ? JSON.parse(await readFile(credentialsFile, 'utf8')).personas
      : [];
    for (const persona of personas) {
      if (
        (await db.user.findUnique({ where: { email: persona.email } })) &&
        !previousEntries.some((entry) => entry.persona === persona.key)
      )
        throw new Error(
          'Existing fixture login has no preserved credentials; refusing to replace its password.',
        );
    }
    // Permit historical fixture accounts in an upgraded isolated demo, but never other identities.
    const allowedEmails = [
      ...personas.map((persona) => persona.email),
      ...['admin', 'buyer', 'coordinator', 'artisan', 'production', 'finance'].flatMap((key) => [
        `${key}@nasj-demo.invalid`,
        `${key}@hirfacare-demo.invalid`,
      ]),
    ];
    if (
      demo &&
      (await db.user.count({
        where: {
          email: { notIn: allowedEmails },
          id: {
            notIn: (
              await db.demoIdentity.findMany({ select: { userId: true } })
            ).map((identity) => identity.userId),
          },
        },
      }))
    )
      throw new Error('Non-demo identities detected; refusing to seed this database.');
    await writeFile(credentialsFile, `${JSON.stringify(generated, null, 2)}\n`, {
      flag: 'w',
      mode: 0o600,
    });
    await chmod(credentialsFile, 0o600);
    const entries = generated.personas;
    const users = new Map<string, string>();
    for (const persona of personas) {
      const credential = entries.find((entry) => entry.persona === persona.key);
      if (!credential) throw new Error('Missing local demo credential.');
      const existing = await db.user.findUnique({ where: { email: persona.email } });
      if (!existing)
        await auth.auth.api.signUpEmail({
          body: { name: persona.name, email: persona.email, password: credential.password },
        });
      const user =
        existing ??
        (await db.user.update({
          where: { email: persona.email },
          data: {
            emailVerified: true,
            role: persona.key === 'admin' ? 'ADMIN' : 'USER',
            status: 'ACTIVE',
          },
        }));
      users.set(persona.key, user.id);
    }
    const id = (key: string) => {
      const value = users.get(key);
      if (!value) throw new Error('Missing synthetic identity.');
      return value;
    };
    const admin = id('admin');
    const capacityStart = new Date();
    capacityStart.setUTCHours(0, 0, 0, 0);
    capacityStart.setUTCDate(
      capacityStart.getUTCDate() + ((8 - capacityStart.getUTCDay()) % 7 || 7),
    );
    const capacityEnd = new Date(capacityStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const organizationSpecs = [
      {
        slug: 'demo-buyer-business',
        name: 'DEMO — Jasmin Buyer Studio',
        type: 'BUYER_BUSINESS' as const,
        owner: 'buyer',
      },
      {
        slug: 'demo-artisan-association',
        name: 'DEMO — Noura Artisan Association',
        type: 'ASSOCIATION' as const,
        owner: 'coordinator',
      },
      {
        slug: 'demo-internal-operator',
        name: 'DEMO — NASJ Operations',
        type: 'INTERNAL' as const,
        owner: 'admin',
      },
    ];
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631902)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(724631903)`;
        const organizations = new Map<string, string>();
        for (const spec of organizationSpecs) {
          const organization = await tx.organization.upsert({
            where: { slug: spec.slug },
            update: {},
            create: {
              slug: spec.slug,
              name: spec.name,
              type: spec.type,
              country: 'TN',
              region: 'Tunis',
              description:
                'Fictional demonstration organization. No real commercial activity or personal records.',
              contactEmail: `${spec.owner}@nasj-demo.invalid`,
              representativeName:
                personas.find((p) => p.key === spec.owner)?.name ?? 'Demo Representative',
              createdByUserId: id(spec.owner),
              approvalStatus: 'APPROVED',
              approvedByUserId: admin,
              approvedAt: new Date(),
              approvalReason: 'Synthetic isolated demonstration fixture',
            },
          });
          organizations.set(spec.slug, organization.id);
        }
        const orgId = (slug: string) => {
          const value = organizations.get(slug);
          if (!value) throw new Error('Missing synthetic organization.');
          return value;
        };
        const memberships: {
          persona: string;
          slug: string;
          manager: boolean;
          roles: BusinessRole[];
        }[] = [
          {
            persona: 'buyer',
            slug: 'demo-buyer-business',
            manager: true,
            roles: ['BUYER_REPRESENTATIVE'],
          },
          {
            persona: 'coordinator',
            slug: 'demo-artisan-association',
            manager: true,
            roles: ['ASSOCIATION_COORDINATOR'],
          },
          {
            persona: 'operator',
            slug: 'demo-internal-operator',
            manager: false,
            roles: ['NASJ_OPERATOR'],
          },
        ];
        for (const item of memberships) {
          const membership = await tx.organizationMember.upsert({
            where: {
              organizationId_userId: { organizationId: orgId(item.slug), userId: id(item.persona) },
            },
            update: {},
            create: {
              organizationId: orgId(item.slug),
              userId: id(item.persona),
              isManager: item.manager,
            },
          });
          for (const role of item.roles)
            await tx.membershipRole.upsert({
              where: { membershipId_role: { membershipId: membership.id, role } },
              update: {},
              create: { membershipId: membership.id, role, assignedByUserId: admin },
            });
          if (item.persona === 'buyer') {
            // Approval authority is an explicit grant, never inferred from the buyer role.
            await tx.membershipPermission.upsert({
              where: {
                membershipId_permission: {
                  membershipId: membership.id,
                  permission: 'buyer.quotation.approve',
                },
              },
              update: {},
              create: {
                membershipId: membership.id,
                permission: 'buyer.quotation.approve',
                grantedById: admin,
                reason: 'Synthetic buyer signatory for local E02 demonstrations.',
              },
            });
          }
        }
        for (const slug of ['demo-buyer-business', 'demo-artisan-association'])
          await tx.operatorAssignment.upsert({
            where: {
              operatorId_organizationId: {
                operatorId: id('operator'),
                organizationId: orgId(slug),
              },
            },
            update: {},
            create: {
              operatorId: id('operator'),
              organizationId: orgId(slug),
              assignedById: admin,
            },
          });
        // Participants are managed records, not login personas. Keep any existing linked record intact.
        const historicalProfile = await tx.artisanProfile.findFirst({
          where: {
            displayName: 'DEMO — Amel Artisan',
            OR: [
              { userId: null, createdById: id('coordinator') },
              {
                user: {
                  email: { in: ['artisan@nasj-demo.invalid', 'artisan@hirfacare-demo.invalid'] },
                },
              },
            ],
          },
        });
        const profile =
          historicalProfile ??
          (await tx.artisanProfile.create({
            data: {
              createdById: id('coordinator'),
              displayName: 'DEMO — Amel Artisan',
              region: 'Nabeul',
              preferredLanguage: 'fr',
              experienceDescription:
                'Fictional participant managed by the demo association; no login required.',
              equipment: ['Hand loom', 'Embroidery tools'],
            },
          }));
        const associationId = orgId('demo-artisan-association');
        if (
          !(await tx.artisanManagement.findFirst({
            where: { artisanProfileId: profile.id, endedAt: null },
          }))
        )
          await tx.artisanManagement.create({
            data: {
              artisanProfileId: profile.id,
              organizationId: associationId,
              recordedById: id('coordinator'),
              reason: 'Synthetic local-demo association management.',
            },
          });
        if (
          !(await tx.artisanAssignment.findFirst({
            where: { artisanProfileId: profile.id, organizationId: associationId, endedAt: null },
          }))
        )
          await tx.artisanAssignment.create({
            data: {
              artisanProfileId: profile.id,
              organizationId: associationId,
              coordinatorId: id('coordinator'),
              assignedById: admin,
              reason: 'Synthetic local-demo coordinator assignment.',
            },
          });
        const skill = await tx.craftSkill.upsert({
          where: { name: 'DEMO — Traditional embroidery' },
          update: {},
          create: {
            name: 'DEMO — Traditional embroidery',
            category: 'Textile',
            description: 'Synthetic craft for the isolated demonstration.',
          },
        });
        await tx.artisanSkill.upsert({
          where: {
            artisanProfileId_craftSkillId: { artisanProfileId: profile.id, craftSkillId: skill.id },
          },
          update: {},
          create: {
            artisanProfileId: profile.id,
            craftSkillId: skill.id,
            proficiency: 'ADVANCED',
          },
        });
        if (!(await tx.capacityDeclaration.findFirst({ where: { artisanProfileId: profile.id } })))
          await tx.capacityDeclaration.create({
            data: {
              artisanProfileId: profile.id,
              craftSkillId: skill.id,
              unitType: 'PIECES',
              quantity: '12.00',
              effectiveFrom: capacityStart,
              effectiveTo: capacityEnd,
              declaredByUserId: id('coordinator'),
            },
          });
        if (
          !(await tx.auditEvent.findFirst({
            where: {
              action: demo ? 'demo.fixtures.created' : 'development.fixtures.created',
              actorId: admin,
            },
          }))
        )
          await tx.auditEvent.create({
            data: {
              actorId: admin,
              targetType: demo ? 'DemoEnvironment' : 'DevelopmentEnvironment',
              targetId: demo ? 'nasj_demo' : 'nasj',
              action: demo ? 'demo.fixtures.created' : 'development.fixtures.created',
              correlationId: demo ? 'isolated-demo-seed-v1' : 'local-development-seed-v1',
              reason: demo
                ? 'Synthetic fixtures in a dedicated database; no live data imported.'
                : 'Synthetic fixtures in the local development database; no real data imported.',
            },
          });
      },
      { maxWait: 15000, timeout: 30000 },
    );
    console.log(
      `${personas.length} role-based local fixture accounts are ready at ${config.PUBLIC_APP_URL}. Credentials: .local/${demo ? 'demo' : 'dev'}-credentials.json. Existing passwords and records were preserved.`,
    );
  } catch (error) {
    console.error(
      `Local fixture seed refused or failed (${error instanceof Error ? error.name : 'UnknownError'}). Check the intended local environment and preserved credential manifest. No passwords were reset.`,
    );
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}
