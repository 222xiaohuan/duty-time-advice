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

function parseGenericRule(value: unknown) {
  if (!value || typeof value !== "object") bad("参数模板规则格式错误");
  const row = value as Record<string, unknown>;
  const rule = {
    cutoffDays: row.cutoffDays,
    baselineRule: parseEnum(row.baselineRule, Object.values(DtaBaselineRule), "baselineRule"),
    submitMode: parseEnum(row.submitMode, Object.values(DtaSubmitMode), "submitMode"),
    empEditEnable: parseFlag(row.empEditEnable, "empEditEnable"),
    priorityRosterEnable: parseFlag(row.priorityRosterEnable, "priorityRosterEnable"),
    autoGenRangeWeek: row.autoGenRangeWeek,
  };
  validateParamValues({ ...rule, templateAutoGenEnable: 0, autoGenWeekday: null, autoGenTime: null, conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK });
  return { ...rule, cutoffDays: Number(rule.cutoffDays), autoGenRangeWeek: Number(rule.autoGenRangeWeek) };
}

function parseSchemeRules(body: Record<string, unknown>) {
  if (body.rule !== undefined) {
    const generic = parseGenericRule(body.rule);
    return Object.values(EMP_TYPE_CODES).map((empTypeCode) => ({ empTypeCode, ...generic }));
  }
  return parseRules(body.rules);
}

function genericRule(rules: Array<{ empTypeCode: string; cutoffDays: number; baselineRule: DtaBaselineRule; submitMode: DtaSubmitMode; empEditEnable: number; priorityRosterEnable: number; autoGenRangeWeek: number }>) {
  const rule = rules.find((item) => item.empTypeCode === EMP_TYPE_CODES.FULL_TIME) ?? rules[0];
  if (!rule) return null;
  return { cutoffDays: rule.cutoffDays, baselineRule: rule.baselineRule, submitMode: rule.submitMode, empEditEnable: rule.empEditEnable, priorityRosterEnable: rule.priorityRosterEnable, autoGenRangeWeek: rule.autoGenRangeWeek };
}

function parseEmpTypes(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > Object.values(EMP_TYPE_CODES).length) bad("请选择至少一种员工类型");
  const empTypes = value.map((item) => String(item));
  if (new Set(empTypes).size !== empTypes.length || empTypes.some((item) => !Object.values(EMP_TYPE_CODES).includes(item as typeof EMP_TYPE_CODES[keyof typeof EMP_TYPE_CODES]))) bad("员工类型编码无效");
  return empTypes;
}

async function descendants(orgIds: number[]) {
  const all = await prisma.dtaOrg.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 }, select: { id: true, parentOrgId: true } });
  const children = new Map<number, number[]>();
  for (const row of all) children.set(row.parentOrgId ?? 0, [...(children.get(row.parentOrgId ?? 0) ?? []), row.id]);
  const result = new Set(orgIds);
  const queue = [...orgIds];
  while (queue.length) {
    const next = queue.shift()!;
    for (const child of children.get(next) ?? []) if (!result.has(child)) { result.add(child); queue.push(child); }
  }
  return [...result];
}

async function authorizationTargets(rows: Array<{ orgId: number; empTypeCode: string; includeChildren: number }>) {
  const targets = new Map<string, { orgId: number; empTypeCode: string }>();
  for (const row of rows) {
    const orgIds = row.includeChildren ? await descendants([row.orgId]) : [row.orgId];
    for (const orgId of orgIds) targets.set(`${orgId}:${row.empTypeCode}`, { orgId, empTypeCode: row.empTypeCode });
  }
  return [...targets.values()];
}

paramSchemesRouter.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const [schemes, rules, orgs, authorizations] = await Promise.all([
      prisma.dtaParamScheme.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 }, orderBy: { id: "asc" } }),
      prisma.dtaParamSchemeRule.findMany({ where: { tenantId: TENANT_ID }, orderBy: [{ schemeId: "asc" }, { empTypeCode: "asc" }] }),
      prisma.dtaOrg.findMany({ where: { tenantId: TENANT_ID, isDeleted: 0 }, select: { id: true, paramSchemeId: true } }),
      prisma.dtaParamSchemeAuthorization.findMany({ where: { tenantId: TENANT_ID }, orderBy: [{ schemeId: "asc" }, { orgId: "asc" }, { empTypeCode: "asc" }] }),
    ]);
    ok(res, schemes.map((scheme) => ({ ...scheme,
      rules: rules.filter((rule) => rule.schemeId === scheme.id),
      rule: genericRule(rules.filter((rule) => rule.schemeId === scheme.id)),
      assignedOrgIds: [...new Set([...orgs.filter((org) => org.paramSchemeId === scheme.id).map((org) => org.id), ...authorizations.filter((row) => row.schemeId === scheme.id).map((row) => row.orgId)])],
      authorizations: authorizations.filter((row) => row.schemeId === scheme.id),
    })));
  } catch (error) { next(error); }
});

paramSchemesRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const schemeName = typeof body.schemeName === "string" ? body.schemeName.trim() : "";
    const description = body.description == null ? null : typeof body.description === "string" ? body.description.trim() : "";
    if (!schemeName || schemeName.length > 80) bad("方案名称须为 1 至 80 个字符");
    if (description && description.length > 500) bad("方案描述不能超过 500 个字符");
    const rules = parseSchemeRules(body);
    const sourceSchemeId = body.sourceSchemeId == null ? null : parseId(body.sourceSchemeId, "sourceSchemeId");
    if (sourceSchemeId && !(await prisma.dtaParamScheme.findFirst({ where: { id: sourceSchemeId, tenantId: TENANT_ID, isDeleted: 0 } }))) bad("来源方案不存在");
    if (await prisma.dtaParamScheme.findFirst({ where: { tenantId: TENANT_ID, schemeName, isDeleted: 0 } })) bad("方案名称已存在");
    const scheme = await prisma.$transaction(async (tx) => {
      const created = await tx.dtaParamScheme.create({ data: { tenantId: TENANT_ID, schemeName, description: description || null, sourceSchemeId, createdBy: req.identity!.userId } });
      await tx.dtaParamSchemeRule.createMany({ data: rules.map((rule) => ({ tenantId: TENANT_ID, schemeId: created.id, ...rule })) });
      return created;
    });
    ok(res, { ...scheme, rules, rule: genericRule(rules), assignedOrgIds: [], authorizations: [] }, "参数方案已创建");
  } catch (error) { next(error); }
});

paramSchemesRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const schemeId = parseId(req.params.id, "id");
    const current = await prisma.dtaParamScheme.findFirst({ where: { id: schemeId, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!current) throw new AppError(ErrorCode.NOT_FOUND, "参数模板不存在", 404);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const schemeName = body.schemeName === undefined ? current.schemeName : typeof body.schemeName === "string" ? body.schemeName.trim() : "";
    const description = body.description === undefined ? current.description : body.description == null ? null : typeof body.description === "string" ? body.description.trim() : "";
    if (!schemeName || schemeName.length > 80) bad("方案名称须为 1 至 80 个字符");
    if (description && description.length > 500) bad("方案描述不能超过 500 个字符");
    if (await prisma.dtaParamScheme.findFirst({ where: { tenantId: TENANT_ID, schemeName, isDeleted: 0, id: { not: schemeId } } })) bad("方案名称已存在");
    const rules = body.rule === undefined && body.rules === undefined ? null : parseSchemeRules(body);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.dtaParamScheme.update({ where: { id: schemeId }, data: { schemeName, description: description || null } });
      if (rules) {
        for (const rule of rules) await tx.dtaParamSchemeRule.upsert({ where: { schemeId_empTypeCode: { schemeId, empTypeCode: rule.empTypeCode } }, create: { tenantId: TENANT_ID, schemeId, ...rule }, update: rule });
      }
      return row;
    });
    const nextRules = rules ?? await prisma.dtaParamSchemeRule.findMany({ where: { tenantId: TENANT_ID, schemeId } });
    const assignedOrgIds = (await prisma.dtaOrg.findMany({ where: { tenantId: TENANT_ID, paramSchemeId: schemeId, isDeleted: 0 }, select: { id: true } })).map((row) => row.id);
    const authorizationRows = await prisma.dtaParamSchemeAuthorization.findMany({ where: { tenantId: TENANT_ID, schemeId } });
    ok(res, { ...updated, rules: nextRules, rule: genericRule(nextRules), assignedOrgIds: [...new Set([...assignedOrgIds, ...authorizationRows.map((row) => row.orgId)])], authorizations: authorizationRows }, "参数模板已更新");
  } catch (error) { next(error); }
});

