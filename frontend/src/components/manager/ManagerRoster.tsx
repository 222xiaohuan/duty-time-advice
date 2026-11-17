import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagerDayTimeline } from "@/components/manager/ManagerDayTimeline";
import { apiDelete, apiGet, apiPatch, apiPost, type SourceDictionaryItem, type StatusDictionaryItem } from "@/lib/api";
import { employeeTypes, errorText, labelOf, posts, weekdays } from "@/lib/admin";
import type { MockProfile } from "@/lib/identity";
import { addDays, dayLocked, hkDate, hkTime, hkToday, mondayOf, shortDay } from "@/lib/week";

type Mode = "day" | "person" | "week" | "month";
type Employee = { id: number; empName: string; empTypeCode: string; postCode: string; cutoffDays: number | null; baselineRule: string | null };
type Directory = { orgId: number; orgName: string; employees: Employee[] };
type RecordRow = { id: number; empId: number; businessDate: string; statusCode: string; sourceCode: string; startTime: string; endTime: string; remark: string | null; locked: number };
type ShiftRow = { id: number; empId: number; businessDate: string; shiftName: string; startTime: string; endTime: string; durationMinutes: number };
type Selection = { empId: number; day: string };
type RecordForm = { statusCode: string; startTime: string; endTime: string; endDayOffset: number; remark: string };
type GenerateResult = { startMonday: string; employeeCount: number; summary: { created: number; exists: number; locked: number; shiftConflict: number; noParam: number; noTemplate: number; statusDisabled: number }; skipped: { empId: number; businessDate: string | null; reason: string; message: string }[] };
const newRecord = (): RecordForm => ({ statusCode: "ROSTERABLE", startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" });
const modes: { value: Mode; label: string }[] = [{ value: "day", label: "单日全员" }, { value: "person", label: "单人周" }, { value: "week", label: "组织周" }, { value: "month", label: "组织月" }];
const skipLabels: Record<string, string> = { EXISTS: "已存在", LOCKED: "已锁定", SHIFT_CONFLICT: "班次冲突", NO_PARAM: "无参数", NO_TEMPLATE: "无模板", STATUS_DISABLED: "状态未启用" };

function monthStart(day: string): string { return `${day.slice(0, 7)}-01`; }
function monthEnd(day: string): string { return addDays(monthStart(addDays(`${day.slice(0, 7)}-28`, 7)), -1); }
function moveMonth(day: string, offset: number): string {
  const date = new Date(`${monthStart(day)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
function period(mode: Mode, day: string) {
  if (mode === "month") return { from: monthStart(day), to: monthEnd(day) };
  if (mode === "day") return { from: day, to: day };
  const from = mode === "person" ? addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay()) : mondayOf(day);
  return { from, to: addDays(from, 6) };
}

function RecordFields({ form, setForm, statuses }: { form: RecordForm; setForm: Dispatch<SetStateAction<RecordForm>>; statuses: StatusDictionaryItem[] }) {
  return <div className="admin-form-grid">
    <label>可排性状态<select name="statusCode" value={form.statusCode} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, statusCode: value })); }}>{statuses.map((status) => <option key={status.statusCode} value={status.statusCode}>{status.statusName}</option>)}</select></label>
    <label>开始时间<input name="startTime" type="time" required value={form.startTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} /></label>
    <label>结束时间<input name="endTime" type="time" required value={form.endTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} /></label>
    <label>结束日期<select name="endDayOffset" value={form.endDayOffset} onChange={(event) => { const value = Number(event.currentTarget.value); setForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
    <label className="employee-remark">备注<input name="remark" maxLength={500} value={form.remark} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, remark: value })); }} /></label>
  </div>;
}

export function ManagerRoster({ profile, statuses, sources, onOpenSchedule }: { profile: MockProfile; statuses: StatusDictionaryItem[]; sources: SourceDictionaryItem[]; onOpenSchedule: () => void }) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [mode, setMode] = useState<Mode>("day");
  const [anchor, setAnchor] = useState(hkToday);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [recordForm, setRecordForm] = useState<RecordForm>(newRecord);
  const [dayStatusCode, setDayStatusCode] = useState("ROSTERABLE");
  const [personAddRequest, setPersonAddRequest] = useState<{ empId: number; day: string } | null>(null);
  const [editingRecord, setEditingRecord] = useState<number | null>(null);
  const [generation, setGeneration] = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const range = period(mode, anchor);

  useEffect(() => {
    let active = true;
    setDirectory(null); setSelection(null); setError("");
    apiGet<Directory>("/manager/employees", profile).then((data) => {
      if (!active) return;
      setDirectory(data);
      setSelection(data.employees[0] ? { empId: data.employees[0].id, day: anchor } : null);
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    if (!directory) return;
    let active = true;
    setLoading(true);
    Promise.all([
      apiGet<RecordRow[]>(`/rosterability-records?orgId=${directory.orgId}&from=${mode === "day" || mode === "person" ? addDays(range.from, -1) : range.from}&to=${range.to}`, profile),
      apiGet<ShiftRow[]>(`/mock-shifts?orgId=${directory.orgId}`, profile),
    ]).then(([nextRecords, nextShifts]) => {
      if (active) { setRecords(nextRecords); setShifts(nextShifts); setLoading(false); }
    }).catch((cause: unknown) => { if (active) { setError(errorText(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [directory, profile, range.from, range.to, mode, refresh]);

  useEffect(() => {
    if (!directory) return;
    const matching = directory.employees.filter((employee) =>
      (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
    if (selection && matching.some((employee) => employee.id === selection.empId)) return;
    setSelection(matching[0] ? { empId: matching[0].id, day: anchor } : null);
    setEditingRecord(null); setRecordForm(newRecord());
  }, [directory, employeeFilter, typeFilter, postFilter, selection?.empId]);

  const employees = (directory?.employees ?? []).filter((employee) =>
    (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
  const shownRecords = records.filter((row) => employees.some((employee) => employee.id === row.empId) && (!statusFilter || row.statusCode === statusFilter) && (!sourceFilter || row.sourceCode === sourceFilter));
  const shownShifts = shifts.filter((row) => employees.some((employee) => employee.id === row.empId));
  const singleEmployee = employees.find((employee) => employee.id === selection?.empId) ?? employees[0];
  const selectedEmployee = directory?.employees.find((employee) => employee.id === selection?.empId);
  const selectedRecords = records.filter((row) => row.empId === selection?.empId && row.businessDate === selection?.day);
  const selectedShifts = shifts.filter((row) => row.empId === selection?.empId && row.businessDate === selection?.day);
  const locked = !selectedEmployee || selectedEmployee.cutoffDays === null || !selection || dayLocked(selection.day, selectedEmployee.cutoffDays);
  const statusOptions = statuses.filter((status) => status.enabled === 1 && (status.statusCode === "ROSTERABLE" || status.statusCode === "UNROSTERABLE"));
  const labelStatus = (code: string) => statusOptions.find((status) => status.statusCode === code)?.statusName ?? code;
  const labelSource = (code: string) => sources.find((source) => source.sourceCode === code)?.sourceName ?? code;
  const periodTitle = mode === "month" ? `${anchor.slice(0, 4)}年${Number(anchor.slice(5, 7))}月` : mode === "day" ? anchor : `${range.from} — ${range.to}`;

  function select(empId: number, day: string) {
    setSelection({ empId, day }); setEditingRecord(null); setRecordForm(newRecord());
    window.requestAnimationFrame(() => document.getElementById("manager-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }
  function navigate(direction: number) {
    const next = mode === "month" ? moveMonth(anchor, direction) : addDays(anchor, direction * (mode === "day" ? 1 : 7));
    setAnchor(next); setPersonAddRequest(null);
    setSelection((current) => current ? { ...current, day: next } : current);
    setEditingRecord(null); setRecordForm(newRecord());
  }
  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); setRefresh((value) => value + 1); return true; }
    catch (cause) { setError(errorText(cause)); return false; }
    finally { setBusy(false); }
  }
  function editRecord(row: RecordRow) {
    select(row.empId, row.businessDate);
    setEditingRecord(row.id);
    setRecordForm({ statusCode: row.statusCode, startTime: hkTime(row.startTime), endTime: hkTime(row.endTime), endDayOffset: hkDate(row.endTime) === row.businessDate ? 0 : 1, remark: row.remark ?? "" });
  }
  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || locked) return;
    const values = new FormData(event.currentTarget);
    const body = { empId: selection.empId, businessDate: selection.day, statusCode: String(values.get("statusCode")), startTime: String(values.get("startTime")), endTime: String(values.get("endTime")), endDayOffset: Number(values.get("endDayOffset")), remark: String(values.get("remark") || "") || null };
    void run(() => editingRecord === null ? apiPost("/rosterability-records", profile, body) : apiPatch(`/rosterability-records/${editingRecord}`, profile, body), "可排性记录已保存").then((saved) => { if (saved) { setEditingRecord(null); setRecordForm(newRecord()); } });
  }
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiPost<GenerateResult>("/template-generation", profile, {});
      setGeneration(result); setMode("week"); setAnchor(result.startMonday); setPersonAddRequest(null);
      setSelection((current) => current ? { ...current, day: result.startMonday } : current);
      setEditingRecord(null); setRecordForm(newRecord());
      setRefresh((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  function cell(empId: number, day: string) {
    const entries = shownRecords.filter((row) => row.empId === empId && row.businessDate === day);
    const work = shownShifts.filter((row) => row.empId === empId && row.businessDate === day);
    return <button type="button" className={`manager-cell ${selection?.empId === empId && selection.day === day ? "selected" : ""}`} key={`${empId}-${day}`} onClick={() => select(empId, day)} aria-label={`${directory?.employees.find((employee) => employee.id === empId)?.empName} ${day}`}>
      {entries.map((row) => <span className={`manager-chip ${row.statusCode === "ROSTERABLE" ? "rosterable" : "unrosterable"}`} key={row.id}>{labelStatus(row.statusCode)} {hkTime(row.startTime)}–{hkTime(row.endTime)}{hkDate(row.endTime) !== day ? " 次日" : ""}</span>)}
      {work.map((row) => <span className="manager-chip shift" key={`s-${row.id}`}>{row.shiftName} {hkTime(row.startTime)}–{hkTime(row.endTime)}</span>)}
      {!entries.length && !work.length && <span className="manager-empty">—</span>}
    </button>;
  }
  function monthCell(day: string) {
    const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
    const recordCount = shownRecords.filter((row) => row.businessDate === day).length;
    const shiftCount = shownShifts.filter((row) => row.businessDate === day).length;
    return <button type="button" key={day} className={inMonth ? "" : "outside"} onClick={() => { setAnchor(day); setMode("day"); if (singleEmployee) select(singleEmployee.id, day); }}>
      <strong>{Number(day.slice(8))}</strong>
      {inMonth && recordCount > 0 && <span title={`${recordCount} 条可排性记录`}>记录{recordCount}</span>}
      {inMonth && shiftCount > 0 && <small title={`${shiftCount} 个模拟班次`}>班次{shiftCount}</small>}
    </button>;
  }
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(range.from, index));
  const monthDays = mode === "month" ? Array.from({ length: Math.ceil((Number(monthEnd(anchor).slice(8)) + (new Date(`${monthStart(anchor)}T00:00:00Z`).getUTCDay() + 6) % 7) / 7) * 7 }, (_, index) => addDays(mondayOf(monthStart(anchor)), index)) : [];

  return <div className="manager-page">
    <div className="manager-toolbar">
      <div className="manager-tabs" role="tablist" aria-label="日历视图">{modes.map((item) => <button type="button" role="tab" aria-selected={mode === item.value} className={mode === item.value ? "selected" : ""} key={item.value} onClick={() => { setMode(item.value); setPersonAddRequest(null); if (item.value === "person") setEmployeeFilter(""); }}>{item.label}</button>)}</div>
      {mode !== "person" && <Button type="button" onClick={() => void generate()} disabled={busy || !directory}><CalendarDays size={16} />生成可排时段</Button>}
    </div>
    <div className="manager-filters">
      <label>组织<select value={directory?.orgId ?? ""} disabled><option value={directory?.orgId ?? ""}>{directory?.orgName ?? "加载中"}</option></select></label>
      {mode !== "person" && <label>员工<select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}><option value="">全部员工</option>{directory?.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.empName}</option>)}</select></label>}
      <label>员工类型<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">全部类型</option>{employeeTypes.map((type) => <option value={type.code} key={type.code}>{type.name}</option>)}</select></label>
      <label>岗位<select value={postFilter} onChange={(event) => setPostFilter(event.target.value)}><option value="">全部岗位</option>{posts.map((post) => <option value={post.code} key={post.code}>{post.name}</option>)}</select></label>
      <label>状态<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">全部状态</option>{statusOptions.map((status) => <option value={status.statusCode} key={status.statusCode}>{status.statusName}</option>)}</select></label>
      <label>来源<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">全部来源</option>{sources.filter((source) => source.enabled).map((source) => <option value={source.sourceCode} key={source.sourceCode}>{source.sourceName}</option>)}</select></label>
    </div>
    <div className="manager-period"><div className="manager-period-nav"><Button type="button" variant="outline" size="icon" title="上一期" aria-label="上一期" onClick={() => navigate(-1)}><ChevronLeft size={16} /></Button><strong>{periodTitle}</strong><Button type="button" variant="outline" size="icon" title="下一期" aria-label="下一期" onClick={() => navigate(1)}><ChevronRight size={16} /></Button><Button type="button" variant="outline" onClick={() => { const today = hkToday(); setAnchor(today); setSelection((current) => current ? { ...current, day: today } : current); setEditingRecord(null); }}>今天</Button></div><Button type="button" variant="outline" size="icon" title="刷新" aria-label="刷新" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /></Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {generation && <section className="manager-generation" aria-label="生成结果"><div className="admin-intro"><h2>生成结果</h2><span>从 {generation.startMonday} 开始 · {generation.employeeCount} 名员工</span></div><div className="manager-summary">{Object.entries(generation.summary).map(([key, count]) => <div key={key}><strong>{count}</strong><span>{key === "created" ? "新增" : skipLabels[key === "shiftConflict" ? "SHIFT_CONFLICT" : key === "noParam" ? "NO_PARAM" : key === "noTemplate" ? "NO_TEMPLATE" : key === "statusDisabled" ? "STATUS_DISABLED" : key.toUpperCase()]}</span></div>)}</div>{generation.skipped.length > 0 && <details><summary>逐项跳过原因（{generation.skipped.length}）</summary><div className="manager-skip-list">{generation.skipped.map((row, index) => <div key={`${row.empId}-${row.businessDate}-${index}`}><strong>{directory?.employees.find((employee) => employee.id === row.empId)?.empName ?? `员工 ${row.empId}`}</strong><span>{row.businessDate ?? "—"} · {skipLabels[row.reason] ?? row.reason} · {row.message}</span></div>)}</div></details>}</section>}
    <section className="manager-view" aria-label="经理日历">
      {loading ? <div className="employee-loading">正在加载可排性记录和班次</div> : employees.length === 0 ? <p className="manager-no-data">当前筛选下没有员工</p> : mode === "day" ? <ManagerDayTimeline key={anchor} day={anchor} employees={employees} records={shownRecords} shifts={shownShifts} statuses={statuses} sources={sources} profile={profile} chosenStatus={dayStatusCode} onStatusChange={setDayStatusCode} onChanged={(message) => { setNotice(message); setRefresh((value) => value + 1); }} /> : mode === "person" && singleEmployee ? <div className="manager-person-week"><aside className="manager-person-list" aria-label="员工列表"><div className="manager-person-list-head">员工</div><div className="manager-person-list-scroll">{employees.map((employee) => { const addDay = weekDays.find((value) => employee.cutoffDays !== null && !dayLocked(value, employee.cutoffDays)); return <div className={`manager-person-list-item ${singleEmployee.id === employee.id ? "selected" : ""}`} key={employee.id}><button type="button" className="manager-person-choice" aria-pressed={singleEmployee.id === employee.id} onClick={() => { setSelection({ empId: employee.id, day: selection?.day && weekDays.includes(selection.day) ? selection.day : anchor }); setPersonAddRequest(null); }}><strong>{employee.empName}</strong><small>{labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</small></button><Button type="button" variant="ghost" size="icon" title={`为${employee.empName}新增时段`} aria-label={`为${employee.empName}新增时段`} disabled={!addDay} onClick={() => { if (addDay) { setSelection({ empId: employee.id, day: addDay }); setPersonAddRequest({ empId: employee.id, day: addDay }); } }}><Plus size={16} /></Button></div>; })}</div></aside><ManagerDayTimeline key={`${range.from}-${singleEmployee.id}`} day={anchor} days={weekDays} employees={[singleEmployee]} records={shownRecords} shifts={shownShifts} statuses={statuses} sources={sources} profile={profile} chosenStatus={dayStatusCode} onStatusChange={setDayStatusCode} addRequest={personAddRequest} onAddRequestHandled={() => setPersonAddRequest(null)} onChanged={(message) => { setNotice(message); setPersonAddRequest(null); setRefresh((value) => value + 1); }} /></div> : mode === "month" ? <div className="manager-month">{weekdays.map((name) => <strong key={name}>{name}</strong>)}{monthDays.map(monthCell)}</div> : <div className="manager-week-scroll"><div className="manager-week-grid"><div className="manager-week-head">员工</div>{weekDays.map((day, index) => <div className="manager-week-head" key={day}>{weekdays[index]}<small>{shortDay(day)}</small></div>)}{employees.map((employee) => <div className="manager-week-row" key={employee.id}><div className="manager-week-person"><strong>{employee.empName}</strong><small>{labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</small></div>{weekDays.map((day) => cell(employee.id, day))}</div>)}</div></div>}
    </section>
    {mode !== "day" && mode !== "person" && <section id="manager-detail" className="manager-detail"><div className="admin-intro"><h2>{selectedEmployee ? `${selectedEmployee.empName} · ${selection?.day}` : "员工详情"}</h2><span>{locked ? "可排性记录只读" : "可维护可排性记录"}</span></div>{selection && selectedEmployee && <div className="manager-detail-grid">
      <div className="manager-editor">
        <div className="manager-editor-head"><h3>可排性记录</h3><Button type="button" variant="outline" size="sm" onClick={() => { setEditingRecord(null); setRecordForm(newRecord()); }}><Plus size={14} />新增</Button></div>
        <div className="manager-entry-list">{selectedRecords.map((row) => <div key={row.id}>
          <span className={`manager-chip ${row.statusCode === "ROSTERABLE" ? "rosterable" : "unrosterable"}`}>{labelStatus(row.statusCode)} {hkTime(row.startTime)}–{hkTime(row.endTime)}{hkDate(row.endTime) !== row.businessDate ? " 次日" : ""}</span>
          <small>{labelSource(row.sourceCode)}{row.remark ? ` · ${row.remark}` : ""}</small>
          <div><button type="button" disabled={Boolean(row.locked) || row.sourceCode === "EXTERNAL_SYNC" || row.sourceCode === "BULK_IMPORT"} onClick={() => editRecord(row)}>编辑</button><button type="button" disabled={Boolean(row.locked) || row.sourceCode === "EXTERNAL_SYNC" || row.sourceCode === "BULK_IMPORT"} onClick={() => { if (window.confirm("删除这条可排性记录？")) void run(() => apiDelete(`/rosterability-records/${row.id}`, profile), "可排性记录已删除"); }}>删除</button></div>
        </div>)}{selectedRecords.length === 0 && <p>当日暂无记录</p>}</div>
        {locked ? <p className="employee-readonly">该业务日期已到报备截止时间，记录只读；或员工尚无有效截止参数。</p> : <form onSubmit={saveRecord} className="manager-form"><RecordFields form={recordForm} setForm={setRecordForm} statuses={statusOptions} /><Button type="submit" disabled={busy || !statusOptions.length}><Save size={15} />{editingRecord ? "保存修改" : "新增记录"}</Button></form>}
      </div>
      <div className="manager-editor">
        <div className="manager-editor-head"><h3>模拟班次</h3><Button type="button" variant="outline" size="sm" onClick={onOpenSchedule}><CalendarDays size={14} />模拟排班</Button></div>
        <div className="manager-entry-list">{selectedShifts.map((row) => <div key={row.id}>
          <span className="manager-chip shift">{row.shiftName} {hkTime(row.startTime)}–{hkTime(row.endTime)}{hkDate(row.endTime) !== row.businessDate ? " 次日" : ""}</span><small>{row.durationMinutes} 分钟</small>
        </div>)}{selectedShifts.length === 0 && <p>当日暂无模拟班次</p>}</div>
      </div>
    </div>}</section>}
  </div>;
}
