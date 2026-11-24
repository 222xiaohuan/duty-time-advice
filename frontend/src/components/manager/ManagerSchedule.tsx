import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagerOrgPicker, type ManagerOrganization } from "@/components/manager/ManagerOrgPicker";
import { apiDelete, apiGet, apiPatch, apiPost, type StatusDictionaryItem } from "@/lib/api";
import { employeeTypes, errorText, labelOf, posts, weekdays } from "@/lib/admin";
import { BaselineRule, RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { shiftPresets, type ShiftPreset } from "@/lib/shiftPresets";
import { addDays, hkDate, hkTime, hkToday, mondayOf, shortDay } from "@/lib/week";

type Employee = { id: number; empName: string; empTypeCode: string; postCode: string; baselineRule: string | null; priorityRosterEnable: number };
type Directory = { orgId: number; orgName: string; organizations: ManagerOrganization[]; employees: Employee[] };
type RecordRow = { id: number; empId: number; businessDate: string; statusCode: string; startTime: string; endTime: string };
type ShiftRow = { id: number; empId: number; businessDate: string; shiftName: string; startTime: string; endTime: string; durationMinutes: number };
type Selection = { empId: number; day: string };
type MarkerSelection = { id: number; day: string };
type DragRange = { start: number; end: number };
type ShiftForm = { shiftName: string; startTime: string; endTime: string; endDayOffset: number };
const blankShift = (): ShiftForm => ({ shiftName: "工作班", startTime: "09:00", endTime: "17:00", endDayOffset: 0 });

function presetDuration(preset: ShiftPreset): number {
  const minutes = (time: string) => { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; };
  return preset.endDayOffset * 1440 + minutes(preset.endTime) - minutes(preset.startTime);
}

function minuteOf(iso: string): number {
  const [hour, minute] = hkTime(iso).split(":").map(Number);
  return hour * 60 + minute;
}

function timeOfMinute(minute: number): string {
  const normalized = minute === 1440 ? 0 : Math.max(0, Math.min(1439, minute));
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function durationLabel(minutes: number): string {
  return `${Number((minutes / 60).toFixed(1))}h`;
}

function durationLabelFromTimes(startTime: string, endTime: string): string {
  const minutes = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
  return durationLabel(minutes);
}

type AvailabilitySegment = { start: number; end: number; statusCode: string };

function recordCovers(row: RecordRow, day: string, minute: number): boolean {
  const startDay = row.businessDate;
  const endDay = hkDate(row.endTime);
  if (startDay === day) {
    const start = minuteOf(row.startTime);
    const end = endDay !== startDay ? (minuteOf(row.endTime) || 1440) : minuteOf(row.endTime);
    return minute >= start && minute < end;
  }
  if (endDay === day && startDay < day) return minute < (minuteOf(row.endTime) || 1440);
  return false;
}

function availabilityState(employee: Employee, rows: RecordRow[], day: string, minute: number): string {
  let state: string = employee.baselineRule === BaselineRule.BASE_UNROSTERABLE ? RosterabilityStatus.UNROSTERABLE : RosterabilityStatus.ROSTERABLE;
  rows.filter((row) => row.empId === employee.id).sort((a, b) => a.id - b.id).forEach((row) => {
    if (recordCovers(row, day, minute)) state = row.statusCode;
  });
  return state;
}

function availabilitySegments(employee: Employee, rows: RecordRow[], day: string): AvailabilitySegment[] {
  const segments: AvailabilitySegment[] = [];
  for (let minute = 0; minute < 1440; minute += 15) {
    const statusCode = availabilityState(employee, rows, day, minute);
    const previous = segments[segments.length - 1];
    if (previous?.statusCode === statusCode) previous.end += 15;
    else segments.push({ start: minute, end: minute + 15, statusCode });
  }
  return segments;
}

export function ManagerSchedule({ profile, statuses }: { profile: MockProfile; statuses: StatusDictionaryItem[] }) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>(profile.orgId === undefined ? [] : [profile.orgId]);
  const [monday, setMonday] = useState(() => mondayOf(hkToday()));
  const [day, setDay] = useState(() => hkToday());
  const [mode, setMode] = useState<"week" | "day">("week");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [postFilter, setPostFilter] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragRange, setDragRange] = useState<DragRange | null>(null);
  const dragRef = useRef<{ pointerId: number; empId: number; start: number; end: number } | null>(null);
  const dragWarningRef = useRef(false);
  const [selectedMarker, setSelectedMarker] = useState<MarkerSelection | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [form, setForm] = useState<ShiftForm>(blankShift);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogMode, setDialogMode] = useState<"catalog" | "edit" | null>(null);
  const [presetSearch, setPresetSearch] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const selectedOrgIdsKey = selectedOrgIds.join(",");
  const managerProfile = useMemo(() => selectedOrgIds[0] === profile.orgId ? profile : { ...profile, orgId: selectedOrgIds[0] }, [profile, selectedOrgIds]);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const employees = (directory?.employees ?? []).filter((employee) =>
    (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
  const selectedEmployee = directory?.employees.find((employee) => employee.id === selection?.empId);
  const selectedShifts = shifts.filter((shift) => shift.empId === selection?.empId && shift.businessDate === selection?.day);
  const markerRecord = records.find((row) => row.id === selectedMarker?.id);
  const markerEmployee = directory?.employees.find((employee) => employee.id === markerRecord?.empId);
  const markerStatus = statuses.find((status) => status.statusCode === markerRecord?.statusCode);
  const activeStatuses = statuses.filter((status) => status.enabled === 1 && (status.statusCode === RosterabilityStatus.ROSTERABLE || status.statusCode === RosterabilityStatus.UNROSTERABLE || (status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE && directory?.employees.some((employee) => employee.priorityRosterEnable === 1))));
  const visiblePresets = shiftPresets.filter((preset) => `${preset.code} ${preset.name} ${preset.startTime} ${preset.endTime}`.toLowerCase().includes(presetSearch.trim().toLowerCase()));

  useEffect(() => {
    if (!dialogMode || dialogRef.current?.open) return;
    dialogRef.current?.showModal();
    if (dialogMode === "catalog") dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, [dialogMode]);

  useEffect(() => {
    let active = true;
    setDirectory(null); setSelection(null); setRecords([]); setShifts([]); setDialogMode(null); setSelectedMarker(null); setLoading(true); setError("");
    apiGet<Directory>(`/manager/employees?orgIds=${selectedOrgIdsKey}`, managerProfile).then((data) => {
      if (!active) return;
      setDirectory(data);
    }).catch((cause: unknown) => { if (active) { setError(errorText(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [managerProfile, selectedOrgIdsKey]);

  useEffect(() => {
    if (!directory) return;
    let active = true;
    setLoading(true);
    Promise.all([
      apiGet<RecordRow[]>(`/rosterability-records?orgIds=${selectedOrgIdsKey}&from=${addDays(mode === "day" ? day : monday, -1)}&to=${mode === "day" ? day : weekDays[6]}`, managerProfile),
      apiGet<ShiftRow[]>(`/mock-shifts?orgIds=${selectedOrgIdsKey}`, managerProfile),
    ]).then(([nextRecords, nextShifts]) => {
      if (active) { setRecords(nextRecords); setShifts(nextShifts); setLoading(false); }
    }).catch((cause: unknown) => { if (active) { setError(errorText(cause)); setLoading(false); } });
    return () => { active = false; };
  }, [directory, monday, day, mode, managerProfile, selectedOrgIdsKey, refresh]);

  useEffect(() => {
    if (!directory) return;
    const matching = directory.employees.filter((employee) =>
      (!employeeFilter || String(employee.id) === employeeFilter) && (!typeFilter || employee.empTypeCode === typeFilter) && (!postFilter || employee.postCode === postFilter));
    if (selection && !matching.some((employee) => employee.id === selection.empId)) closeDialog();
  }, [directory, employeeFilter, typeFilter, postFilter, selection?.empId]);

  function closeDialog() {
    setDialogMode(null); setSelection(null); setEditingId(null); setForm(blankShift()); setPresetSearch(""); setDragRange(null); dragRef.current = null; dragWarningRef.current = false;
  }

  function select(empId: number, day: string) {
    setSelection({ empId, day }); setSelectedMarker(null); setEditingId(null); setPresetSearch(""); setError(""); setDragRange(null); setDialogMode("catalog");
  }

  function edit(shift: ShiftRow) {
    setSelection({ empId: shift.empId, day: shift.businessDate }); setSelectedMarker(null); setError(""); setEditingId(shift.id);
    setForm({ shiftName: shift.shiftName, startTime: hkTime(shift.startTime), endTime: hkTime(shift.endTime), endDayOffset: hkDate(shift.endTime) === shift.businessDate ? 0 : 1 });
    setDialogMode("edit");
  }

  function move(weeks: number) {
    const next = addDays(monday, weeks * 7);
    setMonday(next);
    setSelectedMarker(null);
    closeDialog();
  }

  function movePeriod(amount: number) {
    if (mode === "day") { setDay((current) => addDays(current, amount)); closeDialog(); setSelectedMarker(null); return; }
    move(amount);
  }

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(success); setRefresh((value) => value + 1); return true; }
    catch (cause) { setError(errorText(cause)); return false; }
    finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || editingId === null) return;
    const values = new FormData(event.currentTarget);
    const body = {
      empId: selection.empId, businessDate: selection.day,
      shiftName: String(values.get("shiftName")), startTime: String(values.get("startTime")),
      endTime: String(values.get("endTime")), endDayOffset: Number(values.get("endDayOffset")),
    };
    void run(() => apiPatch(`/mock-shifts/${editingId}`, managerProfile, body), "模拟班次已更新").then((saved) => { if (saved) closeDialog(); });
  }

  function assignPreset(preset: ShiftPreset) {
    if (!selection || busy) return;
    const startTime = dragRange ? timeOfMinute(dragRange.start) : preset.startTime;
    const endTime = dragRange ? timeOfMinute(dragRange.end === 1440 ? 0 : dragRange.end) : preset.endTime;
    const endDayOffset = dragRange ? (dragRange.end === 1440 ? 1 : 0) : preset.endDayOffset;
    const body = { empId: selection.empId, businessDate: selection.day, shiftName: preset.name, startTime, endTime, endDayOffset };
    void run(() => apiPost("/mock-shifts", managerProfile, body), "模拟班次已排入").then((saved) => { if (saved) closeDialog(); });
  }

  function dayPointerMinute(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1440, Math.round((event.clientX - rect.left) / rect.width * 96) * 15));
  }

  function dayPointerDown(event: PointerEvent<HTMLDivElement>, employee: Employee) {
    if (event.button !== 0 || busy || !availabilityState(employee, records, day, Math.min(1425, dayPointerMinute(event))) || availabilityState(employee, records, day, Math.min(1425, dayPointerMinute(event))) === RosterabilityStatus.UNROSTERABLE) {
      if (event.button === 0 && availabilityState(employee, records, day, Math.min(1425, dayPointerMinute(event))) === RosterabilityStatus.UNROSTERABLE) setError("不可排时间段无法排入模拟班次");
      return;
    }
    const start = Math.min(1425, dayPointerMinute(event));
    dragRef.current = { pointerId: event.pointerId, empId: employee.id, start, end: start + 15 };
    dragWarningRef.current = false;
    setError("");
    setDragRange({ start, end: start + 15 });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic pointer events may not have an active capture target */ }
    event.preventDefault();
  }

  function dragTouchesUnavailable(employee: Employee, start: number, end: number): boolean {
    const first = Math.min(start, end);
    const last = Math.min(1425, Math.max(start, end));
    for (let minute = first; minute <= last; minute += 15) {
      if (availabilityState(employee, records, day, minute) === RosterabilityStatus.UNROSTERABLE) return true;
    }
    return false;
  }

  function dayPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const end = dayPointerMinute(event);
    const employee = directory?.employees.find((item) => item.id === current.empId);
    if (employee && dragTouchesUnavailable(employee, current.start, end)) {
      if (!dragWarningRef.current) setError("排班时间不能进入不可排区间，请选择其他可排时间");
      dragWarningRef.current = true;
      return;
    }
    dragWarningRef.current = false;
    const next = { ...current, end };
    dragRef.current = next;
    setDragRange({ start: Math.min(next.start, next.end), end: Math.max(next.start, next.end) });
  }

  function dayPointerUp(event: PointerEvent<HTMLDivElement>, employee: Employee) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.empId !== employee.id) return;
    const end = dayPointerMinute(event);
    const start = Math.min(current.start, end);
    const finish = Math.max(current.start, end) === start ? Math.min(1440, start + 15) : Math.max(current.start, end);
    if (dragTouchesUnavailable(employee, start, finish)) {
      if (!dragWarningRef.current) setError("排班时间不能进入不可排区间，请选择其他可排时间");
      dragWarningRef.current = true;
      setDragRange({ start: Math.min(current.start, current.end), end: Math.max(current.start, current.end) });
      return;
    }
    dragRef.current = null;
    dragWarningRef.current = false;
    setDragRange({ start, end: finish });
    setError(""); setSelection({ empId: employee.id, day }); setPresetSearch(""); setDialogMode("catalog");
  }

  function removeShift() {
    if (editingId === null || busy || !window.confirm("删除这个模拟班次？")) return;
    void run(() => apiDelete(`/mock-shifts/${editingId}`, managerProfile), "模拟班次已删除").then((deleted) => { if (deleted) closeDialog(); });
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
        <Button type="button" variant="outline" size="icon" aria-label={mode === "day" ? "前一天" : "上一周"} title={mode === "day" ? "前一天" : "上一周"} onClick={() => movePeriod(-1)}><ChevronLeft size={16} /></Button>
        <strong>{mode === "day" ? `${day} ${shortDay(day)}` : `${monday} — ${weekDays[6]}`}</strong>
        <Button type="button" variant="outline" size="icon" aria-label={mode === "day" ? "后一天" : "下一周"} title={mode === "day" ? "后一天" : "下一周"} onClick={() => movePeriod(1)}><ChevronRight size={16} /></Button>
        <Button type="button" variant="outline" onClick={() => { if (mode === "day") setDay(hkToday()); else setMonday(mondayOf(hkToday())); setSelectedMarker(null); closeDialog(); }}>{mode === "day" ? "今天" : "本周"}</Button>
        <Button type="button" variant="outline" size="icon" aria-label="刷新排班" title="刷新排班" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /></Button>
      </div>
      <div className="schedule-view-switch" role="group" aria-label="模拟排班呈现方式"><button type="button" className={mode === "week" ? "selected" : ""} aria-pressed={mode === "week"} onClick={() => { setMode("week"); closeDialog(); }}>周模式</button><button type="button" className={mode === "day" ? "selected" : ""} aria-pressed={mode === "day"} onClick={() => { setMode("day"); closeDialog(); }}>天模式</button></div>
    </div>
    <div className="schedule-filters">
      <ManagerOrgPicker organizations={directory?.organizations ?? []} value={selectedOrgIds} onChange={(next) => { setSelectedOrgIds(next); setEmployeeFilter(""); setTypeFilter(""); setPostFilter(""); closeDialog(); setSelectedMarker(null); setNotice(""); }} />
      <label>员工<select value={employeeFilter} onChange={(event) => { setEmployeeFilter(event.target.value); setSelectedMarker(null); }}><option value="">全部员工</option>{directory?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.empName}</option>)}</select></label>
      <label>员工类型<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setSelectedMarker(null); }}><option value="">全部类型</option>{employeeTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label>岗位<select value={postFilter} onChange={(event) => { setPostFilter(event.target.value); setSelectedMarker(null); }}><option value="">全部岗位</option>{posts.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
    </div>
    <div className="schedule-legend" aria-label="可排性状态">{activeStatuses.map((status) => <span key={status.statusCode}><i style={{ backgroundColor: status.colorHex ?? (status.statusCode === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9") }} />{status.statusName}</span>)}</div>
    {!dialogMode && error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <section className="schedule-board" aria-label={mode === "day" ? "模拟排班天表" : "模拟排班周表"}>
      {loading ? <div className="employee-loading">正在加载班次和可排性记录</div> : employees.length === 0 ? <div className="manager-no-data">当前筛选下没有员工</div> : mode === "day" ? <div className="schedule-day-scroll"><div className="schedule-day-grid">
        <div className="schedule-day-column-head">员工</div><div className="schedule-day-ruler">{Array.from({ length: 13 }, (_, index) => index * 2).map((hour) => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}</div>
        {employees.map((employee) => { const availability = availabilitySegments(employee, records, day); const dayShifts = shifts.filter((shift) => shift.empId === employee.id && (shift.businessDate === day || hkDate(shift.endTime) === day)); return <div className="schedule-day-row" key={employee.id}>
          <div className="schedule-day-person"><strong>{employee.empName}</strong><small>{labelOf(employeeTypes, employee.empTypeCode)} · {labelOf(posts, employee.postCode)}</small></div>
          <div className="schedule-day-body"><div className="schedule-day-availability" aria-label={`${employee.empName} ${day} 可排性`}>
            {availability.map((segment) => <span key={`${segment.start}-${segment.end}`} className={`schedule-day-availability-segment ${segment.statusCode === RosterabilityStatus.UNROSTERABLE ? "unrosterable" : segment.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "priority" : "rosterable"}`} style={{ left: `${segment.start / 1440 * 100}%`, width: `${(segment.end - segment.start) / 1440 * 100}%` }} title={`${segment.statusCode === RosterabilityStatus.UNROSTERABLE ? "不可排" : segment.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "优先排" : "可排"} ${timeOfMinute(segment.start)}–${timeOfMinute(segment.end === 1440 ? 0 : segment.end)}`}><b>{(segment.end - segment.start) >= 120 ? (segment.statusCode === RosterabilityStatus.UNROSTERABLE ? "不可排" : segment.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE ? "优先排" : "可排") : ""}</b></span>)}
          </div><div className="schedule-day-track" onPointerDown={(event) => dayPointerDown(event, employee)} onPointerMove={dayPointerMove} onPointerUp={(event) => dayPointerUp(event, employee)} onPointerCancel={() => { dragRef.current = null; dragWarningRef.current = false; setDragRange(null); }} aria-label={`${employee.empName} ${day} 排班时间轴`}>
            {availability.filter((segment) => segment.statusCode === RosterabilityStatus.UNROSTERABLE).map((segment) => <span className="schedule-day-unavailable" key={`blocked-${segment.start}`} style={{ left: `${segment.start / 1440 * 100}%`, width: `${(segment.end - segment.start) / 1440 * 100}%` }} aria-hidden="true" />)}
            {dragRange && (selection?.empId === employee.id || dragRef.current?.empId === employee.id) && <span className="schedule-day-draft" style={{ left: `${dragRange.start / 1440 * 100}%`, width: `${(dragRange.end - dragRange.start) / 1440 * 100}%` }}><span>待排 {timeOfMinute(dragRange.start)}–{dragRange.end === 1440 ? "24:00" : timeOfMinute(dragRange.end)} ({durationLabel(dragRange.end - dragRange.start)})</span></span>}
            {dayShifts.map((shift) => { const continued = shift.businessDate !== day; const start = continued ? 0 : minuteOf(shift.startTime); const end = hkDate(shift.endTime) !== day ? 1440 : (minuteOf(shift.endTime) || 1440); return <button type="button" className="schedule-day-shift" key={shift.id} style={{ left: `${start / 1440 * 100}%`, width: `${Math.max(0.6, (end - start) / 1440 * 100)}%` }} onPointerDown={(event) => event.stopPropagation()} onClick={() => edit(shift)} title={`${shift.shiftName} · ${hkTime(shift.startTime)}–${hkDate(shift.endTime) !== shift.businessDate ? "次日 " : ""}${hkTime(shift.endTime)} · ${durationLabel(shift.durationMinutes)}`}><span>{hkTime(shift.startTime)}–{hkTime(shift.endTime)} ({durationLabel(shift.durationMinutes)})</span></button>; })}
          </div></div>
        </div>; })}
      </div></div> : <div className="schedule-scroll"><div className="schedule-grid">
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
    {dialogMode && selection && selectedEmployee && <dialog ref={dialogRef} className="schedule-dialog" aria-labelledby="schedule-dialog-title" onClose={closeDialog} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="schedule-dialog-head"><div><h2 id="schedule-dialog-title">{dialogMode === "catalog" ? "选择班次" : "编辑班次"}</h2><p>{selectedEmployee.empName} · {selection.day} · 已排 {selectedShifts.length} 个班次</p></div><Button type="button" variant="outline" size="icon" title="关闭" aria-label="关闭" disabled={busy} onClick={closeDialog}><X size={16} /></Button></div>
      {dialogMode === "catalog" ? <>
        <label className="schedule-catalog-search"><Search size={17} /><input type="search" autoFocus value={presetSearch} onChange={(event) => setPresetSearch(event.target.value)} placeholder="搜索代码、名称或时间" aria-label="搜索班次" /></label>
        <div className="schedule-catalog-list" aria-label="班次清单">{visiblePresets.map((preset) => <button type="button" className="schedule-preset" key={preset.code} disabled={busy} onClick={() => assignPreset(preset)}>
          <i style={{ backgroundColor: preset.color }} /><span className="schedule-preset-code">{preset.code}</span><strong>{preset.name}</strong><span className="schedule-preset-time">{preset.startTime}–{preset.endDayOffset ? "次日 " : ""}{preset.endTime} · {durationLabel(presetDuration(preset))}</span>
        </button>)}{visiblePresets.length === 0 && <p className="manager-no-data">没有匹配的班次</p>}</div>
      </> : <form className="schedule-dialog-form" onSubmit={save}>
          <div className="admin-form-grid">
            <label className="employee-remark">班次名称<input name="shiftName" required maxLength={100} value={form.shiftName} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, shiftName: value })); }} /></label>
            <label>开始时间<input name="startTime" type="time" required value={form.startTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} /></label>
            <label>结束时间<input name="endTime" type="time" required value={form.endTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} /></label>
            <label>结束日期<select name="endDayOffset" value={form.endDayOffset} onChange={(event) => { const value = Number(event.currentTarget.value); setForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
          </div>
          <div className="schedule-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={removeShift}><Trash2 size={15} />删除</Button><Button type="submit" disabled={busy}><Save size={15} />保存修改</Button></div>
        </form>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </dialog>}
  </div>;
}
