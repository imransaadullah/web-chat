-- AlterTable
ALTER TABLE "App" ADD COLUMN "orgId" TEXT;
CREATE UNIQUE INDEX "App_orgId_key" ON "App"("orgId");
