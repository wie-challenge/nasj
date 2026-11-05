# Revised foundation delivery — 2026-10-21

Implementation branch: `foundation/revised-role-model` in the website and documentation repositories. The existing Better Auth application and the shadcn UI work are preserved. No new application, authentication provider or duplicate administrator system was created. The completed foundation and UI changes are being submitted for hosted verification and merge; local verification is recorded below.

## Architecture and authorization

Four operational personas are resolved from the existing account and scoped memberships: PLATFORM_ADMIN (existing ADMIN), NASJ_OPERATOR, BUYER_REPRESENTATIVE and ASSOCIATION_COORDINATOR. ARTISAN is a participant with an optional verified account link. USER remains an ordinary platform account. Existing business-role enum values remain historical compatibility values; new assignments use the revised personas.

The existing Organization names BUYER_BUSINESS, ASSOCIATION and INTERNAL remain, with PARTNER_COOPERATIVE added. ASSOCIATION and INTERNAL correspond to PARTNER_ASSOCIATION and NASJ_INTERNAL in the business terminology.

The action catalog and organization-specific permission mapping are in `packages/contracts/src/permissions.ts`. AccessService/PolicyService enforce current account, role, permission and organization scope. Registry operations additionally require a single approved active affiliation, explicit participant assignment and the appropriate current authorization evidence. Governance checks existing ADMIN status and privileged MFA. Ordinary non-manager buyer representatives retain the existing non-privileged MFA treatment. Grants cannot turn buyer permissions into internal financial authority.

| Persona | Working foundation functions | Boundary |
| --- | --- | --- |
| Administrator | Existing accounts/approval/audit/privacy controls; personnel invitation; coordinator status/transfer; participant reassignment, transfer and reviewed account link; authorization policies; independent concerns; permission diagnostics and explicit grants | No implicit private artisan registry or operational/financial membership |
| Internal operator | Assigned buyer and partner overview, real participant counts, scoped audit activity, minimal participant-reference duplicate investigation and reviewed duplicate tickets | Approved INTERNAL membership and explicit assigned-account scope; no unrelated contacts or individual payout information |
| Buyer representative | Own company/representative settings and invitations, approval status, existing synthetic RFQ interface | Purchasing can be independently removed/restored; exact quotation approval requires a separately audited grant; company ownership and active approval remain mandatory |
| Association coordinator | Assigned registry, no-account onboarding, profile/skills/availability, reviewed authorization history, worker-declared capacity and paginated histories | One approved active partner affiliation; no automatic access to other coordinators' private participant records |

Permissions for future pricing, assisted offers, production, logistics and finance are defined. Those commercial modules are not presented as functional new operator screens. Existing labelled synthetic commerce remains available to its authorized legacy actors, with new representative purchasing/approval restrictions enforced on the backend. Real payouts are disabled; initiation and approval grants cannot coexist for the same person. A future real-payout service must also enforce independent initiating/approving actors per immutable transaction, even after role changes.

## Database and preservation

Modified existing models: OrganizationType and BusinessRole enums, OrganizationMember (database-maintained coordinator marker and grant relationship), ArtisanProfile (nullable unique user, creator, participant status and registry history), CapacityDeclaration (assisted evidence reference), and explicit relation mappings on User/Organization. Two existing commerce projection relations now explicitly describe their existing PostgreSQL NO ACTION update behavior, eliminating schema drift without changing their database constraints.

Seven tables were added: MembershipPermission, ArtisanManagement, ArtisanAssignment, AuthorizationPolicy, OnboardingAuthorization, OperatorAssignment and ParticipantConcern. Existing organization/member/invitation, skills, capacity, consent, audit/outbox, Better Auth and commercial tables were reused.

Migrations:

- `20261021010000_revised_foundation`: transactional additive schema changes, foreign keys, history, account-optional profiles, conflict checks and data backfill. It stops with reference IDs if existing coordinators or artisans have conflicting active affiliations. It retains existing buyer approval as explicit authority and does not fabricate authorization evidence or coordinator assignments.
- `20261021020000_buyer_purchasing_authority`: additive enabled/disabled overrides for scoped purchasing/negotiation and explicit approval authority, retaining existing grants as enabled.

PostgreSQL partial unique indexes enforce one active coordinator affiliation, one active artisan managing relationship, one active responsible assignment and one active legacy artisan association. A trigger derives the coordinator marker from MembershipRole, so a client-supplied marker cannot bypass uniqueness. IAM transactions serialize validation and mutation; database constraints also reject concurrent direct writes. Actor/organization/participant foreign keys use retained identities with restricted deletion.

