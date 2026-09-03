-- CreateEnum
CREATE TYPE "Entitlement" AS ENUM ('FREE_SETUP', 'LIFETIME', 'MANUAL_LIFETIME', 'DEMO');

-- CreateEnum
CREATE TYPE "PurchaseSource" AS ENUM ('STRIPE_CHECKOUT', 'MANUAL_GRANT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "entitlement" "Entitlement" NOT NULL DEFAULT 'FREE_SETUP';

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "PurchaseSource" NOT NULL,
    "entitlement" "Entitlement" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeCustomerId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "purchasedByUserId" TEXT,
    "grantReason" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_stripeCheckoutSessionId_key" ON "purchases"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "purchases_organizationId_idx" ON "purchases"("organizationId");

-- CreateIndex
CREATE INDEX "organizations_entitlement_idx" ON "organizations"("entitlement");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
