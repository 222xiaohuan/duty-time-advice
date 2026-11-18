import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hkDateTime } from "../src/lib/time";
import { DtaRosterabilityStatus, DtaSourceCode } from "../src/types/enums";

const app = createApp();
const manager = { "x-mock-role": "manager", "x-mock-user-id": "9101", "x-mock-org-id": "1" };
const employeeId = 201;
const day = "2099-03-03";
const by = { createdBy: 9001, updatedBy: 9001 };

beforeAll(async () => {
  await prisma.dtaOrg.upsert({ where: { id: 1 }, update: {}, create: { id: 1, tenantId: 1, orgName: "冲突校验组织", ...by } });
  await prisma.dtaEmployee.upsert({
    where: { id: employeeId },
    update: {},
    create: { id: employeeId, tenantId: 1, orgId: 1, empName: "冲突校验员工", empTypeCode: "T010J", postCode: "TEST", ...by },
  });
});

describe("模拟班次可排性冲突", () => {
  it("班次与不可排时段重叠时禁止新增，边界相接允许", async () => {
    await prisma.dtaRosterabilityRecord.create({ data: {
      tenantId: 1, orgId: 1, empId: employeeId, empTypeCode: "T010J", businessDate: day,
      statusCode: DtaRosterabilityStatus.UNROSTERABLE, sourceCode: DtaSourceCode.EMP_SUBMIT,
      startTime: hkDateTime(day, "00:00"), endTime: hkDateTime(day, "12:00"), ...by,
    } });

    const conflict = await request(app).post("/api/mock-shifts").set(manager).send({
      empId: employeeId, businessDate: day, shiftName: "早班", startTime: "07:00", endTime: "15:00", endDayOffset: 0,
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.msg).toBe("该班次与员工不可排时间段冲突，不能排入。");

    const adjacent = await request(app).post("/api/mock-shifts").set(manager).send({
      empId: employeeId, businessDate: day, shiftName: "午班", startTime: "12:00", endTime: "15:00", endDayOffset: 0,
    });
    expect(adjacent.status).toBe(200);
  });

  it("修改班次同样校验跨午夜不可排区间，零时长不占用区间", async () => {
    const crossDay = "2099-03-04";
    await prisma.dtaRosterabilityRecord.create({ data: {
      tenantId: 1, orgId: 1, empId: employeeId, empTypeCode: "T010J", businessDate: crossDay,
      statusCode: DtaRosterabilityStatus.UNROSTERABLE, sourceCode: DtaSourceCode.EMP_SUBMIT,
      startTime: hkDateTime(crossDay, "23:00"), endTime: hkDateTime(crossDay, "01:00", 1), ...by,
    } });
    const created = await request(app).post("/api/mock-shifts").set(manager).send({
      empId: employeeId, businessDate: crossDay, shiftName: "白班", startTime: "09:00", endTime: "10:00", endDayOffset: 0,
    });
    expect(created.status).toBe(200);
    const blockedUpdate = await request(app).patch(`/api/mock-shifts/${created.body.data.id}`).set(manager).send({
      businessDate: crossDay, startTime: "23:30", endTime: "01:00", endDayOffset: 1,
    });
    expect(blockedUpdate.status).toBe(409);

    const zero = await request(app).post("/api/mock-shifts").set(manager).send({
      empId: employeeId, businessDate: crossDay, shiftName: "休息", startTime: "00:00", endTime: "00:00", endDayOffset: 0,
    });
    expect(zero.status).toBe(200);
    expect(zero.body.data.durationMinutes).toBe(0);
  });
});
