ALTER TABLE "dta_org" ADD COLUMN "parent_org_id" INTEGER;

CREATE INDEX "dta_org_tenant_id_parent_org_id_is_deleted_idx" ON "dta_org"("tenant_id", "parent_org_id", "is_deleted");

CREATE TABLE "dta_param_scheme_authorization" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenant_id" INTEGER NOT NULL,
  "scheme_id" INTEGER NOT NULL,
  "org_id" INTEGER NOT NULL,
  "emp_type_code" TEXT NOT NULL,
  "include_children" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" INTEGER NOT NULL,
  "updated_by" INTEGER NOT NULL
);

CREATE UNIQUE INDEX "dta_param_scheme_authorization_tenant_id_org_id_emp_type_code_key"
  ON "dta_param_scheme_authorization"("tenant_id", "org_id", "emp_type_code");
CREATE INDEX "dta_param_scheme_authorization_tenant_id_scheme_id_idx"
  ON "dta_param_scheme_authorization"("tenant_id", "scheme_id");
