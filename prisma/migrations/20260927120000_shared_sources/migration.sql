-- Sources («المصادر») rework R1: SHARED sources.
-- One source (text + files + visibility) is attached to MANY people through
-- `source_links`. The tree-wide source («مصدر الشجرة») becomes the explicit
-- `is_tree_wide` flag. Generated with `prisma migrate diff`, then HAND-EDITED
-- so existing data is preserved: every person entry becomes 1 source + 1 link.

-- 1. Tree-wide flag, backfilled from the old "no person" rows.
ALTER TABLE "source_entries" ADD COLUMN "is_tree_wide" BOOLEAN NOT NULL DEFAULT false;
UPDATE "source_entries" SET "is_tree_wide" = true WHERE "individual_id" IS NULL;

-- 2. Links table.
CREATE TABLE "source_links" (
    "source_id" UUID NOT NULL,
    "individual_id" UUID NOT NULL,
    "tree_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_links_pkey" PRIMARY KEY ("source_id","individual_id")
);

CREATE INDEX "source_links_individual_id_idx" ON "source_links"("individual_id");
CREATE INDEX "source_links_tree_id_idx" ON "source_links"("tree_id");

ALTER TABLE "source_links" ADD CONSTRAINT "source_links_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_individual_id_fkey" FOREIGN KEY ("individual_id") REFERENCES "individuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_links" ADD CONSTRAINT "source_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Backfill: each old person entry → one link to its person.
INSERT INTO "source_links" ("source_id", "individual_id", "tree_id", "created_by", "created_at")
SELECT "id", "individual_id", "tree_id", "created_by", "created_at"
FROM "source_entries"
WHERE "individual_id" IS NOT NULL;

-- 4. Drop the old person column (+ its FK and indexes), re-index.
DROP INDEX "source_entries_one_tree_wide_per_tree";
DROP INDEX "source_entries_tree_id_individual_id_idx";
ALTER TABLE "source_entries" DROP CONSTRAINT "source_entries_individual_id_fkey";
ALTER TABLE "source_entries" DROP COLUMN "individual_id";

CREATE INDEX "source_entries_tree_id_idx" ON "source_entries"("tree_id");

-- ---------------------------------------------------------------------------
-- HAND-ADDED (not expressible in schema.prisma — a regenerated migration
-- would drop it; keep in sync with the comment on `model SourceEntry`).
-- ---------------------------------------------------------------------------

-- At most ONE tree-wide source («مصدر الشجرة») per tree.
CREATE UNIQUE INDEX "source_entries_one_tree_wide_per_tree"
    ON "source_entries"("tree_id") WHERE "is_tree_wide";
