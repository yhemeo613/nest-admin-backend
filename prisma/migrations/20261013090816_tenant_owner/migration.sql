-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "tenant_owner_id_idx" ON "tenant"("owner_id");
