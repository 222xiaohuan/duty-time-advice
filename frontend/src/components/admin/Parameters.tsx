import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronRight, Copy, Pencil, Plus, Save, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { BaselineRule, SubmitMode } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { employeeTypes, errorText } from "@/lib/admin";

type Rule = { cutoffDays: number; baselineRule: string; submitMode: string; empEditEnable: number; priorityRosterEnable: number; autoGenRangeWeek: number };
type LegacyRule = Rule & { empTypeCode: string };
type Org = { id: number; orgName: string; parentOrgId: number | null; paramSchemeId: number | null; schemeName: string | null; rules: LegacyRule[] };
type Authorization = { id: number; schemeId: number; orgId: number; empTypeCode: string; includeChildren: number };
type Scheme = { id: number; schemeName: string; description: string | null; sourceSchemeId: number | null; rule: Rule | null; rules: LegacyRule[]; assignedOrgIds: number[]; authorizations: Authorization[] };
type Draft = { schemeName: string; description: string; sourceSchemeId: number | null; rule: Rule };
type SchemeDialogMode = "create" | "copy" | "edit";
type OrgNode = Org & { children: OrgNode[] };
type EmployeeFilterField = "EMP_TYPE";

const defaultRule = (): Rule => ({ cutoffDays: 3, baselineRule: BaselineRule.BASE_ROSTERABLE, submitMode: SubmitMode.MODE_ONLY_UNROSTERABLE, empEditEnable: 1, priorityRosterEnable: 0, autoGenRangeWeek: 4 });
const modes = [
  { code: SubmitMode.MODE_ONLY_UNROSTERABLE, name: "仅报不可排" },
  { code: SubmitMode.MODE_ONLY_ROSTERABLE, name: "仅报可排" },
  { code: SubmitMode.MODE_ALL_STATUS, name: "可排与不可排" },
  { code: SubmitMode.MODE_NO_SUBMIT, name: "无需提报" },
];
const allowed = (baseline: string, mode: string) => mode === SubmitMode.MODE_ALL_STATUS || mode === SubmitMode.MODE_NO_SUBMIT || (baseline === BaselineRule.BASE_ROSTERABLE ? mode === SubmitMode.MODE_ONLY_UNROSTERABLE : mode === SubmitMode.MODE_ONLY_ROSTERABLE);
const ruleOf = (scheme?: Scheme | null): Rule => scheme?.rule ?? scheme?.rules?.[0] ?? defaultRule();

function treeOf(orgs: Org[], parentId: number | null = null): OrgNode[] {
  return orgs.filter((org) => org.parentOrgId === parentId).map((org) => ({ ...org, children: treeOf(orgs, org.id) }));
}

