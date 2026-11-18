import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { generateForManager } from "../src/lib/templateGeneration";
import { hkDateTime } from "../src/lib/time";
import { DtaBaselineRule, DtaConflictCheckMode, DtaRosterabilityStatus, DtaSubmitMode } from "../src/types/enums";

const app = createApp();
const admin = { "x-mock-role": "admin", "x-mock-user-id": "9001" };
const manager1 = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const now = new Date("2026-11-15T00:00:00.000Z");

beforeAll(async () => {
  const by = { createdBy: 9001, updatedBy: 9001 };
  await prisma.dtaTenant.create({ data: { id: 1, tenantName: "Test", ...by } });
  for (const id of [1, 2]) {
    await prisma.dtaOrg.upsert({ where: { id }, update: { orgName: `Org ${id}` }, create: { id, tenantId: 1, orgName: `Org ${id}`, ...by } });
  }
  await prisma.dtaEmployee.createMany({ data: [
    { id: 1, tenantId: 1, orgId: 1, empName: "Employee 1", empTypeCode: "FULL_TIME", postCode: "BETTING_SERVICE", ...by },
    { id: 2, tenantId: 1, orgId: 2, empName: "Employee 2", empTypeCode: "FULL_TIME", postCode: "BETTING_SERVICE", ...by },
  ] });
  for (const [statusCode, statusName, allowSchedule] of [[DtaRosterabilityStatus.ROSTERABLE, "可排", 1], [DtaRosterabilityStatus.UNROSTERABLE, "不可排", 0]] as const) {
    await prisma.dtaRosterabilityStatusDict.upsert({
      where: { tenantId_statusCode: { tenantId: 1, statusCode } },
      update: { enabled: 1, empSelfEdit: 1 },
      create: { tenantId: 1, statusCode, statusName, allowSchedule, empSelfEdit: 1, enabled: 1, ...by },
    });
  }
  for (const orgId of [1, 2]) await prisma.dtaParamGroup.create({ data: {
    tenantId: 1, orgId, empTypeCode: "FULL_TIME", cutoffDays: 0,
    baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE,
    empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 1,
    conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK, ...by,
  } });
});

