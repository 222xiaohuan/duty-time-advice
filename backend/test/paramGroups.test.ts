import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { DtaBaselineRule, DtaSubmitMode } from "../src/types/enums";

const app = createApp();
const admin = { "x-mock-role": "admin", "x-mock-user-id": "9001" };
const manager = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const by = { createdBy: 9001, updatedBy: 9001 };
const base = "/api/param-groups";
const values = {
  orgId: 5,
  empTypeCode: "FULL_TIME",
  cutoffDays: 3,
  baselineRule: DtaBaselineRule.BASE_ROSTERABLE,
  submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE,
  empEditEnable: 1,
  autoGenRangeWeek: 1,
};

beforeAll(async () => {
  await prisma.dtaOrg.create({ data: { id: 5, tenantId: 1, orgName: "T006 test org", ...by } });
});

describe("T006 参数边界与接口冒烟", () => {
  let paramId: number;

  it("参数接口仅管理员可写，创建后可读", async () => {
    expect((await request(app).post(base).set(manager).send(values)).status).toBe(403);
    const created = await request(app).post(base).set(admin).send(values);
    expect(created.status).toBe(200);
    paramId = created.body.data.id;
    expect(created.body.data).toMatchObject({ orgId: 5, autoGenRangeWeek: 1, templateAutoGenEnable: 0 });
    expect((await request(app).get(`${base}/${paramId}`).set(admin)).body.data.id).toBe(paramId);
  });

  it("基线与提报模式的全部八种组合按 PRD 矩阵校验", async () => {
    const cases = [
      [DtaBaselineRule.BASE_ROSTERABLE, DtaSubmitMode.MODE_ONLY_UNROSTERABLE, true],
      [DtaBaselineRule.BASE_ROSTERABLE, DtaSubmitMode.MODE_ONLY_ROSTERABLE, false],
      [DtaBaselineRule.BASE_ROSTERABLE, DtaSubmitMode.MODE_ALL_STATUS, true],
      [DtaBaselineRule.BASE_ROSTERABLE, DtaSubmitMode.MODE_NO_SUBMIT, true],
      [DtaBaselineRule.BASE_UNROSTERABLE, DtaSubmitMode.MODE_ONLY_UNROSTERABLE, false],
      [DtaBaselineRule.BASE_UNROSTERABLE, DtaSubmitMode.MODE_ONLY_ROSTERABLE, true],
      [DtaBaselineRule.BASE_UNROSTERABLE, DtaSubmitMode.MODE_ALL_STATUS, true],
      [DtaBaselineRule.BASE_UNROSTERABLE, DtaSubmitMode.MODE_NO_SUBMIT, true],
    ] as const;
    for (const [baselineRule, submitMode, accepted] of cases) {
      const response = await request(app).patch(`${base}/${paramId}`).set(admin).send({ baselineRule, submitMode });
      expect(response.status, `${baselineRule} + ${submitMode}`).toBe(accepted ? 200 : 400);
      if (accepted) expect(response.body.data).toMatchObject({ baselineRule, submitMode });
    }
  });

  it("手动生成周数只接受 1 至 12，预留开关保持关闭", async () => {
    for (const [range, accepted] of [[0, false], [1, true], [12, true], [13, false]] as const) {
      const response = await request(app).patch(`${base}/${paramId}`).set(admin).send({ autoGenRangeWeek: range });
      expect(response.status, `autoGenRangeWeek=${range}`).toBe(accepted ? 200 : 400);
      if (accepted) expect(response.body.data.autoGenRangeWeek).toBe(range);
    }
    for (const field of ["templateAutoGenEnable", "fieldSiteEnable", "enableApproval", "specialTagDiffEnable"]) {
      expect((await request(app).patch(`${base}/${paramId}`).set(admin).send({ [field]: 1 })).status).toBe(400);
    }
    expect((await request(app).patch(`${base}/${paramId}`).set(admin).send({ autoGenWeekday: 1 })).status).toBe(400);
    expect((await request(app).patch(`${base}/${paramId}`).set(admin).send({ autoGenTime: "09:00" })).status).toBe(400);
    expect((await request(app).get(`${base}/${paramId}`).set(admin)).body.data).toMatchObject({ autoGenRangeWeek: 12, templateAutoGenEnable: 0, fieldSiteEnable: 0, enableApproval: 0, specialTagDiffEnable: 0 });
  });

  it("健康检查、身份、字典、参数、模板、班次和记录接口返回统一结构", async () => {
    const health = await request(app).get("/api/health");
    expect(health.body).toMatchObject({ code: 0, data: { status: "up", db: "sqlite" } });
    const paths = [
      ["/api/me", manager],
      ["/api/dictionaries/statuses", admin],
      ["/api/dictionaries/sources", admin],
      [base, admin],
      ["/api/templates", admin],
      ["/api/mock-shifts", manager],
      ["/api/rosterability-records", manager],
    ] as const;
    for (const [path, headers] of paths) {
      const response = await request(app).get(path).set(headers);
      expect(response.status, path).toBe(200);
      expect(response.body, path).toMatchObject({ code: 0, msg: expect.any(String), data: expect.anything() });
    }
  });
});
