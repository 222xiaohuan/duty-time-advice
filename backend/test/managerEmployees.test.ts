import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { DtaBaselineRule, DtaSubmitMode } from "../src/types/enums";

const app = createApp();
const manager1 = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const manager2 = { "x-mock-role": "manager", "x-mock-user-id": "9102", "x-mock-org-id": "2" };
const by = { createdBy: 9001, updatedBy: 9001 };

beforeAll(async () => {
  for (const id of [1, 2]) {
    await prisma.dtaOrg.upsert({ where: { id }, update: {}, create: { id, tenantId: 1, orgName: `T010 org ${id}`, ...by } });
  }
  await prisma.dtaEmployee.createMany({ data: [
    { id: 701, tenantId: 1, orgId: 1, empName: "T010 A", empTypeCode: "T010C_ROSTERABLE", postCode: "BETTING_SERVICE", ...by },
    { id: 702, tenantId: 1, orgId: 2, empName: "T010 B", empTypeCode: "PART_TIME", postCode: "CUSTOMER_SERVICE", ...by },
    { id: 703, tenantId: 1, orgId: 1, empName: "T010 C", empTypeCode: "T010C_UNROSTERABLE", postCode: "CUSTOMER_SERVICE", ...by },
  ] });
  await prisma.dtaParamGroup.createMany({ data: [
    { tenantId: 1, orgId: 1, empTypeCode: "T010C_ROSTERABLE", cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE, empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 4, conflictCheckMode: "STRONG_BLOCK", ...by },
    { tenantId: 1, orgId: 1, empTypeCode: "T010C_UNROSTERABLE", cutoffDays: 2, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 4, conflictCheckMode: "STRONG_BLOCK", ...by },
  ] });
});

describe("T010 经理员工目录", () => {
  it("仅返回所辖组织的员工与有效截止参数", async () => {
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T010C_ROSTERABLE" } }, data: { priorityRosterEnable: 1 } });
    const first = await request(app).get("/api/manager/employees").set(manager1);
    expect(first.status).toBe(200);
    expect(first.body.data.orgId).toBe(1);
    expect(first.body.data.employees).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 701, empTypeCode: "T010C_ROSTERABLE", postCode: "BETTING_SERVICE", cutoffDays: 3, baselineRule: "BASE_ROSTERABLE", priorityRosterEnable: 1 }),
      expect.objectContaining({ id: 703, empTypeCode: "T010C_UNROSTERABLE", cutoffDays: 2, baselineRule: "BASE_UNROSTERABLE", priorityRosterEnable: 0 }),
    ]));
    expect(first.body.data.employees.some((row: { id: number }) => row.id === 702)).toBe(false);
    const second = await request(app).get("/api/manager/employees").set(manager2);
    expect(second.status).toBe(200);
    expect(second.body.data.employees).toEqual(expect.arrayContaining([expect.objectContaining({ id: 702, cutoffDays: null, baselineRule: null })]));
    expect(second.body.data.employees.some((row: { id: number }) => row.id === 701)).toBe(false);
  });

  it("员工和管理员无法访问，经理身份不能伪造管辖组织", async () => {
    expect((await request(app).get("/api/manager/employees").set({ "x-mock-role": "employee", "x-mock-user-id": "701" })).status).toBe(403);
    expect((await request(app).get("/api/manager/employees").set({ "x-mock-role": "admin", "x-mock-user-id": "9001" })).status).toBe(403);
    expect((await request(app).get("/api/manager/employees").set({ "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "2" })).status).toBe(403);
  });
});
