import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPatch, apiPost, type StatusDictionaryItem } from "@/lib/api";
import { employeeTypes, errorText, labelOf, posts, weekdays } from "@/lib/admin";
import { RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { addDays, hkDate, hkTime, hkToday, mondayOf, shortDay } from "@/lib/week";

type Employee = { id: number; empName: string; empTypeCode: string; postCode: string; priorityRosterEnable: number };
type Directory = { orgId: number; orgName: string; employees: Employee[] };
type RecordRow = { id: number; empId: number; businessDate: string; statusCode: string; startTime: string; endTime: string };
type ShiftRow = { id: number; empId: number; businessDate: string; shiftName: string; startTime: string; endTime: string; durationMinutes: number };
type Selection = { empId: number; day: string };
type MarkerSelection = { id: number; day: string };
type ShiftForm = { shiftName: string; startTime: string; endTime: string; endDayOffset: number };
const blankShift = (): ShiftForm => ({ shiftName: "工作班", startTime: "09:00", endTime: "17:00", endDayOffset: 0 });

function minuteOf(iso: string): number {
  const [hour, minute] = hkTime(iso).split(":").map(Number);
  return hour * 60 + minute;
}

function durationLabel(minutes: number): string {
  return `${Number((minutes / 60).toFixed(1))}h`;
}

function durationLabelFromTimes(startTime: string, endTime: string): string {
  const minutes = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
  return durationLabel(minutes);
}

export function ManagerSchedule({ profile, statuses }: { profile: MockProfile; statuses: StatusDictionaryItem[] }) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [monday, setMonday] = useState(() => mondayOf(hkToday()));
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MarkerSelection | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [form, setForm] = useState<ShiftForm>(blankShift);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const employees = (directory?.employees ?? []).filter((employee) =>
    (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
  const selectedEmployee = directory?.employees.find((employee) => employee.id === selection?.empId);
  const selectedShifts = shifts.filter((shift) => shift.empId === selection?.empId && shift.businessDate === selection?.day);
  const markerRecord = records.find((row) => row.id === selectedMarker?.id);
  const markerEmployee = directory?.employees.find((employee) => employee.id === markerRecord?.empId);
  const markerStatus = statuses.find((status) => status.statusCode === markerRecord?.statusCode);
  const activeStatuses = statuses.filter((status) => status.enabled === 1 && (status.statusCode === RosterabilityStatus.ROSTERABLE || status.statusCode === RosterabilityStatus.UNROSTERABLE || (status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE && directory?.employees.some((employee) => employee.priorityRosterEnable === 1))));

  useEffect(() => {
    let active = true;
    setDirectory(null); setSelection(null); setSelectedMarker(null); setError("");
    apiGet<Directory>("/manager/employees", profile).then((data) => {
      if (!active) return;
      setDirectory(data);
      if (data.employees[0]) setSelection({ empId: data.employees[0].id, day: hkToday() });
    }).catch((cause: unknown) => { if (active) { setError(errorText(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    if (!directory) return;
    let active = true;
    setLoading(true);
    Promise.all([
      apiGet<RecordRow[]>(`/rosterability-records?orgId=${directory.orgId}&from=${addDays(monday, -1)}&to=${weekDays[6]}`, profile),
      apiGet<ShiftRow[]>(`/mock-shifts?orgId=${directory.orgId}`, profile),
    ]).then(([nextRecords, nextShifts]) => {
      if (active) { setRecords(nextRecords); setShifts(nextShifts); setLoading(false); }
    }).catch((cause: unknown) => { if (active) { setError(errorText(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [directory, monday, profile, refresh]);

  useEffect(() => {
    if (!directory) return;
    const matching = directory.employees.filter((employee) =>
      (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
    if (selection && matching.some((employee) => employee.id === selection.empId)) return;
    setSelection(matching[0] ? { empId: matching[0].id, day: monday } : null);
    setEditingId(null); setForm(blankShift());
  }, [directory, employeeFilter, typeFilter, postFilter, selection?.empId]);

  function select(empId: number, day: string) {
    setSelection({ empId, day }); setSelectedMarker(null); setEditingId(null); setForm(blankShift());
    window.requestAnimationFrame(() => document.getElementById("schedule-editor")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function edit(shift: ShiftRow) {
    select(shift.empId, shift.businessDate);
    setEditingId(shift.id);
    setForm({ shiftName: shift.shiftName, startTime: hkTime(shift.startTime), endTime: hkTime(shift.endTime), endDayOffset: hkDate(shift.endTime) === shift.businessDate ? 0 : 1 });
  }

  function move(weeks: number) {
    const next = addDays(monday, weeks * 7);
    setMonday(next);
    setSelectedMarker(null);
    setSelection((current) => current ? { ...current, day: next } : current);
    setEditingId(null); setForm(blankShift());
  }

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); setRefresh((value) => value + 1); return true; }
    catch (cause) { setError(errorText(cause)); return false; }
    finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection) return;
    const values = new FormData(event.currentTarget);
    const body = {
      empId: selection.empId, businessDate: selection.day,
      shiftName: String(values.get("shiftName")), startTime: String(values.get("startTime")),
      endTime: String(values.get("endTime")), endDayOffset: Number(values.get("endDayOffset")),
    };
    void run(() => editingId === null ? apiPost("/mock-shifts", profile, body) : apiPatch(`/mock-shifts/${editingId}`, profile, body), "模拟班次已保存")
      .then((saved) => { if (saved) { setEditingId(null); setForm(blankShift()); } });
  }

  function markers(empId: number, day: string) {
    const relevant = records.filter((row) => row.empId === empId && (row.businessDate === day || (hkDate(row.endTime) === day && minuteOf(row.endTime) > 0)));
    return <div className="schedule-markers" aria-label="可排性标记">{relevant.map((row) => {
      const continued = row.businessDate !== day;
      const start = continued ? 0 : minuteOf(row.startTime);
      const end = continued ? minuteOf(row.endTime) : hkDate(row.endTime) !== day ? 1440 : minuteOf(row.endTime);
      const left = start / 1440 * 100;
      const width = Math.max(5, Math.min(100 - left, (end - start) / 1440 * 100));
      const status = statuses.find((item) => item.statusCode === row.statusCode);
      const name = status?.statusName ?? row.statusCode;
      const overnight = hkDate(row.endTime) !== row.businessDate ? "次日 " : "";
      const label = `${continued ? "前日延续 · " : ""}${name} ${hkTime(row.startTime)}–${overnight}${hkTime(row.endTime)} · ${durationLabelFromTimes(row.startTime, row.endTime)}`;
      return <button type="button" className="schedule-marker-track" key={`${row.id}-${day}`} style={{ left: `${left}%`, width: `${width}%` }} title={label} aria-label={label} aria-pressed={selectedMarker?.id === row.id && selectedMarker.day === day} onClick={() => setSelectedMarker({ id: row.id, day })}>
        <span style={{ backgroundColor: status?.colorHex ?? (row.statusCode === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : row.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9") }} />
      </button>;
    })}</div>;
  }

  return <div className="schedule-page">
    <div className="schedule-controls">
      <div className="schedule-week-nav">
        <Button type="button" variant="outline" size="icon" aria-label="上一周" title="上一周" onClick={() => move(-1)}><ChevronLeft size={16} /></Button>
        <strong>{monday} — {weekDays[6]}</strong>
        <Button type="button" variant="outline" size="icon" aria-label="下一周" title="下一周" onClick={() => move(1)}><ChevronRight size={16} /></Button>
        <Button type="button" variant="outline" onClick={() => { const next = mondayOf(hkToday()); setMonday(next); setSelectedMarker(null); setSelection((current) => current ? { ...current, day: hkToday() } : current); }}>本周</Button>
        <Button type="button" variant="outline" size="icon" aria-label="刷新排班" title="刷新排班" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /></Button>
      </div>
    </div>
    <div className="schedule-filters">
      <label>组织<select disabled value={directory?.orgId ?? ""}><option value={directory?.orgId ?? ""}>{directory?.orgName ?? "加载中"}</option></select></label>
      <label>员工<select value={employeeFilter} onChange={(event) => { setEmployeeFilter(event.target.value); setSelectedMarker(null); }}><option value="">全部员工</option>{directory?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.empName}</option>)}</select></label>
      <label>员工类型<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setSelectedMarker(null); }}><option value="">全部类型</option>{employeeTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label>岗位<select value={postFilter} onChange={(event) => { setPostFilter(event.target.value); setSelectedMarker(null); }}><option value="">全部岗位</option>{posts.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
    </div>
    <div className="schedule-legend" aria-label="可排性状态">{activeStatuses.map((status) => <span key={status.statusCode}><i style={{ backgroundColor: status.colorHex ?? (status.statusCode === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9") }} />{status.statusName}</span>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <section className="schedule-board" aria-label="模拟排班周表">
      {loading ? <div className="employee-loading">正在加载班次和可排性记录</div> : employees.length === 0 ? <div className="manager-no-data">当前筛选下没有员工</div> : <div className="schedule-scroll"><div className="schedule-grid">
        <div className="schedule-column-head">员工</div>{weekDays.map((day, index) => <div className="schedule-column-head" key={day}>{shortDay(day)} {weekdays[index]}</div>)}
        {employees.map((employee) => <div className="schedule-row" key={employee.id}>
          <div className="schedule-person"><strong>{employee.empName}</strong><small>{labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</small></div>
          {weekDays.map((day) => { const dayShifts = shifts.filter((shift) => shift.empId === employee.id && shift.businessDate === day); return <div className={`schedule-cell ${selection?.empId === employee.id && selection.day === day ? "selected" : ""}`} key={`${employee.id}-${day}`}>
            {markers(employee.id, day)}
            {dayShifts.map((shift) => <button type="button" className="schedule-shift" key={shift.id} onClick={() => edit(shift)} title={`${shift.shiftName} · ${hkTime(shift.startTime)}–${hkDate(shift.endTime) !== day ? "次日 " : ""}${hkTime(shift.endTime)} · ${durationLabel(shift.durationMinutes)}`}><strong>{hkTime(shift.startTime)}–{hkTime(shift.endTime)}</strong><span>{shift.shiftName} · {durationLabel(shift.durationMinutes)}</span></button>)}
            <button type="button" className="schedule-cell-add" onClick={() => select(employee.id, day)} title={`${employee.empName} ${day} 新增班次`} aria-label={`${employee.empName} ${day} 新增班次`}><Plus size={14} /></button>
          </div>; })}
        </div>)}
      </div></div>}
    </section>
    {markerRecord && markerEmployee && selectedMarker && <div className="schedule-marker-detail" role="status">
      <i style={{ backgroundColor: markerStatus?.colorHex ?? (markerRecord.statusCode === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : markerRecord.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9") }} />
      <div><strong>{markerEmployee.empName} · {markerStatus?.statusName ?? markerRecord.statusCode}</strong><span>{markerRecord.businessDate} {hkTime(markerRecord.startTime)}–{hkDate(markerRecord.endTime) !== markerRecord.businessDate ? "次日 " : ""}{hkTime(markerRecord.endTime)} · {durationLabelFromTimes(markerRecord.startTime, markerRecord.endTime)}{selectedMarker.day !== markerRecord.businessDate ? ` · ${selectedMarker.day} 延续` : ""}</span></div>
      <Button type="button" variant="ghost" size="icon" title="关闭可排性详情" aria-label="关闭可排性详情" onClick={() => setSelectedMarker(null)}><X size={16} /></Button>
    </div>}
    <section id="schedule-editor" className="schedule-editor" aria-label="模拟班次维护">
      <div className="admin-intro"><h2>{selectedEmployee && selection ? `${selectedEmployee.empName} · ${selection.day}` : "模拟班次"}</h2><span>{selectedShifts.length} 个班次</span></div>
      {selection && selectedEmployee && <div className="schedule-editor-layout">
        <div className="schedule-shift-list">{selectedShifts.map((shift) => <div key={shift.id}><div><strong>{shift.shiftName}</strong><span>{hkTime(shift.startTime)}–{hkDate(shift.endTime) !== shift.businessDate ? "次日 " : ""}{hkTime(shift.endTime)} · {durationLabel(shift.durationMinutes)}</span></div><div className="schedule-shift-actions"><Button type="button" size="sm" variant="outline" onClick={() => edit(shift)}>编辑</Button><Button type="button" size="icon" variant="outline" title="删除班次" aria-label={`删除${shift.shiftName}`} onClick={() => { if (window.confirm("删除这个模拟班次？")) void run(() => apiDelete(`/mock-shifts/${shift.id}`, profile), "模拟班次已删除"); }}><Trash2 size={15} /></Button></div></div>)}{selectedShifts.length === 0 && <p>当日暂无模拟班次</p>}</div>
        <form className="schedule-form" onSubmit={save}>
          <div className="manager-editor-head"><h3>{editingId ? "编辑班次" : "新增班次"}</h3>{editingId && <Button type="button" variant="outline" size="sm" onClick={() => { setEditingId(null); setForm(blankShift()); }}>取消编辑</Button>}</div>
          <div className="admin-form-grid">
            <label className="employee-remark">班次名称<input name="shiftName" required maxLength={100} value={form.shiftName} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, shiftName: value })); }} /></label>
            <label>开始时间<input name="startTime" type="time" required value={form.startTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} /></label>
            <label>结束时间<input name="endTime" type="time" required value={form.endTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} /></label>
            <label>结束日期<select name="endDayOffset" value={form.endDayOffset} onChange={(event) => { const value = Number(event.currentTarget.value); setForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
          </div>
          <Button type="submit" disabled={busy}><Save size={15} />{editingId ? "保存修改" : "新增班次"}</Button>
        </form>
      </div>}
    </section>
  </div>;
}
