-- Product renamed to NASJ. The append-only audit triggers reference the function by OID,
-- so renaming it keeps them attached without recreating them.
ALTER FUNCTION hirfacare_audit_append_only() RENAME TO nasj_audit_append_only;
