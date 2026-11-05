-- Additive pickup cancellation and explicit damaged receipt quantities.
-- Cancelled shipments release their prepared pieces. Existing confirmations keep damaged at 0.
BEGIN;
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_status_check";
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_status_check" CHECK ("status" IN ('PICKUP_SCHEDULED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERY_REPORTED', 'BUYER_CONFIRMED', 'DISCREPANCY', 'CANCELLED'));
ALTER TABLE "BuyerDeliveryConfirmation" ADD COLUMN "damaged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BuyerDeliveryConfirmation" DROP CONSTRAINT "BuyerDeliveryConfirmation_quantity_check";
ALTER TABLE "BuyerDeliveryConfirmation" ADD CONSTRAINT "BuyerDeliveryConfirmation_quantity_check" CHECK (
  "received" >= 0 AND "accepted" >= 0 AND "missing" >= 0 AND "damaged" >= 0
  AND "accepted" + "damaged" <= "received"
);
COMMIT;
