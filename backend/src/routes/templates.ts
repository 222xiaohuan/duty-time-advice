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

async function checkItemStatus(statusCode: string): Promise<void> {
  const status = await prisma.dtaRosterabilityStatusDict.findFirst({ where: { tenantId: TENANT_ID, statusCode: statusCode as "ROSTERABLE" | "UNROSTERABLE", enabled: 1, isDeleted: 0 } });
  if (!status) bad("该可排性状态未启用");
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
    const [items, conditions] = await Promise.all([
      prisma.dtaTemplateItem.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { id: "asc" }] }),
      prisma.dtaTemplateCondition.findMany({ where: { tenantId: TENANT_ID, templateId: template.id, isDeleted: 0 }, orderBy: [{ priority: "asc" }, { id: "asc" }] }),
    ]);
    ok(res, { ...template, items, conditions });
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
