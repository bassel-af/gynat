-- CreateEnum
CREATE TYPE "SourceVisibility" AS ENUM ('admins', 'members', 'public');

-- CreateTable
CREATE TABLE "source_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tree_id" UUID NOT NULL,
    "individual_id" UUID,
    "visibility" "SourceVisibility" NOT NULL DEFAULT 'admins',
    "text" BYTEA,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "tree_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "file_name" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_file_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "source_file_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_entries_tree_id_individual_id_idx" ON "source_entries"("tree_id", "individual_id");

-- CreateIndex
CREATE INDEX "source_files_entry_id_idx" ON "source_files"("entry_id");

-- CreateIndex
CREATE INDEX "source_files_tree_id_idx" ON "source_files"("tree_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_file_data_file_id_key" ON "source_file_data"("file_id");

-- AddForeignKey
ALTER TABLE "source_entries" ADD CONSTRAINT "source_entries_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_entries" ADD CONSTRAINT "source_entries_individual_id_fkey" FOREIGN KEY ("individual_id") REFERENCES "individuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_entries" ADD CONSTRAINT "source_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "source_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_file_data" ADD CONSTRAINT "source_file_data_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "source_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- HAND-ADDED (not expressible in schema.prisma — a regenerated migration
-- would drop these; keep them in sync with the comments in schema.prisma).
-- ---------------------------------------------------------------------------

-- At most ONE tree-wide source entry («مصدر الشجرة») per tree.
CREATE UNIQUE INDEX "source_entries_one_tree_wide_per_tree"
    ON "source_entries"("tree_id") WHERE "individual_id" IS NULL;

-- A stored file is 1 byte .. 8 MB.
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_size_bytes_check"
    CHECK ("size_bytes" BETWEEN 1 AND 8388608);

-- Only the four accepted formats (verified by magic bytes before insert).
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_mime_type_check"
    CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));
