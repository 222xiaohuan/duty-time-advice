import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { BaselineRule, SubmitMode } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { employeeTypes, errorText, labelOf } from "@/lib/admin";

type Rule = { empTypeCode: string; cutoffDays: number; baselineRule: string; submitMode: string; empEditEnable: number; priorityRosterEnable: number; autoGenRangeWeek: number };
type Scheme = { id: number; schemeName: string; sourceSchemeId: number | null; rules: Rule[]; assignedOrgIds: number[] };
type Org = { id: number; orgName: string; paramSchemeId: number | null; schemeName: string | null; rules: Rule[] };
type Draft = { schemeName: string; sourceSchemeId: number | null; rules: Rule[] };

const modes = [
  { code: SubmitMode.MODE_ONLY_UNROSTERABLE, name: "仅报不可排" },
  { code: SubmitMode.MODE_ONLY_ROSTERABLE, name: "仅报可排" },
  { code: SubmitMode.MODE_ALL_STATUS, name: "可排与不可排" },
  { code: SubmitMode.MODE_NO_SUBMIT, name: "无需提报" },
];
const defaultRule = (empTypeCode: string): Rule => {
  const fullTime = empTypeCode === "FULL_TIME";
  return { empTypeCode, cutoffDays: 3, baselineRule: fullTime ? BaselineRule.BASE_ROSTERABLE : BaselineRule.BASE_UNROSTERABLE,
    submitMode: fullTime ? SubmitMode.MODE_ONLY_UNROSTERABLE : SubmitMode.MODE_ONLY_ROSTERABLE,
    empEditEnable: 1, priorityRosterEnable: 0, autoGenRangeWeek: 4 };
};
const allowed = (baseline: string, mode: string) => mode === SubmitMode.MODE_ALL_STATUS || mode === SubmitMode.MODE_NO_SUBMIT ||
  (baseline === BaselineRule.BASE_ROSTERABLE ? mode === SubmitMode.MODE_ONLY_UNROSTERABLE : mode === SubmitMode.MODE_ONLY_ROSTERABLE);
const summary = (rule?: Rule) => rule ? `${rule.baselineRule === BaselineRule.BASE_ROSTERABLE ? "默认可排" : "默认不可排"} · 锁定 ${rule.cutoffDays} 天 · 优先排${rule.priorityRosterEnable ? "开启" : "关闭"}` : "未配置";
function changesFor(org: Org, scheme: Scheme): string {
  const changes = employeeTypes.flatMap((type) => {
    const before = org.rules.find((rule) => rule.empTypeCode === type.code);
    const after = scheme.rules.find((rule) => rule.empTypeCode === type.code);
    if (!after) return [`${type.name}：方案缺少规则`];
    if (!before) return [`${type.name}：新增规则`];
    const fields: [string, string, string][] = [
      ["基线", before.baselineRule === BaselineRule.BASE_ROSTERABLE ? "可排" : "不可排", after.baselineRule === BaselineRule.BASE_ROSTERABLE ? "可排" : "不可排"],
      ["提报模式", modes.find((mode) => mode.code === before.submitMode)?.name ?? before.submitMode, modes.find((mode) => mode.code === after.submitMode)?.name ?? after.submitMode],
      ["锁定天数", `${before.cutoffDays}`, `${after.cutoffDays}`], ["生成周数", `${before.autoGenRangeWeek}`, `${after.autoGenRangeWeek}`],
      ["员工编辑", before.empEditEnable ? "开" : "关", after.empEditEnable ? "开" : "关"],
      ["优先排", before.priorityRosterEnable ? "开" : "关", after.priorityRosterEnable ? "开" : "关"],
    ];
    const changed = fields.filter(([, oldValue, newValue]) => oldValue !== newValue).map(([name, oldValue, newValue]) => `${name} ${oldValue}→${newValue}`);
    return changed.length ? [`${type.name}：${changed.join("、")}`] : [];
  });
  return changes.length ? changes.join("；") : "规则无变化";
}

