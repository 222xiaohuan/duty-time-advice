import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { DtaBaselineRule, DtaSubmitMode } from "../src/types/enums";
import { hkDateTime } from "../src/lib/time";

const app = createApp();
const manager1 = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const manager2 = { "x-mock-role": "manager", "x-mock-user-id": "9102", "x-mock-org-id": "2" };
const by = { createdBy: 9001, updatedBy: 9001 };

beforeAll(async () => {
  for (const id of [1, 2]) {
    await prisma.dtaOrg.upsert({ where: { id }, update: {}, create: { id, tenantId: 1, orgName: `T010 org ${id}`, ...by } });
  }
  await prisma.dtaOrg.createMany({ data: [
    { id: 31, tenantId: 1, orgName: "T010 child", parentOrgId: 1, ...by },
    { id: 32, tenantId: 1, orgName: "T010 grandchild", parentOrgId: 31, ...by },
    { id: 33, tenantId: 1, orgName: "T010 outside", ...by },
  ] });
  await prisma.dtaEmployee.createMany({ data: [
    { id: 701, tenantId: 1, orgId: 1, empName: "T010 A", empTypeCode: "T010C_ROSTERABLE", postCode: "BETTING_SERVICE", ...by },
    { id: 702, tenantId: 1, orgId: 2, empName: "T010 B", empTypeCode: "CONTRACT_PT", postCode: "CUSTOMER_SERVICE", ...by },
    { id: 703, tenantId: 1, orgId: 1, empName: "T010 C", empTypeCode: "T010C_UNROSTERABLE", postCode: "CUSTOMER_SERVICE", ...by },
    { id: 704, tenantId: 1, orgId: 32, empName: "T010 descendant", empTypeCode: "CONTRACT_PT", postCode: "CUSTOMER_SERVICE", ...by },
    { id: 705, tenantId: 1, orgId: 33, empName: "T010 outside", empTypeCode: "CONTRACT_PT", postCode: "CUSTOMER_SERVICE", ...by },
  ] });
  await prisma.dtaParamGroup.createMany({ data: [
    { tenantId: 1, orgId: 1, empTypeCode: "T010C_ROSTERABLE", cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE, empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 4, conflictCheckMode: "STRONG_BLOCK", ...by },
    { tenantId: 1, orgId: 1, empTypeCode: "T010C_UNROSTERABLE", cutoffDays: 2, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 4, conflictCheckMode: "STRONG_BLOCK", ...by },
    { tenantId: 1, orgId: 32, empTypeCode: "CONTRACT_PT", cutoffDays: 1, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 4, conflictCheckMode: "STRONG_BLOCK", ...by },
  ] });
});

