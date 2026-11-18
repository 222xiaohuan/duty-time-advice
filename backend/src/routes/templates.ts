import { Router } from "express";
import type { Request } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { bad, parseId, TENANT_ID } from "../lib/validation";
import { conditionFields, itemFields, templateFields } from "../lib/templateValidation";

export const templatesRouter = Router();

function bodyOf(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) bad("请求体必须为对象");
  return req.body as Record<string, unknown>;
}

async function templateOf(id: number) {
  const template = await prisma.dtaTemplate.findFirst({ where: { id, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!template) throw new AppError(ErrorCode.NOT_FOUND, "模板不存在", 404);
  return template;
}

async function itemOf(templateId: number, id: number) {
  const item = await prisma.dtaTemplateItem.findFirst({ where: { id, templateId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!item) throw new AppError(ErrorCode.NOT_FOUND, "模板明细不存在", 404);
  return item;
}

async function conditionOf(templateId: number, id: number) {
  const condition = await prisma.dtaTemplateCondition.findFirst({ where: { id, templateId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!condition) throw new AppError(ErrorCode.NOT_FOUND, "模板条件不存在", 404);
  return condition;
}

async function employeeAssociationOf(templateId: number, id: number) {
  const association = await prisma.dtaTemplateEmployee.findFirst({ where: { id, templateId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!association) throw new AppError(ErrorCode.NOT_FOUND, "模板员工关联不存在", 404);
  return association;
}

async function employeeForAssociation(req: Request, empId: number) {
  const employee = await prisma.dtaEmployee.findFirst({ where: { id: empId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!employee) throw new AppError(ErrorCode.NOT_FOUND, "员工不存在", 404);
  if (req.identity?.role === "manager" && employee.orgId !== req.identity.orgId) throw new AppError(ErrorCode.FORBIDDEN, "经理只能关联所辖组织员工", 403);
  return employee;
}

function associationPriority(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) bad("priority 必须为非负整数");
  return Number(value);
}

function associationEmployeeIds(body: Record<string, unknown>): number[] {
  const raw = body.empIds === undefined ? body.empId === undefined ? [] : [body.empId] : body.empIds;
  if (!Array.isArray(raw) || raw.length === 0) bad("empIds 至少包含一个员工");
  const ids = raw.map((value) => parseId(value, "empId"));
  if (new Set(ids).size !== ids.length) bad("empIds 不能包含重复员工");
  return ids;
}

async function checkItemStatus(statusCode: string): Promise<void> {
  const status = await prisma.dtaRosterabilityStatusDict.findFirst({ where: { tenantId: TENANT_ID, statusCode: statusCode as "ROSTERABLE" | "UNROSTERABLE", enabled: 1, isDeleted: 0 } });
  if (!status) bad("该可排性状态未启用");
}

type ItemTimeFields = { weekday: number; startTime: string; endTime: string; endDayOffset: number };
type DaySegment = { weekday: number; start: number; end: number };

function itemSegments(item: ItemTimeFields): DaySegment[] {
  const [startHour, startMinute] = item.startTime.split(":").map(Number);
  const [endHour, endMinute] = item.endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (item.endDayOffset === 0) return [{ weekday: item.weekday, start, end }];
  return [
    { weekday: item.weekday, start, end: 1440 },
    { weekday: item.weekday === 7 ? 1 : item.weekday + 1, start: 0, end },
  ].filter((segment) => segment.end > segment.start);
}

async function checkItemOverlap(templateId: number, fields: ItemTimeFields, excludeId?: number): Promise<void> {
  const existing = await prisma.dtaTemplateItem.findMany({ where: { tenantId: TENANT_ID, templateId, isDeleted: 0, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { weekday: true, startTime: true, endTime: true, endDayOffset: true } });
  const candidateSegments = itemSegments(fields);
  const overlaps = existing.some((item) => itemSegments(item).some((existingSegment) => candidateSegments.some((candidate) => candidate.weekday === existingSegment.weekday && candidate.start < existingSegment.end && existingSegment.start < candidate.end)));
  if (overlaps) bad("同一星期的模板可排性时间段不能重叠，请修改时间或删除已有时段后再添加。");
}

async function checkConditionOrg(orgId: number | null): Promise<void> {
  if (orgId === null) return;
  const org = await prisma.dtaOrg.findFirst({ where: { id: orgId, tenantId: TENANT_ID, isDeleted: 0 } });
  if (!org) bad("模板条件中的组织不存在");
}

templatesRouter.get("/", requireRole("admin", "manager"), async (_req, res, next) => {
  try {
    const rows = await prisma.dtaTemplate.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
    ok(res, rows);
  } catch (error) { next(error); }
});

templatesRouter.get("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const [items, conditions, employeeAssociations] = await Promise.all([
      prisma.dtaTemplateItem.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { id: "asc" }] }),
      prisma.dtaTemplateCondition.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ priority: "asc" }, { id: "asc" }] }),
      prisma.dtaTemplateEmployee.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ priority: "asc" }, { id: "asc" }] }),
    ]);
    const employeeIds = employeeAssociations.map((row) => row.empId);
    const employees = employeeIds.length === 0 ? [] : await prisma.dtaEmployee.findMany({ where: { tenantId: TENANT_ID, id: { in: employeeIds }, isDeleted: 0 }, select: { id: true, empName: true, orgId: true, empTypeCode: true, postCode: true } });
    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    const visibleAssociations = req.identity?.role === "manager"
      ? employeeAssociations.filter((row) => employeeMap.get(row.empId)?.orgId === req.identity?.orgId)
      : employeeAssociations;
    ok(res, { ...template, items, conditions, employeeAssociations: visibleAssociations.map((row) => ({ ...row, employee: employeeMap.get(row.empId) ?? null })) });
  } catch (error) { next(error); }
});

