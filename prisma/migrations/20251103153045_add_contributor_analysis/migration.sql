-- CreateTable
CREATE TABLE "contributors" (
    "id" TEXT NOT NULL,
    "github_id" INTEGER NOT NULL,
    "login" TEXT NOT NULL,
    "avatar_url" TEXT NOT NULL,
    "html_url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'User',
    "repository_id" INTEGER NOT NULL,
    "total_contributions" INTEGER NOT NULL DEFAULT 0,
    "total_additions" INTEGER NOT NULL DEFAULT 0,
    "total_deletions" INTEGER NOT NULL DEFAULT 0,
    "first_contribution_at" TIMESTAMP(3),
    "last_contribution_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributor_weekly_stats" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "week_timestamp" INTEGER NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "commits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributor_weekly_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contributors_repository_id_idx" ON "contributors"("repository_id");

-- CreateIndex
CREATE INDEX "contributors_login_idx" ON "contributors"("login");

-- CreateIndex
CREATE UNIQUE INDEX "contributors_repository_id_github_id_key" ON "contributors"("repository_id", "github_id");

-- CreateIndex
CREATE INDEX "contributor_weekly_stats_contributor_id_week_timestamp_idx" ON "contributor_weekly_stats"("contributor_id", "week_timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "contributor_weekly_stats_contributor_id_week_timestamp_key" ON "contributor_weekly_stats"("contributor_id", "week_timestamp");

-- AddForeignKey
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_weekly_stats" ADD CONSTRAINT "contributor_weekly_stats_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
