-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "enable_radaa" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rada_families" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tree_id" UUID NOT NULL,
    "gedcom_id" TEXT,
    "foster_father_id" UUID,
    "foster_mother_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rada_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rada_family_children" (
    "rada_family_id" UUID NOT NULL,
    "individual_id" UUID NOT NULL,

    CONSTRAINT "rada_family_children_pkey" PRIMARY KEY ("rada_family_id","individual_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rada_families_tree_id_gedcom_id_key" ON "rada_families"("tree_id", "gedcom_id");

-- AddForeignKey
ALTER TABLE "rada_families" ADD CONSTRAINT "rada_families_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rada_families" ADD CONSTRAINT "rada_families_foster_father_id_fkey" FOREIGN KEY ("foster_father_id") REFERENCES "individuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rada_families" ADD CONSTRAINT "rada_families_foster_mother_id_fkey" FOREIGN KEY ("foster_mother_id") REFERENCES "individuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rada_family_children" ADD CONSTRAINT "rada_family_children_rada_family_id_fkey" FOREIGN KEY ("rada_family_id") REFERENCES "rada_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rada_family_children" ADD CONSTRAINT "rada_family_children_individual_id_fkey" FOREIGN KEY ("individual_id") REFERENCES "individuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