paramSchemesRouter.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const schemeId = parseId(req.params.id, "id");
    const scheme = await prisma.dtaParamScheme.findFirst({ where: { id: schemeId, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!scheme) throw new AppError(ErrorCode.NOT_FOUND, "参数模板不存在", 404);
    const assigned = await prisma.dtaOrg.count({ where: { tenantId: TENANT_ID, paramSchemeId: schemeId, isDeleted: 0 } }) + await prisma.dtaParamSchemeAuthorization.count({ where: { tenantId: TENANT_ID, schemeId } });
    if (assigned > 0) bad("该参数模板已授权组织，请先解除组织授权后再删除");
    await prisma.$transaction(async (tx) => {
      await tx.dtaParamSchemeRule.deleteMany({ where: { tenantId: TENANT_ID, schemeId } });
      await tx.dtaParamScheme.update({ where: { id: schemeId }, data: { isDeleted: 1 } });
    });
    ok(res, { id: schemeId }, "参数模板已删除");
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
      prisma.dtaParamScheme.findFirst({ where: { id: schemeId, tenantId: TENANT_ID, isDeleted: 0 } }),
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

paramSchemesRouter.post("/:id/authorize", requireRole("admin"), async (req, res, next) => {
  try {
    const schemeId = parseId(req.params.id, "id");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const orgIdsValue = body.orgIds;
    if (!Array.isArray(orgIdsValue) || orgIdsValue.length < 1 || orgIdsValue.length > 500) bad("请选择至少一个组织");
    const rootOrgIds = [...new Set(orgIdsValue.map((value) => parseId(value, "orgId")))];
    const empTypeCodes = parseEmpTypes(body.empTypeCodes);
    const includeChildren = parseFlag(body.includeChildren, "includeChildren", 0);
    const [scheme, rules, orgs, allAuthorizations] = await Promise.all([
      prisma.dtaParamScheme.findFirst({ where: { id: schemeId, tenantId: TENANT_ID, isDeleted: 0 } }),
      prisma.dtaParamSchemeRule.findMany({ where: { tenantId: TENANT_ID, schemeId }, orderBy: { empTypeCode: "asc" } }),
      prisma.dtaOrg.findMany({ where: { tenantId: TENANT_ID, id: { in: rootOrgIds }, isDeleted: 0 } }),
      prisma.dtaParamSchemeAuthorization.findMany({ where: { tenantId: TENANT_ID }, select: { schemeId: true, orgId: true, empTypeCode: true, includeChildren: true } }),
    ]);
    if (!scheme) throw new AppError(ErrorCode.NOT_FOUND, "参数模板不存在", 404);
    if (orgs.length !== rootOrgIds.length) bad("包含不存在的组织");
    const rule = genericRule(rules);
    if (!rule) bad("参数模板规则不完整");
    const targetOrgIds = includeChildren ? await descendants(rootOrgIds) : rootOrgIds;
    const selectedKeys = new Set(targetOrgIds.flatMap((orgId) => empTypeCodes.map((empTypeCode) => `${orgId}:${empTypeCode}`)));
    const targetsByScheme = new Map<number, Awaited<ReturnType<typeof authorizationTargets>>>();
    for (const existingSchemeId of new Set(allAuthorizations.map((row) => row.schemeId))) {
      targetsByScheme.set(existingSchemeId, await authorizationTargets(allAuthorizations.filter((row) => row.schemeId === existingSchemeId)));
    }
    const previousTargets = targetsByScheme.get(schemeId) ?? [];
    const staleTargets = previousTargets.filter((item) => !selectedKeys.has(`${item.orgId}:${item.empTypeCode}`));
    // A grant with children has no exclusion field; split only grants that lose part of their scope.
    const displaced = [...targetsByScheme.entries()].filter(([existingSchemeId, targets]) => existingSchemeId !== schemeId && targets.some((item) => selectedKeys.has(`${item.orgId}:${item.empTypeCode}`)));
    const remainingDisplaced = [] as Array<{ tenantId: number; schemeId: number; orgId: number; empTypeCode: string; includeChildren: number; createdBy: number; updatedBy: number }>;
    for (const [existingSchemeId, targets] of displaced) {
      const rows = allAuthorizations.filter((row) => row.schemeId === existingSchemeId);
      const preserved = [] as typeof rows;
      for (const row of rows) {
        if (!(await authorizationTargets([row])).some((item) => selectedKeys.has(`${item.orgId}:${item.empTypeCode}`))) preserved.push(row);
      }
      const preservedKeys = new Set((await authorizationTargets(preserved)).map((item) => `${item.orgId}:${item.empTypeCode}`));
      remainingDisplaced.push(...preserved.map((row) => ({ ...row, tenantId: TENANT_ID, createdBy: req.identity!.userId, updatedBy: req.identity!.userId })));
      remainingDisplaced.push(...targets.filter((item) => !selectedKeys.has(`${item.orgId}:${item.empTypeCode}`) && !preservedKeys.has(`${item.orgId}:${item.empTypeCode}`)).map((item) => ({ tenantId: TENANT_ID, schemeId: existingSchemeId, orgId: item.orgId, empTypeCode: item.empTypeCode, includeChildren: 0, createdBy: req.identity!.userId, updatedBy: req.identity!.userId })));
    }
    const owners = new Map<string, number>();
    for (const [existingSchemeId, targets] of targetsByScheme) for (const item of targets) owners.set(`${item.orgId}:${item.empTypeCode}`, existingSchemeId);
    for (const item of previousTargets) owners.delete(`${item.orgId}:${item.empTypeCode}`);
    for (const key of selectedKeys) owners.set(key, schemeId);
    const affectedOrgIds = [...new Set([...targetOrgIds, ...staleTargets.map((item) => item.orgId)])];
    await prisma.$transaction(async (tx) => {
      if (displaced.length) {
        await tx.dtaParamSchemeAuthorization.deleteMany({ where: { tenantId: TENANT_ID, schemeId: { in: displaced.map(([existingSchemeId]) => existingSchemeId) } } });
        if (remainingDisplaced.length) await tx.dtaParamSchemeAuthorization.createMany({ data: remainingDisplaced });
      }
      await tx.dtaParamSchemeAuthorization.deleteMany({ where: { tenantId: TENANT_ID, schemeId } });
      for (const stale of staleTargets) {
        if (!owners.has(`${stale.orgId}:${stale.empTypeCode}`)) await tx.dtaParamGroup.updateMany({ where: { tenantId: TENANT_ID, orgId: stale.orgId, empTypeCode: stale.empTypeCode, isDeleted: 0 }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
      }
      for (const orgId of targetOrgIds) {
        for (const empTypeCode of empTypeCodes) {
          const values = { cutoffDays: rule.cutoffDays, baselineRule: rule.baselineRule, submitMode: rule.submitMode,
            empEditEnable: rule.empEditEnable, priorityRosterEnable: rule.priorityRosterEnable,
            autoGenRangeWeek: rule.autoGenRangeWeek, templateAutoGenEnable: 0, autoGenWeekday: null,
            autoGenTime: null, conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK,
            fieldSiteEnable: 0, enableApproval: 0, specialTagDiffEnable: 0, isDeleted: 0, updatedBy: req.identity!.userId };
          await tx.dtaParamGroup.upsert({ where: { tenantId_orgId_empTypeCode: { tenantId: TENANT_ID, orgId, empTypeCode } }, create: { tenantId: TENANT_ID, orgId, empTypeCode, ...values, createdBy: req.identity!.userId }, update: values });
        }
      }
      for (const orgId of rootOrgIds) for (const empTypeCode of empTypeCodes) {
        await tx.dtaParamSchemeAuthorization.create({ data: { tenantId: TENANT_ID, schemeId, orgId, empTypeCode, includeChildren, createdBy: req.identity!.userId, updatedBy: req.identity!.userId } });
      }
      for (const orgId of affectedOrgIds) {
        const assigned = Object.values(EMP_TYPE_CODES).map((empTypeCode) => owners.get(`${orgId}:${empTypeCode}`));
        await tx.dtaOrg.update({ where: { id: orgId }, data: { paramSchemeId: assigned.every((owner) => owner && owner === assigned[0]) ? assigned[0] : null, updatedBy: req.identity!.userId } });
      }
    });
    ok(res, { schemeId, rootOrgIds, targetOrgIds, empTypeCodes, includeChildren }, "参数模板授权已保存");
  } catch (error) { next(error); }
});

paramSchemesRouter.delete("/:id/authorize", requireRole("admin"), async (req, res, next) => {
  try {
    const schemeId = parseId(req.params.id, "id");
    const scheme = await prisma.dtaParamScheme.findFirst({ where: { id: schemeId, tenantId: TENANT_ID, isDeleted: 0 } });
    if (!scheme) throw new AppError(ErrorCode.NOT_FOUND, "参数模板不存在", 404);
    const authorizations = await prisma.dtaParamSchemeAuthorization.findMany({ where: { tenantId: TENANT_ID, schemeId }, select: { orgId: true, empTypeCode: true, includeChildren: true } });
    const targets = await authorizationTargets(authorizations);
    await prisma.$transaction(async (tx) => {
      await tx.dtaParamSchemeAuthorization.deleteMany({ where: { tenantId: TENANT_ID, schemeId } });
      for (const target of targets) {
        await tx.dtaParamGroup.updateMany({ where: { tenantId: TENANT_ID, orgId: target.orgId, empTypeCode: target.empTypeCode, isDeleted: 0 }, data: { isDeleted: 1, updatedBy: req.identity!.userId } });
      }
      await tx.dtaOrg.updateMany({ where: { tenantId: TENANT_ID, paramSchemeId: schemeId }, data: { paramSchemeId: null, updatedBy: req.identity!.userId } });
    });
    ok(res, { schemeId, removed: targets.length }, "参数模板授权已解除");
  } catch (error) { next(error); }
});
