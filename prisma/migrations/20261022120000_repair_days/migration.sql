-- Repair Days: plumber, electrician, carpenter and painter services; a problem note and photo on a
-- booking; parts a technician asks the resident to approve and pay for, at cost.

ALTER TYPE "ServiceCategory" ADD VALUE 'PLUMBER';
ALTER TYPE "ServiceCategory" ADD VALUE 'ELECTRICIAN';
ALTER TYPE "ServiceCategory" ADD VALUE 'CARPENTER';
ALTER TYPE "ServiceCategory" ADD VALUE 'PAINTER';
ALTER TYPE "WalletTxnType" ADD VALUE 'PARTS_DEBIT';
ALTER TYPE "WalletTxnType" ADD VALUE 'PARTS_REFUND';
ALTER TYPE "VendorAdjustmentType" ADD VALUE 'PARTS';
ALTER TYPE "NotificationType" ADD VALUE 'PARTS_APPROVAL';

CREATE TYPE "PaymentPurpose" AS ENUM ('ORDER', 'PARTS');
CREATE TYPE "PartsRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'REFUNDED');

-- Existing payments were all for orders.
ALTER TABLE "Payment" ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'ORDER',
ADD COLUMN "partsRequestId" TEXT;

ALTER TABLE "ServiceBooking" ADD COLUMN "problemNote" TEXT;

CREATE TABLE "BookingPhoto" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingPhoto_pkey" PRIMARY KEY ("id"),
    -- At most 300 KB, and the stored size is the real size.
    CONSTRAINT "BookingPhoto_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 307200 AND octet_length("data") = "sizeBytes")
);

CREATE TABLE "PartsRequest" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "status" "PartsRequestStatus" NOT NULL DEFAULT 'PENDING',
    "pendingVisitId" TEXT,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartsRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartsRequest_total_check" CHECK ("totalPaise" > 0),
    -- One waiting request per visit: pendingVisitId (unique) is the visit while pending, null otherwise.
    CONSTRAINT "PartsRequest_pending_check" CHECK (("status" = 'PENDING' AND "pendingVisitId" = "visitId") OR ("status" <> 'PENDING' AND "pendingVisitId" IS NULL))
);

CREATE UNIQUE INDEX "BookingPhoto_bookingId_key" ON "BookingPhoto"("bookingId");
CREATE UNIQUE INDEX "PartsRequest_pendingVisitId_key" ON "PartsRequest"("pendingVisitId");
CREATE INDEX "PartsRequest_visitId_idx" ON "PartsRequest"("visitId");
CREATE INDEX "PartsRequest_roundId_idx" ON "PartsRequest"("roundId");
CREATE INDEX "Payment_partsRequestId_idx" ON "Payment"("partsRequestId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partsRequestId_fkey" FOREIGN KEY ("partsRequestId") REFERENCES "PartsRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingPhoto" ADD CONSTRAINT "BookingPhoto_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingPhoto" ADD CONSTRAINT "BookingPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
