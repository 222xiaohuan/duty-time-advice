import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { isLocked, createRecord } from "../src/lib/rosterabilityRecords";
import { prisma } from "../src/lib/prisma";
import { addDays, hkDateTime, hkToday } from "../src/lib/time";
import { DtaBaselineRule, DtaConflictCheckMode, DtaRosterabilityStatus, DtaSubmitMode } from "../src/types/enums";

const app = createApp();
const employee1 = { "x-mock-role": "employee", "x-mock-user-id": "101" };
const employee2 = { "x-mock-role": "employee", "x-mock-user-id": "102" };
const manager1 = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const manager2 = { "x-mock-role": "manager", "x-mock-user-id": "9102", "x-mock-org-id": "2" };
const base = "/api/rosterability-records";
const by = { createdBy: 9001, updatedBy: 9001 };
const input = (businessDate: string, statusCode = "UNROSTERABLE") => ({ businessDate, statusCode, startTime: "09:00", endTime: "12:00", endDayOffset: 0 });

beforeAll(async () => {
  for (const id of [1, 2]) {
    await prisma.dtaOrg.upsert({ where: { id }, update: {}, create: { id, tenantId: 1, orgName: `T004 org ${id}`, ...by } });
  }
  await prisma.dtaEmployee.createMany({ data: [
    { id: 101, tenantId: 1, orgId: 1, empName: "T004 employee 1", empTypeCode: "T004", postCode: "TEST", ...by },
    { id: 102, tenantId: 1, orgId: 2, empName: "T004 employee 2", empTypeCode: "T004", postCode: "TEST", ...by },
  ] });
  for (const orgId of [1, 2]) await prisma.dtaParamGroup.create({ data: {
    tenantId: 1, orgId, empTypeCode: "T004", cutoffDays: 0,
    baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ALL_STATUS,
    empEditEnable: 1, templateAutoGenEnable: 0, autoGenRangeWeek: 1,
    conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK, ...by,
  } });
  for (const [statusCode, statusName, allowSchedule] of [["ROSTERABLE", "可排", 1], ["UNROSTERABLE", "不可排", 0]] as const) {
    await prisma.dtaRosterabilityStatusDict.upsert({
      where: { tenantId_statusCode: { tenantId: 1, statusCode } },
      update: { enabled: 1, empSelfEdit: 1 },
      create: { tenantId: 1, statusCode, statusName, allowSchedule, enabled: 1, empSelfEdit: 1, ...by },
    });
  }
  await prisma.dtaRosterabilityStatusDict.upsert({
    where: { tenantId_statusCode: { tenantId: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE } },
    update: { enabled: 1, empSelfEdit: 1 },
    create: { tenantId: 1, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE, statusName: "优先排", colorHex: "#2e8b57", allowSchedule: 1, enabled: 1, empSelfEdit: 1, ...by },
  });
});

