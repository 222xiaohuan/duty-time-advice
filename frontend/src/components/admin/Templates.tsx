import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { employeeTypes, errorText, labelOf, orgs, posts, weekdays } from "@/lib/admin";
import { RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";

type Template = { id: number; templateName: string; startDate: string; endDate: string | null; enabled: number };
type Item = { id: number; weekday: number; statusCode: string; startTime: string; endTime: string; endDayOffset: number; remark: string | null };
type Condition = { id: number; orgId: number | null; empTypeCode: string | null; postCode: string | null; priority: number };
type Detail = Template & { items: Item[]; conditions: Condition[] };
type ItemForm = Omit<Item, "id">;
type ConditionForm = Omit<Condition, "id">;
const blankTemplate = { templateName: "", startDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }), endDate: "", enabled: 1 };
const blankItem: ItemForm = { weekday: 1, statusCode: "ROSTERABLE", startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" };
const blankCondition: ConditionForm = { orgId: 1, empTypeCode: null, postCode: null, priority: 0 };
const statusLabel = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "可排" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "优先排" : "不可排";

export function Templates({ profile }: { profile: MockProfile }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [main, setMain] = useState({ ...blankTemplate });
  const [item, setItem] = useState<ItemForm>(blankItem);
  const [condition, setCondition] = useState<ConditionForm>(blankCondition);
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editingCondition, setEditingCondition] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh(id: number | null = selected) {
    const list = await apiGet<Template[]>("/templates", profile);
    setTemplates(list);
    if (id !== null) {
      const next = await apiGet<Detail>(`/templates/${id}`, profile);
      setDetail(next); setMain({ templateName: next.templateName, startDate: next.startDate, endDate: next.endDate ?? "", enabled: next.enabled });
    } else { setDetail(null); }
  }
  useEffect(() => { void refresh(null).catch((cause) => setError(errorText(cause))); }, [profile]);
  async function choose(id: number | null) {
    setError(""); setMessage(""); setSelected(id); setEditingItem(null); setEditingCondition(null); setItem(blankItem); setCondition(blankCondition);
    if (id === null) { setDetail(null); setMain(blankTemplate); return; }
    try { await refresh(id); } catch (cause) { setError(errorText(cause)); }
  }
  async function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await refresh(); after?.(); setMessage(success); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function saveMain(event: React.FormEvent) {
    event.preventDefault();
    if (main.endDate && main.endDate < main.startDate) { setError("失效日期不得早于生效日期"); return; }
    const payload = { ...main, endDate: main.endDate || null };
    if (selected !== null) await run(() => apiPatch(`/templates/${selected}`, profile, payload), "模板已保存");
    else {
      setBusy(true); setError("");
      try { const created = await apiPost<Template>("/templates", profile, payload); setSelected(created.id); await refresh(created.id); setMessage("模板已创建，可继续设置时段和条件"); }
      catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
    }
  }
  async function removeTemplate() {
    if (selected === null || !window.confirm("删除此模板及其页面入口？")) return;
    const id = selected;
    setBusy(true); setError(""); setMessage("");
    try { await apiDelete(`/templates/${id}`, profile); setSelected(null); await refresh(null); setMain(blankTemplate); setMessage("模板已删除"); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); if (selected === null) return;
    const payload = { ...item, remark: item.remark || null };
    const path = `/templates/${selected}/items`;
    await run(() => editingItem === null ? apiPost(path, profile, payload) : apiPatch(`${path}/${editingItem}`, profile, payload), editingItem === null ? "时段已添加" : "时段已保存", () => { setItem(blankItem); setEditingItem(null); });
  }
  async function saveCondition(event: React.FormEvent) {
    event.preventDefault(); if (selected === null) return;
    if (condition.orgId === null && condition.empTypeCode === null && condition.postCode === null) { setError("至少选择一个匹配条件"); return; }
    if (!Number.isInteger(condition.priority) || condition.priority < 0) { setError("优先级须为非负整数"); return; }
    const path = `/templates/${selected}/conditions`;
    await run(() => editingCondition === null ? apiPost(path, profile, condition) : apiPatch(`${path}/${editingCondition}`, profile, condition), editingCondition === null ? "条件已添加" : "条件已保存", () => { setCondition(blankCondition); setEditingCondition(null); });
  }

  return <div className="admin-stack">
    <div className="admin-intro"><h2>周模板</h2><Button type="button" size="sm" variant="outline" onClick={() => void choose(null)}><Plus size={15} />新建模板</Button></div>
    <div className="template-layout">
      <nav className="template-list" aria-label="模板列表">{templates.length === 0 && <p className="muted-text">暂无模板</p>}{templates.map((template) => <button type="button" className={selected === template.id ? "selected" : ""} key={template.id} onClick={() => void choose(template.id)}><strong>{template.templateName}</strong><small>{template.enabled ? "启用" : "停用"} · {template.startDate}</small></button>)}</nav>
      <div className="template-detail">
        <form className="admin-form" onSubmit={saveMain}>
          <div className="admin-form-title"><h3>{selected === null ? "新建模板" : "模板设置"}</h3>{selected !== null && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void removeTemplate()}><Trash2 size={15} />删除</Button>}</div>
          <div className="admin-form-grid"><label>模板名称<input required maxLength={100} value={main.templateName} onChange={(event) => setMain({ ...main, templateName: event.target.value })} /></label><label>生效日期<input required type="date" value={main.startDate} onChange={(event) => setMain({ ...main, startDate: event.target.value })} /></label><label>失效日期<input type="date" value={main.endDate} onChange={(event) => setMain({ ...main, endDate: event.target.value })} /></label></div>
          <label className="admin-check"><input type="checkbox" checked={main.enabled === 1} onChange={(event) => setMain({ ...main, enabled: event.target.checked ? 1 : 0 })} />启用模板</label>
          <div className="admin-actions"><Button disabled={busy} type="submit"><Save size={15} />保存模板</Button></div>
        </form>
        {detail && <>
          <section className="admin-section"><div className="admin-intro"><h3>每周时段</h3><span>每天可添加多条</span></div>
            <div className="week-grid">{weekdays.map((day, index) => <div className="week-day" key={day}><strong>{day}</strong>{detail.items.filter((row) => row.weekday === index + 1).map((row) => <div className="time-row" key={row.id}><span className={row.statusCode === RosterabilityStatus.ROSTERABLE ? "rosterable" : row.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "priority" : "unrosterable"}>{statusLabel(row.statusCode)}</span><span>{row.startTime}–{row.endDayOffset ? "次日 " : ""}{row.endTime}{row.remark && <small>{row.remark}</small>}</span><button type="button" aria-label={`编辑${day}时段`} onClick={() => { setEditingItem(row.id); setItem({ weekday: row.weekday, statusCode: row.statusCode, startTime: row.startTime, endTime: row.endTime, endDayOffset: row.endDayOffset, remark: row.remark }); }}>编辑</button><button type="button" aria-label={`删除${day}时段`} onClick={() => void run(() => apiDelete(`/templates/${selected}/items/${row.id}`, profile), "时段已删除")}>×</button></div>)}{detail.items.every((row) => row.weekday !== index + 1) && <span className="muted-text">无时段</span>}</div>)}</div>
            <form className="admin-inline-form" onSubmit={saveItem}><h4>{editingItem ? "编辑时段" : "添加时段"}</h4><div className="admin-form-grid"><label>星期<select value={item.weekday} onChange={(event) => setItem({ ...item, weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label><label>状态<select value={item.statusCode} onChange={(event) => setItem({ ...item, statusCode: event.target.value })}><option value={RosterabilityStatus.ROSTERABLE}>可排</option><option value={RosterabilityStatus.UNROSTERABLE}>不可排</option><option value={RosterabilityStatus.PRIORITY_ROSTERABLE}>优先排</option></select></label><label>开始<input type="time" required value={item.startTime} onChange={(event) => setItem({ ...item, startTime: event.target.value })} /></label><label>结束<input type="time" required value={item.endTime} onChange={(event) => setItem({ ...item, endTime: event.target.value })} /></label><label>结束日期<select value={item.endDayOffset} onChange={(event) => setItem({ ...item, endDayOffset: Number(event.target.value) })}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label><label>备注<input maxLength={500} value={item.remark ?? ""} onChange={(event) => setItem({ ...item, remark: event.target.value })} /></label></div><div className="admin-actions"><Button type="submit" disabled={busy}><Save size={15} />{editingItem ? "保存时段" : "添加时段"}</Button>{editingItem && <Button type="button" variant="outline" onClick={() => { setEditingItem(null); setItem(blankItem); }}>取消</Button>}</div></form>
          </section>
          <section className="admin-section"><div className="admin-intro"><h3>匹配条件</h3><span>非空字段同时满足，优先级数值越小越优先</span></div>
            <div className="condition-list">{detail.conditions.map((row) => <div className="condition-row" key={row.id}><strong>优先级 {row.priority}</strong><span>{orgs.find((org) => org.id === row.orgId)?.name ?? "不限组织"} · {labelOf(employeeTypes, row.empTypeCode)} · {labelOf(posts, row.postCode)}</span><button type="button" onClick={() => { setEditingCondition(row.id); setCondition({ orgId: row.orgId, empTypeCode: row.empTypeCode, postCode: row.postCode, priority: row.priority }); }}>编辑</button><button type="button" aria-label="删除条件" onClick={() => void run(() => apiDelete(`/templates/${selected}/conditions/${row.id}`, profile), "条件已删除")}>×</button></div>)}{detail.conditions.length === 0 && <p className="muted-text">尚未设置匹配条件</p>}</div>
            <form className="admin-inline-form" onSubmit={saveCondition}><h4>{editingCondition ? "编辑条件" : "添加条件"}</h4><div className="admin-form-grid"><label>组织<select value={condition.orgId ?? ""} onChange={(event) => setCondition({ ...condition, orgId: event.target.value ? Number(event.target.value) : null })}><option value="">不限</option>{orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label>员工类型<select value={condition.empTypeCode ?? ""} onChange={(event) => setCondition({ ...condition, empTypeCode: event.target.value || null })}><option value="">不限</option>{employeeTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select></label><label>岗位<select value={condition.postCode ?? ""} onChange={(event) => setCondition({ ...condition, postCode: event.target.value || null })}><option value="">不限</option>{posts.map((post) => <option key={post.code} value={post.code}>{post.name}</option>)}</select></label><label>优先级<input type="number" min="0" step="1" required value={condition.priority} onChange={(event) => setCondition({ ...condition, priority: event.target.valueAsNumber })} /></label></div><div className="admin-actions"><Button type="submit" disabled={busy}><Save size={15} />{editingCondition ? "保存条件" : "添加条件"}</Button>{editingCondition && <Button type="button" variant="outline" onClick={() => { setEditingCondition(null); setCondition(blankCondition); }}>取消</Button>}</div></form>
          </section>
        </>}
      </div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
  </div>;
}
