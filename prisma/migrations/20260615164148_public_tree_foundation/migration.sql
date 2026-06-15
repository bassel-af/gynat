-- Public Tree v1 foundation:
--   * Multi-tree foundation (FamilyTree.kind / nameAr; drop the workspace
--     unique so a workspace can hold one main tree + optional extra trees).
--   * Tree visibility / publishing fields.
--   * CopyProvenance table (raw UUIDs, no FK) for the admin global takedown.

-- CreateEnum
CREATE TYPE "TreeVisibility" AS ENUM ('private', 'public_link', 'public_listed');

-- CreateEnum
CREATE TYPE "TreeKind" AS ENUM ('main', 'extra');

-- DropIndex
DROP INDEX "family_trees_workspace_id_key";

-- AlterTable
ALTER TABLE "family_trees" ADD COLUMN     "allow_reuse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "TreeKind" NOT NULL DEFAULT 'main',
ADD COLUMN     "name_ar" TEXT,
ADD COLUMN     "public_slug" TEXT,
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "published_by" UUID,
ADD COLUMN     "search_listing_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibility" "TreeVisibility" NOT NULL DEFAULT 'private';

-- CreateTable
CREATE TABLE "copy_provenance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "copied_tree_id" UUID NOT NULL,
    "copied_root_id" UUID NOT NULL,
    "source_workspace_id" UUID NOT NULL,
    "source_tree_id" UUID NOT NULL,
    "source_root_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copy_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copy_provenance_source_workspace_id_idx" ON "copy_provenance"("source_workspace_id");

-- CreateIndex
CREATE INDEX "copy_provenance_source_root_id_idx" ON "copy_provenance"("source_root_id");

-- CreateIndex
CREATE INDEX "copy_provenance_copied_tree_id_idx" ON "copy_provenance"("copied_tree_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_trees_public_slug_key" ON "family_trees"("public_slug");

-- CreateIndex
CREATE INDEX "family_trees_workspace_id_idx" ON "family_trees"("workspace_id");

-- AddForeignKey
ALTER TABLE "family_trees" ADD CONSTRAINT "family_trees_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce "at most one MAIN tree per workspace" (Prisma can't express a partial
-- unique index in the schema, so it is added here as raw SQL).
CREATE UNIQUE INDEX "family_trees_one_main_per_workspace"
  ON "family_trees" ("workspace_id")
  WHERE "kind" = 'main';
