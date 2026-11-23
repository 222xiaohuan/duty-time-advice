-- Preserve existing part-time rules for both new PT types before renaming the old code.
INSERT INTO "dta_param_group" (
  "tenant_id", "org_id", "emp_type_code", "cutoff_days", "baseline_rule", "submit_mode",
  "emp_edit_enable", "template_auto_gen_enable", "auto_gen_range_week", "auto_gen_weekday",
  "auto_gen_time", "conflict_check_mode", "field_site_enable", "enable_approval",
  "special_tag_diff_enable", "is_deleted", "created_at", "updated_at", "created_by",
  "updated_by", "priority_roster_enable"
)
SELECT "tenant_id", "org_id", 'CASUAL_PT', "cutoff_days", "baseline_rule", "submit_mode",
  "emp_edit_enable", "template_auto_gen_enable", "auto_gen_range_week", "auto_gen_weekday",
  "auto_gen_time", "conflict_check_mode", "field_site_enable", "enable_approval",
  "special_tag_diff_enable", "is_deleted", "created_at", "updated_at", "created_by",
  "updated_by", "priority_roster_enable"
FROM "dta_param_group" WHERE "emp_type_code" = 'PART_TIME';

INSERT INTO "dta_param_scheme_rule" (
  "tenant_id", "scheme_id", "emp_type_code", "cutoff_days", "baseline_rule", "submit_mode",
  "emp_edit_enable", "priority_roster_enable", "auto_gen_range_week"
)
SELECT "tenant_id", "scheme_id", 'CASUAL_PT', "cutoff_days", "baseline_rule", "submit_mode",
  "emp_edit_enable", "priority_roster_enable", "auto_gen_range_week"
FROM "dta_param_scheme_rule" WHERE "emp_type_code" = 'PART_TIME';

INSERT INTO "dta_param_scheme_authorization" (
  "tenant_id", "scheme_id", "org_id", "emp_type_code", "include_children",
  "created_at", "updated_at", "created_by", "updated_by"
)
SELECT "tenant_id", "scheme_id", "org_id", 'CASUAL_PT', "include_children",
  "created_at", "updated_at", "created_by", "updated_by"
FROM "dta_param_scheme_authorization" WHERE "emp_type_code" = 'PART_TIME';

INSERT INTO "dta_template_condition" (
  "tenant_id", "template_id", "priority", "org_id", "emp_type_code", "post_code",
  "is_deleted", "created_at", "updated_at", "created_by", "updated_by"
)
SELECT "tenant_id", "template_id", "priority", "org_id", 'CASUAL_PT', "post_code",
  "is_deleted", "created_at", "updated_at", "created_by", "updated_by"
FROM "dta_template_condition" WHERE "emp_type_code" = 'PART_TIME' AND "is_deleted" = 0;

UPDATE "dta_employee" SET "emp_type_code" = 'CONTRACT_PT' WHERE "emp_type_code" = 'PART_TIME';
UPDATE "dta_employee" SET "emp_type_code" = 'CASUAL_PT' WHERE "id" IN (4, 8, 12, 14) AND "emp_type_code" = 'CONTRACT_PT';
UPDATE "dta_param_group" SET "emp_type_code" = 'CONTRACT_PT' WHERE "emp_type_code" = 'PART_TIME';
UPDATE "dta_param_scheme_rule" SET "emp_type_code" = 'CONTRACT_PT' WHERE "emp_type_code" = 'PART_TIME';
UPDATE "dta_param_scheme_authorization" SET "emp_type_code" = 'CONTRACT_PT' WHERE "emp_type_code" = 'PART_TIME';
UPDATE "dta_template_condition" SET "emp_type_code" = 'CONTRACT_PT' WHERE "emp_type_code" = 'PART_TIME';
UPDATE "dta_rosterability_record" SET "emp_type_code" = COALESCE((
  SELECT "emp_type_code" FROM "dta_employee" WHERE "dta_employee"."id" = "dta_rosterability_record"."emp_id"
), 'CONTRACT_PT') WHERE "emp_type_code" = 'PART_TIME';