Local preflight found no conflicting affiliations. Encrypted backups were created before the local changes. Hash comparisons of every User, Account and Session row were identical before and after both migrations: **6 users, 6 credential records and 2 sessions preserved**. No real credentials are included in this report. A read-only Prisma database-to-schema diff is empty.

The conflict/upgrade test verifies migration rollback on duplicate coordinator and artisan affiliations, explicit conflict resolution in the disposable fixture, retained identity/history rows and preserved legacy approval grants. The existing full encrypted backup/restore drill now covers all 40 application tables.

## Backend interfaces

All authenticated mutations retain session-bound CSRF, strict input validation, transactional audit/outbox and current account checks. Collections use pagination; registry detail includes bounded recent history and separate paginated history endpoints. Safe projections omit unrelated personal/financial information.

| Interface | Purpose |
| --- | --- |
| `GET /api/v1/me/context` | Own personas, scoped permissions and landing path |
| Existing `/api/v1/organizations`, organization settings/member/invitation and admin approval routes | Reused onboarding, company representatives and governance; admin organization listing adds a type filter |
| `PUT /api/v1/organizations/:id/members/:memberId/permissions` | Scoped purchasing/negotiation, buyer approval or explicit internal payout authority; reasons audited |
| `GET /api/v1/associations/me` and `/coordinators` | Resolve approved active association and its coordinator directory |
| `GET/POST /api/v1/associations/me/artisans` | Assigned list and authorized no-account onboarding |
| `GET/PATCH /api/v1/associations/me/artisans/:id` | Assigned participant detail/profile changes |
| `PUT .../:id/skills`, `POST .../:id/capacity` | Validated skills and separately authorized worker capacity declarations |
| `POST .../:id/authorization`, `POST .../:id/authorization/:evidenceId/withdraw` | Reviewed evidence and withdrawal, preserving history |
| `GET .../:id/capacity`, `/authorization`, `/assignments` | Paginated authorized histories |
| `GET /api/v1/admin/coordinators`, `/operators`, `/access-report` | Affiliation/personnel listings and effective permission diagnostics |
| `POST /api/v1/admin/personnel/invite` | Administrator-only coordinator/operator invitations through the existing hashed-token invitation service |
| `PATCH /api/v1/admin/coordinators/:userId/status`, `POST .../:userId/transfer` | Scoped activation/suspension/revocation and audited transfer; ambiguous historical affiliation requests require an exact organization |
| `POST /api/v1/admin/artisans/:id/assignment`, `/transfer`, `/link-account` | Reviewed coordinator reassignment, association transfer and verified identity conversion |
| `POST /api/v1/admin/operator-assignments` | Grant/revoke assigned buyer or partner accounts |
| `GET /api/v1/operator/dashboard`, `GET /api/v1/operator/activity`, `GET /operator/organizations/:id/participants`, `POST .../:id/duplicate-reviews` | Actual assigned network overview and minimal duplicate support |
| `GET /api/v1/authorization-policies`, `POST /admin/authorization-policies`, `PATCH /admin/authorization-policies/:id` | Reviewed methods/version references and withdrawal |
| `POST /api/v1/participant-concerns` | Rate-limited no-login independent intake; generic response does not reveal participant existence |
| `GET /api/v1/admin/participant-concerns`, `PATCH /api/v1/admin/participant-concerns/:id` | Private administrator concern review; a participant's creator/assigned coordinator cannot independently review that participant's concern |

Worker authorization is policy/version/purpose/method/time/language/evidence based. Witnessed verbal records require a separate witness. Capacity needs a separate CAPACITY record plus current PARTICIPATION evidence. Historical accepted offers/batches are not removed by new declarations, pause, withdrawal or transfer. Private phone information is redacted when participation authorization is inactive. Account conversion uses a reviewed reference and a verified account ID, never name matching.

The ArtisanDecisionEvidence contract prepares voluntary accepted/declined offer decisions with exact terms version, recorder, confirmation evidence, authorization context and review/dispute status. It is not an implemented assisted production service.

## Frontend journeys

The preserved shadcn shell now follows the identity context, with role-specific work links and explicit denied states for unauthorized administration and commerce routes. Hidden navigation is supplemented by API authorization.

