import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Link2, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { employeeTypes, errorText, labelOf, orgs, posts, weekdays } from "@/lib/admin";
import { RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";

type Template = { id: number; templateName: string; description: string | null; startDate: string; endDate: string | null; enabled: number };
type Item = { id: number; weekday: number; statusCode: string; startTime: string; endTime: string; endDayOffset: number; remark: string | null };
type Condition = { id: number; orgId: number | null; empTypeCode: string | null; postCode: string | null; priority: number };
type Detail = Template & { items: Item[]; conditions: Condition[] };
type Employee = { id: number; empName: string; empTypeCode: string; postCode: string };
type Directory = { orgId: number; orgName: string; employees: Employee[] };
type ItemForm = Omit<Item, "id">;
type ConditionForm = Omit<Condition, "id">;
type TemplateForm = { templateName: string; description: string; startDate: string; endDate: string; enabled: number };
type DialogMode = "create" | "edit" | "associate" | "generate" | null;
type GenerationResult = { summary: Record<string, number>; skipped: Array<{ empId: number; businessDate: string | null; reason: string; message: string }> };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
const blankTemplate = (): TemplateForm => ({ templateName: "", description: "", startDate: today(), endDate: "", enabled: 1 });
const blankItem: ItemForm = { weekday: 1, statusCode: RosterabilityStatus.ROSTERABLE, startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" };
const blankCondition = (orgId: number | null): ConditionForm => ({ orgId, empTypeCode: null, postCode: null, priority: 0 });
const statusLabel = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "可排" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "优先排" : "不可排";
const orgLabel = (id: number | null) => id === null ? "不限组织" : orgs.find((org) => org.id === id)?.name ?? String(id);
const skipLabels: Record<string, string> = { EXISTS: "已存在", LOCKED: "已锁定", SHIFT_CONFLICT: "班次冲突", NO_PARAM: "无参数", NO_TEMPLATE: "无模板", STATUS_DISABLED: "状态未启用" };
const summaryLabels: Record<string, string> = { shiftConflict: "班次冲突", noParam: "无参数", noTemplate: "无模板", statusDisabled: "状态未启用", exists: "已存在", locked: "已锁定" };

export function Templates({ profile }: { profile: MockProfile }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [page, setPage] = useState<"list" | "detail">("list");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [main, setMain] = useState<TemplateForm>(blankTemplate);
  const [item, setItem] = useState<ItemForm>(blankItem);
  const [condition, setCondition] = useState<ConditionForm>(blankCondition(profile.orgId ?? null));
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editingCondition, setEditingCondition] = useState<number | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogTemplate, setDialogTemplate] = useState<Template | null>(null);
  const [associationDetail, setAssociationDetail] = useState<Detail | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [search, setSearch] = useState("");
  const [associationSearch, setAssociationSearch] = useState("");
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) => `${template.templateName} ${template.description ?? ""}`.toLowerCase().includes(query));
  }, [search, templates]);
  const matchingEmployees = useMemo(() => {
    const query = associationSearch.trim().toLowerCase();
    return (directory?.employees ?? []).filter((employee) =>
      (!condition.empTypeCode || employee.empTypeCode === condition.empTypeCode) &&
      (!condition.postCode || employee.postCode === condition.postCode) &&
      (!query || employee.empName.toLowerCase().includes(query) || String(employee.id).includes(query)));
  }, [associationSearch, condition.empTypeCode, condition.postCode, directory?.employees]);

  useEffect(() => {
    let active = true;
    setLoading(true); setPage("list"); setSelected(null); setDetail(null); setDialogMode(null); setError("");
    apiGet<Template[]>("/templates", profile).then((rows) => { if (active) setTemplates(rows); }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    if (dialogMode && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!dialogMode && dialogRef.current?.open) dialogRef.current?.close();
  }, [dialogMode]);

  function closeDialog() {
    setDialogMode(null); setDialogTemplate(null); setAssociationDetail(null); setGeneration(null); setAssociationSearch(""); setEditingCondition(null);
  }

  async function refreshList() { setTemplates(await apiGet<Template[]>("/templates", profile)); }

  async function openDetail(id: number) {
    setError(""); setMessage(""); setSelected(id); setPage("detail"); setEditingItem(null); setEditingCondition(null);
    try {
      const next = await apiGet<Detail>(`/templates/${id}`, profile); setDetail(next);
      setMain({ templateName: next.templateName, description: next.description ?? "", startDate: next.startDate, endDate: next.endDate ?? "", enabled: next.enabled });
    } catch (cause) { setError(errorText(cause)); }
  }

  function backToList() { setPage("list"); setSelected(null); setDetail(null); setEditingItem(null); setEditingCondition(null); setError(""); }
  function openCreate() { setMain(blankTemplate()); setDialogTemplate(null); setError(""); setMessage(""); setDialogMode("create"); }
  function openEdit(template: Template) { setMain({ templateName: template.templateName, description: template.description ?? "", startDate: template.startDate, endDate: template.endDate ?? "", enabled: template.enabled }); setDialogTemplate(template); setError(""); setMessage(""); setDialogMode("edit"); }

  async function openAssociation(template: Template, edit?: Condition) {
    setDialogTemplate(template); setError(""); setMessage(""); setAssociationSearch(""); setEditingCondition(edit?.id ?? null); setCondition(edit ? { orgId: edit.orgId, empTypeCode: edit.empTypeCode, postCode: edit.postCode, priority: edit.priority } : blankCondition(profile.orgId ?? null));
    try {
      const [next, people] = await Promise.all([apiGet<Detail>(`/templates/${template.id}`, profile), apiGet<Directory>("/manager/employees", profile)]);
      setAssociationDetail(next); setDirectory(people); setDialogMode("associate");
    } catch (cause) { setError(errorText(cause)); }
  }

  function openGenerate(template: Template) { setDialogTemplate(template); setGeneration(null); setError(""); setMessage(""); setDialogMode("generate"); }

  async function saveMain(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (main.endDate && main.endDate < main.startDate) { setError("失效日期不得早于生效日期"); return; }
    setBusy(true); setError("");
    try {
      const payload = { ...main, description: main.description || null, endDate: main.endDate || null };
      if (dialogMode === "edit" && dialogTemplate) await apiPatch(`/templates/${dialogTemplate.id}`, profile, payload); else await apiPost("/templates", profile, payload);
      await refreshList(); closeDialog(); setMessage(dialogMode === "edit" ? "模板基本信息已保存" : "模板已创建");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function removeTemplate(templateId: number, templateName?: string) {
    if (!window.confirm(`删除模板“${templateName ?? "当前模板"}”及其可排性明细？`)) return;
    setBusy(true); setError("");
    try {
      await apiDelete(`/templates/${templateId}`, profile);
      await refreshList();
      if (selected === templateId) backToList();
      setMessage("模板已删除");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (selected === null) return;
    setBusy(true); setError("");
    try {
      const payload = { ...item, remark: item.remark || null }; const path = `/templates/${selected}/items`;
      if (editingItem === null) await apiPost(path, profile, payload); else await apiPatch(`${path}/${editingItem}`, profile, payload);
      setDetail(await apiGet<Detail>(`/templates/${selected}`, profile)); setItem(blankItem); setEditingItem(null); setMessage(editingItem === null ? "可排性时段已添加" : "可排性时段已保存");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function saveCondition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dialogTemplate && selected === null) return;
    if (condition.orgId === null && condition.empTypeCode === null && condition.postCode === null) { setError("至少选择一个匹配条件"); return; }
    if (!Number.isInteger(condition.priority) || condition.priority < 0) { setError("优先级须为非负整数"); return; }
    const templateId = dialogTemplate?.id ?? selected; if (templateId === null || templateId === undefined) return;
    setBusy(true); setError("");
    try {
      const path = `/templates/${templateId}/conditions`;
      if (editingCondition === null) await apiPost(path, profile, condition); else await apiPatch(`${path}/${editingCondition}`, profile, condition);
      const next = await apiGet<Detail>(`/templates/${templateId}`, profile); setAssociationDetail(next); if (selected === templateId) setDetail(next); setCondition(blankCondition(profile.orgId ?? null)); setEditingCondition(null); setMessage("关联条件已保存");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function deleteCondition(id: number) {
    const templateId = dialogTemplate?.id ?? selected; if (!templateId) return;
    setBusy(true); setError("");
    try { await apiDelete(`/templates/${templateId}/conditions/${id}`, profile); const next = await apiGet<Detail>(`/templates/${templateId}`, profile); setAssociationDetail(next); if (selected === templateId) setDetail(next); setMessage("关联条件已删除"); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function deleteItem(id: number) {
    if (!selected) return;
    setBusy(true); setError("");
    try { await apiDelete(`/templates/${selected}/items/${id}`, profile); setDetail(await apiGet<Detail>(`/templates/${selected}`, profile)); setMessage("可排性时段已删除"); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function generate() {
    if (!dialogTemplate) return;
    setBusy(true); setError("");
    try { setGeneration(await apiPost<GenerationResult>("/template-generation", profile, { templateId: dialogTemplate.id })); setMessage("未来可排性生成完成"); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  return <div className="admin-stack template-page">
    {page === "list" ? <>
      <div className="template-toolbar"><div><h2>周模板</h2><p>维护每周可排性规则，并按条件关联人员</p></div><Button type="button" onClick={openCreate}><Plus size={16} />新建模板</Button></div>
      <div className="template-list-toolbar"><label className="template-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模板名称或描述" aria-label="搜索模板" /></label><span>{templates.length} 个模板</span></div>
      <section className="template-table-wrap" aria-label="周模板列表"><table className="template-table"><thead><tr><th>模板名称</th><th>模板描述</th><th>生效日期</th><th>失效日期</th><th>模板状态</th><th>操作</th></tr></thead><tbody>
        {loading && <tr><td colSpan={6} className="template-empty">正在加载模板</td></tr>}{!loading && filteredTemplates.length === 0 && <tr><td colSpan={6} className="template-empty">暂无模板</td></tr>}
        {!loading && filteredTemplates.map((template) => <tr key={template.id}><td><button type="button" className="template-name-link" onClick={() => void openDetail(template.id)}>{template.templateName}<ChevronRight size={15} /></button></td><td className="template-description">{template.description || "—"}</td><td>{template.startDate}</td><td>{template.endDate || "—"}</td><td><span className={`template-status ${template.enabled ? "enabled" : "disabled"}`}>{template.enabled ? "启用" : "停用"}</span></td><td><div className="template-row-actions"><Button type="button" size="sm" variant="outline" onClick={() => openEdit(template)}><Pencil size={14} />编辑</Button><Button type="button" size="sm" variant="outline" onClick={() => void openAssociation(template)}><Link2 size={14} />关联人员</Button><Button type="button" size="sm" variant="outline" onClick={() => openGenerate(template)}><Sparkles size={14} />生成未来可排性</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void removeTemplate(template.id, template.templateName)}><Trash2 size={14} />删除</Button></div></td></tr>)}
      </tbody></table></section>
    </> : detail && <>
      <div className="template-detail-head"><Button type="button" variant="ghost" onClick={backToList}><ArrowLeft size={16} />返回模板列表</Button><div className="template-detail-actions"><Button type="button" variant="outline" onClick={() => openEdit(detail)}><Pencil size={15} />编辑基本信息</Button><Button type="button" variant="outline" onClick={() => void openAssociation(detail)}><Link2 size={15} />关联人员</Button><Button type="button" onClick={() => openGenerate(detail)}><Sparkles size={15} />生成未来可排性</Button></div></div>
      <div className="template-detail-title"><div><h2>{detail.templateName}</h2><p>{detail.description || "暂无模板描述"} · {detail.startDate} 至 {detail.endDate || "长期有效"}</p></div><span className={`template-status ${detail.enabled ? "enabled" : "disabled"}`}>{detail.enabled ? "启用" : "停用"}</span></div>
      <section className="admin-section"><div className="admin-intro"><h3>每天可排性</h3><span>周一至周日可配置多个时段，跨午夜时归属开始日</span></div><div className="week-grid">{weekdays.map((day, index) => <div className="week-day" key={day}><strong>{day}</strong>{detail.items.filter((row) => row.weekday === index + 1).map((row) => <div className="time-row" key={row.id}><span className={row.statusCode === RosterabilityStatus.ROSTERABLE ? "rosterable" : row.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "priority" : "unrosterable"}>{statusLabel(row.statusCode)}</span><span>{row.startTime}–{row.endDayOffset ? "次日 " : ""}{row.endTime}{row.remark && <small>{row.remark}</small>}</span><button type="button" onClick={() => { setEditingItem(row.id); setItem({ weekday: row.weekday, statusCode: row.statusCode, startTime: row.startTime, endTime: row.endTime, endDayOffset: row.endDayOffset, remark: row.remark }); }}>编辑</button><button type="button" aria-label={`删除${day}时段`} onClick={() => void deleteItem(row.id)}>×</button></div>)}{detail.items.every((row) => row.weekday !== index + 1) && <span className="muted-text">无时段</span>}</div>)}</div>
        <form className="admin-inline-form" onSubmit={saveItem}><h4>{editingItem ? "编辑时段" : "添加时段"}</h4><div className="admin-form-grid"><label>星期<select value={item.weekday} onChange={(event) => setItem({ ...item, weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label><label>状态<select value={item.statusCode} onChange={(event) => setItem({ ...item, statusCode: event.target.value })}><option value={RosterabilityStatus.ROSTERABLE}>可排</option><option value={RosterabilityStatus.UNROSTERABLE}>不可排</option><option value={RosterabilityStatus.PRIORITY_ROSTERABLE}>优先排</option></select></label><label>开始<input type="time" required value={item.startTime} onChange={(event) => setItem({ ...item, startTime: event.target.value })} /></label><label>结束<input type="time" required value={item.endTime} onChange={(event) => setItem({ ...item, endTime: event.target.value })} /></label><label>结束日期<select value={item.endDayOffset} onChange={(event) => setItem({ ...item, endDayOffset: Number(event.target.value) })}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label><label>备注<input maxLength={500} value={item.remark ?? ""} onChange={(event) => setItem({ ...item, remark: event.target.value })} /></label></div><div className="admin-actions"><Button type="submit" disabled={busy}><Save size={15} />{editingItem ? "保存时段" : "添加时段"}</Button>{editingItem && <Button type="button" variant="outline" onClick={() => { setEditingItem(null); setItem(blankItem); }}>取消</Button>}</div></form>
      </section>
      <section className="admin-section"><div className="admin-intro"><h3>关联条件</h3><span>当前模板已配置 {detail.conditions.length} 条条件，按优先级匹配员工</span></div><div className="condition-list">{detail.conditions.map((row) => <div className="condition-row" key={row.id}><strong>优先级 {row.priority}</strong><span>{orgLabel(row.orgId)} · {labelOf(employeeTypes, row.empTypeCode)} · {labelOf(posts, row.postCode)}</span><button type="button" onClick={() => void openAssociation(detail, row)}>编辑</button><button type="button" aria-label="删除条件" onClick={() => void deleteCondition(row.id)}>×</button></div>)}</div></section>
    </>}

    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    {dialogMode && <dialog ref={dialogRef} className="template-dialog" onClose={closeDialog} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="template-dialog-head"><div><h3>{dialogMode === "create" ? "新建模板" : dialogMode === "edit" ? "编辑模板基本信息" : dialogMode === "associate" ? "关联人员" : "生成未来可排性"}</h3><p>{dialogTemplate?.templateName ?? "填写模板基本信息"}</p></div><Button type="button" variant="ghost" size="icon" disabled={busy} onClick={closeDialog} aria-label="关闭"><X size={17} /></Button></div>
      {(dialogMode === "create" || dialogMode === "edit") && <form className="template-basic-form" onSubmit={saveMain}><label>模板名称<input required maxLength={100} value={main.templateName} onChange={(event) => setMain({ ...main, templateName: event.target.value })} /></label><label>模板描述<textarea maxLength={500} rows={3} value={main.description} onChange={(event) => setMain({ ...main, description: event.target.value })} /></label><div className="admin-form-grid"><label>生效日期<input required type="date" value={main.startDate} onChange={(event) => setMain({ ...main, startDate: event.target.value })} /></label><label>失效日期<input type="date" value={main.endDate} onChange={(event) => setMain({ ...main, endDate: event.target.value })} /></label></div><label className="admin-check"><input type="checkbox" checked={main.enabled === 1} onChange={(event) => setMain({ ...main, enabled: event.target.checked ? 1 : 0 })} />启用模板</label><div className="template-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>取消</Button><Button type="submit" disabled={busy}><Save size={15} />保存模板</Button></div></form>}
      {dialogMode === "associate" && <div className="template-association"><div className="association-filter-grid"><label>组织<select value={condition.orgId ?? ""} onChange={(event) => setCondition({ ...condition, orgId: event.target.value ? Number(event.target.value) : null })}><option value="">不限组织</option>{orgs.filter((org) => profile.orgId === null || org.id === profile.orgId).map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label>员工类型<select value={condition.empTypeCode ?? ""} onChange={(event) => setCondition({ ...condition, empTypeCode: event.target.value || null })}><option value="">全部类型</option>{employeeTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select></label><label>岗位<select value={condition.postCode ?? ""} onChange={(event) => setCondition({ ...condition, postCode: event.target.value || null })}><option value="">全部岗位</option>{posts.map((post) => <option key={post.code} value={post.code}>{post.name}</option>)}</select></label><label>优先级<input type="number" min="0" step="1" value={condition.priority} onChange={(event) => setCondition({ ...condition, priority: event.target.valueAsNumber })} /></label></div><label className="template-search association-search"><Search size={16} /><input value={associationSearch} onChange={(event) => setAssociationSearch(event.target.value)} placeholder="筛选人员姓名或员工编号" /></label><p className="association-count">符合当前筛选的人员：{matchingEmployees.length} 人</p><div className="association-people">{matchingEmployees.map((employee) => <div key={employee.id}><strong>{employee.empName}</strong><span>{employee.id} · {labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</span></div>)}{matchingEmployees.length === 0 && <p className="muted-text">当前筛选没有匹配人员</p>}</div><div className="template-association-existing"><strong>已关联条件</strong>{associationDetail?.conditions.map((row) => <div className="condition-row" key={row.id}><span>优先级 {row.priority} · {orgLabel(row.orgId)} · {labelOf(employeeTypes, row.empTypeCode)} · {labelOf(posts, row.postCode)}</span><button type="button" onClick={() => { setEditingCondition(row.id); setCondition({ orgId: row.orgId, empTypeCode: row.empTypeCode, postCode: row.postCode, priority: row.priority }); }}>编辑</button><button type="button" aria-label="删除关联条件" onClick={() => void deleteCondition(row.id)}>×</button></div>)}</div><form onSubmit={saveCondition} className="template-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>关闭</Button><Button type="submit" disabled={busy}><Link2 size={15} />{editingCondition ? "保存关联条件" : "关联当前筛选人员"}</Button></form></div>}
      {dialogMode === "generate" && <div className="template-generation-dialog"><p>将按该模板的匹配条件，为所辖组织员工生成未来参数范围内的可排性记录。重复生成会自动跳过已存在记录。</p>{generation && <><div className="generation-summary">{Object.entries(generation.summary).map(([key, value]) => <span key={key}><b>{value}</b>{key === "created" ? "新增" : summaryLabels[key] ?? key}</span>)}</div>{generation.skipped.length > 0 && <details open><summary>逐项跳过原因（{generation.skipped.length}）</summary><div className="manager-skip-list">{generation.skipped.map((row, index) => <div key={`${row.empId}-${row.businessDate}-${index}`}><strong>员工 {row.empId}</strong><span>{row.businessDate ?? "—"} · {skipLabels[row.reason] ?? row.reason} · {row.message}</span></div>)}</div></details>}</>}<div className="template-dialog-actions"><Button type="button" variant="outline" onClick={closeDialog}>关闭</Button>{!generation && <Button type="button" disabled={busy} onClick={() => void generate()}><Sparkles size={15} />开始生成</Button>}</div></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </dialog>}
  </div>;
}
