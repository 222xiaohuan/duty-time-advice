DROP INDEX "dta_rosterability_record_tenant_id_emp_id_business_date_template_item_id_idx";

CREATE UNIQUE INDEX "dta_rosterability_record_tenant_id_emp_id_business_date_template_item_id_key"
ON "dta_rosterability_record"("tenant_id", "emp_id", "business_date", "template_item_id");
