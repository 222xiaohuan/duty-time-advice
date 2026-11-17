import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagerDayTimeline } from "@/components/manager/ManagerDayTimeline";
import { apiDelete, apiGet, apiPatch, apiPost, type SourceDictionaryItem, type StatusDictionaryItem } from "@/lib/api";
import { employeeTypes, errorText, labelOf, posts, weekdays } from "@/lib/admin";
import { BaselineRule, RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { baselineStatusMessage } from "@/lib/rosterability";
import { addDays, dayLocked, hkDate, hkTime, hkToday, managerLockMessage, mondayOf, shortDay } from "@/lib/week";

type Mode = "day" | "person" | "week";
type Employee = { id: number; empName: string; empTypeCode: string; postCode: string; cutoffDays: number | null; baselineRule: string | null; priorityRosterEnable: number };
type Directory = { orgId: number; orgName: string; employees: Employee[] };
type RecordRow = { id: number; empId: number; businessDate: string; statusCode: string; sourceCode: string; startTime: string; endTime: string; remark: string | null; locked: number };
type ShiftRow = { id: number; empId: number; businessDate: string; shiftName: string; startTime: string; endTime: string; durationMinutes: number };
type Selection = { empId: number; day: string };
type RecordForm = { statusCode: string; allDay: boolean; startTime: string; endTime: string; endDayOffset: number; remark: string };
type GenerateResult = { startMonday: string; employeeCount: number; summary: { created: number; exists: number; locked: number; shiftConflict: number; noParam: number; noTemplate: number; statusDisabled: number }; skipped: { empId: number; businessDate: string | null; reason: string; message: string }[] };
const newRecord = (statusCode = ""): RecordForm => ({ statusCode, allDay: false, startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" });
const modes: { value: Mode; label: string }[] = [{ value: "day", label: "单日全员" }, { value: "person", label: "单人周" }, { value: "week", label: "组织周" }];
const skipLabels: Record<string, string> = { EXISTS: "已存在", LOCKED: "已锁定", SHIFT_CONFLICT: "班次冲突", NO_PARAM: "无参数", NO_TEMPLATE: "无模板", STATUS_DISABLED: "状态未启用" };
const statusClass = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "rosterable" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "priority" : "unrosterable";
const statusColor = (code: string, statuses: StatusDictionaryItem[]) => statuses.find((status) => status.statusCode === code)?.colorHex ?? (code === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9");

function durationLabel(startTime: string, endTime: string): string {
  const minutes = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
  return `${Number((minutes / 60).toFixed(1))}h`;
}

function durationMinutesLabel(minutes: number): string {
  return `${Number((minutes / 60).toFixed(1))}h`;
}

function period(mode: Mode, day: string) {
  if (mode === "day") return { from: day, to: day };
  const from = mode === "person" ? addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay()) : mondayOf(day);
  return { from, to: addDays(from, 6) };
}

export function ManagerRoster({ profile, statuses, sources }: { profile: MockProfile; statuses: StatusDictionaryItem[]; sources: SourceDictionaryItem[] }) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [mode, setMode] = useState<Mode>("day");
  const [anchor, setAnchor] = useState(hkToday);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
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
    if (!selection || mode !== "week") return;
    dialogRef.current?.querySelector("select")?.focus();
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setSelection(null); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selection, mode, busy]);

  useEffect(() => {
    let active = true;
    setDirectory(null); setSelection(null); setError("");
    apiGet<Directory>("/manager/employees", profile).then((data) => {
      if (!active) return;
      setDirectory(data);
      setSelection(null);
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
    if (!selection || matching.some((employee) => employee.id === selection.empId)) return;
    setSelection(null);
    setEditingRecord(null); setRecordForm(newRecord());
  }, [directory, employeeFilter, typeFilter, postFilter, selection?.empId]);

  const employees = (directory?.employees ?? []).filter((employee) =>
    (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
  const shownRecords = records.filter((row) => employees.some((employee) => employee.id === row.empId) && (!statusFilter || row.statusCode === statusFilter) && (!sourceFilter || row.sourceCode === sourceFilter));
  const shownShifts = shifts.filter((row) => employees.some((employee) => employee.id === row.empId));
  const singleEmployee = employees.find((employee) => employee.id === selection?.empId) ?? employees[0];
  const selectedEmployee = directory?.employees.find((employee) => employee.id === selection?.empId);
  const selectedRecords = records.filter((row) => row.empId === selection?.empId && row.businessDate === selection?.day);
  const editingRow = selectedRecords.find((row) => row.id === editingRecord);
  const locked = !selectedEmployee || selectedEmployee.cutoffDays === null || !selection || dayLocked(selection.day, selectedEmployee.cutoffDays);
  const readOnly = locked || Boolean(editingRow?.locked) || editingRow?.sourceCode === "EXTERNAL_SYNC" || editingRow?.sourceCode === "BULK_IMPORT";
  const selectedLockMessage = locked && selection ? managerLockMessage(selection.day, selectedEmployee?.cutoffDays ?? null) ?? "暂无可排性参数" : null;
  const statusOptions = statuses.filter((status) => status.enabled === 1 && (status.statusCode === RosterabilityStatus.ROSTERABLE || status.statusCode === RosterabilityStatus.UNROSTERABLE || (status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE && directory?.employees.some((employee) => employee.priorityRosterEnable === 1))));
  const editableStatuses = statusOptions.filter((status) => (status.statusCode !== RosterabilityStatus.PRIORITY_ROSTERABLE || selectedEmployee?.priorityRosterEnable === 1) && (selectedEmployee?.baselineRule === BaselineRule.BASE_ROSTERABLE ? status.statusCode !== RosterabilityStatus.ROSTERABLE : selectedEmployee?.baselineRule === BaselineRule.BASE_UNROSTERABLE ? status.statusCode !== RosterabilityStatus.UNROSTERABLE : false));
  const baselineMessage = baselineStatusMessage(selectedEmployee?.baselineRule, recordForm.statusCode);
  const labelStatus = (code: string) => statusOptions.find((status) => status.statusCode === code)?.statusName ?? code;
  const labelSource = (code: string) => sources.find((source) => source.sourceCode === code)?.sourceName ?? code;
  const periodTitle = mode === "day" ? anchor : `${range.from} — ${range.to}`;

  function select(empId: number, day: string) {
    const employee = directory?.employees.find((item) => item.id === empId);
    const initial = statusOptions.find((status) => status.statusCode === (employee?.baselineRule === BaselineRule.BASE_ROSTERABLE ? RosterabilityStatus.UNROSTERABLE : RosterabilityStatus.ROSTERABLE));
    setSelection({ empId, day }); setEditingRecord(null); setRecordForm(newRecord(initial?.statusCode)); setError("");
  }
  function navigate(direction: number) {
    const next = addDays(anchor, direction * (mode === "day" ? 1 : 7));
    setAnchor(next); setPersonAddRequest(null);
    setSelection(null);
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
    setRecordForm({ statusCode: row.statusCode, allDay: hkTime(row.startTime) === "00:00" && hkTime(row.endTime) === "00:00" && hkDate(row.endTime) !== row.businessDate, startTime: hkTime(row.startTime), endTime: hkTime(row.endTime), endDayOffset: hkDate(row.endTime) === row.businessDate ? 0 : 1, remark: row.remark ?? "" });
  }
  function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || readOnly || !editableStatuses.some((status) => status.statusCode === recordForm.statusCode)) return;
    const values = new FormData(event.currentTarget);
    const statusCode = String(values.get("statusCode"));
    const warning = baselineStatusMessage(selectedEmployee?.baselineRule, statusCode);
    if (warning) { setError(warning); return; }
    const body = { empId: selection.empId, businessDate: selection.day, statusCode, startTime: recordForm.allDay ? "00:00" : String(values.get("startTime")), endTime: recordForm.allDay ? "00:00" : String(values.get("endTime")), endDayOffset: recordForm.allDay ? 1 : Number(values.get("endDayOffset")), remark: String(values.get("remark") || "") || null };
    void run(() => editingRecord === null ? apiPost("/rosterability-records", profile, body) : apiPatch(`/rosterability-records/${editingRecord}`, profile, body), "可排性记录已保存").then((saved) => { if (saved) setSelection(null); });
  }
  function removeRecord() {
    if (!editingRow || readOnly || !window.confirm("删除这条可排性记录？")) return;
    void run(() => apiDelete(`/rosterability-records/${editingRow.id}`, profile), "可排性记录已删除").then((removed) => { if (removed) setSelection(null); });
  }
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiPost<GenerateResult>("/template-generation", profile, {});
      setGeneration(result); setMode("week"); setAnchor(result.startMonday); setPersonAddRequest(null);
      setSelection(null);
      setEditingRecord(null); setRecordForm(newRecord());
      setRefresh((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  function cell(empId: number, day: string) {
    const employee = directory?.employees.find((item) => item.id === empId);
    const lockKind = day < hkToday() ? "past" : employee?.cutoffDays == null ? "unknown" : dayLocked(day, employee.cutoffDays) ? "cutoff" : null;
    const lockMessage = lockKind ? managerLockMessage(day, employee?.cutoffDays ?? null) ?? "暂无可排性参数" : null;
    const entries = shownRecords.filter((row) => row.empId === empId && row.businessDate === day);
    const work = shownShifts.filter((row) => row.empId === empId && row.businessDate === day);
    return <button type="button" className={`manager-cell ${!entries.length ? "empty-records" : ""} ${lockKind ? `locked locked-${lockKind}` : ""} ${selection?.empId === empId && selection.day === day ? "selected" : ""}`} key={`${empId}-${day}`} onClick={() => { if (!lockKind) select(empId, day); }} aria-disabled={Boolean(lockKind)} aria-label={`${employee?.empName} ${day} ${lockMessage ?? "维护可排性时段"}`} title={lockMessage ?? undefined}>
      {lockKind === "cutoff" && <LockKeyhole className="manager-week-lock-icon" size={16} aria-hidden="true" />}
      {entries.length > 0 && <span className="manager-week-records" aria-label="可排性时间段">{entries.map((row) => {
        const overnight = hkDate(row.endTime) !== row.businessDate;
        const startMinutes = Number(hkTime(row.startTime).slice(0, 2)) * 60 + Number(hkTime(row.startTime).slice(3));
        const endMinutes = overnight ? 1440 : Number(hkTime(row.endTime).slice(0, 2)) * 60 + Number(hkTime(row.endTime).slice(3));
        const left = startMinutes / 1440 * 100;
        const width = Math.max(5, Math.min(100 - left, (endMinutes - startMinutes) / 1440 * 100));
        const label = `${day} · ${labelStatus(row.statusCode)} ${hkTime(row.startTime)}–${overnight ? "次日 " : ""}${hkTime(row.endTime)} · ${durationLabel(row.startTime, row.endTime)}`;
        return <span className={`manager-week-record-track ${statusClass(row.statusCode)}`} key={row.id} title={label} aria-label={label} data-tooltip={label} onClick={(event) => { event.stopPropagation(); editRecord(row); }} style={{ left: `${left}%`, width: `${width}%`, backgroundColor: statusColor(row.statusCode, statuses) }}><span>{durationLabel(row.startTime, row.endTime)}</span></span>;
      })}</span>}
      {work.length > 0 && <span className="manager-week-shifts" aria-label="排班时间">{work.map((row) => {
        const overnight = hkDate(row.endTime) !== row.businessDate;
        const label = `${day} · ${row.shiftName} ${hkTime(row.startTime)}–${overnight ? "次日 " : ""}${hkTime(row.endTime)} · ${durationMinutesLabel(row.durationMinutes)}`;
        return <span className="manager-chip shift" key={`s-${row.id}`} title={label} aria-label={label}>{row.shiftName} {hkTime(row.startTime)}–{overnight ? "次日 " : ""}{hkTime(row.endTime)} · {durationMinutesLabel(row.durationMinutes)}</span>;
      })}</span>}
      {!entries.length && !lockKind && <Plus className="manager-empty" size={16} aria-hidden="true" />}
    </button>;
  }
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(range.from, index));

  return <div className="manager-page">
    <div className="manager-toolbar">
      <div className="manager-tabs" role="tablist" aria-label="日历视图">{modes.map((item) => <button type="button" role="tab" aria-selected={mode === item.value} className={mode === item.value ? "selected" : ""} key={item.value} onClick={() => { setMode(item.value); setSelection(null); setPersonAddRequest(null); if (item.value === "person") setEmployeeFilter(""); }}>{item.label}</button>)}</div>
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
    <div className="manager-period"><div className="manager-period-nav"><Button type="button" variant="outline" size="icon" title="上一期" aria-label="上一期" onClick={() => navigate(-1)}><ChevronLeft size={16} /></Button><strong>{periodTitle}</strong><Button type="button" variant="outline" size="icon" title="下一期" aria-label="下一期" onClick={() => navigate(1)}><ChevronRight size={16} /></Button><Button type="button" variant="outline" onClick={() => { const today = hkToday(); setAnchor(today); setSelection(null); setEditingRecord(null); }}>今天</Button></div><Button type="button" variant="outline" size="icon" title="刷新" aria-label="刷新" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /></Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {generation && <section className="manager-generation" aria-label="生成结果"><div className="admin-intro"><h2>生成结果</h2><span>从 {generation.startMonday} 开始 · {generation.employeeCount} 名员工</span></div><div className="manager-summary">{Object.entries(generation.summary).map(([key, count]) => <div key={key}><strong>{count}</strong><span>{key === "created" ? "新增" : skipLabels[key === "shiftConflict" ? "SHIFT_CONFLICT" : key === "noParam" ? "NO_PARAM" : key === "noTemplate" ? "NO_TEMPLATE" : key === "statusDisabled" ? "STATUS_DISABLED" : key.toUpperCase()]}</span></div>)}</div>{generation.skipped.length > 0 && <details><summary>逐项跳过原因（{generation.skipped.length}）</summary><div className="manager-skip-list">{generation.skipped.map((row, index) => <div key={`${row.empId}-${row.businessDate}-${index}`}><strong>{directory?.employees.find((employee) => employee.id === row.empId)?.empName ?? `员工 ${row.empId}`}</strong><span>{row.businessDate ?? "—"} · {skipLabels[row.reason] ?? row.reason} · {row.message}</span></div>)}</div></details>}</section>}
    <section className="manager-view" aria-label="经理日历">
      {loading ? <div className="employee-loading">正在加载可排性记录和班次</div> : employees.length === 0 ? <p className="manager-no-data">当前筛选下没有员工</p> : mode === "day" ? <ManagerDayTimeline key={anchor} day={anchor} employees={employees} records={shownRecords} shifts={shownShifts} statuses={statuses} sources={sources} profile={profile} chosenStatus={dayStatusCode} onStatusChange={setDayStatusCode} onChanged={(message) => { setNotice(message); setRefresh((value) => value + 1); }} /> : mode === "person" && singleEmployee ? <div className="manager-person-week"><aside className="manager-person-list" aria-label="员工列表"><div className="manager-person-list-head">员工</div><div className="manager-person-list-scroll">{employees.map((employee) => { const addDay = weekDays.find((value) => employee.cutoffDays !== null && !dayLocked(value, employee.cutoffDays)); return <div className={`manager-person-list-item ${singleEmployee.id === employee.id ? "selected" : ""}`} key={employee.id}><button type="button" className="manager-person-choice" aria-pressed={singleEmployee.id === employee.id} onClick={() => { setSelection({ empId: employee.id, day: selection?.day && weekDays.includes(selection.day) ? selection.day : anchor }); setPersonAddRequest(null); }}><strong>{employee.empName}</strong><small>{labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</small></button><Button type="button" variant="ghost" size="icon" title={`为${employee.empName}新增时段`} aria-label={`为${employee.empName}新增时段`} disabled={!addDay} onClick={() => { if (addDay) { setSelection({ empId: employee.id, day: addDay }); setPersonAddRequest({ empId: employee.id, day: addDay }); } }}><Plus size={16} /></Button></div>; })}</div></aside><ManagerDayTimeline key={`${range.from}-${singleEmployee.id}`} day={anchor} days={weekDays} employees={[singleEmployee]} records={shownRecords} shifts={shownShifts} statuses={statuses} sources={sources} profile={profile} chosenStatus={dayStatusCode} onStatusChange={setDayStatusCode} addRequest={personAddRequest} onAddRequestHandled={() => setPersonAddRequest(null)} onChanged={(message) => { setNotice(message); setPersonAddRequest(null); setRefresh((value) => value + 1); }} /></div> : <div className="manager-week-scroll"><div className="manager-week-grid"><div className="manager-week-head">员工</div>{weekDays.map((day, index) => <div className={`manager-week-head ${day < hkToday() ? "locked-past" : ""}`} key={day}>{weekdays[index]}<small>{shortDay(day)}</small></div>)}{employees.map((employee) => <div className="manager-week-row" key={employee.id}><div className="manager-week-person"><strong>{employee.empName}</strong><small>{labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</small></div>{weekDays.map((day) => cell(employee.id, day))}</div>)}</div></div>}
    </section>
    {mode === "week" && selection && selectedEmployee && <div className="manager-day-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelection(null); }}>
      <div className="manager-day-dialog manager-week-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${selectedEmployee.empName} ${editingRow ? "编辑" : "新增"}可排性时段`}>
        <div className="manager-day-dialog-head"><div><h2>{selectedEmployee.empName} · {selection.day}</h2><span>{editingRow ? "编辑可排性时段" : "新增可排性时段"}</span></div><Button type="button" variant="ghost" size="icon" title="关闭" aria-label="关闭编辑面板" disabled={busy} onClick={() => setSelection(null)}><X size={17} /></Button></div>
        {selectedRecords.length > 0 && <div className="manager-week-dialog-records" aria-label="当日可排性记录">{selectedRecords.map((row) => <button type="button" key={row.id} className={editingRecord === row.id ? "selected" : ""} onClick={() => editRecord(row)}><span className={`manager-chip ${statusClass(row.statusCode)}`}>{labelStatus(row.statusCode)}</span><span>{hkTime(row.startTime)}–{hkDate(row.endTime) !== row.businessDate ? "次日 " : ""}{hkTime(row.endTime)}</span><small>{labelSource(row.sourceCode)}</small></button>)}</div>}
        {editingRow && <Button type="button" variant="outline" size="sm" className="manager-week-dialog-new" onClick={() => select(selection.empId, selection.day)}><Plus size={14} />新增时段</Button>}
        {readOnly ? <p className="employee-readonly">{selectedLockMessage ?? "该记录来源只读"}</p> : <form onSubmit={saveRecord} className="manager-day-dialog-form">
          <label>可排性状态<select name="statusCode" value={recordForm.statusCode} disabled={busy} onChange={(event) => { const value = event.currentTarget.value; setRecordForm((current) => ({ ...current, statusCode: value })); }}><option value="" disabled>选择状态</option>{recordForm.statusCode && !editableStatuses.some((status) => status.statusCode === recordForm.statusCode) && <option value={recordForm.statusCode} disabled>{labelStatus(recordForm.statusCode)}（当前不可维护）</option>}{editableStatuses.map((status) => <option key={status.statusCode} value={status.statusCode}>{status.statusName}</option>)}</select></label>
          <fieldset className="manager-day-pattern"><legend>时间模式</legend><label><input type="radio" name="timePattern" checked={!recordForm.allDay} disabled={busy} onChange={() => setRecordForm((current) => ({ ...current, allDay: false }))} />时段</label><label><input type="radio" name="timePattern" checked={recordForm.allDay} disabled={busy} onChange={() => setRecordForm((current) => ({ ...current, allDay: true }))} />全天</label></fieldset>
          <div className="manager-day-time-fields"><label>开始时间<input name="startTime" type="time" required value={recordForm.allDay ? "00:00" : recordForm.startTime} disabled={busy || recordForm.allDay} onInput={(event) => { const value = event.currentTarget.value; setRecordForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setRecordForm((current) => ({ ...current, startTime: value })); }} /></label><label>结束时间<input name="endTime" type="time" required value={recordForm.allDay ? "00:00" : recordForm.endTime} disabled={busy || recordForm.allDay} onInput={(event) => { const value = event.currentTarget.value; setRecordForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setRecordForm((current) => ({ ...current, endTime: value })); }} /></label></div>
          <label>结束日期<select name="endDayOffset" value={recordForm.allDay ? 1 : recordForm.endDayOffset} disabled={busy || recordForm.allDay} onChange={(event) => { const value = Number(event.currentTarget.value); setRecordForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
          <label>备注<textarea name="remark" maxLength={500} rows={3} value={recordForm.remark} disabled={busy} onChange={(event) => { const value = event.currentTarget.value; setRecordForm((current) => ({ ...current, remark: value })); }} /></label>
          {baselineMessage && <p className="form-error" role="alert">{baselineMessage}</p>}{error && <p className="form-error" role="alert">{error}</p>}{!editableStatuses.length && <p className="form-error">当前员工没有可维护的可排性状态</p>}
          <div className="manager-day-dialog-actions">{editingRow && <Button type="button" variant="outline" disabled={busy} onClick={removeRecord}><Trash2 size={15} />删除</Button>}<Button type="button" variant="outline" disabled={busy} onClick={() => setSelection(null)}>取消</Button><Button type="submit" disabled={busy || !editableStatuses.some((status) => status.statusCode === recordForm.statusCode) || Boolean(baselineMessage)}><Save size={15} />确认</Button></div>
        </form>}
      </div>
    </div>}
  </div>;
}
