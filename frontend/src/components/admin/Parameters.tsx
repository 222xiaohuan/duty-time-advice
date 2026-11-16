import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { BaselineRule, SubmitMode } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { employeeTypes, errorText, orgs } from "@/lib/admin";

type Param = { id?: number; orgId: number; empTypeCode: string; cutoffDays: number; baselineRule: string; submitMode: string; empEditEnable: number; autoGenRangeWeek: number; fieldSiteEnable: number; enableApproval: number; specialTagDiffEnable: number };
const modes = [
  { code: SubmitMode.MODE_ONLY_UNROSTERABLE, name: "仅报不可排" },
  { code: SubmitMode.MODE_ONLY_ROSTERABLE, name: "仅报可排" },
  { code: SubmitMode.MODE_ALL_STATUS, name: "可排与不可排" },
  { code: SubmitMode.MODE_NO_SUBMIT, name: "无需提报" },
];
function defaultParam(orgId: number, empTypeCode: string): Param {
  const rosterable = empTypeCode === "FULL_TIME";
  return { orgId, empTypeCode, cutoffDays: 3, baselineRule: rosterable ? BaselineRule.BASE_ROSTERABLE : BaselineRule.BASE_UNROSTERABLE,
    submitMode: rosterable ? SubmitMode.MODE_ONLY_UNROSTERABLE : SubmitMode.MODE_ONLY_ROSTERABLE, empEditEnable: 1, autoGenRangeWeek: 4,
    fieldSiteEnable: 0, enableApproval: 0, specialTagDiffEnable: 0 };
}
function allowed(baseline: string, mode: string) {
  return mode === SubmitMode.MODE_ALL_STATUS || mode === SubmitMode.MODE_NO_SUBMIT ||
    (baseline === BaselineRule.BASE_ROSTERABLE ? mode === SubmitMode.MODE_ONLY_UNROSTERABLE : mode === SubmitMode.MODE_ONLY_ROSTERABLE);
}

export function Parameters({ profile }: { profile: MockProfile }) {
  const [rows, setRows] = useState<Param[]>([]);
  const [orgId, setOrgId] = useState(1);
  const [empTypeCode, setEmpTypeCode] = useState("FULL_TIME");
  const [form, setForm] = useState<Param>(defaultParam(1, "FULL_TIME"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await apiGet<Param[]>("/param-groups", profile);
    setRows(data);
    setForm(data.find((row) => row.orgId === orgId && row.empTypeCode === empTypeCode) ?? defaultParam(orgId, empTypeCode));
  }
  useEffect(() => { void load().catch((cause) => setError(errorText(cause))); }, [profile]);
  useEffect(() => { setForm(rows.find((row) => row.orgId === orgId && row.empTypeCode === empTypeCode) ?? defaultParam(orgId, empTypeCode)); setMessage(""); setError(""); }, [rows, orgId, empTypeCode]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!Number.isInteger(form.cutoffDays) || form.cutoffDays < 0 || form.cutoffDays > 30 || !Number.isInteger(form.autoGenRangeWeek) || form.autoGenRangeWeek < 1 || form.autoGenRangeWeek > 12) {
      setError("截止天数须为 0–30，手动生成周数须为 1–12 的整数"); return;
    }
    setBusy(true);
    try {
      const payload = { orgId, empTypeCode, cutoffDays: form.cutoffDays, baselineRule: form.baselineRule, submitMode: form.submitMode,
        empEditEnable: form.empEditEnable, autoGenRangeWeek: form.autoGenRangeWeek, conflictCheckMode: "STRONG_BLOCK" };
      if (form.id) await apiPatch(`/param-groups/${form.id}`, profile, payload);
      else await apiPost("/param-groups", profile, payload);
      await load(); setMessage("参数已保存");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  return <div className="admin-stack">
    <div className="admin-intro"><h2>组织与员工类型参数</h2><span>按组合配置报备规则</span></div>
    <div className="admin-picker">
      <label>组织<select value={orgId} onChange={(event) => setOrgId(Number(event.target.value))}>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label>员工类型<select value={empTypeCode} onChange={(event) => setEmpTypeCode(event.target.value)}>{employeeTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select></label>
    </div>
    <form onSubmit={save} className="admin-form">
      <div className="admin-form-grid">
        <label>基线规则<select value={form.baselineRule} onChange={(event) => { const baselineRule = event.target.value; setForm({ ...form, baselineRule, submitMode: allowed(baselineRule, form.submitMode) ? form.submitMode : baselineRule === BaselineRule.BASE_ROSTERABLE ? SubmitMode.MODE_ONLY_UNROSTERABLE : SubmitMode.MODE_ONLY_ROSTERABLE }); }}>
          <option value={BaselineRule.BASE_ROSTERABLE}>默认可排</option><option value={BaselineRule.BASE_UNROSTERABLE}>默认不可排</option></select></label>
        <label>员工提报模式<select value={form.submitMode} onChange={(event) => setForm({ ...form, submitMode: event.target.value })}>{modes.map((mode) => <option key={mode.code} value={mode.code} disabled={!allowed(form.baselineRule, mode.code)}>{mode.name}</option>)}</select></label>
        <label>提前锁定天数<input type="number" min="0" max="30" step="1" required value={form.cutoffDays} onChange={(event) => setForm({ ...form, cutoffDays: event.target.valueAsNumber })} /></label>
        <label>手动生成未来周数<input type="number" min="1" max="12" step="1" required value={form.autoGenRangeWeek} onChange={(event) => setForm({ ...form, autoGenRangeWeek: event.target.valueAsNumber })} /></label>
      </div>
      <label className="admin-check"><input type="checkbox" checked={form.empEditEnable === 1} onChange={(event) => setForm({ ...form, empEditEnable: event.target.checked ? 1 : 0 })} />允许员工自主编辑</label>
      <div className="admin-reserved" aria-label="预留功能状态">{["场地", "审批", "特殊日期差异化"].map((name) => <label key={name} className="admin-check"><input type="checkbox" checked={false} disabled readOnly />{name}<span>关闭</span></label>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      <div className="admin-actions"><Button type="submit" disabled={busy}><Save size={16} />{busy ? "保存中" : "保存参数"}</Button></div>
    </form>
  </div>;
}