describe("T004 可排性记录", () => {
  it("组织与员工类型开关控制优先排记录，开启后经理可以维护", async () => {
    const day = "2099-02-01";
    expect((await request(app).post(base).set(manager1).send({ ...input(day, DtaRosterabilityStatus.PRIORITY_ROSTERABLE), empId: 101 })).status).toBe(403);
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } }, data: { priorityRosterEnable: 1 } });
    const created = await request(app).post(base).set(manager1).send({ ...input(day, DtaRosterabilityStatus.PRIORITY_ROSTERABLE), empId: 101 });
    expect(created.status).toBe(200);
    expect(created.body.data.statusCode).toBe(DtaRosterabilityStatus.PRIORITY_ROSTERABLE);
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } }, data: { priorityRosterEnable: 0 } });
  });

  it("员工只能维护本人，经理只能维护所辖组织，管理员只读", async () => {
    const day = "2099-01-12";
    expect((await request(app).post(base).set(employee1).send({ ...input(day), empId: 102 })).status).toBe(403);
    expect((await request(app).post(base).set(manager2).send({ ...input(day), empId: 101 })).status).toBe(403);
    expect((await request(app).post(base).set({ "x-mock-role": "admin", "x-mock-user-id": "9001" }).send({ ...input(day), empId: 101 })).status).toBe(403);
    const created = await request(app).post(base).set(manager1).send({ ...input(day, "ROSTERABLE"), empId: 101 });
    expect(created.status).toBe(200);
    expect(created.body.data.sourceCode).toBe("MGR_MAINTENANCE");
    const id = created.body.data.id;
    expect((await request(app).get(`${base}/${id}`).set(employee2)).status).toBe(403);
    expect((await request(app).patch(`${base}/${id}`).set(manager2).send({ remark: "x" })).status).toBe(403);
    expect((await request(app).delete(`${base}/${id}`).set(employee2)).status).toBe(403);
    expect((await request(app).get(base).set(manager2).query({ empId: 101 })).status).toBe(403);
    expect((await request(app).get(base).set(employee1)).body.data).toContainEqual(expect.objectContaining({ id }));
    expect((await request(app).delete(`${base}/${id}`).set(manager1)).status).toBe(200);
    expect((await request(app).get(`${base}/${id}`).set(manager1)).status).toBe(404);
  });

  it("默认基线状态不能重复维护并返回明确提示", async () => {
    const day = "2099-01-14";
    const redundantUnrosterable = await request(app).post(base).set(manager1).send({ ...input(day, "UNROSTERABLE"), empId: 101 });
    expect(redundantUnrosterable.status).toBe(400);
    expect(redundantUnrosterable.body.msg).toBe("已默认全部不可排，无需维护不可排时间");

    const key = { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } };
    await prisma.dtaParamGroup.update({ where: key, data: { baselineRule: DtaBaselineRule.BASE_ROSTERABLE } });
    const redundantRosterable = await request(app).post(base).set(manager1).send({ ...input(day, "ROSTERABLE"), empId: 101 });
    expect(redundantRosterable.status).toBe(400);
    expect(redundantRosterable.body.msg).toBe("已默认全部可排，无需维护可排时间");
    await prisma.dtaParamGroup.update({ where: key, data: { baselineRule: DtaBaselineRule.BASE_UNROSTERABLE } });
  });

  it("员工编辑开关、提报模式和状态字典由后端校验", async () => {
    const day = "2099-01-13";
    const key = { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } };
    await prisma.dtaParamGroup.update({ where: key, data: { empEditEnable: 0 } });
    expect((await request(app).post(base).set(employee1).send(input(day))).status).toBe(403);
    expect((await request(app).post(base).set(manager1).send({ ...input(day, "ROSTERABLE"), empId: 101 })).status).toBe(200);
    await prisma.dtaParamGroup.update({ where: key, data: { empEditEnable: 1, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE } });
    const redundant = await request(app).post(base).set(employee1).send({ ...input(day), startTime: "13:00", endTime: "14:00" });
    expect(redundant.status).toBe(400);
    expect(redundant.body.msg).toBe("已默认全部不可排，无需维护不可排时间");
    expect((await request(app).post(base).set(employee1).send({ ...input(day, "ROSTERABLE"), startTime: "13:00", endTime: "14:00" })).status).toBe(200);
    await prisma.dtaRosterabilityStatusDict.update({ where: { tenantId_statusCode: { tenantId: 1, statusCode: "ROSTERABLE" } }, data: { empSelfEdit: 0 } });
    expect((await request(app).post(base).set(employee1).send({ ...input(day, "ROSTERABLE"), startTime: "15:00", endTime: "16:00" })).status).toBe(403);
    await prisma.dtaRosterabilityStatusDict.update({ where: { tenantId_statusCode: { tenantId: 1, statusCode: "ROSTERABLE" } }, data: { empSelfEdit: 1 } });
    await prisma.dtaParamGroup.update({ where: key, data: { submitMode: DtaSubmitMode.MODE_ALL_STATUS } });
  });

  it("香港时间截止点前可写、到达即锁，读取时实时计算", async () => {
    const key = { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } };
    await prisma.dtaParamGroup.update({ where: key, data: { cutoffDays: 3 } });
    const before = new Date("2099-01-15T15:59:59.999Z");
    const at = new Date("2099-01-15T16:00:00.000Z");
    expect(isLocked("2099-01-18", 3, before)).toBe(false);
    expect(isLocked("2099-01-18", 3, at)).toBe(true);
    const created = await createRecord({ role: "employee", userId: 101, orgId: null }, 101, input("2099-01-18", "ROSTERABLE"), before);
    expect(created.businessDate).toBe("2099-01-18");
    await expect(createRecord({ role: "employee", userId: 101, orgId: null }, 101, { ...input("2099-01-18", "ROSTERABLE"), startTime: "13:00", endTime: "14:00" }, at)).rejects.toMatchObject({ httpStatus: 403 });
    await prisma.dtaParamGroup.update({ where: key, data: { cutoffDays: 0 } });
  });

  it("跨午夜归属开始日，修改和删除受锁定约束", async () => {
    const day = "2099-01-21";
    const created = await request(app).post(base).set(employee1).send({ ...input(day, "ROSTERABLE"), startTime: "22:00", endTime: "02:00", endDayOffset: 1 });
    expect(created.status).toBe(200);
    expect(created.body.data.startTime).toBe("2099-01-21T14:00:00.000Z");
    expect(created.body.data.endTime).toBe("2099-01-21T18:00:00.000Z");
    const id = created.body.data.id;
    expect((await request(app).patch(`${base}/${id}`).set(employee1).send({ remark: "夜间" })).body.data.businessDate).toBe(day);
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } }, data: { cutoffDays: 30 } });
    // 将业务日移到已锁定范围，再验证旧记录的修改和删除均被拒绝。
    await prisma.dtaRosterabilityRecord.update({ where: { id }, data: { businessDate: hkToday() } });
    expect((await request(app).patch(`${base}/${id}`).set(employee1).send({ remark: "x" })).status).toBe(403);
    expect((await request(app).delete(`${base}/${id}`).set(manager1)).status).toBe(403);
    await prisma.dtaParamGroup.update({ where: { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } }, data: { cutoffDays: 0 } });
  });

  it("不可排按整个业务日拦截正时长班次，零时长或软删除班次不拦截", async () => {
    const day = "2099-01-22";
    const paramKey = { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 1, empTypeCode: "T004" } };
    const rosterable = await request(app).post(base).set(employee1).send(input(day, "ROSTERABLE"));
    expect(rosterable.status).toBe(200);
    await prisma.dtaParamGroup.update({ where: paramKey, data: { baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ALL_STATUS } });
    const shift = await prisma.dtaMockShift.create({ data: { tenantId: 1, orgId: 1, empId: 101, businessDate: day, shiftName: "test", startTime: hkDateTime(day, "18:00"), endTime: hkDateTime(day, "19:00"), durationMinutes: 60, ...by } });
    const conflict = await request(app).post(base).set(employee1).send(input(day));
    expect(conflict.status).toBe(409);
    expect(conflict.body.msg).toBe("该员工当日已存在工作班次，不能调整为不可排。");
    expect((await request(app).patch(`${base}/${rosterable.body.data.id}`).set(employee1).send({ statusCode: "UNROSTERABLE" })).body.msg).toBe("该员工当日已存在工作班次，不能调整为不可排。");
    await prisma.dtaMockShift.update({ where: { id: shift.id }, data: { durationMinutes: 0 } });
    expect((await request(app).post(base).set(employee1).send(input(day))).status).toBe(200);
    await prisma.dtaParamGroup.update({ where: paramKey, data: { baselineRule: DtaBaselineRule.BASE_UNROSTERABLE } });
  });

  it("多日期统一设置逐项失败，成功项保留", async () => {
    const future = addDays(hkToday(), 40);
    const locked = addDays(hkToday(), -1);
    const result = await request(app).post(`${base}/batch/set-dates`).set(employee1).send({ dates: [locked, future, future], statusCode: "ROSTERABLE", startTime: "10:00", endTime: "11:00", endDayOffset: 0 });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ created: 1, failed: 2 });
    expect(result.body.data.results.map((row: { success: boolean }) => row.success)).toEqual([false, true, false]);
    expect(await prisma.dtaRosterabilityRecord.count({ where: { empId: 101, businessDate: future, startTime: hkDateTime(future, "10:00") } })).toBe(1);
  });

  it("复制本周到下周逐项校验班次冲突与状态模式，复制上周逐项报告锁定", async () => {
    const org2ParamKey = { tenantId_orgId_empTypeCode: { tenantId: 1, orgId: 2, empTypeCode: "T004" } };
    await prisma.dtaParamGroup.update({ where: org2ParamKey, data: { baselineRule: DtaBaselineRule.BASE_ROSTERABLE } });
    await prisma.dtaParamGroup.update({ where: org2ParamKey, data: { priorityRosterEnable: 1 } });
    const monday = hkToday(new Date());
    const weekday = new Date(`${monday}T00:00:00.000Z`).getUTCDay();
    const thisMonday = addDays(monday, -(weekday === 0 ? 6 : weekday - 1));
    const sourceDay = addDays(thisMonday, 1);
    const targetDay = addDays(sourceDay, 7);
    await prisma.dtaRosterabilityRecord.create({ data: { tenantId: 1, orgId: 2, empId: 102, empTypeCode: "T004", businessDate: sourceDay, statusCode: "UNROSTERABLE", sourceCode: "EMP_SUBMIT", startTime: hkDateTime(sourceDay, "13:00"), endTime: hkDateTime(sourceDay, "14:00"), ...by } });
    await prisma.dtaRosterabilityRecord.create({ data: { tenantId: 1, orgId: 2, empId: 102, empTypeCode: "T004", businessDate: addDays(sourceDay, 1), statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE, sourceCode: "EMP_SUBMIT", startTime: hkDateTime(addDays(sourceDay, 1), "13:00"), endTime: hkDateTime(addDays(sourceDay, 1), "14:00"), ...by } });
    await prisma.dtaMockShift.create({ data: { tenantId: 1, orgId: 2, empId: 102, businessDate: targetDay, shiftName: "test", startTime: hkDateTime(targetDay, "18:00"), endTime: hkDateTime(targetDay, "19:00"), durationMinutes: 60, ...by } });
    const result = await request(app).post(`${base}/batch/copy-current-to-next`).set(employee2).send({});
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ created: 1, failed: 1 });
    expect(result.body.data.results.find((row: { businessDate: string }) => row.businessDate === targetDay).message).toBe("该员工当日已存在工作班次，不能调整为不可排。");
    const priorDay = addDays(thisMonday, -7);
    await prisma.dtaRosterabilityRecord.create({ data: { tenantId: 1, orgId: 2, empId: 102, empTypeCode: "T004", businessDate: priorDay, statusCode: "ROSTERABLE", sourceCode: "EMP_SUBMIT", startTime: hkDateTime(priorDay, "16:00"), endTime: hkDateTime(priorDay, "17:00"), ...by } });
    const previous = await request(app).post(`${base}/batch/copy-previous-week`).set(employee2).send({});
    expect(previous.status).toBe(200);
    expect(previous.body.data.failed).toBeGreaterThan(0);
    expect(previous.body.data.results).toContainEqual(expect.objectContaining({ success: false, businessDate: thisMonday }));
    expect(await prisma.dtaAuditLog.count()).toBe(0);
    await prisma.dtaParamGroup.update({ where: org2ParamKey, data: { baselineRule: DtaBaselineRule.BASE_UNROSTERABLE } });
    await prisma.dtaParamGroup.update({ where: org2ParamKey, data: { priorityRosterEnable: 0 } });
  });
});
