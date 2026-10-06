-- CreateTable
CREATE TABLE "report_clusters" (
    "id" UUID NOT NULL,
    "centroid_lat" DOUBLE PRECISION NOT NULL,
    "centroid_lng" DOUBLE PRECISION NOT NULL,
    "confirmation_count" INTEGER NOT NULL DEFAULT 1,
    "priority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_confirmations" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "cluster_id" UUID NOT NULL,
    "confirmed_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_clusters_priority_score_idx" ON "report_clusters"("priority_score");

-- CreateIndex
CREATE UNIQUE INDEX "report_confirmations_report_id_confirmed_by_user_id_key" ON "report_confirmations"("report_id", "confirmed_by_user_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "report_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "report_clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_confirmations" ADD CONSTRAINT "report_confirmations_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
