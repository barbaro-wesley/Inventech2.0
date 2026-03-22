-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "licenseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedBy" TEXT,
ADD COLUMN     "suspendedReason" TEXT;