templatesRouter.post("/", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const fields = templateFields(bodyOf(req));
    const row = await prisma.dtaTemplate.create({ data: { tenantId: TENANT_ID, ...fields, createdBy: req.identity!.userId, updatedBy: req.identity!.userId } });
    ok(res, row, "模板已创建");
  } catch (error) { next(error); }
});

templatesRouter.patch("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const current = await templateOf(parseId(req.params.id, "id"));
    const fields = templateFields(bodyOf(req), current);
    const row = await prisma.dtaTemplate.update({ where: { id: current.id }, data: { ...fields, updatedBy: req.identity!.userId } });
    ok(res, row, "模板已更新");
  } catch (error) { next(error); }
});

templatesRouter.delete("/:id", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const current = await templateOf(parseId(req.params.id, "id"));
    const row = await prisma.dtaTemplate.update({ where: { id: current.id }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
    ok(res, row, "模板已删除");
  } catch (error) { next(error); }
});

templatesRouter.get("/:id/items", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    ok(res, await prisma.dtaTemplateItem.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { id: "asc" }] }));
  } catch (error) { next(error); }
});

templatesRouter.post("/:id/items", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const fields = itemFields(bodyOf(req));
    await checkItemStatus(fields.statusCode);
    await checkItemOverlap(template.id, fields);
    const row = await prisma.dtaTemplateItem.create({ data: { tenantId: TENANT_ID, templateId: template.id, ...fields, createdBy: req.identity!.userId, updatedBy: req.identity!.userId } });
    ok(res, row, "模板明细已创建");
  } catch (error) { next(error); }
});

templatesRouter.patch("/:id/items/:itemId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const current = await itemOf(template.id, parseId(req.params.itemId, "itemId"));
    const fields = itemFields(bodyOf(req), current);
    await checkItemStatus(fields.statusCode);
    await checkItemOverlap(template.id, fields, current.id);
    const row = await prisma.dtaTemplateItem.update({ where: { id: current.id }, data: { ...fields, updatedBy: req.identity!.userId } });
    ok(res, row, "模板明细已更新");
  } catch (error) { next(error); }
});

templatesRouter.delete("/:id/items/:itemId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const current = await itemOf(template.id, parseId(req.params.itemId, "itemId"));
    const row = await prisma.dtaTemplateItem.update({ where: { id: current.id }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
    ok(res, row, "模板明细已删除");
  } catch (error) { next(error); }
});

templatesRouter.get("/:id/conditions", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    ok(res, await prisma.dtaTemplateCondition.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ priority: "asc" }, { id: "asc" }] }));
  } catch (error) { next(error); }
});

