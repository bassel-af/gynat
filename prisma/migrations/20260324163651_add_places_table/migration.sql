-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "parent_id" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "places_workspace_id_name_ar_key" ON "places"("workspace_id", "name_ar");

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
