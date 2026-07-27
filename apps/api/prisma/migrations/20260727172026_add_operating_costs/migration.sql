-- CreateEnum
CREATE TYPE "CostFrequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('HOSTING', 'SAAS', 'DOMAIN', 'INFRASTRUCTURE', 'MARKETING', 'CONTRACTOR', 'HARDWARE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('MANUAL', 'N8N_IMPORT', 'FORWARDED_EMAIL');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "frequency" "CostFrequency" NOT NULL DEFAULT 'MONTHLY',
    "category" "CostCategory" NOT NULL DEFAULT 'SAAS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextChargeAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "projectId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "ExpenseSource" NOT NULL DEFAULT 'MANUAL',
    "externalReference" TEXT,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_workspaceId_archivedAt_idx" ON "Vendor"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_workspaceId_normalizedName_key" ON "Vendor"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_isActive_idx" ON "Subscription"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_projectId_idx" ON "Subscription"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "Subscription_vendorId_idx" ON "Subscription"("vendorId");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_incurredAt_idx" ON "Expense"("workspaceId", "incurredAt");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_status_idx" ON "Expense"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_projectId_incurredAt_idx" ON "Expense"("workspaceId", "projectId", "incurredAt");

-- CreateIndex
CREATE INDEX "Expense_vendorId_incurredAt_idx" ON "Expense"("vendorId", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_workspaceId_source_externalReference_key" ON "Expense"("workspaceId", "source", "externalReference");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
