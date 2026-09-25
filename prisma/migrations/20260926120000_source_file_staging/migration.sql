-- Sources («المصادر») step 5: staged file uploads.
-- A file is uploaded on its own first (entry_id NULL, owned by created_by),
-- then attached to an entry. Staged files are never served and are swept
-- after 24 h.

-- AlterTable
ALTER TABLE "source_files" ADD COLUMN     "created_by" UUID,
ALTER COLUMN "entry_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- HAND-ADDED (not expressible in schema.prisma — keep in sync with the
-- comment on `model SourceFile`).
-- ---------------------------------------------------------------------------

-- The lazy sweep of abandoned staged uploads scans only staged rows.
CREATE INDEX "source_files_staged_created_at"
    ON "source_files"("created_at") WHERE "entry_id" IS NULL;
