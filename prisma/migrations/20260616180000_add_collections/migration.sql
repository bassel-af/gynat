-- CreateEnum
CREATE TYPE "CollectionItemKind" AS ENUM ('tree', 'collection');

-- CreateEnum
CREATE TYPE "ItemLinkMode" AS ENUM ('linked', 'copied');

-- AlterEnum
ALTER TYPE "ContentPermission" ADD VALUE 'collection_editor';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "enable_collections" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title_ar" TEXT NOT NULL,
    "description_ar" TEXT,
    "visibility" "TreeVisibility" NOT NULL DEFAULT 'private',
    "public_slug" TEXT,
    "allow_reuse" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID NOT NULL,
    "kind" "CollectionItemKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title_ar" TEXT NOT NULL,
    "description_ar" TEXT,
    "linkMode" "ItemLinkMode",
    "tree_id" UUID,
    "root_individual_id" UUID,
    "branch_pointer_id" UUID,
    "child_collection_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_public_slug_key" ON "collections"("public_slug");

-- CreateIndex
CREATE INDEX "collections_workspace_id_idx" ON "collections"("workspace_id");

-- CreateIndex
CREATE INDEX "collection_items_collection_id_sort_order_idx" ON "collection_items"("collection_id", "sort_order");

-- CreateIndex
CREATE INDEX "collection_items_child_collection_id_idx" ON "collection_items"("child_collection_id");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_branch_pointer_id_fkey" FOREIGN KEY ("branch_pointer_id") REFERENCES "branch_pointers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_child_collection_id_fkey" FOREIGN KEY ("child_collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_root_individual_id_fkey" FOREIGN KEY ("root_individual_id") REFERENCES "individuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraint (Prisma cannot express this).
-- Every CollectionItem binds to EXACTLY ONE source, and the source kind must
-- agree with `kind`:
--   kind = 'collection'  =>  child_collection_id set; tree_id / branch_pointer_id / "linkMode" all null.
--   kind = 'tree'        =>  "linkMode" set, child_collection_id null, and EXACTLY ONE of
--                            { tree_id, branch_pointer_id } set.
-- ---------------------------------------------------------------------------
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_source_exactly_one" CHECK (
  (
    "kind" = 'collection'
    AND "child_collection_id" IS NOT NULL
    AND "tree_id" IS NULL
    AND "branch_pointer_id" IS NULL
    AND "linkMode" IS NULL
  )
  OR (
    "kind" = 'tree'
    AND "child_collection_id" IS NULL
    AND "linkMode" IS NOT NULL
    AND (("tree_id" IS NOT NULL)::int + ("branch_pointer_id" IS NOT NULL)::int) = 1
  )
);
