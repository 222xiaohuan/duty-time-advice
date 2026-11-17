/**
 * Demo 种子数据（T001）。仅用于本地 SQLite，执行时清空 dta_ 表后重新写入。
 * 包含：租户、2 个有员工及参数的组织、8 个未配置组织、状态与来源字典、模拟班次。
 * 不包含：周期模板（T003/T012 补充）、日期标签、导入任务。
 */
import { createPrismaClient } from "../src/lib/prisma";
import { addDays, hkDateTime, hkToday } from "../src/lib/time";
import {
  ADMIN_USER_ID,
  DEMO_TENANT_ID,
  DtaBaselineRule,
  DtaConflictCheckMode,
  DtaRosterabilityStatus,
  DtaSourceCode,
  DtaSubmitMode,
  EMP_TYPE_CODES,
  POST_CODES,
} from "../src/types/enums";

const prisma = createPrismaClient();
const by = { createdBy: ADMIN_USER_ID, updatedBy: ADMIN_USER_ID };
const tenantId = DEMO_TENANT_ID;

async function main() {
  // 清空（顺序无外键依赖），并重置自增序列，保证固定 ID
  const tables = [
    "dta_audit_log",
    "dta_mock_shift",
    "dta_rosterability_record",
    "dta_template_condition",
    "dta_template_item",
    "dta_template",
    "dta_param_group",
    "dta_param_scheme_rule",
    "dta_param_scheme",
    "dta_rosterability_source_dict",
    "dta_rosterability_status_dict",
    "dta_employee",
    "dta_org",
    "dta_tenant",
  ];
  for (const t of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
  await prisma.$executeRawUnsafe(`DELETE FROM sqlite_sequence`);

  await prisma.dtaTenant.create({ data: { id: tenantId, tenantName: "HKJC Demo", ...by } });

  const org1 = await prisma.dtaOrg.create({ data: { id: 1, tenantId, orgName: "沙田马场 · 投注服务部", ...by } });
  const org2 = await prisma.dtaOrg.create({ data: { id: 2, tenantId, orgName: "跑马地马场 · 客户服务部", ...by } });
  await prisma.dtaOrg.createMany({ data: [
    { id: 3, orgName: "沙田马场 · 客户服务部" },
    { id: 4, orgName: "沙田马场 · 场地运营部" },
    { id: 5, orgName: "沙田马场 · 人流管理部" },
    { id: 6, orgName: "跑马地马场 · 投注服务部" },
    { id: 7, orgName: "跑马地马场 · 场地运营部" },
    { id: 8, orgName: "跑马地马场 · 人流管理部" },
    { id: 9, orgName: "总部 · 客户支持部" },
    { id: 10, orgName: "总部 · 活动协调部" },
  ].map((org) => ({ ...org, tenantId, ...by })) });

  const employees = [
    { id: 1, orgId: org1.id, empName: "陈志明", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.BETTING_SERVICE },
    { id: 2, orgId: org1.id, empName: "李嘉欣", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.CROWD_CONTROL },
    { id: 3, orgId: org1.id, empName: "黄伟强", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.BETTING_SERVICE },
    { id: 4, orgId: org1.id, empName: "张美玲", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.CROWD_CONTROL },
    { id: 9, orgId: org1.id, empName: "王志豪", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.BETTING_SERVICE },
    { id: 10, orgId: org1.id, empName: "陈雅婷", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.CROWD_CONTROL },
    { id: 11, orgId: org1.id, empName: "林家俊", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.CROWD_CONTROL },
    { id: 12, orgId: org1.id, empName: "何嘉怡", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.BETTING_SERVICE },
    { id: 13, orgId: org1.id, empName: "梁文杰", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.BETTING_SERVICE },
    { id: 14, orgId: org1.id, empName: "苏晓彤", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.CROWD_CONTROL },
    { id: 5, orgId: org2.id, empName: "刘家豪", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.CUSTOMER_SERVICE },
    { id: 6, orgId: org2.id, empName: "吴咏诗", empTypeCode: EMP_TYPE_CODES.FULL_TIME, postCode: POST_CODES.CROWD_CONTROL },
    { id: 7, orgId: org2.id, empName: "林俊杰", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.CUSTOMER_SERVICE },
    { id: 8, orgId: org2.id, empName: "何慧琳", empTypeCode: EMP_TYPE_CODES.PART_TIME, postCode: POST_CODES.BETTING_SERVICE },
  ];
  for (const e of employees) await prisma.dtaEmployee.create({ data: { tenantId, ...e, ...by } });

  await prisma.dtaRosterabilityStatusDict.createMany({
    data: [
      { tenantId, statusCode: DtaRosterabilityStatus.ROSTERABLE, statusName: "可排", nameI18n: JSON.stringify({ en: "Rosterable", "zh-HK": "可排" }), colorHex: "#4a90e2", allowSchedule: 1, empSelfEdit: 1, enabled: 1, ...by },
      { tenantId, statusCode: DtaRosterabilityStatus.UNROSTERABLE, statusName: "不可排", nameI18n: JSON.stringify({ en: "Unrosterable", "zh-HK": "不可排" }), colorHex: "#a9a9a9", allowSchedule: 0, empSelfEdit: 1, enabled: 1, ...by },
      { tenantId, statusCode: DtaRosterabilityStatus.PRIORITY_ROSTERABLE, statusName: "优先排", nameI18n: JSON.stringify({ en: "Priority Rosterable", "zh-HK": "優先排" }), colorHex: "#2e8b57", allowSchedule: 1, empSelfEdit: 1, enabled: 1, ...by },
      { tenantId, statusCode: DtaRosterabilityStatus.STANDBY, statusName: "仅后备待命", nameI18n: JSON.stringify({ en: "Standby", "zh-HK": "僅後備待命" }), colorHex: "#f59e0b", allowSchedule: 0, empSelfEdit: 0, enabled: 0, ...by },
    ],
  });

  await prisma.dtaRosterabilitySourceDict.createMany({
    data: [
      { tenantId, sourceCode: DtaSourceCode.EMP_SUBMIT, sourceName: "员工提交", nameI18n: JSON.stringify({ en: "Employee Submission" }), iconKey: "user", enabled: 1, ...by },
      { tenantId, sourceCode: DtaSourceCode.MGR_MAINTENANCE, sourceName: "主管维护", nameI18n: JSON.stringify({ en: "Manager Maintenance" }), iconKey: "shield", enabled: 1, ...by },
      { tenantId, sourceCode: DtaSourceCode.TEMPLATE_GEN, sourceName: "模板生成", nameI18n: JSON.stringify({ en: "Template Generation" }), iconKey: "repeat", enabled: 1, ...by },
      { tenantId, sourceCode: DtaSourceCode.EXTERNAL_SYNC, sourceName: "外部接口同步", nameI18n: JSON.stringify({ en: "External Sync" }), iconKey: "link", enabled: 0, ...by },
      { tenantId, sourceCode: DtaSourceCode.BULK_IMPORT, sourceName: "批量导入", nameI18n: JSON.stringify({ en: "Bulk Import" }), iconKey: "upload", enabled: 0, ...by },
    ],
  });

  const scheme = await prisma.dtaParamScheme.create({ data: { tenantId, schemeName: "常规报备方案", createdBy: ADMIN_USER_ID } });
  await prisma.dtaParamSchemeRule.createMany({ data: [
    { tenantId, schemeId: scheme.id, empTypeCode: EMP_TYPE_CODES.FULL_TIME, cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE, empEditEnable: 1, priorityRosterEnable: 0, autoGenRangeWeek: 4 },
    { tenantId, schemeId: scheme.id, empTypeCode: EMP_TYPE_CODES.PART_TIME, cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, priorityRosterEnable: 0, autoGenRangeWeek: 4 },
  ] });
  await prisma.dtaOrg.updateMany({ where: { id: { in: [org1.id, org2.id] } }, data: { paramSchemeId: scheme.id } });

  // 生效参数组：全职默认可排、只报不可排；兼职默认不可排、只报可排
  for (const orgId of [org1.id, org2.id]) {
    await prisma.dtaParamGroup.create({
      data: {
        tenantId, orgId, empTypeCode: EMP_TYPE_CODES.FULL_TIME,
        cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_ROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_UNROSTERABLE,
        empEditEnable: 1, priorityRosterEnable: 0, templateAutoGenEnable: 0, autoGenRangeWeek: 4, autoGenWeekday: null, autoGenTime: null,
        conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK, ...by,
      },
    });
    await prisma.dtaParamGroup.create({
      data: {
        tenantId, orgId, empTypeCode: EMP_TYPE_CODES.PART_TIME,
        cutoffDays: 3, baselineRule: DtaBaselineRule.BASE_UNROSTERABLE, submitMode: DtaSubmitMode.MODE_ONLY_ROSTERABLE,
        empEditEnable: 1, priorityRosterEnable: 0, templateAutoGenEnable: 0, autoGenRangeWeek: 4, autoGenWeekday: null, autoGenTime: null,
        conflictCheckMode: DtaConflictCheckMode.STRONG_BLOCK, ...by,
      },
    });
  }

  // 模拟班次：日期相对香港今日计算，覆盖锁定期内、锁定期外、跨午夜与 0 时长场景
  const today = hkToday();
  const shifts = [
    { empId: 1, orgId: org1.id, day: 1, name: "早班", start: "07:00", end: "15:00", offset: 0 },
    { empId: 1, orgId: org1.id, day: 7, name: "夜马日班", start: "17:00", end: "23:30", offset: 0 },
    { empId: 2, orgId: org1.id, day: 8, name: "跨午夜班", start: "22:00", end: "02:00", offset: 1 },
    { empId: 3, orgId: org1.id, day: 9, name: "赛日兼职班", start: "11:00", end: "18:00", offset: 0 },
    { empId: 4, orgId: org1.id, day: 9, name: "待定班次（0 时长）", start: "12:00", end: "12:00", offset: 0 },
    { empId: 5, orgId: org2.id, day: 10, name: "中班", start: "12:00", end: "20:00", offset: 0 },
    { empId: 7, orgId: org2.id, day: 10, name: "夜马日兼职班", start: "18:00", end: "23:00", offset: 0 },
  ];
  for (const s of shifts) {
    const businessDate = addDays(today, s.day);
    const startTime = hkDateTime(businessDate, s.start);
    const endTime = hkDateTime(businessDate, s.end, s.offset);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    await prisma.dtaMockShift.create({
      data: { tenantId, orgId: s.orgId, empId: s.empId, businessDate, shiftName: s.name, startTime, endTime, durationMinutes, ...by },
    });
  }

  const counts = {
    tenants: await prisma.dtaTenant.count(),
    orgs: await prisma.dtaOrg.count(),
    employees: await prisma.dtaEmployee.count(),
    statusDict: await prisma.dtaRosterabilityStatusDict.count(),
    sourceDict: await prisma.dtaRosterabilitySourceDict.count(),
    paramGroups: await prisma.dtaParamGroup.count(),
    mockShifts: await prisma.dtaMockShift.count(),
  };
  console.log("Seed done:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
