-- CreateTable
CREATE TABLE "dta_tenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_name" TEXT NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_org" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "org_name" TEXT NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "org_id" INTEGER NOT NULL,
    "emp_name" TEXT NOT NULL,
    "emp_type_code" TEXT NOT NULL,
    "post_code" TEXT NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_rosterability_status_dict" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "status_code" TEXT NOT NULL,
    "status_name" TEXT NOT NULL,
    "name_i18n" TEXT,
    "color_hex" TEXT,
    "allow_schedule" INTEGER NOT NULL,
    "emp_self_edit" INTEGER NOT NULL,
    "enabled" INTEGER NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_rosterability_source_dict" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "source_code" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "name_i18n" TEXT,
    "icon_key" TEXT,
    "enabled" INTEGER NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_param_group" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "org_id" INTEGER NOT NULL,
    "emp_type_code" TEXT NOT NULL,
    "cutoff_days" INTEGER NOT NULL,
    "baseline_rule" TEXT NOT NULL,
    "submit_mode" TEXT NOT NULL,
    "emp_edit_enable" INTEGER NOT NULL,
    "template_auto_gen_enable" INTEGER NOT NULL,
    "auto_gen_range_week" INTEGER,
    "auto_gen_weekday" INTEGER,
    "auto_gen_time" TEXT,
    "conflict_check_mode" TEXT NOT NULL DEFAULT 'STRONG_BLOCK',
    "field_site_enable" INTEGER NOT NULL DEFAULT 0,
    "enable_approval" INTEGER NOT NULL DEFAULT 0,
    "special_tag_diff_enable" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_template" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "template_name" TEXT NOT NULL,
    "name_i18n" TEXT,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "enabled" INTEGER NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_template_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "status_code" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "end_day_offset" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "site_code" TEXT,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_template_condition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "template_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "org_id" INTEGER,
    "emp_type_code" TEXT,
    "post_code" TEXT,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_rosterability_record" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "org_id" INTEGER NOT NULL,
    "emp_id" INTEGER NOT NULL,
    "emp_type_code" TEXT NOT NULL,
    "business_date" TEXT NOT NULL,
    "status_code" TEXT NOT NULL,
    "source_code" TEXT NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME NOT NULL,
    "remark" TEXT,
    "site_code" TEXT,
    "approval_status" TEXT,
    "approver_id" INTEGER,
    "approved_at" DATETIME,
    "approve_comment" TEXT,
    "locked" INTEGER NOT NULL DEFAULT 0,
    "template_id" INTEGER,
    "template_item_id" INTEGER,
    "external_sync_id" TEXT,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_mock_shift" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "org_id" INTEGER NOT NULL,
    "emp_id" INTEGER NOT NULL,
    "business_date" TEXT NOT NULL,
    "shift_name" TEXT NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_deleted" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" INTEGER NOT NULL,
    "updated_by" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "dta_audit_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenant_id" INTEGER NOT NULL,
    "org_id" INTEGER,
    "emp_id" INTEGER,
    "business_date" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" INTEGER NOT NULL,
    "action_code" TEXT NOT NULL,
    "status_code" TEXT,
    "source_code" TEXT,
    "before_json" TEXT,
    "after_json" TEXT,
    "operator_id" INTEGER NOT NULL,
    "operate_time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operate_source" TEXT NOT NULL,
    "remark" TEXT,
    "site_code" TEXT,
    "approval_related" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "dta_org_tenant_id_is_deleted_idx" ON "dta_org"("tenant_id", "is_deleted");

-- CreateIndex
CREATE INDEX "dta_employee_tenant_id_org_id_is_deleted_idx" ON "dta_employee"("tenant_id", "org_id", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "dta_rosterability_status_dict_tenant_id_status_code_key" ON "dta_rosterability_status_dict"("tenant_id", "status_code");

-- CreateIndex
CREATE UNIQUE INDEX "dta_rosterability_source_dict_tenant_id_source_code_key" ON "dta_rosterability_source_dict"("tenant_id", "source_code");

-- CreateIndex
CREATE UNIQUE INDEX "dta_param_group_tenant_id_org_id_emp_type_code_key" ON "dta_param_group"("tenant_id", "org_id", "emp_type_code");

-- CreateIndex
CREATE INDEX "dta_template_tenant_id_is_deleted_idx" ON "dta_template"("tenant_id", "is_deleted");

-- CreateIndex
CREATE INDEX "dta_template_item_tenant_id_template_id_is_deleted_idx" ON "dta_template_item"("tenant_id", "template_id", "is_deleted");

-- CreateIndex
CREATE INDEX "dta_template_condition_tenant_id_template_id_is_deleted_idx" ON "dta_template_condition"("tenant_id", "template_id", "is_deleted");

-- CreateIndex
CREATE INDEX "dta_rosterability_record_tenant_id_emp_id_business_date_is_deleted_idx" ON "dta_rosterability_record"("tenant_id", "emp_id", "business_date", "is_deleted");

-- CreateIndex
CREATE INDEX "dta_rosterability_record_tenant_id_emp_id_business_date_template_item_id_idx" ON "dta_rosterability_record"("tenant_id", "emp_id", "business_date", "template_item_id");

-- CreateIndex
CREATE INDEX "dta_mock_shift_tenant_id_emp_id_business_date_is_deleted_idx" ON "dta_mock_shift"("tenant_id", "emp_id", "business_date", "is_deleted");

-- CreateIndex
CREATE INDEX "dta_audit_log_tenant_id_operate_time_idx" ON "dta_audit_log"("tenant_id", "operate_time");

-- CreateIndex
CREATE INDEX "dta_audit_log_tenant_id_org_id_emp_id_idx" ON "dta_audit_log"("tenant_id", "org_id", "emp_id");
