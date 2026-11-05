import { bootPostgres } from './wire-session.mjs';
const env = await bootPostgres();
const r = await env.client.query(
  `select m.id, m.status, m."organizationId", o.type, o."approvalStatus", mp.permission
   from "OrganizationMember" m
   join "Organization" o on o.id=m."organizationId"
   left join "MembershipPermission" mp on mp."membershipId"=m.id
   where m.status='ACTIVE' limit 5`,
);
console.log(JSON.stringify(r.rows, null, 1));
await env.close();
