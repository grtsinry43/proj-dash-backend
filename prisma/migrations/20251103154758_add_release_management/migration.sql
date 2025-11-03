-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "github_id" INTEGER NOT NULL,
    "repository_id" INTEGER NOT NULL,
    "tag_name" TEXT NOT NULL,
    "target_commitish" TEXT,
    "name" TEXT,
    "body" TEXT,
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "is_prerelease" BOOLEAN NOT NULL DEFAULT false,
    "author_login" TEXT NOT NULL,
    "author_avatar_url" TEXT,
    "html_url" TEXT NOT NULL,
    "assets_url" TEXT NOT NULL,
    "upload_url" TEXT NOT NULL,
    "tarball_url" TEXT NOT NULL,
    "zipball_url" TEXT NOT NULL,
    "github_created_at" TIMESTAMP(3) NOT NULL,
    "github_published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_assets" (
    "id" TEXT NOT NULL,
    "github_id" INTEGER NOT NULL,
    "release_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "content_type" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'uploaded',
    "size" INTEGER NOT NULL,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "browser_download_url" TEXT NOT NULL,
    "uploader_login" TEXT NOT NULL,
    "uploader_avatar_url" TEXT,
    "github_created_at" TIMESTAMP(3) NOT NULL,
    "github_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "releases_github_id_key" ON "releases"("github_id");

-- CreateIndex
CREATE INDEX "releases_repository_id_idx" ON "releases"("repository_id");

-- CreateIndex
CREATE INDEX "releases_tag_name_idx" ON "releases"("tag_name");

-- CreateIndex
CREATE INDEX "releases_github_published_at_idx" ON "releases"("github_published_at");

-- CreateIndex
CREATE UNIQUE INDEX "releases_repository_id_tag_name_key" ON "releases"("repository_id", "tag_name");

-- CreateIndex
CREATE UNIQUE INDEX "release_assets_github_id_key" ON "release_assets"("github_id");

-- CreateIndex
CREATE INDEX "release_assets_release_id_idx" ON "release_assets"("release_id");

-- CreateIndex
CREATE INDEX "release_assets_name_idx" ON "release_assets"("name");

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_assets" ADD CONSTRAINT "release_assets_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
