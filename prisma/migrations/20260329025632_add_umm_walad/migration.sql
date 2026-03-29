-- AlterTable
ALTER TABLE "families" ADD COLUMN     "is_umm_walad" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "enable_umm_walad" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "branch_pointers" ADD CONSTRAINT "branch_pointers_share_token_id_fkey" FOREIGN KEY ("share_token_id") REFERENCES "branch_share_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
