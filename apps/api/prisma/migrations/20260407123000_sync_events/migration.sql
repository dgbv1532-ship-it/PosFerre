-- CreateEnum
CREATE TYPE "SyncEntity" AS ENUM ('sale', 'product', 'cash_movement');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('create', 'update', 'delete');

-- CreateTable
CREATE TABLE "sync_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "local_id" TEXT NOT NULL,
    "entity" "SyncEntity" NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_events_store_id_device_id_local_id_key" ON "sync_events"("store_id", "device_id", "local_id");

-- CreateIndex
CREATE INDEX "sync_events_store_id_processed_at_idx" ON "sync_events"("store_id", "processed_at");
