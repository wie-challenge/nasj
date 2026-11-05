# Authorization model

**Last verified:** 1 November 2026 against `apps/api/src/modules/foundation/` and the shared
permission definitions.

Authorization is enforced in the API on every request. The frontend renders what a user *can* do; it
never decides what they *may* do.

## Layers

| Layer | Mechanism | Where |
|---|---|---|
| Authentication | Better Auth session, verified email, active account | `modules/auth/` |
| Privileged MFA | TOTP required for administrative roles | `modules/auth/` |
| Session revalidation | Reloaded inside every transaction | `foundation/transaction.ts` |
| Organization membership | Active membership in the owning organization | `modules/organizations/` |
| Role permission | Role grants a named permission | `packages/contracts/src/permissions.ts` |
| Object scope | The specific RFQ, order, batch or payable must be in scope | Each service |
| Tenant boundary | Cross-organization access returns 404, not 403 | Each service |

## Roles

Roles are assigned per membership, not globally. A user can hold different roles in different
organizations.

The role set was consolidated in the NASJ rename; the former `HIRFACARE_OPERATOR` value is now
`NASJ_OPERATOR` (migration `20261021040000_nasj_operator_role`).

## Rules that are easy to get wrong

- **Global ADMIN does not grant organization or artisan access.** Administrative rights are separate
  from business data rights.
- **Tenant isolation returns 404.** A caller outside the organization learns nothing about whether
  the object exists.
- **Client-supplied IDs are untrusted.** Substituting another tenant's, order's or batch's ID does not
  bypass the scope check.
- **Artisan assistance is consented and scoped.** A coordinator acting for an artisan holds delegated
  permission that the artisan can revoke, and the revocation applies immediately.

## Where to read the implementation

- Permission catalogue: `packages/contracts/src/permissions.ts`
- Session and MFA: `apps/api/src/modules/auth/`
- Membership and approval: `apps/api/src/modules/organizations/`
- Transaction revalidation: `apps/api/src/modules/foundation/transaction.ts`

## Related

- [Security overview](../06-security-and-governance/security-overview.md)
- [Transaction integrity](transaction-integrity.md)
