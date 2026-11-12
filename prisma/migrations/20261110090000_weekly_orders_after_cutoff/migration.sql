-- Weekly auto-pay runs after the cutoff, one resident at a time: these mark what's been handled.
ALTER TABLE "ServiceBooking" ADD COLUMN "autoPayCheckedAt" TIMESTAMPTZ(3);
ALTER TABLE "StandingOrder" ADD COLUMN "placedRoundId" TEXT;
-- Everything that exists now was already handled when its week opened.
UPDATE "ServiceBooking" SET "autoPayCheckedAt" = "createdAt" WHERE "status" = 'HELD';
UPDATE "StandingOrder" SET "placedRoundId" = "roundId";
