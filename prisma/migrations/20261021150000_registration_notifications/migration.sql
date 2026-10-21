-- Phase 10: tell platform admins when a community or a vendor registers and waits for them.
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE 'VENDOR_REGISTERED';
