-- CreateEnum
CREATE TYPE "ReputationReason" AS ENUM ('REPORT_FIXED', 'REPORT_REJECTED_SPAM', 'CONFIRMED_BY_OTHER');

-- CreateTable
CREATE TABLE "reputation_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "reason" "ReputationReason" NOT NULL,
    "delta" INTEGER NOT NULL,
    "related_user_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reputation_events_dedupe_key_key" ON "reputation_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "reputation_events_user_id_created_at_idx" ON "reputation_events"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
