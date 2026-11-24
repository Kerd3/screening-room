-- AlterTable
ALTER TABLE "User" ADD COLUMN     "handle" TEXT;

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "profilePublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Dismissal" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "titleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dismissal_userId_createdAt_idx" ON "Dismissal"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dismissal_userId_titleId_key" ON "Dismissal"("userId", "titleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- AddForeignKey
ALTER TABLE "Dismissal" ADD CONSTRAINT "Dismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dismissal" ADD CONSTRAINT "Dismissal_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;
