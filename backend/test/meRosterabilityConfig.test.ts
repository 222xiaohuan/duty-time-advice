import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { DtaBaselineRule, DtaRosterabilityStatus, DtaSubmitMode } from "../src/types/enums";

const app = createApp();
const employee = { "x-mock-role": "employee", "x-mock-user-id": "301" };
const by = { createdBy: 9001, updatedBy: 9001 };

beforeAll(async () => {
  await prisma.dtaOrg.create({ data: { id: 6, tenantId: 1, orgName: "T009 test org", ...by } });
  await prisma.dtaEmployee.create({ data: { id: 301, tenantId: 1, orgId: 6, empName: "T009 employee", empTypeCode: "CONTRACT_PT", postCode: "TEST", ...by } });
  await prisma.dtaParamGroup.create({ data: {
    tenantId: 1, orgId: 6, empTypeCode: "CONTRACT_PT", cutoffDays: 3,
    baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE,
    empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 4, conflictCheckMode: "STRONG_BLOCK", ...by,
  } });
  for (const [statusCode, statusName, allowSchedule] of [["ROSTERABLE", "可排", 1], ["UNROSTERABLE", "不可排", 0]] as const) {
    await prisma.dtaRosterabilityStatusDict.upsert({ where: { tenantId_statusCode: { tenantId: 1, statusCode } },
      update: { enabled: 1, empSelfEdit: 1 },
      create: { tenantId: 1, statusCode, statusName, allowSchedule, enabled: 1, empSelfEdit: 1, ...by },
    });
  }
});

describe("T009 本人有效提报参数", () => {
  it("只返回当前员工参数与按模式过滤的状态", async () => {
    const res = await request(app).get("/api/me/rosterability-config").set(employee);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ empId: 301, orgId: 6, cutoffDays: 3, submitMode: "MODE_ONLY_ROSTERABLE", allowedStatuses: [{ statusCode: "ROSTERABLE" }] });
    expect(res.body.data).not.toHaveProperty("autoGenRangeWeek");
    await prisma.dtaRosterabilityStatusDict.upsert({ where: { tenantId_statusCode: { tenantId: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE } }, update: { enabled: 1, empSelfEdit: 1 }, create: { tenantId: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE, statusName: "优先排", colorHex: "#2e8b57", allowSchedule: 1, enabled: 1, empSelfEdit: 1, ...by } });
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 6, empTypeCode: "CONTRACT_PT" } }, data: { priorityRosterEnable: 1 } });
    const priority = await request(app).get("/api/me/rosterability-config").set(employee);
    expect(priority.body.data.allowedStatuses.map((status: { statusCode: string }) => status.statusCode)).toEqual(["ROSTERABLE", "PRIORITY_ROSTERABLE"]);
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 6, empTypeCode: "CONTRACT_PT" } }, data: { priorityRosterEnable: 0 } });
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 6, empTypeCode: "CONTRACT_PT" } }, data: { submitMode: DtaSubmitMode.MODE_NO_SUBMIT, empEditEnable: 0 } });
    const closed = await request(app).get("/api/me/rosterability-config").set(employee);
    expect(closed.body.data).toMatchObject({ empEditEnable: 0, allowedStatuses: [] });
  });

  it("经理和管理员不能通过员工配置接口读取，未知员工返回 404", async () => {
    expect((await request(app).get("/api/me/rosterability-config").set({ "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" })).status).toBe(403);
    expect((await request(app).get("/api/me/rosterability-config").set({ "x-mock-role": "admin", "x-mock-user-id": "9001" })).status).toBe(403);
    expect((await request(app).get("/api/me/rosterability-config").set({ "x-mock-role": "employee", "x-mock-user-id": "999" })).status).toBe(404);
  });
});
