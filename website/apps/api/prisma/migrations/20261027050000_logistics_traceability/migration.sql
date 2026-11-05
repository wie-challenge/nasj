-- Additive logistics, traceability and simulated settlement.
-- ShipmentPreparation stays a preparation record. Existing orders are not moved.
BEGIN;
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PICKUP_SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "hub" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Shipment_status_check" CHECK ("status" IN ('PICKUP_SCHEDULED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERY_REPORTED', 'BUYER_CONFIRMED', 'DISCREPANCY')),
    CONSTRAINT "Shipment_provenance_check" CHECK ("provenance" = 'SYNTHETIC')
);
CREATE TABLE "ShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "preparationItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShipmentItem_quantity_check" CHECK ("quantity" > 0)
);
CREATE TABLE "PickupSchedule" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "associationOrganizationId" TEXT NOT NULL,
    "hub" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PIECES',
    "note" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickupSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PickupSchedule_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "PickupSchedule_unit_check" CHECK ("unit" = 'PIECES'),
    CONSTRAINT "PickupSchedule_window_check" CHECK ("windowEnd" > "windowStart")
);
CREATE TABLE "CustodyHandover" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceHolder" TEXT NOT NULL,
    "destinationHolder" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PIECES',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "confirmationStatus" TEXT NOT NULL,
    "priorHandoverId" TEXT,
    "correlationId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CustodyHandover_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustodyHandover_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "CustodyHandover_type_check" CHECK ("eventType" IN ('COLLECTED_FROM_ASSOCIATION', 'RECEIVED_AT_HUB', 'HANDED_TO_TRANSPORT')),
    CONSTRAINT "CustodyHandover_status_check" CHECK ("confirmationStatus" IN ('PENDING', 'CONFIRMED')),
    CONSTRAINT "CustodyHandover_provenance_check" CHECK ("provenance" = 'SYNTHETIC')
);
CREATE TABLE "DeliveryReport" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryReport_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "DeliveryReport_provenance_check" CHECK ("provenance" = 'SYNTHETIC')
);
CREATE TABLE "BuyerDeliveryConfirmation" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "received" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "missing" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuyerDeliveryConfirmation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuyerDeliveryConfirmation_quantity_check" CHECK ("received" >= 0 AND "accepted" >= 0 AND "missing" >= 0 AND "accepted" <= "received")
);
CREATE TABLE "DeliveryDiscrepancy" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryDiscrepancy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryDiscrepancy_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "DeliveryDiscrepancy_status_check" CHECK ("status" = 'OPEN')
);
CREATE TABLE "TraceabilityPublication" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "productTitle" TEXT NOT NULL,
    "craftName" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "coarseRegion" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TraceabilityPublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TraceabilityPublication_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REVOKED'))
);
CREATE TABLE "TraceabilityRevision" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TraceabilityRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProducerSharePolicy" (
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "numeratorDefinition" TEXT NOT NULL,
    "denominatorDefinition" TEXT NOT NULL,
    "taxTreatment" TEXT NOT NULL,
    "refundTreatment" TEXT NOT NULL,
    "partialTreatment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProducerSharePolicy_pkey" PRIMARY KEY ("version")
);
CREATE TABLE "ProducerShareSnapshot" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "basis" TEXT NOT NULL,
    "numeratorMillimes" BIGINT NOT NULL,
    "denominatorMillimes" BIGINT NOT NULL,
    "basisPoints" INTEGER,
    "availability" TEXT NOT NULL,
    "artisanCount" INTEGER NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    CONSTRAINT "ProducerShareSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProducerShareSnapshot_basis_check" CHECK ("basis" = 'AGREED_NOT_PAID'),
    CONSTRAINT "ProducerShareSnapshot_availability_check" CHECK ("availability" IN ('AVAILABLE', 'UNAVAILABLE_SMALL_GROUP', 'UNAVAILABLE_DENOMINATOR')),
    CONSTRAINT "ProducerShareSnapshot_provenance_check" CHECK ("provenance" = 'SYNTHETIC')
);
CREATE TABLE "ArtisanPayable" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "artisanProfileId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPayMillimes" BIGINT NOT NULL,
    "amountMillimes" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TND',
    "status" TEXT NOT NULL DEFAULT 'RECOGNIZED',
    "sourceEventId" TEXT NOT NULL,
    "termsSnapshot" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtisanPayable_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArtisanPayable_quantity_check" CHECK ("quantity" > 0 AND "amountMillimes" > 0 AND "unitPayMillimes" > 0),
    CONSTRAINT "ArtisanPayable_milestone_check" CHECK ("milestone" = 'BUYER_ACCEPTED_PIECE'),
    CONSTRAINT "ArtisanPayable_status_check" CHECK ("status" = 'RECOGNIZED'),
    CONSTRAINT "ArtisanPayable_currency_check" CHECK ("currency" = 'TND'),
    CONSTRAINT "ArtisanPayable_provenance_check" CHECK ("provenance" = 'SYNTHETIC')
);
CREATE TABLE "SimulatedSettlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "payableId" TEXT,
    "subjectKey" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "amountMillimes" BIGINT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulatedSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SimulatedSettlement_side_check" CHECK ("side" IN ('BUYER', 'ARTISAN')),
    CONSTRAINT "SimulatedSettlement_status_check" CHECK ("status" IN ('SCHEDULED', 'SIMULATED_INITIATED', 'SIMULATED_SETTLED', 'SIMULATED_FAILED')),
    CONSTRAINT "SimulatedSettlement_amount_check" CHECK ("amountMillimes" > 0),
    CONSTRAINT "SimulatedSettlement_provenance_check" CHECK ("provenance" = 'SYNTHETIC' AND "bankVerified" = false)
);
CREATE TABLE "SimulatedSettlementEvent" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulatedSettlementEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SimulatedSettlementEvent_status_check" CHECK ("status" IN ('SCHEDULED', 'SIMULATED_INITIATED', 'SIMULATED_SETTLED', 'SIMULATED_FAILED'))
);
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_preparationItemId_key" ON "ShipmentItem"("shipmentId", "preparationItemId");
CREATE INDEX "ShipmentItem_preparationItemId_idx" ON "ShipmentItem"("preparationItemId");
CREATE INDEX "Shipment_orderId_createdAt_idx" ON "Shipment"("orderId", "createdAt");
CREATE INDEX "PickupSchedule_shipmentId_createdAt_idx" ON "PickupSchedule"("shipmentId", "createdAt");
CREATE INDEX "PickupSchedule_associationOrganizationId_createdAt_idx" ON "PickupSchedule"("associationOrganizationId", "createdAt");
CREATE UNIQUE INDEX "CustodyHandover_priorHandoverId_key" ON "CustodyHandover"("priorHandoverId");
CREATE INDEX "CustodyHandover_shipmentId_recordedAt_idx" ON "CustodyHandover"("shipmentId", "recordedAt");
CREATE UNIQUE INDEX "DeliveryReport_shipmentId_key" ON "DeliveryReport"("shipmentId");
CREATE UNIQUE INDEX "BuyerDeliveryConfirmation_shipmentId_key" ON "BuyerDeliveryConfirmation"("shipmentId");
CREATE UNIQUE INDEX "DeliveryDiscrepancy_confirmationId_key" ON "DeliveryDiscrepancy"("confirmationId");
CREATE UNIQUE INDEX "TraceabilityPublication_publicToken_key" ON "TraceabilityPublication"("publicToken");
CREATE INDEX "TraceabilityPublication_orderId_idx" ON "TraceabilityPublication"("orderId");
CREATE UNIQUE INDEX "TraceabilityRevision_publicationId_version_key" ON "TraceabilityRevision"("publicationId", "version");
CREATE UNIQUE INDEX "ProducerShareSnapshot_revisionId_key" ON "ProducerShareSnapshot"("revisionId");
CREATE UNIQUE INDEX "ArtisanPayable_batchId_milestone_sourceEventId_key" ON "ArtisanPayable"("batchId", "milestone", "sourceEventId");
CREATE INDEX "ArtisanPayable_orderId_idx" ON "ArtisanPayable"("orderId");
CREATE INDEX "ArtisanPayable_artisanProfileId_idx" ON "ArtisanPayable"("artisanProfileId");
CREATE UNIQUE INDEX "SimulatedSettlement_subjectKey_side_attempt_key" ON "SimulatedSettlement"("subjectKey", "side", "attempt");
CREATE INDEX "SimulatedSettlement_orderId_createdAt_idx" ON "SimulatedSettlement"("orderId", "createdAt");
CREATE INDEX "SimulatedSettlementEvent_settlementId_createdAt_idx" ON "SimulatedSettlementEvent"("settlementId", "createdAt");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_preparationItemId_fkey" FOREIGN KEY ("preparationItemId") REFERENCES "ShipmentPreparationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupSchedule" ADD CONSTRAINT "PickupSchedule_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupSchedule" ADD CONSTRAINT "PickupSchedule_associationOrganizationId_fkey" FOREIGN KEY ("associationOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupSchedule" ADD CONSTRAINT "PickupSchedule_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupSchedule" ADD CONSTRAINT "PickupSchedule_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupSchedule" ADD CONSTRAINT "PickupSchedule_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_priorHandoverId_fkey" FOREIGN KEY ("priorHandoverId") REFERENCES "CustodyHandover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerDeliveryConfirmation" ADD CONSTRAINT "BuyerDeliveryConfirmation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuyerDeliveryConfirmation" ADD CONSTRAINT "BuyerDeliveryConfirmation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryDiscrepancy" ADD CONSTRAINT "DeliveryDiscrepancy_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "BuyerDeliveryConfirmation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceabilityPublication" ADD CONSTRAINT "TraceabilityPublication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceabilityPublication" ADD CONSTRAINT "TraceabilityPublication_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceabilityRevision" ADD CONSTRAINT "TraceabilityRevision_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "TraceabilityPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TraceabilityRevision" ADD CONSTRAINT "TraceabilityRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProducerShareSnapshot" ADD CONSTRAINT "ProducerShareSnapshot_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TraceabilityRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "ArtisanPayable_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "ArtisanPayable_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "ArtisanPayable_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CommercialBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "ArtisanPayable_artisanProfileId_fkey" FOREIGN KEY ("artisanProfileId") REFERENCES "ArtisanProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedSettlement" ADD CONSTRAINT "SimulatedSettlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedSettlement" ADD CONSTRAINT "SimulatedSettlement_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "ArtisanPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedSettlementEvent" ADD CONSTRAINT "SimulatedSettlementEvent_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SimulatedSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedSettlementEvent" ADD CONSTRAINT "SimulatedSettlementEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "ProducerSharePolicy" ("version", "name", "numeratorDefinition", "denominatorDefinition", "taxTreatment", "refundTreatment", "partialTreatment")
VALUES (
    1,
    'Agreed direct artisan compensation share',
    'Sum of accepted offer quantity times the agreed unit pay on those offers. This is agreed compensation. It is not earned compensation and it is not paid compensation.',
    'Accepted quotation total for the same order, minus recorded buyer refunds. This version has no refund ledger, so the denominator is the quotation total.',
    'Tax is excluded from both sides. Tax treatment remains pending legal review.',
    'A recorded refund reduces only the denominator. No refund is recorded by a simulated payment.',
    'Partial delivery does not change this agreed ratio. An earned ratio uses recognized payables and the quotation portion for buyer-accepted pieces, and it is not published as this metric.'
);
CREATE TRIGGER "PickupSchedule_immutable" BEFORE UPDATE OR DELETE ON "PickupSchedule" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "CustodyHandover_immutable" BEFORE UPDATE OR DELETE ON "CustodyHandover" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "DeliveryReport_immutable" BEFORE UPDATE OR DELETE ON "DeliveryReport" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "BuyerDeliveryConfirmation_immutable" BEFORE UPDATE OR DELETE ON "BuyerDeliveryConfirmation" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "DeliveryDiscrepancy_immutable" BEFORE UPDATE OR DELETE ON "DeliveryDiscrepancy" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "TraceabilityRevision_immutable" BEFORE UPDATE OR DELETE ON "TraceabilityRevision" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProducerSharePolicy_immutable" BEFORE UPDATE OR DELETE ON "ProducerSharePolicy" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ProducerShareSnapshot_immutable" BEFORE UPDATE OR DELETE ON "ProducerShareSnapshot" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "ArtisanPayable_immutable" BEFORE UPDATE OR DELETE ON "ArtisanPayable" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
CREATE TRIGGER "SimulatedSettlementEvent_immutable" BEFORE UPDATE OR DELETE ON "SimulatedSettlementEvent" FOR EACH ROW EXECUTE FUNCTION procurement_immutable_evidence();
COMMIT;
