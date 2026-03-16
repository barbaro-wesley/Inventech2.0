/*
  Warnings:

  - You are about to drop the column `entity_id` on the `attachments` table. All the data in the column will be lost.
  - You are about to drop the column `technician_id` on the `service_orders` table. All the data in the column will be lost.
  - Added the required column `maintenance_type` to the `service_orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ServiceOrderTechnicianRole" AS ENUM ('LEAD', 'ASSISTANT');

-- AlterEnum
ALTER TYPE "AttachmentEntity" ADD VALUE 'COMMENT';

-- AlterEnum
ALTER TYPE "ServiceOrderStatus" ADD VALUE 'AWAITING_PICKUP';

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_comment_fkey";

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_equipment_fkey";

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_maintenance_fkey";

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_service_order_fkey";

-- DropForeignKey
ALTER TABLE "service_orders" DROP CONSTRAINT "service_orders_technician_id_fkey";

-- DropIndex
DROP INDEX "attachments_company_id_entity_entity_id_idx";

-- DropIndex
DROP INDEX "service_orders_technician_id_status_idx";

-- AlterTable
ALTER TABLE "attachments" DROP COLUMN "entity_id",
ADD COLUMN     "comment_id" TEXT,
ADD COLUMN     "equipment_id" TEXT,
ADD COLUMN     "maintenance_id" TEXT,
ADD COLUMN     "service_order_id" TEXT;

-- AlterTable
ALTER TABLE "maintenance_schedules" ADD COLUMN     "group_id" TEXT;

-- AlterTable
ALTER TABLE "service_orders" DROP COLUMN "technician_id",
ADD COLUMN     "alert_after_hours" INTEGER,
ADD COLUMN     "alert_sent_at" TIMESTAMP(3),
ADD COLUMN     "group_id" TEXT,
ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maintenance_type" "MaintenanceType" NOT NULL;

-- CreateTable
CREATE TABLE "maintenance_groups" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_technicians" (
    "id" TEXT NOT NULL,
    "service_order_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "role" "ServiceOrderTechnicianRole" NOT NULL DEFAULT 'LEAD',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "service_order_technicians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_groups_company_id_is_active_idx" ON "maintenance_groups"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_groups_company_id_name_key" ON "maintenance_groups"("company_id", "name");

-- CreateIndex
CREATE INDEX "technician_groups_group_id_is_active_idx" ON "technician_groups"("group_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "technician_groups_user_id_group_id_key" ON "technician_groups"("user_id", "group_id");

-- CreateIndex
CREATE INDEX "service_order_technicians_technician_id_idx" ON "service_order_technicians"("technician_id");

-- CreateIndex
CREATE INDEX "service_order_technicians_service_order_id_idx" ON "service_order_technicians"("service_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_order_technicians_service_order_id_technician_id_key" ON "service_order_technicians"("service_order_id", "technician_id");

-- CreateIndex
CREATE INDEX "attachments_service_order_id_idx" ON "attachments"("service_order_id");

-- CreateIndex
CREATE INDEX "attachments_maintenance_id_idx" ON "attachments"("maintenance_id");

-- CreateIndex
CREATE INDEX "attachments_equipment_id_idx" ON "attachments"("equipment_id");

-- CreateIndex
CREATE INDEX "attachments_company_id_entity_idx" ON "attachments"("company_id", "entity");

-- CreateIndex
CREATE INDEX "service_orders_group_id_is_available_idx" ON "service_orders"("group_id", "is_available");

-- CreateIndex
CREATE INDEX "service_orders_is_available_created_at_idx" ON "service_orders"("is_available", "created_at");

-- AddForeignKey
ALTER TABLE "maintenance_groups" ADD CONSTRAINT "maintenance_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_groups" ADD CONSTRAINT "technician_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_groups" ADD CONSTRAINT "technician_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "maintenance_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "maintenance_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "maintenance_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_technicians" ADD CONSTRAINT "service_order_technicians_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_technicians" ADD CONSTRAINT "service_order_technicians_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "maintenances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "service_order_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
