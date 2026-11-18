CREATE TABLE "dta_template_employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,
    "emp_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

CREATE UNIQUE INDEX "dta_template_employee_tenant_id_template_id_emp_id_is_deleted_key"
ON "dta_template_employee"("tenant_id", "template_id", "emp_id", "is_deleted");

CREATE INDEX "dta_template_employee_tenant_id_emp_id_is_deleted_idx"
ON "dta_template_employee"("tenant_id", "emp_id", "is_deleted");
