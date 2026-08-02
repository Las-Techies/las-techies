-- CreateTable
CREATE TABLE "GithubConnection" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "githubLogin" TEXT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubConnection_userId_key" ON "GithubConnection"("userId");
