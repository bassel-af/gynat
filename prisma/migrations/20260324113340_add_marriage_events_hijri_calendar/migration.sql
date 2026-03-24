-- AlterTable
ALTER TABLE "families" ADD COLUMN     "divorce_date" TEXT,
ADD COLUMN     "divorce_description" VARCHAR(500),
ADD COLUMN     "divorce_hijri_date" TEXT,
ADD COLUMN     "divorce_notes" TEXT,
ADD COLUMN     "divorce_place" TEXT,
ADD COLUMN     "is_divorced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marriage_contract_date" TEXT,
ADD COLUMN     "marriage_contract_description" VARCHAR(500),
ADD COLUMN     "marriage_contract_hijri_date" TEXT,
ADD COLUMN     "marriage_contract_notes" TEXT,
ADD COLUMN     "marriage_contract_place" TEXT,
ADD COLUMN     "marriage_date" TEXT,
ADD COLUMN     "marriage_description" VARCHAR(500),
ADD COLUMN     "marriage_hijri_date" TEXT,
ADD COLUMN     "marriage_notes" TEXT,
ADD COLUMN     "marriage_place" TEXT;

-- AlterTable
ALTER TABLE "individuals" ADD COLUMN     "birth_hijri_date" TEXT,
ADD COLUMN     "death_hijri_date" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calendar_preference" TEXT NOT NULL DEFAULT 'hijri';
