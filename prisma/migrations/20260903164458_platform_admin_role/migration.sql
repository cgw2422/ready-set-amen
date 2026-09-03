-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSignInAt" TIMESTAMP(3),
ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateIndex
CREATE INDEX "users_platformRole_idx" ON "users"("platformRole");
