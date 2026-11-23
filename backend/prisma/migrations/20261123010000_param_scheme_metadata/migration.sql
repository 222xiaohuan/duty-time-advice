ALTER TABLE "dta_param_scheme" ADD COLUMN "description" TEXT;
ALTER TABLE "dta_param_scheme" ADD COLUMN "is_deleted" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "dta_param_scheme_tenant_id_is_deleted_idx" ON "dta_param_scheme"("tenant_id", "is_deleted");
