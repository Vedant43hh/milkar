-- Vendor portal: payouts marked paid, and technicians a vendor can turn off.
ALTER TYPE "VendorOrderStatus" ADD VALUE 'PAID';
ALTER TABLE "VendorOrder" ADD COLUMN "paidAt" TIMESTAMPTZ(3);
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMPTZ(3);
