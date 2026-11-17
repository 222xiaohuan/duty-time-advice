export const RosterabilityStatus = {
  ROSTERABLE: "ROSTERABLE",
  UNROSTERABLE: "UNROSTERABLE",
  PRIORITY_ROSTERABLE: "PRIORITY_ROSTERABLE",
  STANDBY: "STANDBY",
} as const;

export const SourceCode = {
  EMP_SUBMIT: "EMP_SUBMIT",
  MGR_MAINTENANCE: "MGR_MAINTENANCE",
  TEMPLATE_GEN: "TEMPLATE_GEN",
  EXTERNAL_SYNC: "EXTERNAL_SYNC",
  BULK_IMPORT: "BULK_IMPORT",
} as const;

export const BaselineRule = {
  BASE_ROSTERABLE: "BASE_ROSTERABLE",
  BASE_UNROSTERABLE: "BASE_UNROSTERABLE",
} as const;

export const SubmitMode = {
  MODE_ONLY_UNROSTERABLE: "MODE_ONLY_UNROSTERABLE",
  MODE_ONLY_ROSTERABLE: "MODE_ONLY_ROSTERABLE",
  MODE_ALL_STATUS: "MODE_ALL_STATUS",
  MODE_NO_SUBMIT: "MODE_NO_SUBMIT",
} as const;

export const ConflictCheckMode = {
  STRONG_BLOCK: "STRONG_BLOCK",
  WARN_WITH_EXEMPT: "WARN_WITH_EXEMPT",
} as const;

export const ApprovalStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const AuditActionCode = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  PARAM_CHANGE: "PARAM_CHANGE",
  TEMPLATE_GEN: "TEMPLATE_GEN",
  BULK_IMPORT: "BULK_IMPORT",
  EXTERNAL_SYNC: "EXTERNAL_SYNC",
  SUBMIT_APPROVAL: "SUBMIT_APPROVAL",
  APPROVE_PASS: "APPROVE_PASS",
  APPROVE_REJECT: "APPROVE_REJECT",
} as const;

export type RosterabilityStatusCode = (typeof RosterabilityStatus)[keyof typeof RosterabilityStatus];
export type SourceCodeValue = (typeof SourceCode)[keyof typeof SourceCode];
export type MockRole = "admin" | "manager" | "employee";
