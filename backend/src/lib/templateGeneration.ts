import { prisma } from "./prisma";
import { addDays, hkDateTime, hkNow } from "./time";
import { isLocked } from "./rosterabilityRecords";
import { bad, TENANT_ID } from "./validation";
import { DtaRosterabilityStatus, DtaSourceCode } from "../types/enums";

type Employee = { id: number; orgId: number; empTypeCode: string; postCode: string };
type Template = Awaited<ReturnType<typeof prisma.dtaTemplate.findMany>>[number];
type Condition = Awaited<ReturnType<typeof prisma.dtaTemplateCondition.findMany>>[number];
type EmployeeAssociation = Awaited<ReturnType<typeof prisma.dtaTemplateEmployee.findMany>>[number];
type Item = Awaited<ReturnType<typeof prisma.dtaTemplateItem.findMany>>[number];

type SkipReason = "NO_PARAM" | "NO_TEMPLATE" | "EXISTS" | "LOCKED" | "SHIFT_CONFLICT" | "STATUS_DISABLED";
type Skipped = { empId: number; businessDate: string | null; templateItemId: number | null; reason: SkipReason; message: string };
type Summary = { created: number; exists: number; locked: number; shiftConflict: number; noParam: number; noTemplate: number; statusDisabled: number };

function selectTemplate(templates: Template[], conditions: Condition[], employeeAssociations: EmployeeAssociation[], employee: Employee, businessDate: string): Template | null {
  const directCandidates = employeeAssociations.flatMap((association) => {
    if (association.empId !== employee.id) return [];
    const template = templates.find((row) => row.id === association.templateId);
    if (!template || template.startDate > businessDate || (template.endDate !== null && template.endDate < businessDate)) return [];
    return [{ template, priority: association.priority }];
  });
  const candidates = conditions.flatMap((condition) => {
    const template = templates.find((row) => row.id === condition.templateId);
    if (!template || template.startDate > businessDate || (template.endDate !== null && template.endDate < businessDate)) return [];
    if (condition.orgId !== null && condition.orgId !== employee.orgId) return [];
    if (condition.empTypeCode !== null && condition.empTypeCode !== employee.empTypeCode) return [];
    if (condition.postCode !== null && condition.postCode !== employee.postCode) return [];
    return [{ template, priority: condition.priority }];
  });
  directCandidates.sort((a, b) => a.priority - b.priority || b.template.updatedAt.getTime() - a.template.updatedAt.getTime() || b.template.id - a.template.id);
  if (directCandidates.length > 0) return directCandidates[0].template;
  candidates.sort((a, b) => a.priority - b.priority || b.template.updatedAt.getTime() - a.template.updatedAt.getTime() || b.template.id - a.template.id);
  return candidates[0]?.template ?? null;
}

