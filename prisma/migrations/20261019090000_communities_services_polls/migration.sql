-- Phase 4: communities, vendors, group-booked services, interest polls and notifications.
--
-- Renames keep existing data: Society→Community, Supplier→Vendor, RoundProduct→RoundOffering,
-- DeliveryIssue→OrderIssue, SupplierPurchaseOrder→VendorOrder, PurchaseOrderLine→VendorOrderLine,
-- the SUPPLIER role→VENDOR. Constraint, index and sequence names are renamed to what Prisma expects,
-- so `prisma migrate diff` against the schema is empty afterwards.

-- ---------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------
ALTER TYPE "Role" RENAME VALUE 'SUPPLIER' TO 'VENDOR';
ALTER TYPE "Category" RENAME TO "ProductCategory";
ALTER TYPE "RoundProductStatus" RENAME TO "OfferingStatus";
ALTER TYPE "DeliveryIssueReason" RENAME TO "OrderIssueReason";
ALTER TYPE "OrderIssueReason" ADD VALUE 'SERVICE_NOT_DONE';
ALTER TYPE "PurchaseOrderStatus" RENAME TO "VendorOrderStatus";
ALTER TYPE "WalletTxnType" ADD VALUE 'NO_ACCESS_REFUND' BEFORE 'ADJUSTMENT';
ALTER TYPE "WalletTxnType" ADD VALUE 'VISIT_CANCEL_REFUND' BEFORE 'ADJUSTMENT';
ALTER TYPE "WalletTxnType" ADD VALUE 'SERVICE_ISSUE_REFUND' BEFORE 'ADJUSTMENT';

CREATE TYPE "CommunityType" AS ENUM ('APARTMENT_SOCIETY', 'GATED_COMMUNITY', 'PG_COLIVING', 'HOSTEL', 'OFFICE_CAMPUS');
CREATE TYPE "VendorKind" AS ENUM ('GOODS', 'SERVICES');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "ServiceCategory" AS ENUM ('AC', 'RO', 'DEEP_CLEANING', 'PEST_CONTROL', 'WATER_TANK', 'CAR_WASH', 'SOFA_CARPET', 'APPLIANCE_REPAIR', 'CHIMNEY');
CREATE TYPE "RoundKind" AS ENUM ('GROCERY', 'SERVICE');
CREATE TYPE "OfferingKind" AS ENUM ('PRODUCT', 'SERVICE_OPTION');
CREATE TYPE "TierBasis" AS ENUM ('UNITS', 'FLATS');
CREATE TYPE "VendorAdjustmentType" AS ENUM ('NO_ACCESS_FEE', 'VISIT_CANCELLED', 'ISSUE_REFUND');
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'ACTIVE', 'CANCELLED');
CREATE TYPE "VisitKind" AS ENUM ('STANDARD', 'REVISIT');
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'NO_ACCESS', 'CANCELLED');
CREATE TYPE "ServiceIssueKind" AS ENUM ('NOT_DONE_PROPERLY', 'NO_ACCESS_DISPUTE');
CREATE TYPE "ServiceIssueStatus" AS ENUM ('OPEN', 'REVISIT_SCHEDULED', 'REFUNDED', 'REJECTED', 'RESOLVED');
CREATE TYPE "PollKind" AS ENUM ('PRODUCT', 'SERVICE');
CREATE TYPE "PollStatus" AS ENUM ('SUGGESTED', 'OPEN', 'CONVERTED', 'CLOSED');
CREATE TYPE "NotificationType" AS ENUM ('ROUND_OPENED', 'TIER_UNLOCKED', 'CUTOFF_REMINDER', 'ROUND_FINALIZED', 'REFUND_CREDITED', 'VISIT_SCHEDULED', 'TECHNICIAN_ON_THE_WAY', 'VISIT_COMPLETED', 'VISIT_NO_ACCESS', 'POLL_THRESHOLD', 'POLL_SUGGESTION', 'SLOT_HELD', 'ISSUE_UPDATE', 'VENDOR_ORDER');

-- ---------------------------------------------------------------------------------------------
-- Society → Community
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Society" RENAME TO "Community";
ALTER TABLE "Community" RENAME CONSTRAINT "Society_pkey" TO "Community_pkey";
ALTER INDEX "Society_code_key" RENAME TO "Community_code_key";
ALTER TABLE "Community"
  ADD COLUMN "type" "CommunityType" NOT NULL DEFAULT 'APARTMENT_SOCIETY',
  ADD COLUMN "blockLabel" TEXT NOT NULL DEFAULT 'Tower',
  ADD COLUMN "unitLabel" TEXT NOT NULL DEFAULT 'Flat';

