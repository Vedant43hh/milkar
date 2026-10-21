-- Phase 9: one portal per role. Captains become Society Managers who run a community through
-- CommunityStaff; technicians join as a vendor's staff; communities and residents now wait for
-- approval. Existing data is kept: communities stay approved, captains keep running their community.

-- ---------- roles ----------
ALTER TYPE "Role" RENAME VALUE 'CAPTAIN' TO 'MANAGER';
ALTER TYPE "Role" ADD VALUE 'TECHNICIAN' AFTER 'VENDOR';

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffKind" AS ENUM ('PRIMARY', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('GROCERIES', 'HOME_SERVICES', 'REPAIRS');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOIN_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'JOIN_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'VENDOR_DECIDED';

-- ---------- communities: approval ----------
-- Communities that already exist are live; new ones start PENDING.
ALTER TABLE "Community" ADD COLUMN     "registeredById" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "status" "CommunityStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Community" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ServiceVisit" ADD COLUMN     "technicianId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMPTZ(3);

-- ---------- vendors: categories and service area ----------
ALTER TABLE "Vendor" ADD COLUMN     "categories" "VendorCategory"[] DEFAULT ARRAY[]::"VendorCategory"[],
ADD COLUMN     "serviceAreaPincodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "Vendor" SET "categories" = CASE "kind" WHEN 'GOODS' THEN ARRAY['GROCERIES']::"VendorCategory"[] ELSE ARRAY['HOME_SERVICES']::"VendorCategory"[] END;

-- CreateTable
CREATE TABLE "CommunityStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kind" "StaffKind" NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "pendingUserId" TEXT,
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id"),
    -- One open request per user: pendingUserId (unique) is the user while pending, null otherwise.
    CONSTRAINT "JoinRequest_pending_check" CHECK (("status" = 'PENDING' AND "pendingUserId" = "userId") OR ("status" <> 'PENDING' AND "pendingUserId" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStaff_userId_key" ON "CommunityStaff"("userId");

-- CreateIndex
CREATE INDEX "CommunityStaff_communityId_idx" ON "CommunityStaff"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "JoinRequest_pendingUserId_key" ON "JoinRequest"("pendingUserId");

-- CreateIndex
CREATE INDEX "JoinRequest_communityId_status_idx" ON "JoinRequest"("communityId", "status");

-- CreateIndex
CREATE INDEX "JoinRequest_userId_idx" ON "JoinRequest"("userId");

-- CreateIndex
CREATE INDEX "Community_status_idx" ON "Community"("status");

-- CreateIndex
CREATE INDEX "ServiceVisit_technicianId_startsAt_idx" ON "ServiceVisit"("technicianId", "startsAt");

-- CreateIndex
CREATE INDEX "User_vendorId_idx" ON "User"("vendorId");

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStaff" ADD CONSTRAINT "CommunityStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStaff" ADD CONSTRAINT "CommunityStaff_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStaff" ADD CONSTRAINT "CommunityStaff_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- backfill: existing captains run the community they live in ----------
-- The longest-standing manager of each community is primary; any others are assistants.
INSERT INTO "CommunityStaff" ("id", "userId", "communityId", "kind", "createdAt")
SELECT 'staff_' || u."id",
       u."id",
       f."communityId",
       CASE WHEN row_number() OVER (PARTITION BY f."communityId" ORDER BY u."createdAt", u."id") = 1 THEN 'PRIMARY'::"StaffKind" ELSE 'ASSISTANT'::"StaffKind" END,
       u."createdAt"
FROM "User" u
JOIN "Flat" f ON f."id" = u."flatId"
WHERE u."role" = 'MANAGER';

-- ---------- links in stored notifications follow the new portal paths ----------
UPDATE "Notification" SET "href" = CASE
    WHEN "href" = '/' THEN '/app'
    WHEN "href" ~ '^/(groceries|services|orders|wallet|notifications|polls|pay)([/?]|$)' THEN '/app' || "href"
    WHEN "href" ~ '^/captain([/?]|$)' THEN regexp_replace("href", '^/captain', '/manager')
    ELSE "href"
END
WHERE "href" IS NOT NULL;
