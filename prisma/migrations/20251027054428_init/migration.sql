-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "repositoryId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequest_repositoryId_number_key" ON "PullRequest"("repositoryId", "number");

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