ALTER TABLE "Flat" RENAME COLUMN "societyId" TO "communityId";
ALTER INDEX "Flat_societyId_tower_number_key" RENAME TO "Flat_communityId_tower_number_key";
ALTER TABLE "Flat" RENAME CONSTRAINT "Flat_societyId_fkey" TO "Flat_communityId_fkey";

-- ---------------------------------------------------------------------------------------------
-- Supplier → Vendor (existing suppliers are goods vendors, awaiting verification)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Supplier" RENAME TO "Vendor";
ALTER TABLE "Vendor" RENAME CONSTRAINT "Supplier_pkey" TO "Vendor_pkey";
ALTER TABLE "Vendor"
  ADD COLUMN "kind" "VendorKind" NOT NULL DEFAULT 'GOODS',
  ADD COLUMN "about" TEXT,
  ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "verifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "verificationNote" TEXT,
  ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ratingSum" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Vendor" ALTER COLUMN "kind" DROP DEFAULT;

ALTER TABLE "User" RENAME COLUMN "supplierId" TO "vendorId";
ALTER TABLE "User" RENAME CONSTRAINT "User_supplierId_fkey" TO "User_vendorId_fkey";

ALTER TABLE "Product" RENAME COLUMN "supplierId" TO "vendorId";
ALTER INDEX "Product_supplierId_idx" RENAME TO "Product_vendorId_idx";
ALTER TABLE "Product" RENAME CONSTRAINT "Product_supplierId_fkey" TO "Product_vendorId_fkey";

ALTER TABLE "PriceTier" RENAME COLUMN "supplierPricePaise" TO "vendorPricePaise";

-- ---------------------------------------------------------------------------------------------
-- New catalogue tables for services
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "minFlats" INTEGER NOT NULL,
    "noAccessFeePaise" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL,
    "weeklyByDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceOption" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "maxPerFlat" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceOptionTier" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "minFlats" INTEGER NOT NULL,
    "vendorPricePaise" INTEGER NOT NULL,

    CONSTRAINT "ServiceOptionTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorSlotTemplate" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "technicians" INTEGER NOT NULL,

    CONSTRAINT "VendorSlotTemplate_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------------
-- OrderRound: community, kind and Service Day fields
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "OrderRound" RENAME COLUMN "societyId" TO "communityId";
ALTER INDEX "OrderRound_societyId_status_idx" RENAME TO "OrderRound_communityId_status_idx";
ALTER TABLE "OrderRound" RENAME CONSTRAINT "OrderRound_societyId_fkey" TO "OrderRound_communityId_fkey";
ALTER TABLE "OrderRound"
  ADD COLUMN "kind" "RoundKind" NOT NULL DEFAULT 'GROCERY',
  ADD COLUMN "serviceId" TEXT,
  ADD COLUMN "vendorId" TEXT,
  ADD COLUMN "noAccessFeePaise" INTEGER,
  ADD COLUMN "repeatWeekly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repeatOfRoundId" TEXT;
ALTER TABLE "OrderRound" ALTER COLUMN "kind" DROP DEFAULT;
CREATE UNIQUE INDEX "OrderRound_repeatOfRoundId_key" ON "OrderRound"("repeatOfRoundId");

-- ---------------------------------------------------------------------------------------------
-- RoundProduct → RoundOffering. Existing rows are grocery products: their own tier group, basis UNITS.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "RoundProduct" RENAME TO "RoundOffering";
ALTER TABLE "RoundOffering" RENAME CONSTRAINT "RoundProduct_pkey" TO "RoundOffering_pkey";
ALTER INDEX "RoundProduct_roundId_productId_key" RENAME TO "RoundOffering_roundId_productId_key";
ALTER TABLE "RoundOffering" RENAME CONSTRAINT "RoundProduct_roundId_fkey" TO "RoundOffering_roundId_fkey";
ALTER TABLE "RoundOffering" RENAME CONSTRAINT "RoundProduct_productId_fkey" TO "RoundOffering_productId_fkey";
ALTER TABLE "RoundOffering" RENAME COLUMN "supplierId" TO "vendorId";
ALTER TABLE "RoundOffering" RENAME CONSTRAINT "RoundProduct_supplierId_fkey" TO "RoundOffering_vendorId_fkey";
ALTER TABLE "RoundOffering" RENAME COLUMN "finalSupplierPricePaise" TO "finalVendorPricePaise";
ALTER TABLE "RoundOffering" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "RoundOffering"
  ADD COLUMN "kind" "OfferingKind",
  ADD COLUMN "serviceOptionId" TEXT,
  ADD COLUMN "tierGroupKey" TEXT,
  ADD COLUMN "tierBasis" "TierBasis",
  ADD COLUMN "unitLabel" TEXT,
  ADD COLUMN "finalBasisCount" INTEGER;

