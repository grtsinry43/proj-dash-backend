-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "github_id" INTEGER NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "badge_url" TEXT,
    "github_created_at" TIMESTAMP(3) NOT NULL,
    "github_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "github_id" INTEGER NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "run_number" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "conclusion" TEXT,
    "head_branch" TEXT,
    "head_sha" TEXT NOT NULL,
    "trigger_user" TEXT,
    "html_url" TEXT NOT NULL,
    "run_started_at" TIMESTAMP(3),
    "github_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_jobs" (
    "id" TEXT NOT NULL,
    "github_id" INTEGER NOT NULL,
    "workflow_run_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "conclusion" TEXT,
    "runner_name" TEXT,
    "runner_group_name" TEXT,
    "html_url" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflows_github_id_key" ON "workflows"("github_id");

-- CreateIndex
CREATE INDEX "workflows_repository_id_idx" ON "workflows"("repository_id");

-- CreateIndex
CREATE INDEX "workflows_path_idx" ON "workflows"("path");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_repository_id_github_id_key" ON "workflows"("repository_id", "github_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_runs_github_id_key" ON "workflow_runs"("github_id");

-- CreateIndex
CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs"("workflow_id");

-- CreateIndex
CREATE INDEX "workflow_runs_run_number_idx" ON "workflow_runs"("run_number");

-- CreateIndex
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs"("status");

-- CreateIndex
CREATE INDEX "workflow_runs_conclusion_idx" ON "workflow_runs"("conclusion");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_jobs_github_id_key" ON "workflow_jobs"("github_id");

-- CreateIndex
CREATE INDEX "workflow_jobs_workflow_run_id_idx" ON "workflow_jobs"("workflow_run_id");

-- CreateIndex
CREATE INDEX "workflow_jobs_status_idx" ON "workflow_jobs"("status");

-- CreateIndex
CREATE INDEX "workflow_jobs_conclusion_idx" ON "workflow_jobs"("conclusion");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
