/*
  Warnings:

  - You are about to drop the column `branch_id` on the `albums` table. All the data in the column will be lost.
  - You are about to drop the column `branch_id` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `branch_id` on the `posts` table. All the data in the column will be lost.
  - You are about to drop the `branch_invitations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `branch_memberships` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `branches` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "albums" DROP CONSTRAINT "albums_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_invitations" DROP CONSTRAINT "branch_invitations_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_invitations" DROP CONSTRAINT "branch_invitations_invited_by_fkey";

-- DropForeignKey
ALTER TABLE "branch_invitations" DROP CONSTRAINT "branch_invitations_invited_user_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_memberships" DROP CONSTRAINT "branch_memberships_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_memberships" DROP CONSTRAINT "branch_memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "branches_created_by_fkey";

-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "branches_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_branch_id_fkey";

-- AlterTable
ALTER TABLE "albums" DROP COLUMN "branch_id";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "branch_id";

-- AlterTable
ALTER TABLE "posts" DROP COLUMN "branch_id";

-- DropTable
DROP TABLE "branch_invitations";

-- DropTable
DROP TABLE "branch_memberships";

-- DropTable
DROP TABLE "branches";

-- DropEnum
DROP TYPE "BranchInvitationStatus";

-- DropEnum
DROP TYPE "BranchRole";
