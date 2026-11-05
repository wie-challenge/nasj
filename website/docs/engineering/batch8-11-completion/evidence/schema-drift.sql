Loaded Prisma config from prisma.config.ts.

-- DropForeignKey
ALTER TABLE "ArtisanPayable" DROP CONSTRAINT "ArtisanPayable_sampleRequestId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerDepositRecord" DROP CONSTRAINT "BuyerDepositRecord_actorId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerDepositRecord" DROP CONSTRAINT "BuyerDepositRecord_buyerOrganizationId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerDepositRecord" DROP CONSTRAINT "BuyerDepositRecord_orderId_fkey";

-- DropForeignKey
ALTER TABLE "BuyerDepositRecord" DROP CONSTRAINT "BuyerDepositRecord_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "CommercialOrder" DROP CONSTRAINT "CommercialOrder_catalogueProcurementRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "FinanceRecordEvent" DROP CONSTRAINT "FinanceRecordEvent_actorId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialAdjustment" DROP CONSTRAINT "FinancialAdjustment_checkerId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialAdjustment" DROP CONSTRAINT "FinancialAdjustment_makerId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialAdjustment" DROP CONSTRAINT "FinancialAdjustment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_actorId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_lotId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialHandover" DROP CONSTRAINT "MaterialHandover_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialHandover" DROP CONSTRAINT "MaterialHandover_artisanProfileId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialHandover" DROP CONSTRAINT "MaterialHandover_batchId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialHandover" DROP CONSTRAINT "MaterialHandover_lotId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialHandover" DROP CONSTRAINT "MaterialHandover_receiverOrganizationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialHandover" DROP CONSTRAINT "MaterialHandover_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialLot" DROP CONSTRAINT "MaterialLot_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialLot" DROP CONSTRAINT "MaterialLot_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReadiness" DROP CONSTRAINT "MaterialReadiness_batchId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReadiness" DROP CONSTRAINT "MaterialReadiness_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReceipt" DROP CONSTRAINT "MaterialReceipt_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReceipt" DROP CONSTRAINT "MaterialReceipt_artisanProfileId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReceipt" DROP CONSTRAINT "MaterialReceipt_handoverId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReconciliation" DROP CONSTRAINT "MaterialReconciliation_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReconciliation" DROP CONSTRAINT "MaterialReconciliation_handoverId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReservation" DROP CONSTRAINT "MaterialReservation_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReservation" DROP CONSTRAINT "MaterialReservation_batchId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReservation" DROP CONSTRAINT "MaterialReservation_lotId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReservation" DROP CONSTRAINT "MaterialReservation_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReturn" DROP CONSTRAINT "MaterialReturn_actorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReturn" DROP CONSTRAINT "MaterialReturn_dispositionActorId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReturn" DROP CONSTRAINT "MaterialReturn_handoverId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialReturn" DROP CONSTRAINT "MaterialReturn_lotId_fkey";

-- DropForeignKey
ALTER TABLE "OrderClosureAssessment" DROP CONSTRAINT "OrderClosureAssessment_actorId_fkey";

-- DropForeignKey
ALTER TABLE "OrderClosureAssessment" DROP CONSTRAINT "OrderClosureAssessment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentDispute" DROP CONSTRAINT "PaymentDispute_actorId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentDispute" DROP CONSTRAINT "PaymentDispute_artisanProfileId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentDispute" DROP CONSTRAINT "PaymentDispute_batchId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentDispute" DROP CONSTRAINT "PaymentDispute_handlerId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentDispute" DROP CONSTRAINT "PaymentDispute_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentDispute" DROP CONSTRAINT "PaymentDispute_payableId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutExecutionRecord" DROP CONSTRAINT "PayoutExecutionRecord_actorId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutExecutionRecord" DROP CONSTRAINT "PayoutExecutionRecord_payoutId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutRequest" DROP CONSTRAINT "PayoutRequest_approverId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutRequest" DROP CONSTRAINT "PayoutRequest_orderId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutRequest" DROP CONSTRAINT "PayoutRequest_payableId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutRequest" DROP CONSTRAINT "PayoutRequest_requesterId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementSample" DROP CONSTRAINT "ProcurementSample_catalogueApprovalId_fkey";

-- DropForeignKey
ALTER TABLE "ProductSampleRequest" DROP CONSTRAINT "sample_acceptor_user_fk";

-- DropForeignKey
ALTER TABLE "SupportTicketAttachment" DROP CONSTRAINT "SupportTicketAttachment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "SupportTicketAttachment" DROP CONSTRAINT "SupportTicketAttachment_ticketId_fkey";

-- DropIndex
DROP INDEX "CommercialOrder_productSpecificationRevisionId_idx";

-- DropIndex
DROP INDEX "ProcurementSample_catalogueApprovalId_idx";

-- AddForeignKey
ALTER TABLE "CommercialOrder" ADD CONSTRAINT "CommercialOrder_catalogueProcurementRevisionId_fkey" FOREIGN KEY ("catalogueProcurementRevisionId") REFERENCES "ProcurementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSample" ADD CONSTRAINT "ProcurementSample_catalogueApprovalId_fkey" FOREIGN KEY ("catalogueApprovalId") REFERENCES "BuyerSampleApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtisanPayable" ADD CONSTRAINT "ArtisanPayable_sampleRequestId_fkey" FOREIGN KEY ("sampleRequestId") REFERENCES "ProductSampleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