UPDATE "RoundOffering"
SET "kind" = 'PRODUCT',
    "tierGroupKey" = 'product:' || "productId",
    "tierBasis" = 'UNITS',
    "finalBasisCount" = "finalQty",
    -- Tier snapshots: rename supplierPricePaise → vendorPricePaise inside the JSON.
    "tiers" = (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('minQty', t -> 'minQty', 'vendorPricePaise', t -> 'supplierPricePaise') ORDER BY (t ->> 'minQty')::int),
        '[]'::jsonb)
      FROM jsonb_array_elements("tiers") AS t
    );

ALTER TABLE "RoundOffering"
  ALTER COLUMN "kind" SET NOT NULL,
  ALTER COLUMN "tierGroupKey" SET NOT NULL,
  ALTER COLUMN "tierBasis" SET NOT NULL;
CREATE UNIQUE INDEX "RoundOffering_roundId_serviceOptionId_key" ON "RoundOffering"("roundId", "serviceOptionId");
CREATE INDEX "RoundOffering_roundId_tierGroupKey_idx" ON "RoundOffering"("roundId", "tierGroupKey");

ALTER TABLE "OrderItem" RENAME COLUMN "roundProductId" TO "offeringId";
ALTER INDEX "OrderItem_roundProductId_userId_key" RENAME TO "OrderItem_offeringId_userId_key";
ALTER TABLE "OrderItem" RENAME CONSTRAINT "OrderItem_roundProductId_fkey" TO "OrderItem_offeringId_fkey";

-- Stored quotes: rename lines[].roundProductId → offeringId.
UPDATE "Payment"
SET "changes" = jsonb_set(
  "changes",
  '{lines}',
  (
    SELECT COALESCE(jsonb_agg((l - 'roundProductId') || jsonb_build_object('offeringId', l -> 'roundProductId')), '[]'::jsonb)
    FROM jsonb_array_elements("changes" -> 'lines') AS l
  ))
WHERE jsonb_typeof("changes" -> 'lines') = 'array';

-- ---------------------------------------------------------------------------------------------
-- DeliveryIssue → OrderIssue
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "DeliveryIssue" RENAME TO "OrderIssue";
ALTER TABLE "OrderIssue" RENAME CONSTRAINT "DeliveryIssue_pkey" TO "OrderIssue_pkey";
ALTER INDEX "DeliveryIssue_roundId_idx" RENAME TO "OrderIssue_roundId_idx";
ALTER TABLE "OrderIssue" RENAME CONSTRAINT "DeliveryIssue_roundId_fkey" TO "OrderIssue_roundId_fkey";
ALTER TABLE "OrderIssue" RENAME CONSTRAINT "DeliveryIssue_flatId_fkey" TO "OrderIssue_flatId_fkey";
ALTER TABLE "OrderIssue" RENAME CONSTRAINT "DeliveryIssue_orderItemId_fkey" TO "OrderIssue_orderItemId_fkey";
ALTER TABLE "OrderIssue" RENAME CONSTRAINT "DeliveryIssue_createdById_fkey" TO "OrderIssue_createdById_fkey";
ALTER TABLE "OrderIssue" ADD COLUMN "serviceIssueId" TEXT;

