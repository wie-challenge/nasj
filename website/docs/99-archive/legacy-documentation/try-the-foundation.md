# Try the revised foundation locally

Open `http://localhost:3000`. Run `pnpm db:seed` from `website/` for the four current role accounts: admin, operator, buyer and coordinator at `@nasj-demo.invalid`. Keep their generated passwords in `.local/dev-credentials.json` private. Existing historical users and records are preserved. See [role and story access](role-story-access-matrix.md) for the complete responsibility inventory.

## Administrator

Sign in to `/admin`. Review/approve partner and buyer organizations in `/admin/organizations`; filter by organization type and record a decision reason. An organization can be created/submitted through the existing organization settings. INTERNAL organizations require administrator creation.

Use `/admin/coordinators` to invite verified personnel to approved associations/cooperatives, suspend or transfer affiliations, reassign participants, transfer managing associations with new evidence, or link a reviewed verified account to an existing participant. Invitations are emailed as single-use links, accepted with the exact invited email. A second active coordinator affiliation is rejected. Status changes identify the exact affiliation; ambiguous historical affiliation changes are rejected.

Use `/admin/operators` to invite internal personnel, manage their membership status and grant/revoke assigned buyer/partner accounts. Use the reference identifiers in account/access administration for these reviewed operations. The inviter's current authority is checked again when an invitation is accepted, including when a former administrator still has an organization-manager membership.

In `/admin/authorizations`, record a reviewed policy version, approved evidence methods and legal-review reference before real participant onboarding. For disposable demonstrations use only fictional participants and clearly synthetic references. Such references do not constitute legal approval for real participation. `/admin/access` shows effective permissions and membership references; `/admin/audit` and existing privacy controls remain available.

Review `/admin/participant-concerns` separately from the person responsible for the participant's disputed record. Self-review is rejected. Administrator status alone does not grant access to private participant operations or individual finances.

## Association coordinator

After approval and active affiliation, sign-in opens `/association`. Open Artisan registry → Add artisan. Enter the necessary name/region/language, skills, equipment/capabilities and availability, then record participation authorization. No participant email, password or smartphone is required. The association and responsible coordinator come from the authenticated context.

Evidence needs an active reviewed policy, an allowed method, date/time, language and external evidence reference. Documented verbal authorization also needs a separate witness reference. A checkbox alone is insufficient; the software records human evidence references rather than implementing SMS/document verification.

Open the participant record and record a separate CAPACITY authorization under “Record new worker authorization.” Then record the artisan's stated weekly quantity/unit and effective period using that declaration evidence. New capacity does not delete accepted work or history, and wearable fields are rejected. Use the history link to page through authorization, capacity and assignment records.

Other coordinators cannot view private fields without an explicit assignment. Affiliation suspension/revocation blocks access immediately. Withdrawing participation pauses assisted activity and redacts private phone information. Managing transfers retain history and end old assignments. Similar records require an assigned operator's independent duplicate-review reference.

## Buyer representative

Register and verify email, create a BUYER_BUSINESS and request approval through `/settings/organizations`. Pending accounts land at onboarding; approved representatives land at `/buyer`. Company links open the existing profile, approval, representative and invitation settings.

A company manager can invite more representatives without shared credentials. Member settings independently authorize/remove purchasing or negotiation, and grant/revoke final quotation approval. An approval-only representative can read company records and approve an authorized quotation while lacking permission to prepare/submit RFQs. API checks enforce these distinctions.

The existing craft catalog and synthetic buyer request flow remain available within company scope. Buyers cannot access internal operator, association or administrator workspaces, individual artisan payouts or internal financial administration.

## NASJ operator

After an administrator invitation is accepted, sign-in opens `/operator`. Only assigned approved buyer/partner accounts appear. Assigned-account activity exposes safe audit metadata; private snapshots and user-entered reasons are excluded. Partner review exposes minimal participant references and independent duplicate review, without contact or financial records.

Assigned operators can use `/procurement` for E02 local-demo RFQ review, clarifications, sample references and quotations. Assisted offers, full production planning and actual payments retain their separate backlog prerequisites. Real payouts remain disabled.

## Participant without an account

Open `/participant-support`, or ask a trusted helper. Submit a participant/offer reference and a concern, with an optional safe contact method. The response does not reveal whether a reference exists and creates no fake User. NASJ administrators receive it independently of association operations. A real pilot must staff this review and supply accessible offline contact details during onboarding.

## Commands and migrations

From `website/`:

```bash
pnpm exec tsx --env-file=.env scripts/role-migration-preflight.ts
pnpm --filter @nasj/api exec prisma validate
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm audit --audit-level=high
pnpm build
```

Preflight writes a private `.local/role-migration-preflight.json`. Review conflicts and legacy assignments, verify the intended datasource and take an encrypted backup before the normal `pnpm db:migrate` procedure. Never delete/reassign conflicting real records merely to satisfy an index. The current local migrations were already applied with encrypted backups and identical User/Account/Session row hashes.

See [the delivery report](delivery-report.md) for verification and limits. The documentation repository contains the proposed role-model decision and backlog reconciliation. The canonical backlog is unchanged; real payouts and physical-device verification remain pending their separate prerequisites.
