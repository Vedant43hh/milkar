-- Subscriptions: standing weekly grocery orders, and the notifications they send.
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_ORDERED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_CONFIRM';

CREATE TYPE "StandingOrderStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

CREATE TABLE "StandingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "autoPayFromWallet" BOOLEAN NOT NULL DEFAULT false,
    "status" "StandingOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "StandingOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StandingOrder_userId_roundId_key" ON "StandingOrder"("userId", "roundId");
CREATE INDEX "StandingOrder_roundId_status_idx" ON "StandingOrder"("roundId", "status");
ALTER TABLE "StandingOrder" ADD CONSTRAINT "StandingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StandingOrder" ADD CONSTRAINT "StandingOrder_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StandingOrder" ADD CONSTRAINT "StandingOrder_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