function OrgTree({ nodes, selected, expanded, onToggle, onExpand, level = 0 }: { nodes: OrgNode[]; selected: number[]; expanded: number[]; onToggle: (id: number, checked: boolean) => void; onExpand: (id: number) => void; level?: number }): ReactNode {
  return nodes.map((node) => {
    const open = expanded.includes(node.id);
    return <div className="authorization-org-node" key={node.id}>
      <div className="authorization-org-row" style={{ paddingLeft: `${12 + level * 24}px` }}>
        {node.children.length ? <button type="button" className="authorization-org-expand" aria-label={open ? `收起${node.orgName}` : `展开${node.orgName}`} onClick={() => onExpand(node.id)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="authorization-org-indent" />}
        <input type="checkbox" checked={selected.includes(node.id)} onChange={(event) => onToggle(node.id, event.target.checked)} />
        <Building2 size={15} className={level < 2 ? "authorization-org-icon" : "authorization-org-icon leaf"} />
        <span>{node.orgName}</span><small>#{node.id}</small>
      </div>
      {open && node.children.length > 0 && <OrgTree nodes={node.children} selected={selected} expanded={expanded} onToggle={onToggle} onExpand={onExpand} level={level + 1} />}
    </div>;
  });
}

export function Parameters({ profile }: { profile: MockProfile }) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [search, setSearch] = useState("");
  const [schemeDraft, setSchemeDraft] = useState<Draft | null>(null);
  const [schemeDialogMode, setSchemeDialogMode] = useState<SchemeDialogMode | null>(null);
  const [editingSchemeId, setEditingSchemeId] = useState<number | null>(null);
  const [authorizationScheme, setAuthorizationScheme] = useState<Scheme | null>(null);
  const [authorizationOrgIds, setAuthorizationOrgIds] = useState<number[]>([]);
  const [authorizationEmpTypes, setAuthorizationEmpTypes] = useState<string[]>([]);
  const [includeChildren, setIncludeChildren] = useState(false);
  const [expandedOrgIds, setExpandedOrgIds] = useState<number[]>([]);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [employeeFilterField, setEmployeeFilterField] = useState<EmployeeFilterField>("EMP_TYPE");
  const [employeeFilterOperator, setEmployeeFilterOperator] = useState("CONTAINS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const schemeDialogRef = useRef<HTMLDialogElement>(null);
  const authorizationRef = useRef<HTMLDialogElement>(null);
  const visibleSchemes = schemes.filter((scheme) => `${scheme.schemeName} ${scheme.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const orgTree = treeOf(orgs);

  useEffect(() => { const dialog = schemeDialogRef.current; if (schemeDraft && !dialog?.open) dialog?.showModal(); if (!schemeDraft && dialog?.open) dialog.close(); }, [schemeDraft]);
  useEffect(() => { const dialog = authorizationRef.current; if (authorizationScheme && !dialog?.open) dialog?.showModal(); if (!authorizationScheme && dialog?.open) dialog.close(); }, [authorizationScheme]);

  async function load() {
    const [nextOrgs, nextSchemes] = await Promise.all([apiGet<Org[]>("/orgs", profile), apiGet<Scheme[]>("/param-schemes", profile)]);
    setOrgs(nextOrgs); setSchemes(nextSchemes);
    setExpandedOrgIds(nextOrgs.filter((org) => nextOrgs.some((child) => child.parentOrgId === org.id)).map((org) => org.id));
  }
  useEffect(() => { void load().catch((cause) => setError(errorText(cause))); }, [profile]);

  function updateRule(values: Partial<Rule>) { setSchemeDraft((current) => current && { ...current, rule: { ...current.rule, ...values } }); }
  function openSchemeDialog(mode: SchemeDialogMode, scheme?: Scheme) {
    const source = scheme ?? schemes[0]; setError(""); setMessage(""); setSchemeDialogMode(mode); setEditingSchemeId(mode === "edit" ? source?.id ?? null : null);
    setSchemeDraft({ schemeName: mode === "create" ? "" : `${source?.schemeName ?? "参数模板"}${mode === "copy" ? "（副本）" : ""}`, description: mode === "create" ? "" : source?.description ? `${source.description}${mode === "copy" ? "（副本）" : ""}` : "", sourceSchemeId: mode === "copy" ? source?.id ?? null : null, rule: { ...ruleOf(source) } });
  }
  function closeSchemeDialog() { setSchemeDraft(null); setSchemeDialogMode(null); setEditingSchemeId(null); }
  async function saveScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!schemeDraft || !schemeDialogMode) return; setError(""); setMessage("");
    const rule = schemeDraft.rule;
    if (!schemeDraft.schemeName.trim() || !Number.isInteger(rule.cutoffDays) || rule.cutoffDays < 0 || rule.cutoffDays > 30 || !Number.isInteger(rule.autoGenRangeWeek) || rule.autoGenRangeWeek < 1 || rule.autoGenRangeWeek > 12) { setError("请填写参数模板名称；锁定天数须为 0–30，生成周数须为 1–12 的整数"); return; }
    setBusy(true);
    try {
      const body = { schemeName: schemeDraft.schemeName.trim(), description: schemeDraft.description.trim() || null, rule, ...(schemeDialogMode === "copy" ? { sourceSchemeId: schemeDraft.sourceSchemeId } : {}) };
      const saved = schemeDialogMode === "edit" && editingSchemeId ? await apiPatch<Scheme>(`/param-schemes/${editingSchemeId}`, profile, body) : await apiPost<Scheme>("/param-schemes", profile, body);
      await load(); closeSchemeDialog(); setMessage(schemeDialogMode === "edit" ? "参数模板已更新" : schemeDialogMode === "copy" ? "参数模板已复制" : "参数模板已创建");
      if (!saved.id) setError("参数模板已保存，但返回数据不完整");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function deleteScheme(scheme: Scheme) {
    if (scheme.assignedOrgIds.length) { setError("该参数模板已授权组织，请先解除授权后再删除"); return; }
    if (!window.confirm(`确定删除参数模板“${scheme.schemeName}”？`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiDelete(`/param-schemes/${scheme.id}`, profile); await load(); setMessage("参数模板已删除"); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  function openAuthorization(scheme: Scheme) {
    const rows = scheme.authorizations ?? [];
    const selectedTypes = [...new Set(rows.map((row) => row.empTypeCode))];
    setAuthorizationScheme(scheme); setAuthorizationOrgIds([...new Set(rows.map((row) => row.orgId))]); setAuthorizationEmpTypes(selectedTypes.length ? selectedTypes : employeeTypes.map((type) => type.code)); setIncludeChildren(rows.some((row) => row.includeChildren === 1)); setEmployeeFilterField("EMP_TYPE"); setEmployeeFilterOperator("CONTAINS"); setOrgPickerOpen(false); setEmployeePickerOpen(false); setError(""); setMessage("");
  }
  function closeAuthorization() { setAuthorizationScheme(null); setOrgPickerOpen(false); setEmployeePickerOpen(false); }
  function toggleAuthorizationOrg(id: number, checked: boolean) { setAuthorizationOrgIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)); }
  function toggleExpandedOrg(id: number) { setExpandedOrgIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  function toggleAuthorizationEmpType(code: string, checked: boolean) { setAuthorizationEmpTypes((current) => checked ? [...new Set([...current, code])] : current.filter((value) => value !== code)); }
  async function saveAuthorization() {
    if (!authorizationScheme || !authorizationOrgIds.length || !authorizationEmpTypes.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiPost(`/param-schemes/${authorizationScheme.id}/authorize`, profile, { orgIds: authorizationOrgIds, empTypeCodes: authorizationEmpTypes, includeChildren: includeChildren ? 1 : 0 }); await load(); closeAuthorization(); setMessage(`已授权 ${authorizationOrgIds.length} 个组织，${authorizationEmpTypes.length} 种员工类型${includeChildren ? "（包含子组织）" : ""}`); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function clearAuthorization() {
    if (!authorizationScheme || !authorizationScheme.authorizations?.length || busy) return;
    if (!window.confirm(`确定解除“${authorizationScheme.schemeName}”的全部组织授权？解除后对应组织将恢复未配置状态。`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiDelete(`/param-schemes/${authorizationScheme.id}/authorize`, profile); await load(); closeAuthorization(); setMessage("参数模板授权已解除"); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  return <div className="admin-stack parameter-page">
    <div className="admin-intro"><h2>参数模板</h2><span>{orgs.length} 个组织 · {schemes.length} 个参数模板</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    <section className="parameter-scheme-section">
      <div className="parameter-scheme-toolbar"><div><h3>参数模板</h3><p>模板只维护一套通用规则，在授权时指定组织范围和员工类型。</p></div><div className="parameter-scheme-toolbar-actions"><label>查找模板<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="模板名称或描述" /></label><Button type="button" onClick={() => openSchemeDialog("create")}><Plus size={16} />新增参数模板</Button></div></div>
      <div className="parameter-scheme-table-wrap"><table className="parameter-scheme-table"><thead><tr><th>参数模板名称</th><th>参数模板描述</th><th>授权范围</th><th>操作</th></tr></thead><tbody>{visibleSchemes.map((scheme) => <tr key={scheme.id}><td><strong>{scheme.schemeName}</strong><small>{scheme.assignedOrgIds.length ? `已授权 ${scheme.assignedOrgIds.length} 个组织` : "尚未授权组织"}</small></td><td>{scheme.description || "—"}</td><td><span className="parameter-authorization-summary"><UsersRound size={14} />{scheme.authorizations?.length ? `${new Set(scheme.authorizations.map((row) => row.orgId)).size} 个组织 · ${new Set(scheme.authorizations.map((row) => row.empTypeCode)).size} 种员工类型` : "未配置授权"}</span></td><td><div className="parameter-scheme-actions"><Button type="button" variant="outline" size="sm" onClick={() => openSchemeDialog("copy", scheme)}><Copy size={14} />复制模板</Button><Button type="button" variant="outline" size="sm" onClick={() => openSchemeDialog("edit", scheme)}><Pencil size={14} />编辑模板</Button><Button type="button" variant="outline" size="sm" disabled={busy || scheme.assignedOrgIds.length > 0} title={scheme.assignedOrgIds.length ? "已授权组织的模板需先解除授权" : "删除模板"} onClick={() => void deleteScheme(scheme)}><Trash2 size={14} />删除模板</Button><Button type="button" variant="outline" size="sm" onClick={() => openAuthorization(scheme)}><ShieldCheck size={14} />模板授权</Button></div></td></tr>)}{!visibleSchemes.length && <tr><td colSpan={4} className="parameter-scheme-empty">暂无参数模板，请先新增。</td></tr>}</tbody></table></div>
    </section>
    {schemeDraft && <dialog ref={schemeDialogRef} className="template-dialog parameter-scheme-dialog" aria-labelledby="parameter-scheme-dialog-title" onClose={closeSchemeDialog} onCancel={(event) => { if (busy) event.preventDefault(); }}><form className="parameter-scheme-form" onSubmit={(event) => void saveScheme(event)}><div className="template-dialog-head"><div><h3 id="parameter-scheme-dialog-title">{schemeDialogMode === "edit" ? "编辑参数模板" : schemeDialogMode === "copy" ? "复制参数模板" : "新增参数模板"}</h3><p>模板维护一套通用规则，授权时再选择适用组织和员工类型。</p></div><Button type="button" variant="outline" size="icon" title="关闭" aria-label="关闭" disabled={busy} onClick={closeSchemeDialog}><X size={16} /></Button></div><label className="parameter-name">参数模板名称<input required maxLength={80} value={schemeDraft.schemeName} onChange={(event) => setSchemeDraft({ ...schemeDraft, schemeName: event.target.value })} placeholder="例如：常规报备模板" /></label><label className="parameter-description">参数模板描述<textarea maxLength={500} rows={3} value={schemeDraft.description} onChange={(event) => setSchemeDraft({ ...schemeDraft, description: event.target.value })} placeholder="说明适用范围或特殊规则" /></label><section className="parameter-type-rule parameter-generic-rule"><h4>通用参数</h4><div className="admin-form-grid"><label>基线规则<select value={schemeDraft.rule.baselineRule} onChange={(event) => { const baselineRule = event.target.value; updateRule({ baselineRule, submitMode: allowed(baselineRule, schemeDraft.rule.submitMode) ? schemeDraft.rule.submitMode : baselineRule === BaselineRule.BASE_ROSTERABLE ? SubmitMode.MODE_ONLY_UNROSTERABLE : SubmitMode.MODE_ONLY_ROSTERABLE }); }}><option value={BaselineRule.BASE_ROSTERABLE}>默认可排</option><option value={BaselineRule.BASE_UNROSTERABLE}>默认不可排</option></select></label><label>员工提报模式<select value={schemeDraft.rule.submitMode} onChange={(event) => updateRule({ submitMode: event.target.value })}>{modes.map((mode) => <option key={mode.code} value={mode.code} disabled={!allowed(schemeDraft.rule.baselineRule, mode.code)}>{mode.name}</option>)}</select></label><label>提前锁定天数（包含当天）<input type="number" min="0" max="30" step="1" required value={schemeDraft.rule.cutoffDays} onChange={(event) => updateRule({ cutoffDays: event.target.valueAsNumber })} /></label><label>手动生成未来周数<input type="number" min="1" max="12" step="1" required value={schemeDraft.rule.autoGenRangeWeek} onChange={(event) => updateRule({ autoGenRangeWeek: event.target.valueAsNumber })} /></label></div><div className="parameter-type-flags"><label className="admin-check"><input type="checkbox" checked={schemeDraft.rule.empEditEnable === 1} onChange={(event) => updateRule({ empEditEnable: event.target.checked ? 1 : 0 })} />允许员工自主编辑</label><label className="admin-check"><input type="checkbox" checked={schemeDraft.rule.priorityRosterEnable === 1} onChange={(event) => updateRule({ priorityRosterEnable: event.target.checked ? 1 : 0 })} />启用优先排</label></div></section><div className="admin-reserved" aria-label="预留功能状态">{["场地", "审批", "特殊日期差异化"].map((name) => <label key={name} className="admin-check"><input type="checkbox" checked={false} disabled readOnly />{name}<span>关闭</span></label>)}</div><div className="template-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeSchemeDialog}>取消</Button><Button type="submit" disabled={busy}><Save size={16} />{busy ? "保存中" : schemeDialogMode === "edit" ? "保存修改" : "保存模板"}</Button></div></form></dialog>}
    {authorizationScheme && <dialog ref={authorizationRef} className="template-dialog parameter-authorization-dialog" aria-labelledby="parameter-authorization-title" onClose={closeAuthorization} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="template-dialog-head"><div><h3 id="parameter-authorization-title">授权</h3><p>{authorizationScheme.schemeName} · 选择组织范围和员工类型</p></div><Button type="button" variant="outline" size="icon" title="关闭" aria-label="关闭" disabled={busy} onClick={closeAuthorization}><X size={16} /></Button></div>
      <section className="authorization-section"><h4>组织条件</h4><div className="authorization-condition-label">适用人员</div><div className="authorization-condition-row authorization-filter-row"><div className="authorization-filter-controls"><button type="button" className="authorization-condition-icon authorization-filter-icon" aria-label="增加组织条件" disabled><Plus size={18} /></button><button type="button" className="authorization-filter-minus" aria-label="删除组织条件" disabled>−</button><select aria-label="组织筛选字段" value="ORG" disabled><option value="ORG">组织</option></select><select aria-label="组织筛选操作" value="EQUALS" disabled><option value="EQUALS">等于</option></select></div><div className="authorization-picker-wrap"><button type="button" className="authorization-picker" aria-expanded={orgPickerOpen} onClick={() => setOrgPickerOpen((open) => !open)}><span className="authorization-picker-values">{authorizationOrgIds.length ? authorizationOrgIds.map((id) => <span className="authorization-chip" key={id}>{orgs.find((org) => org.id === id)?.orgName ?? `组织 #${id}`}<span aria-hidden="true">×</span></span>) : <span className="authorization-picker-placeholder">选择组织</span>}</span><ChevronDown size={16} /></button>{orgPickerOpen && <div className="authorization-picker-menu authorization-tree">{orgTree.length ? <OrgTree nodes={orgTree} selected={authorizationOrgIds} expanded={expandedOrgIds} onToggle={toggleAuthorizationOrg} onExpand={toggleExpandedOrg} /> : <p className="muted-text">暂无组织数据</p>}</div>}</div><label className="authorization-children"><input type="checkbox" checked={includeChildren} onChange={(event) => setIncludeChildren(event.target.checked)} />包含子组织</label></div><p className="authorization-hint">组织条件支持多选；勾选“包含子组织”时覆盖所选组织树下的全部子组织。</p></section>
      <section className="authorization-section"><h4>人员条件</h4><div className="authorization-condition-label">适用人员</div><div className="authorization-condition-row authorization-filter-row"><div className="authorization-filter-controls"><button type="button" className="authorization-condition-icon authorization-filter-icon" aria-label="增加人员条件" disabled><Plus size={18} /></button><button type="button" className="authorization-filter-minus" aria-label="删除人员条件" disabled>−</button><select aria-label="人员筛选字段" value={employeeFilterField} onChange={(event) => setEmployeeFilterField(event.target.value as EmployeeFilterField)}><option value="EMP_TYPE">员工类型</option><option disabled>员工组（标准产品）</option><option disabled>员工性质（标准产品）</option><option disabled>性别（标准产品）</option><option disabled>岗位（标准产品）</option><option disabled>劳动合同（标准产品）</option><option disabled>工作城市（标准产品）</option></select><select aria-label="人员筛选操作" value={employeeFilterOperator} onChange={(event) => setEmployeeFilterOperator(event.target.value)}><option value="CONTAINS">包含</option><option disabled value="NOT_EMPTY">非空（标准产品）</option><option disabled value="EQUALS">等于（标准产品）</option></select></div><div className="authorization-picker-wrap"><button type="button" className="authorization-picker" aria-expanded={employeePickerOpen} onClick={() => setEmployeePickerOpen((open) => !open)}><span className="authorization-picker-values">{authorizationEmpTypes.length ? authorizationEmpTypes.map((code) => <span className="authorization-chip" key={code}>{employeeTypes.find((type) => type.code === code)?.name ?? code}<span aria-hidden="true">×</span></span>) : <span className="authorization-picker-placeholder">请选择员工类型</span>}</span><ChevronDown size={16} /></button>{employeePickerOpen && <div className="authorization-picker-menu authorization-type-options">{employeeTypes.map((type) => <label key={type.code}><input type="checkbox" checked={authorizationEmpTypes.includes(type.code)} onChange={(event) => toggleAuthorizationEmpType(type.code, event.target.checked)} />{type.name}</label>)}</div>}</div></div><p className="authorization-hint">Demo 当前支持员工类型多选；其他人员维度保留为标准产品扩展。</p></section>
      <div className="template-dialog-actions"><Button type="button" variant="outline" disabled={busy || !authorizationScheme.authorizations?.length} onClick={() => void clearAuthorization()}>解除全部授权</Button><span className="template-dialog-actions-spacer" /><Button type="button" variant="outline" disabled={busy} onClick={closeAuthorization}>取消</Button><Button type="button" disabled={busy || !authorizationOrgIds.length || !authorizationEmpTypes.length} onClick={() => void saveAuthorization()}><ShieldCheck size={16} />{busy ? "保存中" : "确定"}</Button></div>
    </dialog>}
  </div>;
}
