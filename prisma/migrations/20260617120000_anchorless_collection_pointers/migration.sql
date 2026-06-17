-- DropForeignKey
ALTER TABLE "branch_pointers" DROP CONSTRAINT "branch_pointers_anchor_individual_id_fkey";

-- DropForeignKey
ALTER TABLE "branch_pointers" DROP CONSTRAINT "branch_pointers_selected_individual_id_fkey";

-- AlterTable
ALTER TABLE "branch_pointers" ALTER COLUMN "anchor_individual_id" DROP NOT NULL,
ALTER COLUMN "relationship" DROP NOT NULL,
ALTER COLUMN "selected_individual_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "branch_pointers" ADD CONSTRAINT "branch_pointers_selected_individual_id_fkey" FOREIGN KEY ("selected_individual_id") REFERENCES "individuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_pointers" ADD CONSTRAINT "branch_pointers_anchor_individual_id_fkey" FOREIGN KEY ("anchor_individual_id") REFERENCES "individuals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

