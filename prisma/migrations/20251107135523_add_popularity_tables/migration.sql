-- CreateTable
CREATE TABLE "star_history" (
    "id" TEXT NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "star_count" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "star_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_views" (
    "id" TEXT NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "view_date" TIMESTAMP(3) NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "unique_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_clones" (
    "id" TEXT NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "clone_date" TIMESTAMP(3) NOT NULL,
    "clone_count" INTEGER NOT NULL DEFAULT 0,
    "unique_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_clones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_referrers" (
    "id" TEXT NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "referrer" TEXT NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "unique_count" INTEGER NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_referrers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_paths" (
    "id" TEXT NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "unique_count" INTEGER NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_paths_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "star_history_repository_id_recorded_at_idx" ON "star_history"("repository_id", "recorded_at");

-- CreateIndex
CREATE INDEX "traffic_views_repository_id_view_date_idx" ON "traffic_views"("repository_id", "view_date");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_views_repository_id_view_date_key" ON "traffic_views"("repository_id", "view_date");

-- CreateIndex
CREATE INDEX "traffic_clones_repository_id_clone_date_idx" ON "traffic_clones"("repository_id", "clone_date");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_clones_repository_id_clone_date_key" ON "traffic_clones"("repository_id", "clone_date");

-- CreateIndex
CREATE INDEX "traffic_referrers_repository_id_recorded_at_idx" ON "traffic_referrers"("repository_id", "recorded_at");

-- CreateIndex
CREATE INDEX "traffic_referrers_referrer_idx" ON "traffic_referrers"("referrer");

-- CreateIndex
CREATE INDEX "traffic_paths_repository_id_recorded_at_idx" ON "traffic_paths"("repository_id", "recorded_at");

-- CreateIndex
CREATE INDEX "traffic_paths_path_idx" ON "traffic_paths"("path");

-- AddForeignKey
ALTER TABLE "star_history" ADD CONSTRAINT "star_history_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_views" ADD CONSTRAINT "traffic_views_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_clones" ADD CONSTRAINT "traffic_clones_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_referrers" ADD CONSTRAINT "traffic_referrers_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_paths" ADD CONSTRAINT "traffic_paths_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