-- ---------------------------------------------------------------------------------------------
-- SupplierPurchaseOrder → VendorOrder, PurchaseOrderLine → VendorOrderLine
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "SupplierPurchaseOrder" RENAME TO "VendorOrder";
ALTER TABLE "VendorOrder" RENAME CONSTRAINT "SupplierPurchaseOrder_pkey" TO "VendorOrder_pkey";
ALTER SEQUENCE "SupplierPurchaseOrder_number_seq" RENAME TO "VendorOrder_number_seq";
ALTER INDEX "SupplierPurchaseOrder_number_key" RENAME TO "VendorOrder_number_key";
ALTER TABLE "VendorOrder" RENAME COLUMN "supplierId" TO "vendorId";
ALTER INDEX "SupplierPurchaseOrder_roundId_supplierId_key" RENAME TO "VendorOrder_roundId_vendorId_key";
ALTER TABLE "VendorOrder" RENAME CONSTRAINT "SupplierPurchaseOrder_roundId_fkey" TO "VendorOrder_roundId_fkey";
ALTER TABLE "VendorOrder" RENAME CONSTRAINT "SupplierPurchaseOrder_supplierId_fkey" TO "VendorOrder_vendorId_fkey";

ALTER TABLE "PurchaseOrderLine" RENAME TO "VendorOrderLine";
ALTER TABLE "VendorOrderLine" RENAME CONSTRAINT "PurchaseOrderLine_pkey" TO "VendorOrderLine_pkey";
ALTER TABLE "VendorOrderLine" RENAME COLUMN "poId" TO "vendorOrderId";
ALTER TABLE "VendorOrderLine" RENAME CONSTRAINT "PurchaseOrderLine_poId_fkey" TO "VendorOrderLine_vendorOrderId_fkey";
ALTER TABLE "VendorOrderLine" RENAME COLUMN "roundProductId" TO "offeringId";
ALTER TABLE "VendorOrderLine" RENAME CONSTRAINT "PurchaseOrderLine_roundProductId_fkey" TO "VendorOrderLine_offeringId_fkey";
ALTER TABLE "VendorOrderLine" RENAME CONSTRAINT "PurchaseOrderLine_productId_fkey" TO "VendorOrderLine_productId_fkey";
ALTER TABLE "VendorOrderLine" RENAME COLUMN "supplierPricePaise" TO "vendorPricePaise";
ALTER TABLE "VendorOrderLine" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "VendorOrderLine" ADD COLUMN "serviceOptionId" TEXT;

CREATE TABLE "VendorAdjustment" (
    "id" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "visitId" TEXT,
    "type" "VendorAdjustmentType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAdjustment_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------------
-- Service Days: slots, bookings, visits, ratings and issues
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "ServiceSlot" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceSlot_pkey" PRIMARY KEY ("id"),
    -- Last line of defence against overbooking; bookings take a seat with a conditional increment.
    CONSTRAINT "ServiceSlot_bookedCount_check" CHECK ("bookedCount" >= 0 AND "bookedCount" <= "capacity"),
    CONSTRAINT "ServiceSlot_time_check" CHECK ("endsAt" > "startsAt")
);

CREATE TABLE "ServiceBooking" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3),
    "keepSlotWeekly" BOOLEAN NOT NULL DEFAULT false,
    "autoPayFromWallet" BOOLEAN NOT NULL DEFAULT false,
    "repeatOfBookingId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceVisit" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "slotId" TEXT,
    "kind" "VisitKind" NOT NULL DEFAULT 'STANDARD',
    "revisitOfId" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "technicianName" TEXT,
    "completionCode" TEXT NOT NULL,
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "onTheWayAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "noAccessAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitRating" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VisitRating_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "ServiceIssue" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "kind" "ServiceIssueKind" NOT NULL,
    "reportedById" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" "ServiceIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceIssue_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------------
-- Interest polls and notifications
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "InterestPoll" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kind" "PollKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "productId" TEXT,
    "serviceId" TEXT,
    "threshold" INTEGER NOT NULL,
    "status" "PollStatus" NOT NULL,
    "suggestedById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "closesAt" TIMESTAMPTZ(3),
    "thresholdNotifiedAt" TIMESTAMPTZ(3),
    "convertedRoundId" TEXT,
    "convertedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestPoll_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterestPoll_threshold_check" CHECK ("threshold" >= 1)
);

CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "href" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------------
-- Indexes for the new tables
-- ---------------------------------------------------------------------------------------------
CREATE INDEX "Service_vendorId_idx" ON "Service"("vendorId");
CREATE UNIQUE INDEX "ServiceOptionTier_optionId_minFlats_key" ON "ServiceOptionTier"("optionId", "minFlats");
CREATE UNIQUE INDEX "VendorSlotTemplate_serviceId_startTime_key" ON "VendorSlotTemplate"("serviceId", "startTime");
CREATE UNIQUE INDEX "VendorAdjustment_visitId_type_key" ON "VendorAdjustment"("visitId", "type");
CREATE UNIQUE INDEX "ServiceSlot_roundId_startsAt_key" ON "ServiceSlot"("roundId", "startsAt");
CREATE UNIQUE INDEX "ServiceBooking_repeatOfBookingId_key" ON "ServiceBooking"("repeatOfBookingId");
CREATE INDEX "ServiceBooking_slotId_idx" ON "ServiceBooking"("slotId");
CREATE INDEX "ServiceBooking_status_holdExpiresAt_idx" ON "ServiceBooking"("status", "holdExpiresAt");
CREATE UNIQUE INDEX "ServiceBooking_roundId_flatId_key" ON "ServiceBooking"("roundId", "flatId");
CREATE UNIQUE INDEX "ServiceVisit_revisitOfId_key" ON "ServiceVisit"("revisitOfId");
CREATE INDEX "ServiceVisit_roundId_status_idx" ON "ServiceVisit"("roundId", "status");
CREATE UNIQUE INDEX "ServiceVisit_bookingId_kind_key" ON "ServiceVisit"("bookingId", "kind");
CREATE UNIQUE INDEX "VisitRating_visitId_key" ON "VisitRating"("visitId");
CREATE INDEX "VisitRating_vendorId_createdAt_idx" ON "VisitRating"("vendorId", "createdAt");
CREATE UNIQUE INDEX "ServiceIssue_visitId_key" ON "ServiceIssue"("visitId");
CREATE INDEX "ServiceIssue_roundId_status_idx" ON "ServiceIssue"("roundId", "status");
CREATE UNIQUE INDEX "InterestPoll_convertedRoundId_key" ON "InterestPoll"("convertedRoundId");
CREATE INDEX "InterestPoll_communityId_status_idx" ON "InterestPoll"("communityId", "status");
CREATE UNIQUE INDEX "PollVote_pollId_flatId_key" ON "PollVote"("pollId", "flatId");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- ---------------------------------------------------------------------------------------------
-- Foreign keys for new columns and tables
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Service" ADD CONSTRAINT "Service_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceOption" ADD CONSTRAINT "ServiceOption_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOptionTier" ADD CONSTRAINT "ServiceOptionTier_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ServiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorSlotTemplate" ADD CONSTRAINT "VendorSlotTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRound" ADD CONSTRAINT "OrderRound_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRound" ADD CONSTRAINT "OrderRound_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRound" ADD CONSTRAINT "OrderRound_repeatOfRoundId_fkey" FOREIGN KEY ("repeatOfRoundId") REFERENCES "OrderRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoundOffering" ADD CONSTRAINT "RoundOffering_serviceOptionId_fkey" FOREIGN KEY ("serviceOptionId") REFERENCES "ServiceOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderIssue" ADD CONSTRAINT "OrderIssue_serviceIssueId_fkey" FOREIGN KEY ("serviceIssueId") REFERENCES "ServiceIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorOrderLine" ADD CONSTRAINT "VendorOrderLine_serviceOptionId_fkey" FOREIGN KEY ("serviceOptionId") REFERENCES "ServiceOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorAdjustment" ADD CONSTRAINT "VendorAdjustment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceSlot" ADD CONSTRAINT "ServiceSlot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ServiceSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_repeatOfBookingId_fkey" FOREIGN KEY ("repeatOfBookingId") REFERENCES "ServiceBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ServiceSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_revisitOfId_fkey" FOREIGN KEY ("revisitOfId") REFERENCES "ServiceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitRating" ADD CONSTRAINT "VisitRating_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitRating" ADD CONSTRAINT "VisitRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitRating" ADD CONSTRAINT "VisitRating_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceIssue" ADD CONSTRAINT "ServiceIssue_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterestPoll" ADD CONSTRAINT "InterestPoll_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterestPoll" ADD CONSTRAINT "InterestPoll_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterestPoll" ADD CONSTRAINT "InterestPoll_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterestPoll" ADD CONSTRAINT "InterestPoll_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterestPoll" ADD CONSTRAINT "InterestPoll_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterestPoll" ADD CONSTRAINT "InterestPoll_convertedRoundId_fkey" FOREIGN KEY ("convertedRoundId") REFERENCES "OrderRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "InterestPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
