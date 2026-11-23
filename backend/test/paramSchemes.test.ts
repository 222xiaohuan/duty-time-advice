import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { generateForManager } from "../src/lib/templateGeneration";
import { DtaBaselineRule, DtaRosterabilityStatus, DtaSubmitMode } from "../src/types/enums";

const app = createApp();
const admin = { "x-mock-role": "admin", "x-mock-user-id": "9001" };
const manager = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const fullTime = { "x-mock-role": "employee", "x-mock-user-id": "401" };
const partTime = { "x-mock-role": "employee", "x-mock-user-id": "402" };
const by = { createdBy: 9001, updatedBy: 9001 };
const rules = [
  { empTypeCode: "FULL_TIME", cutoffDays: 0, baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE, empEditEnable: 1, priorityRosterEnable: 1, autoGenRangeWeek: 2 },
  { empTypeCode: "CONTRACT_PT", cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, priorityRosterEnable: 0, autoGenRangeWeek: 4 },
  { empTypeCode: "CASUAL_PT", cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, priorityRosterEnable: 0, autoGenRangeWeek: 4 },
];

beforeAll(async () => {
  await prisma.dtaOrg.createMany({ data: [41, 42].map((id) => ({ id, tenantId: 1, orgName: `Scheme org ${id}`, ...by })) });
  await prisma.dtaEmployee.createMany({ data: [
    { id: 401, tenantId: 1, orgId: 41, empName: "Scheme full time", empTypeCode: "FULL_TIME", postCode: "TEST", ...by },
    { id: 402, tenantId: 1, orgId: 41, empName: "Scheme contract PT", empTypeCode: "CONTRACT_PT", postCode: "TEST", ...by },
    { id: 403, tenantId: 1, orgId: 41, empName: "Scheme casual PT", empTypeCode: "CASUAL_PT", postCode: "TEST", ...by },
  ] });
  await prisma.dtaRosterabilityStatusDict.upsert({
    where: { tenantId_statusCode: { tenantId: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE } },
    update: { enabled: 1, empSelfEdit: 1 },
    create: { tenantId: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE, statusName: "优先排", colorHex: "#2e8b57", allowSchedule: 1, enabled: 1, empSelfEdit: 1, ...by },
  });
});

