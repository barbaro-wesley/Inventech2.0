-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('SERVICE_ORDERS', 'EQUIPMENT', 'PREVENTIVE', 'TECHNICIANS', 'FINANCIAL');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "report_name" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "report_footer_text" TEXT,
ADD COLUMN     "report_header_title" TEXT,
ADD COLUMN     "report_primary_color" TEXT DEFAULT '#1E40AF',
ADD COLUMN     "report_secondary_color" TEXT DEFAULT '#DBEAFE';

-- CreateTable
CREATE TABLE "report_permissions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "allowed_roles" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_permissions_company_id_idx" ON "report_permissions"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_permissions_company_id_report_type_key" ON "report_permissions"("company_id", "report_type");

-- AddForeignKey
ALTER TABLE "report_permissions" ADD CONSTRAINT "report_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
