-- Admin portal: platform settings for visit fees and impact estimates, who marked a payout paid,
-- and the notification a vendor gets when it is.
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_PAID';
ALTER TABLE "PlatformSetting"
  ADD COLUMN "defaultNoAccessFeePaise" INTEGER NOT NULL DEFAULT 19900,
  ADD COLUMN "impactMetresPerTrip" INTEGER NOT NULL DEFAULT 8000,
  ADD COLUMN "impactMlPerKm" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "impactGramsCo2PerLitre" INTEGER NOT NULL DEFAULT 2300,
  ADD COLUMN "updatedById" TEXT;
ALTER TABLE "VendorOrder" ADD COLUMN "paidById" TEXT;