templatesRouter.post("/:id/conditions", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const fields = conditionFields(bodyOf(req));
    await checkConditionOrg(fields.orgId);
    const row = await prisma.dtaTemplateCondition.create({ data: { tenantId: TENANT_ID, templateId: template.id, ...fields, createdBy: req.identity!.userId, updatedBy: req.identity!.userId } });
    ok(res, row, "模板条件已创建");
  } catch (error) { next(error); }
});

templatesRouter.patch("/:id/conditions/:conditionId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const current = await conditionOf(template.id, parseId(req.params.conditionId, "conditionId"));
    const fields = conditionFields(bodyOf(req), current);
    await checkConditionOrg(fields.orgId);
    const row = await prisma.dtaTemplateCondition.update({ where: { id: current.id }, data: { ...fields, updatedBy: req.identity!.userId } });
    ok(res, row, "模板条件已更新");
  } catch (error) { next(error); }
});

templatesRouter.delete("/:id/conditions/:conditionId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const current = await conditionOf(template.id, parseId(req.params.conditionId, "conditionId"));
    const row = await prisma.dtaTemplateCondition.update({ where: { id: current.id }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
    ok(res, row, "模板条件已删除");
  } catch (error) { next(error); }
});

templatesRouter.get("/:id/employees", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const rows = await prisma.dtaTemplateEmployee.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ priority: "asc" }, { id: "asc" }] });
    const ids = rows.map((row) => row.empId);
    const employees = ids.length === 0 ? [] : await prisma.dtaEmployee.findMany({ where: { tenantId: TENANT_ID, id: { in: ids }, isDeleted: 0 }, select: { id: true, empName: true, orgId: true, empTypeCode: true, postCode: true } });
    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    ok(res, rows.filter((row) => req.identity?.role !== "manager" || employeeMap.get(row.empId)?.orgId === req.identity?.orgId).map((row) => ({ ...row, employee: employeeMap.get(row.empId) ?? null })));
  } catch (error) { next(error); }
});

templatesRouter.post("/:id/employees", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const body = bodyOf(req);
    const ids = associationEmployeeIds(body);
    const priority = associationPriority(body.priority ?? 0);
    const rows = [];
    for (const empId of ids) {
      await employeeForAssociation(req, empId);
      const existing = await prisma.dtaTemplateEmployee.findFirst({ where: { tenantId: TENANT_ID, templateId: template.id, empId, isDeleted: 0 } });
      if (existing) {
        rows.push(await prisma.dtaTemplateEmployee.update({ where: { id: existing.id }, data: { priority, updatedBy: req.identity!.userId } }));
        continue;
      }
      const deleted = await prisma.dtaTemplateEmployee.findFirst({ where: { tenantId: TENANT_ID, templateId: template.id, empId, isDeleted: 1 } });
      rows.push(deleted
        ? await prisma.dtaTemplateEmployee.update({ where: { id: deleted.id }, data: { priority, isDeleted: 0, updatedBy: req.identity!.userId } })
        : await prisma.dtaTemplateEmployee.create({ data: { tenantId: TENANT_ID, templateId: template.id, empId, priority, createdBy: req.identity!.userId, updatedBy: req.identity!.userId } }));
    }
    ok(res, { associations: rows, created: rows.length }, "员工直绑已保存");
  } catch (error) { next(error); }
});

templatesRouter.patch("/:id/employees/:associationId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const current = await employeeAssociationOf(template.id, parseId(req.params.associationId, "associationId"));
    await employeeForAssociation(req, current.empId);
    const priority = associationPriority(bodyOf(req).priority);
    ok(res, await prisma.dtaTemplateEmployee.update({ where: { id: current.id }, data: { priority, updatedBy: req.identity!.userId } }), "员工直绑优先级已更新");
  } catch (error) { next(error); }
});

templatesRouter.delete("/:id/employees/:associationId", requireRole("admin", "manager"), async (req, res, next) => {
  try {
    const template = await templateOf(parseId(req.params.id, "id"));
    const current = await employeeAssociationOf(template.id, parseId(req.params.associationId, "associationId"));
    await employeeForAssociation(req, current.empId);
    ok(res, await prisma.dtaTemplateEmployee.update({ where: { id: current.id }, data: { isDeleted: 1, updatedBy: req.identity!.userId } }), "员工直绑已删除");
  } catch (error) { next(error); }
});