describe("T003 模板维护与经理生成", () => {
  let templateId: number;
  let itemId: number;

  it("管理员和主管可维护模板、跨午夜明细和条件；员工不能访问", async () => {
    const created = await request(app).post("/api/templates").set(admin).send({ templateName: "夜班模板", description: "跨午夜夜班规则", startDate: "2026-01-01", enabled: 1 });
    expect(created.status).toBe(200);
    expect(created.body.data.description).toBe("跨午夜夜班规则");
    templateId = created.body.data.id;
    const item = await request(app).post(`/api/templates/${templateId}/items`).set(admin).send({ weekday: 1, statusCode: "ROSTERABLE", startTime: "22:00", endTime: "02:00", endDayOffset: 1 });
    expect(item.status).toBe(200);
    itemId = item.body.data.id;
    const conflictItem = await request(app).post(`/api/templates/${templateId}/items`).set(admin).send({ weekday: 3, statusCode: "UNROSTERABLE", startTime: "09:00", endTime: "12:00", endDayOffset: 0 });
    expect(conflictItem.status).toBe(200);
    const overlapItem = await request(app).post(`/api/templates/${templateId}/items`).set(admin).send({ weekday: 1, statusCode: "UNROSTERABLE", startTime: "23:00", endTime: "01:00", endDayOffset: 1 });
    expect(overlapItem.status).toBe(400);
    expect(overlapItem.body.msg).toContain("时间段不能重叠");
    const condition = await request(app).post(`/api/templates/${templateId}/conditions`).set(admin).send({ priority: 1, orgId: 1, empTypeCode: "FULL_TIME", postCode: "BETTING_SERVICE" });
    expect(condition.status).toBe(200);
    const read = await request(app).get(`/api/templates/${templateId}`).set(admin);
    expect(read.body.data.items).toHaveLength(2);
    expect(read.body.data.conditions).toHaveLength(1);
    const managerUpdate = await request(app).patch(`/api/templates/${templateId}`).set(manager1).send({ enabled: 0 });
    expect(managerUpdate.status).toBe(200);
    expect(managerUpdate.body.data.enabled).toBe(0);
    expect((await request(app).get(`/api/templates/${templateId}`).set(manager1)).status).toBe(200);
    expect((await request(app).patch(`/api/templates/${templateId}`).set(manager1).send({ enabled: 1 })).status).toBe(200);
    expect((await request(app).get("/api/templates").set({ "x-mock-role": "employee", "x-mock-user-id": "101" })).status).toBe(403);
    expect((await request(app).post(`/api/templates/${templateId}/items`).set(admin).send({ weekday: 1, statusCode: "STANDBY", startTime: "10:00", endTime: "11:00" })).status).toBe(400);
  });

  it("只接受经理触发，并按组织隔离", async () => {
    expect((await request(app).post("/api/template-generation").set(admin).send({})).status).toBe(403);
    expect((await request(app).post("/api/template-generation").set({ ...manager1, "x-mock-org-id": "2" }).send({})).status).toBe(403);
    expect((await request(app).post("/api/template-generation").set(manager1).send({ templateId: 999999 })).status).toBe(404);
    const otherOrg = await generateForManager(2, 9102, now);
    expect(otherOrg.summary.created).toBe(0);
    expect(otherOrg.skipped.every((row) => row.empId === 2 || row.empId === 102)).toBe(true);
  });

  it("生成跨午夜时段，阻止有班次的不可排，并在重复点击及软删除后保持幂等", async () => {
    await prisma.dtaMockShift.create({ data: { tenantId: 1, orgId: 1, empId: 1, businessDate: "2026-11-18", shiftName: "工作班", startTime: hkDateTime("2026-11-18", "10:00"), endTime: hkDateTime("2026-11-18", "12:00"), durationMinutes: 120, createdBy: 9001, updatedBy: 9001 } });
    const first = await generateForManager(1, 9101, now);
    expect(first.startMonday).toBe("2026-11-16");
    expect(first.summary.created).toBe(1);
    expect(first.summary.shiftConflict).toBe(1);
    expect(first.skipped).toContainEqual(expect.objectContaining({ empId: 1, businessDate: "2026-11-18", reason: "SHIFT_CONFLICT" }));
    const record = await prisma.dtaRosterabilityRecord.findFirstOrThrow({ where: { templateItemId: itemId } });
    expect(record.businessDate).toBe("2026-11-16");
    expect(record.startTime.toISOString()).toBe("2026-11-16T14:00:00.000Z");
    expect(record.endTime.toISOString()).toBe("2026-11-16T18:00:00.000Z");
    expect(record.sourceCode).toBe("TEMPLATE_GEN");
    const repeated = await generateForManager(1, 9101, now);
    expect(repeated.summary.created).toBe(0);
    expect(repeated.summary.exists).toBe(1);
    await prisma.dtaRosterabilityRecord.update({ where: { id: record.id }, data: { isDeleted: 1 } });
    const afterDelete = await generateForManager(1, 9101, now);
    expect(afterDelete.summary.exists).toBe(1);
    expect(await prisma.dtaRosterabilityRecord.count({ where: { templateItemId: itemId } })).toBe(1);
  });

  it("目标日到达截止时间时跳过，且条件优先级选择实际模板", async () => {
    const second = await request(app).post("/api/templates").set(admin).send({ templateName: "低优先级模板", startDate: "2026-01-01" });
    const secondId = second.body.data.id;
    await request(app).post(`/api/templates/${secondId}/items`).set(admin).send({ weekday: 2, statusCode: "ROSTERABLE", startTime: "09:00", endTime: "10:00", endDayOffset: 0 });
    await request(app).post(`/api/templates/${secondId}/conditions`).set(admin).send({ priority: 2, orgId: 1 });
    const tuesday = await request(app).post(`/api/templates/${templateId}/items`).set(admin).send({ weekday: 2, statusCode: "ROSTERABLE", startTime: "11:00", endTime: "12:00", endDayOffset: 0 });
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "FULL_TIME" } }, data: { cutoffDays: 3 } });
    const result = await generateForManager(1, 9101, now);
    expect(result.skipped).toContainEqual(expect.objectContaining({ businessDate: "2026-11-17", templateItemId: tuesday.body.data.id, reason: "LOCKED" }));
    expect(await prisma.dtaRosterabilityRecord.count({ where: { templateId: secondId, empId: 1 } })).toBe(0);
  });

  it("按最多 12 周配置生成，并通过经理接口返回汇总", async () => {
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "FULL_TIME" } }, data: { cutoffDays: 0, autoGenRangeWeek: 12 } });
    const generated = await generateForManager(1, 9101, now);
    expect(generated.summary.created).toBeGreaterThan(12);
    expect(await prisma.dtaRosterabilityRecord.count({ where: { empId: 1, businessDate: "2027-02-01", templateItemId: itemId } })).toBe(1);
    const response = await request(app).post("/api/template-generation").set(manager1).send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ code: 0, data: { orgId: 1, summary: { created: expect.any(Number) }, skipped: expect.any(Array) } });
    expect(await prisma.dtaAuditLog.count()).toBe(0);
  });

  it("模板、明细和条件的修改与软删除不会返回已删除数据", async () => {
    const created = await request(app).post("/api/templates").set(admin).send({ templateName: "临时模板", startDate: "2026-01-01" });
    const id = created.body.data.id;
    const item = await request(app).post(`/api/templates/${id}/items`).set(admin).send({ weekday: 7, statusCode: "ROSTERABLE", startTime: "09:00", endTime: "12:00" });
    const condition = await request(app).post(`/api/templates/${id}/conditions`).set(admin).send({ priority: 3, orgId: 1 });
    expect((await request(app).patch(`/api/templates/${id}`).set(admin).send({ templateName: "已修改模板" })).body.data.templateName).toBe("已修改模板");
    expect((await request(app).patch(`/api/templates/${id}/items/${item.body.data.id}`).set(admin).send({ endTime: "13:00" })).body.data.endTime).toBe("13:00");
    expect((await request(app).patch(`/api/templates/${id}/conditions/${condition.body.data.id}`).set(admin).send({ priority: 4 })).body.data.priority).toBe(4);
    expect((await request(app).delete(`/api/templates/${id}/items/${item.body.data.id}`).set(admin)).body.data.isDeleted).toBe(1);
    expect((await request(app).delete(`/api/templates/${id}/conditions/${condition.body.data.id}`).set(admin)).body.data.isDeleted).toBe(1);
    const details = await request(app).get(`/api/templates/${id}`).set(admin);
    expect(details.body.data.items).toEqual([]);
    expect(details.body.data.conditions).toEqual([]);
    expect((await request(app).delete(`/api/templates/${id}`).set(admin)).body.data.isDeleted).toBe(1);
    expect((await request(app).get(`/api/templates/${id}`).set(admin)).status).toBe(404);
  });

  it("按每名员工的 1 周和 12 周配置限定实际生成范围", async () => {
    const by = { createdBy: 9001, updatedBy: 9001 };
    await prisma.dtaEmployee.create({ data: { id: 201, tenantId: 1, orgId: 1, empName: "Range employee", empTypeCode: "PART_TIME", postCode: "CUSTOMER_SERVICE", ...by } });
    const param = await prisma.dtaParamGroup.create({ data: {
      tenantId: 1, orgId: 1, empTypeCode: "PART_TIME", cutoffDays: 0,
      baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE,
      empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 1,
      conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK, ...by,
    } });
    const template = await request(app).post("/api/templates").set(admin).send({ templateName: "周数边界模板", startDate: "2026-01-01" });
    const id = template.body.data.id;
    const item = await request(app).post(`/api/templates/${id}/items`).set(admin).send({ weekday: 1, statusCode: "ROSTERABLE", startTime: "09:00", endTime: "10:00" });
    await request(app).post(`/api/templates/${id}/conditions`).set(admin).send({ priority: 0, orgId: 1, empTypeCode: "PART_TIME", postCode: "CUSTOMER_SERVICE" });
    await generateForManager(1, 9101, now);
    const where = { empId: 201, templateItemId: item.body.data.id };
    expect(await prisma.dtaRosterabilityRecord.count({ where })).toBe(1);
    expect(await prisma.dtaRosterabilityRecord.count({ where: { ...where, businessDate: "2026-11-23" } })).toBe(0);
    await prisma.dtaParamGroup.update({ where: { id: param.id }, data: { autoGenRangeWeek: 12 } });
    await generateForManager(1, 9101, now);
    expect(await prisma.dtaRosterabilityRecord.count({ where })).toBe(12);
    expect(await prisma.dtaRosterabilityRecord.count({ where: { ...where, businessDate: "2027-02-01" } })).toBe(1);
    expect(await prisma.dtaRosterabilityRecord.count({ where: { ...where, businessDate: "2027-02-08" } })).toBe(0);
  });
});