export async function generateForManager(orgId: number, managerId: number, now: Date = new Date(), templateId?: number, selectedOrgIds: number[] = [orgId]) {
  const org = await prisma.dtaOrg.findFirst({ where: { id: orgId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!org) bad("管辖组织不存在");
  const startMonday = hkNow(now).startOf("week").plus({ weeks: 1 }).toISODate()!;
  const [employees, params, templates, conditions, employeeAssociations, items, statuses] = await Promise.all([
    prisma.dtaEmployee.findMany({ where: { tenantId: TENANT_ID, orgId: { in: selectedOrgIds }, isDeleted: 0 }, orderBy: { id: "asc" } }),
    prisma.dtaParamGroup.findMany({ where: { tenantId: TENANT_ID, orgId: { in: selectedOrgIds }, isDeleted: 0 } }),
    prisma.dtaTemplate.findMany({ where: { tenantId: TENANT_ID, enabled: 1, isDeleted: 0, ...(templateId === undefined ? {} : { id: templateId }) } }),
    prisma.dtaTemplateCondition.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 } }),
    prisma.dtaTemplateEmployee.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 } }),
    prisma.dtaTemplateItem.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 } }),
    prisma.dtaRosterabilityStatusDict.findMany({ where: { tenantId: TENANT_ID, enabled: 1, isDeleted: 0 } }),
  ]);
  const enabledStatuses = new Set(statuses.map((row) => row.statusCode));
  const summary: Summary = { created: 0, exists: 0, locked: 0, shiftConflict: 0, noParam: 0, noTemplate: 0, statusDisabled: 0 };
  const skipped: Skipped[] = [];
  const skip = (empId: number, businessDate: string | null, templateItemId: number | null, reason: SkipReason, message: string) => {
    skipped.push({ empId, businessDate, templateItemId, reason, message });
    if (reason === "NO_PARAM") summary.noParam++;
    if (reason === "NO_TEMPLATE") summary.noTemplate++;
    if (reason === "EXISTS") summary.exists++;
    if (reason === "LOCKED") summary.locked++;
    if (reason === "SHIFT_CONFLICT") summary.shiftConflict++;
    if (reason === "STATUS_DISABLED") summary.statusDisabled++;
  };

  for (const employee of employees) {
    const param = params.find((row) => row.orgId === employee.orgId && row.empTypeCode === employee.empTypeCode);
    if (!param || param.autoGenRangeWeek === null || param.autoGenRangeWeek < 1 || param.autoGenRangeWeek > 12) {
      skip(employee.id, null, null, "NO_PARAM", "员工所属组织与员工类型未配置有效生成周数");
      continue;
    }
    for (let dayIndex = 0; dayIndex < param.autoGenRangeWeek * 7; dayIndex++) {
      const businessDate = addDays(startMonday, dayIndex);
      const template = selectTemplate(templates, conditions, employeeAssociations, employee, businessDate);
      if (!template) {
        skip(employee.id, businessDate, null, "NO_TEMPLATE", "该业务日没有匹配的有效模板");
        continue;
      }
      const weekday = (dayIndex % 7) + 1;
      const dayItems = items.filter((item) => item.templateId === template.id && item.weekday === weekday);
      for (const item of dayItems) {
        const key = { tenantId: TENANT_ID, empId: employee.id, businessDate, templateItemId: item.id };
        const existing = await prisma.dtaRosterabilityRecord.findFirst({ where: key });
        if (existing) {
          skip(employee.id, businessDate, item.id, "EXISTS", "该模板时段已生成，包括已修改或软删除的记录");
          continue;
        }
        if (!enabledStatuses.has(item.statusCode) || item.statusCode === DtaRosterabilityStatus.STANDBY || (item.statusCode === DtaRosterabilityStatus.PRIORITY_ROSTERABLE && param.priorityRosterEnable !== 1)) {
          skip(employee.id, businessDate, item.id, "STATUS_DISABLED", item.statusCode === DtaRosterabilityStatus.PRIORITY_ROSTERABLE ? "所属组织与员工类型未启用优先排班模式" : "模板可排性状态未启用");
          continue;
        }
        if (isLocked(businessDate, param.cutoffDays, now)) {
          skip(employee.id, businessDate, item.id, "LOCKED", "该业务日已到报备截止时间");
          continue;
        }
        if (item.statusCode === DtaRosterabilityStatus.UNROSTERABLE) {
          const shift = await prisma.dtaMockShift.findFirst({ where: { tenantId: TENANT_ID, empId: employee.id, businessDate, isDeleted: 0, durationMinutes: { gt: 0 } } });
          if (shift) {
            skip(employee.id, businessDate, item.id, "SHIFT_CONFLICT", "该员工当日已存在工作班次，不能调整为不可排。");
            continue;
          }
        }
        try {
          await prisma.dtaRosterabilityRecord.create({ data: {
            tenantId: TENANT_ID,
            orgId: employee.orgId,
            empId: employee.id,
            empTypeCode: employee.empTypeCode,
            businessDate,
            statusCode: item.statusCode,
            sourceCode: DtaSourceCode.TEMPLATE_GEN,
            startTime: hkDateTime(businessDate, item.startTime),
            endTime: hkDateTime(businessDate, item.endTime, item.endDayOffset),
            remark: item.remark,
            templateId: template.id,
            templateItemId: item.id,
            createdBy: managerId,
            updatedBy: managerId,
          } });
          summary.created++;
        } catch (error) {
          // The unique index also protects against two managers clicking at once.
          if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
            skip(employee.id, businessDate, item.id, "EXISTS", "该模板时段已生成，包括已修改或软删除的记录");
          } else {
            throw error;
          }
        }
      }
    }
  }
  return { orgId, startMonday, employeeCount: employees.length, summary, skipped };
}