- `/dashboard`: onboarding/pending access; existing organization creation and verification journey.
- `/admin`, `/admin/users`, `/admin/organizations`, `/admin/coordinators`, `/admin/operators`, `/admin/authorizations`, `/admin/access`, `/admin/audit`, `/admin/privacy-requests`, `/admin/participant-concerns`: working governance and access management.
- `/buyer`, `/buyer/company`, `/buyer/representatives`: own-company links to profile, approval, membership, invitations and independent purchasing/approval controls.
- `/association`, `/association/coordinators`, `/association/artisans`, `/association/artisans/new`, `/association/artisans/:id`, `/association/artisans/:id/history`: assisted registry, editing, skills, declared capacity, evidence, withdrawal and paginated history.
- `/operator` and `/operator/partners/:id`: assigned account/network overview, safe scoped activity and limited duplicate review.
- `/participant-support`: an artisan or trusted helper can report a concern without authentication or a fabricated account.

Default sign-in (including MFA completion) resolves to the appropriate authorized workspace. Explicit safe profile/settings destinations still work. An unauthorized route displays Access denied instead of redirecting into another role's dashboard.

## Verification

Final local verification results follow. Raw local evidence is ignored under `.local/roles-*` and `.local/e2e-report.json`. Encrypted backups and identity preservation metadata are private under `.local/role-migration/`.

| Command / verification | Result |
| --- | --- |
| Prisma schema validation | Passed |
| `pnpm lint` | Passed; 227 files, no diagnostics |
| `pnpm typecheck` | Passed for contracts, API, API tests/scripts and web |
| `pnpm test` | 49 passed (44 API/domain/operations, 5 web) |
| `pnpm test:integration` | 79 scenarios passed against disposable PostgreSQL/SMTP; encrypted restore verified all 40 tables |
| `pnpm test:e2e` | 22 passed; zero skipped, unexpected or flaky results |
| Browser axe checkpoints | 30 checkpoints; zero reported violations |
| `pnpm audit --audit-level=high` | No known vulnerabilities reported |
| `pnpm build` | Passed for contracts, API and Next.js web |
| Local migrations and account preservation | Both applied; identical User/Account/Session row hashes and counts |
| Prisma database/schema comparison | Empty diff |

Coverage includes same-association unassigned denial, cross-organization denial, accountless creation, current authorization/capacity evidence, forged scopes, duplicate review, independent concern review, suspended/revoked access, reviewed account linking, buyer-only visibility and permissions, separate financial grant holders, transaction rollback, and concurrent affiliation/role/invitation/create/reassignment/transfer operations. Existing authentication, last-admin, MFA, tenant, synthetic commerce and restore regressions are retained.

## Hosted review follow-up

The first hosted run exposed a transient contrast failure when a hydrated form enabled its submit button. The shared shadcn button now transitions colors only, so disabled opacity ends immediately when the button becomes actionable. The existing catalog axe checks exercise the affected reload path; no accessibility rule is disabled and no scan delay is added. Final hosted status is recorded by [PR #216](https://github.com/wie-challenge/website/pull/216).

## Operational limits and backlog

This is a local foundation, not a real commercial pilot approval. Actual legal review of policy/methods and witness/evidence verification remains an operational requirement; this software records review references rather than claiming their truth or providing an SMS verification service. Independent concerns need staffed review and an accessible offline contact channel. Duplicate review uses scoped name/region/reference matching, not universal identity deduplication. Retention and hosting/backup/security operations require a real deployment review. Automated axe checks do not establish full accessibility conformance.

Real payouts remain disabled. Provider integration, verified funds/settlement evidence, independent approval thresholds and transaction-level maker/checker controls remain future E10 work. Assisted offer/production execution is a future module, with the evidence and access contract prepared here. Physical wearable verification (#197) remains pending device availability; no wearable data grants production authority.

No canonical story or issue is automatically closed. The foundation slices of E01 identity/assistance, E04 participant registry/capacity, E14 governance and E16 boundaries/migration/regression work are implemented. Entire E04/E05/E06/E10 epics are not claimed complete. Hosted CI is a required merge check for this delivery; production deployment has not been verified.

The documentation repository contains the requested `role-model-decision.md` and `backlog-role-reconciliation.md`, with explicit proposed acceptance-criteria changes and dependencies for E01/E04/E05/E06/E10/E14/E16. The 192-story canonical backlog is unchanged. Recommended next work: E02 procurement/RFQ and E03 exact quotation/approval, followed by assisted E04/E05 decisions before production execution.

See [the local walkthrough](try-the-foundation.md) for the role journeys.


Verified foundation acceptance criteria map to E01-02/03/04/05/06/10/11; E04-04/05/06/11; E14-01/02/05/07; and E16-02/03/05/07/08/09. This is criteria-level coverage, not an automatic whole-story closure: the proposed deltas identify where operational policy or future commercial functionality remains. No implemented foundation feature is marked complete based only on an unexecuted command. Hosted CI/deployment, actual policy/process review and physical-device checks remain unverified; full assisted offer execution and real finance are unimplemented future scope.
