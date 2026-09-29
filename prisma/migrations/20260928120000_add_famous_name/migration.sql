-- AlterTable
ALTER TABLE "individuals" ADD COLUMN     "famous_name" BYTEA,
ADD COLUMN     "famous_name_in_nasab" BOOLEAN;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "enable_famous_name" BOOLEAN NOT NULL DEFAULT false;
