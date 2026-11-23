export const orgs = [{ id: 1, name: "沙田马场 · 投注服务部" }, { id: 2, name: "跑马地马场 · 客户服务部" }];
export const employeeTypes = [
  { code: "FULL_TIME", name: "Full Time" },
  { code: "CONTRACT_PT", name: "Contract PT" },
  { code: "CASUAL_PT", name: "Casual PT" },
];
export const posts = [{ code: "BETTING_SERVICE", name: "投注服务员" }, { code: "CUSTOMER_SERVICE", name: "客户服务员" }, { code: "CROWD_CONTROL", name: "人流管理员" }];
export const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export function labelOf<T extends { code: string; name: string }>(options: T[], code: string | null) {
  return options.find((option) => option.code === code)?.name ?? code ?? "不限";
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : "操作失败"; }