describe("组织与员工类型参数方案", () => {
  let schemeId: number;

  it("仅管理员可建方案，校验完整员工类型与合法矩阵", async () => {
    expect((await request(app).post("/api/param-schemes").set(manager).send({ schemeName: "标准方案", rules })).status).toBe(403);
    expect((await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "缺少类型", rules: rules.slice(0, 2) })).status).toBe(400);
    expect((await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "重复类型", rules: [rules[0], rules[0]] })).status).toBe(400);
    expect((await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "非法模式", rules: [{ ...rules[0], submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE }, rules[1], rules[2]] })).status).toBe(400);
    const created = await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "标准方案", description: "基础员工报备规则", rules });
    expect(created.status).toBe(200);
    schemeId = created.body.data.id;
    expect((await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "标准方案", rules })).status).toBe(400);
    const edited = await request(app).patch(`/api/param-schemes/${schemeId}`).set(admin).send({ schemeName: "改名", description: "更新后的说明", rules });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ schemeName: "改名", description: "更新后的说明" });
    expect(edited.body.data.rules).toHaveLength(3);
  });

  it("批量应用原子更新两组织，优先排按员工类型生效", async () => {
    expect((await request(app).post(`/api/param-schemes/${schemeId}/assign`).set(manager).send({ orgIds: [41, 42] })).status).toBe(403);
    expect((await request(app).post(`/api/param-schemes/${schemeId}/assign`).set(admin).send({ orgIds: [41, 999] })).status).toBe(400);
    expect(await prisma.dtaParamGroup.count({ where: { orgId: 41 } })).toBe(0);
    const applied = await request(app).post(`/api/param-schemes/${schemeId}/assign`).set(admin).send({ orgIds: [41, 42] });
    expect(applied.body.data).toMatchObject({ updated: 2, orgIds: [41, 42] });
    expect((await prisma.dtaParamGroup.findMany({ where: { orgId: 41 }, orderBy: { empTypeCode: "asc" } })).map((row) => [row.empTypeCode, row.priorityRosterEnable, row.cutoffDays])).toEqual([["CASUAL_PT", 0, 3], ["CONTRACT_PT", 0, 3], ["FULL_TIME", 1, 0]]);
    expect((await request(app).get("/api/orgs").set(admin)).body.data).toContainEqual(expect.objectContaining({ id: 41, paramSchemeId: schemeId, schemeName: "改名" }));
    expect((await request(app).get("/api/me/rosterability-config").set(fullTime)).body.data.allowedStatuses.map((row: { statusCode: string }) => row.statusCode)).toContain("PRIORITY_ROSTERABLE");
    expect((await request(app).get("/api/me/rosterability-config").set(partTime)).body.data.allowedStatuses.map((row: { statusCode: string }) => row.statusCode)).not.toContain("PRIORITY_ROSTERABLE");
    const body = { businessDate: "2099-04-01", statusCode: "PRIORITY_ROSTERABLE", startTime: "09:00", endTime: "12:00", endDayOffset: 0 };
    expect((await request(app).post("/api/rosterability-records").set(fullTime).send(body)).status).toBe(200);
    expect((await request(app).post("/api/rosterability-records").set(partTime).send(body)).status).toBe(403);
    const template = await prisma.dtaTemplate.create({ data: { tenantId: 1, templateName: "Scheme priority", startDate: "2026-01-01", enabled: 1, ...by } });
    await prisma.dtaTemplateCondition.create({ data: { tenantId: 1, templateId: template.id, orgId: 41, priority: 1, ...by } });
    await prisma.dtaTemplateItem.create({ data: { tenantId: 1, templateId: template.id, weekday: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE, startTime: "08:00", endTime: "12:00", endDayOffset: 0, ...by } });
    const generated = await generateForManager(41, 9101, new Date("2026-11-15T00:00:00.000Z"));
    expect(generated.summary.created).toBe(2);
    expect(generated.skipped.filter((row) => row.empId === 402 && row.reason === "STATUS_DISABLED")).toHaveLength(4);
    expect(generated.skipped.filter((row) => row.empId === 403 && row.reason === "STATUS_DISABLED")).toHaveLength(4);
  });

  it("复制方案只改变重新应用的组织，旧方案规则保持不变", async () => {
    const revisedRules = rules.map((rule) => rule.empTypeCode === "CONTRACT_PT" ? { ...rule, cutoffDays: 0, priorityRosterEnable: 1 } : rule);
    const copy = await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "标准方案 v2", sourceSchemeId: schemeId, rules: revisedRules });
    expect(copy.status).toBe(200);
    expect((await request(app).post(`/api/param-schemes/${copy.body.data.id}/assign`).set(admin).send({ orgIds: [41] })).status).toBe(200);
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 41, empTypeCode: "CONTRACT_PT" } } })).priorityRosterEnable).toBe(1);
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 42, empTypeCode: "CONTRACT_PT" } } })).priorityRosterEnable).toBe(0);
    expect((await request(app).get("/api/param-schemes").set(admin)).body.data.find((row: { id: number }) => row.id === schemeId).rules.find((rule: { empTypeCode: string }) => rule.empTypeCode === "CONTRACT_PT").priorityRosterEnable).toBe(0);
    expect((await request(app).delete(`/api/param-schemes/${schemeId}`).set(admin)).status).toBe(400);
  });

  it("通用模板在授权时按员工类型和子组织生效", async () => {
    await prisma.dtaOrg.create({ data: { id: 43, tenantId: 1, orgName: "Scheme child", parentOrgId: 41, ...by } });
    const genericRule = { cutoffDays: 7, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, priorityRosterEnable: 1, autoGenRangeWeek: 12 };
    const created = await request(app).post("/api/param-schemes").set(admin).send({ schemeName: "授权通用模板", rule: genericRule });
    expect(created.status).toBe(200);
    expect(created.body.data.rule).toMatchObject(genericRule);
    expect(created.body.data.rules).toHaveLength(3);
    expect((await request(app).post(`/api/param-schemes/${created.body.data.id}/authorize`).set(admin).send({ orgIds: [41], empTypeCodes: ["PART_TIME"], includeChildren: 1 })).status).toBe(400);
    const authorized = await request(app).post(`/api/param-schemes/${created.body.data.id}/authorize`).set(admin).send({ orgIds: [41], empTypeCodes: ["CONTRACT_PT", "CASUAL_PT"], includeChildren: 1 });
    expect(authorized.status).toBe(200);
    expect(authorized.body.data.targetOrgIds).toEqual(expect.arrayContaining([41, 43]));
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 43, empTypeCode: "CONTRACT_PT" } } })).cutoffDays).toBe(7);
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 43, empTypeCode: "CASUAL_PT" } } })).cutoffDays).toBe(7);
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 41, empTypeCode: "FULL_TIME" } } })).cutoffDays).toBe(0);
    const listed = (await request(app).get("/api/param-schemes").set(admin)).body.data.find((row: { id: number }) => row.id === created.body.data.id);
    expect(listed.authorizations).toContainEqual(expect.objectContaining({ orgId: 41, empTypeCode: "CONTRACT_PT", includeChildren: 1 }));
    expect(listed.authorizations).toContainEqual(expect.objectContaining({ orgId: 41, empTypeCode: "CASUAL_PT", includeChildren: 1 }));
  });

  it("重新授权完整替换旧范围，并支持解除后删除模板", async () => {
    const scheme = (await request(app).get("/api/param-schemes").set(admin)).body.data.find((row: { schemeName: string }) => row.schemeName === "授权通用模板");
    expect(scheme).toBeDefined();
    const replaced = await request(app).post(`/api/param-schemes/${scheme.id}/authorize`).set(admin).send({ orgIds: [41], empTypeCodes: ["FULL_TIME"], includeChildren: 0 });
    expect(replaced.status).toBe(200);
    expect(await prisma.dtaParamSchemeAuthorization.findMany({ where: { schemeId: scheme.id }, select: { orgId: true, empTypeCode: true } })).toEqual([{ orgId: 41, empTypeCode: "FULL_TIME" }]);
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 43, empTypeCode: "CONTRACT_PT" } } })).isDeleted).toBe(1);
    expect((await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 43, empTypeCode: "CASUAL_PT" } } })).isDeleted).toBe(1);
    const cleared = await request(app).delete(`/api/param-schemes/${scheme.id}/authorize`).set(admin);
    expect(cleared.status).toBe(200);
    expect(await prisma.dtaParamSchemeAuthorization.count({ where: { schemeId: scheme.id } })).toBe(0);
    expect((await request(app).delete(`/api/param-schemes/${scheme.id}`).set(admin)).status).toBe(200);
  });

  it("直接维护生效参数会解除方案关联，组织列表仍显示真实规则", async () => {
    const param = await prisma.dtaParamGroup.findUniqueOrThrow({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 42, empTypeCode: "FULL_TIME" } } });
    expect((await request(app).patch(`/api/param-groups/${param.id}`).set(admin).send({ cutoffDays: 5 })).status).toBe(200);
    const org = (await request(app).get("/api/orgs").set(admin)).body.data.find((row: { id: number }) => row.id === 42);
    expect(org).toMatchObject({ paramSchemeId: null, schemeName: null });
    expect(org.rules.find((rule: { empTypeCode: string }) => rule.empTypeCode === "FULL_TIME").cutoffDays).toBe(5);
  });
});
