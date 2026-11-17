ALTER TABLE "dta_org" ADD COLUMN "param_scheme_id" INTEGER;
ALTER TABLE "dta_param_group" ADD COLUMN "priority_roster_enable" INTEGER NOT NULL DEFAULT 0;

UPDATE "dta_param_group"
SET "priority_roster_enable" = COALESCE((
  SELECT "priority_roster_enable" FROM "dta_org" WHERE "dta_org"."id" = "dta_param_group"."org_id"
), 0);

CREATE TABLE "dta_param_scheme" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenant_id" INTEGER NOT NULL,
  "scheme_name" TEXT NOT NULL,
  "source_scheme_id" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "dta_param_scheme_tenant_id_scheme_name_key" ON "dta_param_scheme"("tenant_id", "scheme_name");

CREATE TABLE "dta_param_scheme_rule" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenant_id" INTEGER NOT NULL,
  "scheme_id" INTEGER NOT NULL,
  "emp_type_code" TEXT NOT NULL,
  "cutoff_days" INTEGER NOT NULL,
  "baseline_rule" TEXT NOT NULL,
  "submit_mode" TEXT NOT NULL,
  "emp_edit_enable" INTEGER NOT NULL,
  "priority_roster_enable" INTEGER NOT NULL,
  "auto_gen_range_week" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "dta_param_scheme_rule_scheme_id_emp_type_code_key" ON "dta_param_scheme_rule"("scheme_id", "emp_type_code");

INSERT INTO "dta_param_scheme" ("id", "tenant_id", "scheme_name", "created_by")
SELECT "id", "tenant_id", "org_name" || ' · 原有配置 #' || "id", "created_by"
FROM "dta_org"
WHERE EXISTS (SELECT 1 FROM "dta_param_group" WHERE "dta_param_group"."org_id" = "dta_org"."id" AND "dta_param_group"."is_deleted" = 0);

INSERT INTO "dta_param_scheme_rule" ("tenant_id", "scheme_id", "emp_type_code", "cutoff_days", "baseline_rule", "submit_mode", "emp_edit_enable", "priority_roster_enable", "auto_gen_range_week")
SELECT "tenant_id", "org_id", "emp_type_code", "cutoff_days", "baseline_rule", "submit_mode", "emp_edit_enable", "priority_roster_enable", COALESCE("auto_gen_range_week", 4)
FROM "dta_param_group" WHERE "is_deleted" = 0;

UPDATE "dta_org" SET "param_scheme_id" = "id"
WHERE EXISTS (SELECT 1 FROM "dta_param_scheme" WHERE "dta_param_scheme"."id" = "dta_org"."id");

ALTER TABLE "dta_org" DROP COLUMN "priority_roster_enable";
