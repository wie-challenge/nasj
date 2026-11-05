-- Product renamed to NASJ. Rename the operator role in place so existing memberships keep it;
-- the earlier migration that added 'HIRFACARE_OPERATOR' stays unchanged for databases that ran it.
ALTER TYPE "BusinessRole" RENAME VALUE 'HIRFACARE_OPERATOR' TO 'NASJ_OPERATOR';
