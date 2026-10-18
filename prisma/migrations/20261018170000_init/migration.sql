-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESIDENT', 'CAPTAIN', 'SUPPLIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('KG', 'G', 'LITRE', 'ML', 'PACKET', 'PIECE', 'DOZEN');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('GRAINS_FLOUR', 'DALS_PULSES', 'OILS_GHEE', 'SUGAR_SALT', 'SPICES', 'TEA_COFFEE', 'BREAKFAST', 'HOME_CARE', 'PERSONAL_CARE', 'EGGS_DAIRY');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('OPEN', 'FINALIZING', 'FINALIZED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoundProductStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'DROPPED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'DROPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('WALLET', 'MOCK', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'CREDITED_TO_WALLET');

-- CreateEnum
CREATE TYPE "WalletTxnType" AS ENUM ('TIER_REFUND', 'DROP_REFUND', 'CANCEL_REFUND', 'ROUND_CANCEL_REFUND', 'ORDER_DEBIT', 'LATE_PAYMENT_CREDIT', 'SHORT_DELIVERY_REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DeliveryIssueReason" AS ENUM ('SHORT', 'DAMAGED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('ISSUED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'COLLECTED');

-- CreateTable
CREATE TABLE "Society" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Society_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flat" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "tower" TEXT NOT NULL,
    "number" TEXT NOT NULL,

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'RESIDENT',
    "flatId" TEXT,
    "supplierId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpRequest" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "unit" "Unit" NOT NULL,
    "packSize" INTEGER NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL,
    "minOrderQty" INTEGER NOT NULL,
    "defaultMaxPerFlat" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "supplierPricePaise" INTEGER NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "marginBps" INTEGER NOT NULL DEFAULT 300,
    "reductionFreezeMinutes" INTEGER NOT NULL DEFAULT 720,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRound" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "societyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'OPEN',
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "marginBps" INTEGER NOT NULL,
    "reductionFreezeMinutes" INTEGER NOT NULL,
    "requirePickupCode" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundProduct" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,
    "gstBps" INTEGER NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "minOrderQty" INTEGER NOT NULL,
    "maxQtyPerFlat" INTEGER NOT NULL,
    "status" "RoundProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "finalQty" INTEGER,
    "finalSupplierPricePaise" INTEGER,
    "finalUnitPricePaise" INTEGER,

    CONSTRAINT "RoundProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roundProductId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "chargedPaise" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "finalPaise" INTEGER,
    "refundPaise" INTEGER,
    "absorbedPaise" INTEGER,
    "shortQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "issueRefundPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLot" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "chargePaise" INTEGER NOT NULL,
    "creditPaise" INTEGER NOT NULL,
    "walletAppliedPaise" INTEGER NOT NULL,
    "gatewayPaise" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "failureReason" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "type" "WalletTxnType" NOT NULL,
    "roundId" TEXT,
    "paymentId" TEXT,
    "orderItemId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryIssue" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "reason" "DeliveryIssueReason" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refundPaise" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "roundId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotalPaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "roundProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplierPricePaise" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL,
    "taxablePaise" INTEGER NOT NULL,
    "gstPaise" INTEGER NOT NULL,
    "lineTotalPaise" INTEGER NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionRecord" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "pickupCode" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "collectedAt" TIMESTAMPTZ(3),
    "collectedById" TEXT,

    CONSTRAINT "DistributionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Society_code_key" ON "Society"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Flat_societyId_tower_number_key" ON "Flat"("societyId", "tower", "number");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_flatId_idx" ON "User"("flatId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "OtpRequest_phone_createdAt_idx" ON "OtpRequest"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "OtpRequest_ip_createdAt_idx" ON "OtpRequest"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_productId_minQty_key" ON "PriceTier"("productId", "minQty");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRound_number_key" ON "OrderRound"("number");

-- CreateIndex
CREATE INDEX "OrderRound_societyId_status_idx" ON "OrderRound"("societyId", "status");

-- CreateIndex
CREATE INDEX "OrderRound_status_cutoffAt_idx" ON "OrderRound"("status", "cutoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoundProduct_roundId_productId_key" ON "RoundProduct"("roundId", "productId");

-- CreateIndex
CREATE INDEX "OrderItem_roundId_userId_idx" ON "OrderItem"("roundId", "userId");

-- CreateIndex
CREATE INDEX "OrderItem_roundId_flatId_idx" ON "OrderItem"("roundId", "flatId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_roundProductId_userId_key" ON "OrderItem"("roundProductId", "userId");

-- CreateIndex
CREATE INDEX "OrderLot_orderItemId_idx" ON "OrderLot"("orderItemId");

-- CreateIndex
CREATE INDEX "Payment_userId_roundId_idx" ON "Payment"("userId", "roundId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryIssue_roundId_idx" ON "DeliveryIssue"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPurchaseOrder_number_key" ON "SupplierPurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPurchaseOrder_roundId_supplierId_key" ON "SupplierPurchaseOrder"("roundId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRecord_roundId_flatId_key" ON "DistributionRecord"("roundId", "flatId");

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRound" ADD CONSTRAINT "OrderRound_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRound" ADD CONSTRAINT "OrderRound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundProduct" ADD CONSTRAINT "RoundProduct_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundProduct" ADD CONSTRAINT "RoundProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundProduct" ADD CONSTRAINT "RoundProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_roundProductId_fkey" FOREIGN KEY ("roundProductId") REFERENCES "RoundProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLot" ADD CONSTRAINT "OrderLot_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLot" ADD CONSTRAINT "OrderLot_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryIssue" ADD CONSTRAINT "DeliveryIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchaseOrder" ADD CONSTRAINT "SupplierPurchaseOrder_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchaseOrder" ADD CONSTRAINT "SupplierPurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "SupplierPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_roundProductId_fkey" FOREIGN KEY ("roundProductId") REFERENCES "RoundProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "OrderRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
