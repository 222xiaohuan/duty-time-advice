import type { MockRole } from "./enums";

export type MockProfile = {
  key: string;
  role: MockRole;
  userId: number;
  orgId?: number;
  label: string;
  group: string;
};

export const profiles: MockProfile[] = [
  { key: "admin", role: "admin", userId: 9001, label: "管理员", group: "管理" },
  { key: "manager-1", role: "manager", userId: 9101, orgId: 15, label: "HVRC Outlet01 · 主管", group: "主管" },
  { key: "manager-2", role: "manager", userId: 9102, orgId: 20, label: "STRC Outlet01 · 主管", group: "主管" },
  { key: "employee-1", role: "employee", userId: 1, label: "陈志明", group: "员工 · HVRC Outlet01" },
  { key: "employee-2", role: "employee", userId: 2, label: "李嘉欣", group: "员工 · HVRC Outlet01" },
  { key: "employee-3", role: "employee", userId: 3, label: "黄伟强", group: "员工 · HVRC Outlet01" },
  { key: "employee-4", role: "employee", userId: 4, label: "张美玲", group: "员工 · HVRC Outlet01" },
  { key: "employee-5", role: "employee", userId: 5, label: "刘家豪", group: "员工 · STRC Outlet01" },
  { key: "employee-6", role: "employee", userId: 6, label: "吴咏诗", group: "员工 · STRC Outlet01" },
  { key: "employee-7", role: "employee", userId: 7, label: "林俊杰", group: "员工 · STRC Outlet01" },
  { key: "employee-8", role: "employee", userId: 8, label: "何慧琳", group: "员工 · STRC Outlet01" },
];

const storageKey = "dta-mock-profile";

export function initialProfile(): MockProfile {
  try {
    const key = window.localStorage.getItem(storageKey);
    return profiles.find((profile) => profile.key === key) ?? profiles[0];
  } catch {
    return profiles[0];
  }
}

export function rememberProfile(profile: MockProfile): void {
  try {
    window.localStorage.setItem(storageKey, profile.key);
  } catch {
    // The selected identity still works when storage cannot be accessed.
  }
}
