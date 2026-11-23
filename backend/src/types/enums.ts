// 业务枚举的唯一出处，与 prisma/schema.prisma 保持一致；前端保持同编码定义。
export {
  DtaRosterabilityStatus,
  DtaSourceCode,
  DtaBaselineRule,
  DtaSubmitMode,
  DtaConflictCheckMode,
  DtaApprovalStatus,
  DtaAuditActionCode,
} from "../generated/prisma/enums";

export const MOCK_ROLES = ["admin", "manager", "employee"] as const;
export type MockRole = (typeof MOCK_ROLES)[number];

/** 审计日志 operate_source */
export const OPERATE_SOURCES = ["employee", "manager", "admin", "system"] as const;
export type OperateSource = (typeof OPERATE_SOURCES)[number];

/** 审计日志 target_type */
export const AUDIT_TARGET_TYPES = ["record", "param", "template", "condition", "mock_shift"] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * Demo 固定账号 ID。主管与管理员不在员工表中，只作为操作人 ID 使用；
 * 取 9000 段，避免与员工 ID 混淆。
 */
export const DEMO_TENANT_ID = 1;
export const SYSTEM_USER_ID = 9000;
export const ADMIN_USER_ID = 9001;
export const MANAGER_USER_IDS = { org1: 9101, org2: 9102 } as const;

/** 员工类型编码（Demo 不建字典表，编码在此约定） */
export const EMP_TYPE_CODES = { FULL_TIME: "FULL_TIME", CONTRACT_PT: "CONTRACT_PT", CASUAL_PT: "CASUAL_PT" } as const;

/** 岗位编码（Demo 不建字典表，编码在此约定） */
export const POST_CODES = {
  BETTING_SERVICE: "BETTING_SERVICE", // 投注服务员
  CUSTOMER_SERVICE: "CUSTOMER_SERVICE", // 客户服务员
  CROWD_CONTROL: "CROWD_CONTROL", // 人流管理员
} as const;

export const BUSINESS_TIME_ZONE = "Asia/Hong_Kong";
