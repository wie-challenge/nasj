// Minimal but constraint-complete fixture chain, inserted with raw SQL so every real database
// constraint (FKs, CHECKs, unique indexes) is enforced. No product source is involved.
let seq = 0;
export async function buildChain(client, label = 'g71') {
  const n = ++seq;
  const _now = '2026-10-31T00:00:00Z';
  const q = (sql, params) => client.query(sql, params);

  await q(
    `insert into "User"(id,email,"emailVerified",name,status,"createdAt","updatedAt","role","preferredLanguage")
     values ($1,$2,true,$3,'ACTIVE',now(),now(),'USER','en')`,
    [`u-${label}-${n}`, `${label}-${n}@example.test`, `Person ${n}`],
  );
  const userId = `u-${label}-${n}`;
  for (const [orgId, type, slug] of [
    [`op-${label}-${n}`, 'INTERNAL', `op-${label}-${n}`],
    [`buy-${label}-${n}`, 'BUYER_BUSINESS', `buy-${label}-${n}`],
  ]) {
    await q(
      `insert into "Organization"(id,name,slug,type,"approvalStatus","createdAt","updatedAt","region",description,"contactEmail","representativeName","createdByUserId")
       values ($1,$2,$3,$4::"OrganizationType",'APPROVED',now(),now(),'TN','synthetic',$5,'Rep',$6)`,
      [orgId, orgId, slug, type, `${orgId}@example.test`, userId],
    );
  }
  await q(
    `insert into "ArtisanProfile"(id,"userId","displayName","region","preferredLanguage","contactVisibility","participantStatus","availabilityStatus","experienceDescription","createdAt","updatedAt")
     values ($1,$2,$3,'TN','en','PRIVATE','ACTIVE','AVAILABLE','synthetic',now(),now())`,
    [`ap-${label}-${n}`, userId, `Artisan ${n}`],
  );
  const craft = await q(`select id from "CraftSkill" where "isActive"=true limit 1`);
  let craftId = craft.rows[0]?.id;
  if (!craftId) {
    craftId = `craft-${n}`;
    await q(`insert into "CraftSkill"(id,name,category,"isActive") values ($1,$2,'TEXTILE',true)`, [
      craftId,
      `Craft ${n}`,
    ]);
  }
  await q(
    `insert into "CommercialRfq"(id,"buyerOrganizationId","operatorOrganizationId","craftSkillId",title,specification,"designRequirements",quantity,"deliveryAt","deliveryLocation",status,version,"createdAt","updatedAt"${''})
     values ($1,$2,$3,$4,'Synthetic','spec','none',100,'2027-01-01T00:00:00Z','Tunis','ACCEPTED',1,now(),now())`,
    [`rfq-${label}-${n}`, `buy-${label}-${n}`, `op-${label}-${n}`, craftId],
  );
  await q(
    `insert into "CommercialOrder"(id,"rfqId",status,version,delivered,"createdAt")
     values ($1,$2,'IN_PRODUCTION',1,0,now())`,
    [`ord-${label}-${n}`, `rfq-${label}-${n}`],
  );
  // capacityDeclarationId is NOT NULL on the offer; a synthetic declaration satisfies it.
  await q(
    `insert into "CapacityDeclaration"(id,"artisanProfileId","craftSkillId","unitType",quantity,"effectiveFrom","effectiveTo","declaredByUserId","createdAt")
     values ($1,$2,$3,'PIECES',1000,'2026-10-01T00:00:00Z','2027-01-01T00:00:00Z',$4,now())`,
    [`cap-${label}-${n}`, `ap-${label}-${n}`, craftId, userId],
  );
  await q(
    `insert into "CommercialOffer"(id,"orderId","capacityDeclarationId","artisanProfileId",quantity,"unitPayMillimes","estimatedHours","expiresAt",materials,"reworkTerms","paymentConditions",status,"createdAt")
     values ($1,$2,$3,$4,100,1000,'1.0','2027-01-01T00:00:00Z','cotton','none','net30','ACCEPTED',now())`,
    [`off-${label}-${n}`, `ord-${label}-${n}`, `cap-${label}-${n}`, `ap-${label}-${n}`],
  );
  await q(
    `insert into "CommercialBatch"(id,"orderId","offerId","artisanProfileId",status)
     values ($1,$2,$3,$4,'ACCEPTED')`,
    [`bat-${label}-${n}`, `ord-${label}-${n}`, `off-${label}-${n}`, `ap-${label}-${n}`],
  );
  return {
    userId,
    artisanProfileId: `ap-${label}-${n}`,
    orderId: `ord-${label}-${n}`,
    offerId: `off-${label}-${n}`,
    batchId: `bat-${label}-${n}`,
    craftId,
  };
}

export async function addPayable(client, chain, label, amountMillimes = 100000n) {
  const id = `pay-${label}-${chain.offerId}`;
  await client.query(
    `insert into "ArtisanPayable"(id,"orderId","offerId","batchId","artisanProfileId",milestone,"policyVersion",quantity,"unitPayMillimes","amountMillimes",currency,status,"sourceEventId","termsSnapshot",provenance,"createdAt")
     values ($1,$2,$3,$4,$5,'BUYER_ACCEPTED_PIECE',1,100,$6,$7,'TND','RECOGNIZED',$8,'{}','SYNTHETIC',now())`,
    [
      id,
      chain.orderId,
      chain.offerId,
      chain.batchId,
      chain.artisanProfileId,
      amountMillimes / 100n,
      amountMillimes,
      `evt-${label}-${id}`,
    ],
  );
  return id;
}

export async function addSettlement(client, orderId, payableId, spec) {
  await client.query(
    `insert into "SimulatedSettlement"(id,"orderId","payableId","subjectKey",side,attempt,status,"amountMillimes","dueAt",provenance,"bankVerified","createdAt")
     values ($1,$2,$3,$4,'ARTISAN',1,$5,$6,'2026-12-01T00:00:00Z','SYNTHETIC',$7,now())`,
    [
      `set-${Math.random().toString(36).slice(2)}`,
      orderId,
      payableId,
      spec.subject,
      spec.status,
      spec.amountMillimes,
      spec.bankVerified,
    ],
  );
}