export function Parameters({ profile }: { profile: MockProfile }) {
  const [tab, setTab] = useState<"orgs" | "schemes">("orgs");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const chosen = schemes.find((scheme) => scheme.id === selectedId);
  const visibleOrgs = orgs.filter((org) => `${org.orgName} ${org.id} ${org.schemeName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedOrgs = orgs.filter((org) => selectedOrgIds.includes(org.id));
  const allVisibleSelected = visibleOrgs.length > 0 && visibleOrgs.every((org) => selectedOrgIds.includes(org.id));

  async function load() {
    const [nextOrgs, nextSchemes] = await Promise.all([apiGet<Org[]>("/orgs", profile), apiGet<Scheme[]>("/param-schemes", profile)]);
    setOrgs(nextOrgs); setSchemes(nextSchemes);
    setSelectedId((current) => nextSchemes.some((scheme) => scheme.id === current) ? current : nextSchemes[0]?.id ?? null);
  }
  useEffect(() => { void load().catch((cause) => setError(errorText(cause))); }, [profile]);
  function updateRule(empTypeCode: string, values: Partial<Rule>) {
    setDraft((current) => current && { ...current, rules: current.rules.map((rule) => rule.empTypeCode === empTypeCode ? { ...rule, ...values } : rule) });
  }
  function toggleOrg(id: number, checked: boolean) {
    setSelectedOrgIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  }
  function toggleVisible(checked: boolean) {
    const ids = visibleOrgs.map((org) => org.id);
    setSelectedOrgIds((current) => checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)));
  }
  async function createScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setError(""); setMessage("");
    if (!draft.schemeName.trim() || draft.rules.some((rule) => !Number.isInteger(rule.cutoffDays) || rule.cutoffDays < 0 || rule.cutoffDays > 30 || !Number.isInteger(rule.autoGenRangeWeek) || rule.autoGenRangeWeek < 1 || rule.autoGenRangeWeek > 12)) {
      setError("请填写方案名称；锁定天数须为 0–30，生成周数须为 1–12 的整数"); return;
    }
    setBusy(true);
    try {
      const created = await apiPost<Scheme>("/param-schemes", profile, { ...draft, schemeName: draft.schemeName.trim() });
      await load(); setSelectedId(created.id); setDraft(null); setMessage("参数方案已创建，可在组织应用中批量分配");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function assign() {
    if (!chosen || !selectedOrgIds.length) return;
    const names = selectedOrgs.slice(0, 5).map((org) => org.orgName).join("、");
    if (!window.confirm(`将“${chosen.schemeName}”应用到 ${selectedOrgIds.length} 个组织（${names}${selectedOrgIds.length > 5 ? "等" : ""}）？配置将立即生效。`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await apiPost(`/param-schemes/${chosen.id}/assign`, profile, { orgIds: selectedOrgIds });
      await load(); setSelectedOrgIds([]); setMessage(`已为 ${selectedOrgs.length} 个组织应用“${chosen.schemeName}”`);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  return <div className="admin-stack parameter-page">
    <div className="admin-intro"><h2>配置概览</h2><span>{orgs.length} 个组织 · {schemes.length} 个方案</span></div>
    <div className="parameter-tabs" role="tablist" aria-label="组织参数视图">
      <button role="tab" aria-selected={tab === "orgs"} className={tab === "orgs" ? "selected" : ""} onClick={() => setTab("orgs")}>组织应用</button>
      <button role="tab" aria-selected={tab === "schemes"} className={tab === "schemes" ? "selected" : ""} onClick={() => setTab("schemes")}>参数方案</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    {tab === "orgs" ? <>
      <div className="parameter-toolbar">
        <label>查找组织<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="组织名称或编号" /></label>
        <label>应用方案<select value={selectedId ?? ""} onChange={(event) => setSelectedId(Number(event.target.value))}>{schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.schemeName}</option>)}</select></label>
        <Button type="button" disabled={!chosen || !selectedOrgIds.length || busy} onClick={() => void assign()}><Check size={16} />应用到 {selectedOrgIds.length} 个组织</Button>
      </div>
      <div className="parameter-org-list" role="table" aria-label="组织参数方案分配">
        <div className="parameter-org-head" role="row"><label role="columnheader"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => toggleVisible(event.target.checked)} disabled={!visibleOrgs.length} />组织</label><span role="columnheader">当前方案</span><span role="columnheader">员工类型规则</span></div>
        {visibleOrgs.map((org) => <div className="parameter-org-row" role="row" key={org.id}>
          <label role="cell"><input type="checkbox" checked={selectedOrgIds.includes(org.id)} onChange={(event) => toggleOrg(org.id, event.target.checked)} /><strong>{org.orgName}</strong><small>#{org.id}</small></label>
          <span role="cell">{org.schemeName ?? (org.rules.length ? "单独配置" : "未配置")}</span>
          <div role="cell" className="parameter-rule-summary">{employeeTypes.map((type) => <span key={type.code}><b>{type.name}</b>{summary(org.rules.find((rule) => rule.empTypeCode === type.code))}</span>)}</div>
        </div>)}
        {!visibleOrgs.length && <p className="manager-no-data">没有匹配的组织</p>}
      </div>
      {selectedOrgs.length > 0 && chosen && <div className="parameter-preview"><strong>应用预览 · {selectedOrgs.length} 个组织 → {chosen.schemeName}</strong><div className="parameter-preview-list">{selectedOrgs.map((org) => <div key={org.id}><b>{org.orgName}</b><span>{changesFor(org, chosen)}</span></div>)}</div></div>}
    </> : <div className="parameter-scheme-layout">
      <aside className="parameter-scheme-list" aria-label="参数方案列表">
        <Button type="button" variant="outline" onClick={() => { setDraft({ schemeName: "", sourceSchemeId: null, rules: employeeTypes.map((type) => defaultRule(type.code)) }); setError(""); setMessage(""); }}><Plus size={16} />新建方案</Button>
        {schemes.map((scheme) => <button type="button" key={scheme.id} className={chosen?.id === scheme.id ? "selected" : ""} onClick={() => { setSelectedId(scheme.id); setDraft(null); }}><strong>{scheme.schemeName}</strong><small>{scheme.assignedOrgIds.length} 个组织使用</small></button>)}
      </aside>
      <div className="parameter-scheme-detail">
        {draft ? <form className="parameter-scheme-form" onSubmit={(event) => void createScheme(event)}>
          <div className="admin-intro"><h3>{draft.sourceSchemeId ? "复制为新方案" : "新建方案"}</h3><Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>取消</Button></div>
          <label className="parameter-name">方案名称<input required maxLength={80} value={draft.schemeName} onChange={(event) => setDraft({ ...draft, schemeName: event.target.value })} placeholder="例如：常规报备方案" /></label>
          {draft.rules.map((rule) => <section className="parameter-type-rule" key={rule.empTypeCode}>
            <h4>{labelOf(employeeTypes, rule.empTypeCode)}</h4>
            <div className="admin-form-grid">
              <label>基线规则<select value={rule.baselineRule} onChange={(event) => { const baselineRule = event.target.value; updateRule(rule.empTypeCode, { baselineRule, submitMode: allowed(baselineRule, rule.submitMode) ? rule.submitMode : baselineRule === BaselineRule.BASE_ROSTERABLE ? SubmitMode.MODE_ONLY_UNROSTERABLE : SubmitMode.MODE_ONLY_ROSTERABLE }); }}><option value={BaselineRule.BASE_ROSTERABLE}>默认可排</option><option value={BaselineRule.BASE_UNROSTERABLE}>默认不可排</option></select></label>
              <label>员工提报模式<select value={rule.submitMode} onChange={(event) => updateRule(rule.empTypeCode, { submitMode: event.target.value })}>{modes.map((mode) => <option key={mode.code} value={mode.code} disabled={!allowed(rule.baselineRule, mode.code)}>{mode.name}</option>)}</select></label>
              <label>提前锁定天数（包含当天）<input type="number" min="0" max="30" step="1" required value={rule.cutoffDays} onChange={(event) => updateRule(rule.empTypeCode, { cutoffDays: event.target.valueAsNumber })} /></label>
              <label>手动生成未来周数<input type="number" min="1" max="12" step="1" required value={rule.autoGenRangeWeek} onChange={(event) => updateRule(rule.empTypeCode, { autoGenRangeWeek: event.target.valueAsNumber })} /></label>
            </div>
            <div className="parameter-type-flags"><label className="admin-check"><input type="checkbox" checked={rule.empEditEnable === 1} onChange={(event) => updateRule(rule.empTypeCode, { empEditEnable: event.target.checked ? 1 : 0 })} />允许员工自主编辑</label><label className="admin-check"><input type="checkbox" checked={rule.priorityRosterEnable === 1} onChange={(event) => updateRule(rule.empTypeCode, { priorityRosterEnable: event.target.checked ? 1 : 0 })} />启用优先排</label></div>
          </section>)}
          <div className="admin-reserved" aria-label="预留功能状态">{["场地", "审批", "特殊日期差异化"].map((name) => <label key={name} className="admin-check"><input type="checkbox" checked={false} disabled readOnly />{name}<span>关闭</span></label>)}</div>
          <Button type="submit" disabled={busy}><Save size={16} />{busy ? "保存中" : "创建方案"}</Button>
        </form> : chosen ? <>
          <div className="admin-intro"><div><h3>{chosen.schemeName}</h3><span>{chosen.assignedOrgIds.length} 个组织使用</span></div><Button type="button" variant="outline" onClick={() => setDraft({ schemeName: `${chosen.schemeName}（副本）`, sourceSchemeId: chosen.id, rules: chosen.rules.map((rule) => ({ empTypeCode: rule.empTypeCode, cutoffDays: rule.cutoffDays, baselineRule: rule.baselineRule, submitMode: rule.submitMode, empEditEnable: rule.empEditEnable, priorityRosterEnable: rule.priorityRosterEnable, autoGenRangeWeek: rule.autoGenRangeWeek })) })}><Copy size={16} />复制为新方案</Button></div>
          {chosen.rules.map((rule) => <section className="parameter-type-rule" key={rule.empTypeCode}><h4>{labelOf(employeeTypes, rule.empTypeCode)}</h4><dl><div><dt>基线</dt><dd>{rule.baselineRule === BaselineRule.BASE_ROSTERABLE ? "默认可排" : "默认不可排"}</dd></div><div><dt>提报模式</dt><dd>{modes.find((mode) => mode.code === rule.submitMode)?.name}</dd></div><div><dt>提前锁定</dt><dd>{rule.cutoffDays} 天（包含当天）</dd></div><div><dt>生成周数</dt><dd>{rule.autoGenRangeWeek} 周</dd></div><div><dt>员工编辑</dt><dd>{rule.empEditEnable ? "开启" : "关闭"}</dd></div><div><dt>优先排</dt><dd>{rule.priorityRosterEnable ? "开启" : "关闭"}</dd></div></dl></section>)}
        </> : <p className="manager-no-data">创建一个参数方案</p>}
      </div>
    </div>}
  </div>;
}
