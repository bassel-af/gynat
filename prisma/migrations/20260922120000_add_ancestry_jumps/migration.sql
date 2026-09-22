-- CreateTable
CREATE TABLE "ancestry_jumps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tree_id" UUID NOT NULL,
    "gedcom_id" TEXT,
    "descendant_id" UUID NOT NULL,
    "ancestor_family_id" UUID NOT NULL,
    "generations_min" INTEGER,
    "generations_max" INTEGER,
    "notes" BYTEA,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ancestry_jumps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ancestry_jumps_ancestor_family_id_idx" ON "ancestry_jumps"("ancestor_family_id");

-- CreateIndex
CREATE UNIQUE INDEX "ancestry_jumps_tree_id_descendant_id_key" ON "ancestry_jumps"("tree_id", "descendant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ancestry_jumps_tree_id_gedcom_id_key" ON "ancestry_jumps"("tree_id", "gedcom_id");

-- A stated generation range must be positive and ordered. Both columns stay
-- independently nullable ("we don't know" is the honest default).
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_generations_range_check" CHECK (
    ("generations_min" IS NULL OR "generations_min" >= 1)
    AND ("generations_max" IS NULL OR "generations_max" >= 1)
    AND ("generations_min" IS NULL OR "generations_max" IS NULL OR "generations_min" <= "generations_max")
);

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_descendant_id_fkey" FOREIGN KEY ("descendant_id") REFERENCES "individuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_ancestor_family_id_fkey" FOREIGN KEY ("ancestor_family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
