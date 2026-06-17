-- DB-authoritative duplicate guard for collection items.
-- The same tree (or the same nested collection) cannot be added to one
-- collection twice. Both columns are nullable, so Postgres treats NULLs as
-- DISTINCT — pointer / cross-kind rows (null tree_id or null child_collection_id)
-- never collide; only true same-source duplicates are blocked. Plain unique
-- indexes (NOT "NULLS NOT DISTINCT") are exactly what we want here.

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_tree_id_key" ON "collection_items"("collection_id", "tree_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_child_collection_id_key" ON "collection_items"("collection_id", "child_collection_id");