describe("T010 经理员工目录", () => {
  it("仅返回所辖组织的员工与有效截止参数", async () => {
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T010C_ROSTERABLE" } }, data: { priorityRosterEnable: 1 } });
    const first = await request(app).get("/api/manager/employees").set(manager1);
    expect(first.status).toBe(200);
    expect(first.body.data.orgId).toBe(1);
    expect(first.body.data.organizations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, parentOrgId: null }),
      expect.objectContaining({ id: 2, parentOrgId: null }),
      expect.objectContaining({ id: 31, parentOrgId: 1 }),
      expect.objectContaining({ id: 32, parentOrgId: 31 }),
    ]));
    expect(first.body.data.organizations.some((org: { id: number }) => org.id === 33)).toBe(false);
    expect(first.body.data.employees).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 701, empTypeCode: "T010C_ROSTERABLE", postCode: "BETTING_SERVICE", cutoffDays: 3, baselineRule: "BASE_ROSTERABLE", priorityRosterEnable: 1 }),
      expect.objectContaining({ id: 703, empTypeCode: "T010C_UNROSTERABLE", cutoffDays: 2, baselineRule: "BASE_UNROSTERABLE", priorityRosterEnable: 0 }),
    ]));
    expect(first.body.data.employees.some((row: { id: number }) => row.id === 702)).toBe(false);
    expect(first.body.data.employees).toContainEqual(expect.objectContaining({ id: 704, orgId: 32, cutoffDays: 1, baselineRule: "BASE_UNROSTERABLE" }));
    expect(first.body.data.employees.some((row: { id: number }) => row.id === 705)).toBe(false);
    const firstOnSecondOrg = await request(app).get("/api/manager/employees").set({ ...manager1, "x-mock-org-id": "2" });
    expect(firstOnSecondOrg.status).toBe(200);
    expect(firstOnSecondOrg.body.data.orgId).toBe(2);
    expect(firstOnSecondOrg.body.data.employees).toEqual(expect.arrayContaining([expect.objectContaining({ id: 702 })]));
    expect(firstOnSecondOrg.body.data.employees.some((row: { id: number }) => row.id === 701)).toBe(false);
    const second = await request(app).get("/api/manager/employees").set(manager2);
    expect(second.status).toBe(200);
    expect(second.body.data.employees).toEqual(expect.arrayContaining([expect.objectContaining({ id: 702, cutoffDays: null, baselineRule: null })]));
    expect(second.body.data.employees.some((row: { id: number }) => row.id === 701)).toBe(false);
    expect(second.body.data.organizations).toEqual([expect.objectContaining({ id: 2 })]);
  });

  it("员工和管理员无法访问，经理不能访问范围外组织", async () => {
    expect((await request(app).get("/api/manager/employees").set({ "x-mock-role": "employee", "x-mock-user-id": "701" })).status).toBe(403);
    expect((await request(app).get("/api/manager/employees").set({ "x-mock-role": "admin", "x-mock-user-id": "9001" })).status).toBe(403);
    expect((await request(app).get("/api/manager/employees").set({ "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "999" })).status).toBe(403);
    expect((await request(app).get("/api/manager/employees").set({ ...manager1, "x-mock-org-id": "33" })).status).toBe(403);
    expect((await request(app).get("/api/manager/employees").set({ ...manager2, "x-mock-org-id": "32" })).status).toBe(403);
  });

  it("可排性记录和模拟班次查询沿用当前组织选择并拒绝范围外组织", async () => {
    const manager1Org2 = { ...manager1, "x-mock-org-id": "2" };
    expect((await request(app).get("/api/rosterability-records").query({ orgId: 2 }).set(manager1Org2)).status).toBe(200);
    expect((await request(app).get("/api/mock-shifts").query({ orgId: 2 }).set(manager1Org2)).status).toBe(200);
    expect((await request(app).get("/api/rosterability-records").query({ orgId: 999 }).set(manager1Org2)).status).toBe(403);
    expect((await request(app).get("/api/mock-shifts").query({ orgId: 999 }).set(manager1Org2)).status).toBe(403);
  });

  it("选中父组织时查询子孙组织记录和班次，选中子组织时收窄范围", async () => {
    const day = "2099-12-01";
    await prisma.dtaRosterabilityRecord.create({ data: {
      tenantId: 1, orgId: 32, empId: 704, empTypeCode: "CONTRACT_PT", businessDate: day,
      statusCode: "ROSTERABLE", sourceCode: "EMP_SUBMIT", startTime: hkDateTime(day, "09:00"), endTime: hkDateTime(day, "10:00"), ...by,
    } });
    await prisma.dtaMockShift.create({ data: {
      tenantId: 1, orgId: 32, empId: 704, businessDate: day, shiftName: "T010 descendant shift",
      startTime: hkDateTime(day, "11:00"), endTime: hkDateTime(day, "12:00"), durationMinutes: 60, ...by,
    } });
    const parentRecords = await request(app).get("/api/rosterability-records").query({ orgId: 1, from: day, to: day }).set(manager1);
    const parentShifts = await request(app).get("/api/mock-shifts").query({ orgId: 1 }).set(manager1);
    expect(parentRecords.body.data).toContainEqual(expect.objectContaining({ empId: 704 }));
    expect(parentShifts.body.data).toContainEqual(expect.objectContaining({ empId: 704 }));
    const child = { ...manager1, "x-mock-org-id": "31" };
    const childDirectory = await request(app).get("/api/manager/employees").set(child);
    expect(childDirectory.body.data.employees).toContainEqual(expect.objectContaining({ id: 704 }));
    expect(childDirectory.body.data.employees.some((row: { id: number }) => row.id === 701)).toBe(false);
    const grandchildRecords = await request(app).get("/api/rosterability-records").query({ orgId: 32, from: day, to: day }).set({ ...manager1, "x-mock-org-id": "32" });
    expect(grandchildRecords.body.data).toContainEqual(expect.objectContaining({ empId: 704 }));
    expect((await request(app).get("/api/mock-shifts").query({ orgId: 33 }).set(manager1)).status).toBe(403);
  });

  it("主管可维护授权子组织员工，但不能维护权限外员工", async () => {
    const day = "2099-12-02";
    const record = await request(app).post("/api/rosterability-records").set(manager1).send({ empId: 704, businessDate: day, statusCode: "ROSTERABLE", startTime: "09:00", endTime: "10:00", endDayOffset: 0 });
    expect(record.status).toBe(200);
    expect(record.body.data.orgId).toBe(32);
    const shift = await request(app).post("/api/mock-shifts").set(manager1).send({ empId: 704, businessDate: day, shiftName: "子组织工作班", startTime: "11:00", endTime: "12:00", endDayOffset: 0 });
    expect(shift.status).toBe(200);
    expect((await request(app).post("/api/rosterability-records").set(manager2).send({ empId: 704, businessDate: day, statusCode: "ROSTERABLE", startTime: "12:00", endTime: "13:00", endDayOffset: 0 })).status).toBe(403);
    expect((await request(app).post("/api/mock-shifts").set(manager1).send({ empId: 705, businessDate: day, shiftName: "越权班次", startTime: "12:00", endTime: "13:00", endDayOffset: 0 })).status).toBe(403);
  });
});
