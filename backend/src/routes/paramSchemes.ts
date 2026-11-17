import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError, ErrorCode, ok } from "../lib/response";
import { requireRole } from "../middleware/mockIdentity";
import { DtaBaselineRule, DtaConflictCheckMode, DtaSubmitMode, EMP_TYPE_CODES } from "../types/enums";
import { bad, isEmployeeType, parseEnum, parseFlag, parseId, validateParamValues, TENANT_ID } from "../lib/validation";

export const paramSchemesRouter = Router();

function parseRules(value: unknown) {
  if (!Array.isArray(value) || value.length !== Object.values(EMP_TYPE_CODES).length) bad("方案须包含全部员工类型规则");
  const rules = value.map((item: unknown) => {
    if (!item || typeof item !== "object") bad("员工类型规则格式错误");
    const row = item as Record<string, unknown>;
    if (!isEmployeeType(row.empTypeCode)) bad("员工类型编码无效");
    const rule = {
      empTypeCode: row.empTypeCode,
      cutoffDays: row.cutoffDays,
      baselineRule: parseEnum(row.baselineRule, Object.values(DtaBaselineRule), "baselineRule"),
      submitMode: parseEnum(row.submitMode, Object.values(DtaSubmitMode), "submitMode"),
      empEditEnable: parseFlag(row.empEditEnable, "empEditEnable"),
      priorityRosterEnable: parseFlag(row.priorityRosterEnable, "priorityRosterEnable"),
      autoGenRangeWeek: row.autoGenRangeWeek,
    };
    validateParamValues({ ...rule, templateAutoGenEnable: 0, autoGenWeekday: null, autoGenTime: null,
      conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK });
    return { ...rule, cutoffDays: Number(rule.cutoffDays), autoGenRangeWeek: Number(rule.autoGenRangeWeek) };
  });
  if (new Set(rules.map((row) => row.empTypeCode)).size !== Object.values(EMP_TYPE_CODES).length) bad("方案中员工类型不能重复");
  return rules;
}

paramSchemesRouter.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const [schemes, rules, orgs] = await Promise.all([
      prisma.dtaParamScheme.findMany({ where: { tenantId: TENANT_ID }, orderBy: { id: "asc" } }),
      prisma.dtaParamSchemeRule.findMany({ where: { tenantId: TENANT_ID }, orderBy: { empTypeCode: "asc" } }),
      prisma.dtaOrg.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 }, select: { id: true, paramSchemeId: true } }),
    ]);
    ok(res, schemes.map((scheme) => ({ ...scheme,
      rules: rules.filter((rule) => rule.schemeId === scheme.id),
      assignedOrgIds: orgs.filter((org) => org.paramSchemeId === scheme.id).map((org) => org.id),
    })));
  } catch (error) { next(error); }
});

paramSchemesRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const schemeName = typeof body.schemeName === "string" ? body.schemeName.trim() : "";
    if (!schemeName || schemeName.length > 80) bad("方案名称须为 1 至 80 个字符");
    const rules = parseRules(body.rules);
    const sourceSchemeId = body.sourceSchemeId == null ? null : parseId(body.sourceSchemeId, "sourceSchemeId");
    if (sourceSchemeId && !(await prisma.dtaParamScheme.findFirst({ where: { id: sourceSchemeId, tenantId: TENANT_ID } }))) bad("来源方案不存在");
    if (await prisma.dtaParamScheme.findFirst({ where: { tenantId: TENANT_ID, schemeName } })) bad("方案名称已存在");
    const scheme = await prisma.$transaction(async (tx) => {
      const created = await tx.dtaParamScheme.create({ data: { tenantId: TENANT_ID, schemeName, sourceSchemeId, createdBy: req.identity!.userId } });
      await tx.dtaParamSchemeRule.createMany({ data: rules.map((rule) => ({ tenantId: TENANT_ID, schemeId: created.id, ...rule })) });
      return created;
    });
    ok(res, { ...scheme, rules, assignedOrgIds: [] }, "参数方案已创建");
  } catch (error) { next(error); }
});

paramSchemesRouter.post("/:id/assign", requireRole("admin"), async (req, res, next) => {
  try {
    const schemeId = parseId(req.params.id, "id");
    const orgIdsValue = ((req.body ?? {}) as Record<string, unknown>).orgIds;
    if (!Array.isArray(orgIdsValue) || orgIdsValue.length < 1 || orgIdsValue.length > 500) bad("请选择 1 至 500 个组织");
    const orgIds = orgIdsValue.map((value) => parseId(value, "orgId"));
    if (new Set(orgIds).size !== orgIds.length) bad("组织不能重复");
    const [scheme, rules, orgs] = await Promise.all([
      prisma.dtaParamScheme.findFirst({ where: { id: schemeId, tenantId: TENANT_ID } }),
      prisma.dtaParamSchemeRule.findMany({ where: { tenantId: TENANT_ID, schemeId } }),
      prisma.dtaOrg.findMany({ where: { tenantId: TENANT_ID, id: { in: orgIds }, isDeleted: 0 } }),
    ]);
    if (!scheme) throw new AppError(ErrorCode.NOT_FOUND, "参数方案不存在", 404);
    if (orgs.length !== orgIds.length) bad("包含不存在的组织");
    if (rules.length !== Object.values(EMP_TYPE_CODES).length) bad("方案员工类型规则不完整");
    await prisma.$transaction(async (tx) => {
      for (const orgId of orgIds) {
        for (const rule of rules) {
          const values = { cutoffDays: rule.cutoffDays, baselineRule: rule.baselineRule, submitMode: rule.submitMode,
            empEditEnable: rule.empEditEnable, priorityRosterEnable: rule.priorityRosterEnable,
            autoGenRangeWeek: rule.autoGenRangeWeek, templateAutoGenEnable: 0, autoGenWeekday: null,
            autoGenTime: null, conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK,
            fieldSiteEnable: 0, enableApproval: 0, specialTagDiffEnable: 0, isDeleted: 0, updatedBy: req.identity!.userId };
          await tx.dtaParamGroup.upsert({ where: { tenantId_orgId_empTypeCode: { tenantId: TENANT_ID, orgId, empTypeCode: rule.empTypeCode } },
            create: { tenantId: TENANT_ID, orgId, empTypeCode: rule.empTypeCode, ...values, createdBy: req.identity!.userId },
            update: values });
        }
        await tx.dtaOrg.update({ where: { id: orgId }, data: { paramSchemeId: schemeId, updatedBy: req.identity!.userId } });
      }
    });
    ok(res, { schemeId, orgIds, updated: orgIds.length }, "参数方案已应用");
  } catch (error) { next(error); }
});
