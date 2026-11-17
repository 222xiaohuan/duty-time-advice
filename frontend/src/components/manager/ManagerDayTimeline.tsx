import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { LockKeyhole, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiPatch, apiPost, type SourceDictionaryItem, type StatusDictionaryItem } from "@/lib/api";
import { employeeTypes, errorText, labelOf, posts } from "@/lib/admin";
import { RosterabilityStatus } from "@/lib/enums";
import { BaselineRule } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { baselineStatusMessage } from "@/lib/rosterability";
import { dayLocked, hkDate, hkTime, hkToday, managerLockMessage } from "@/lib/week";

export type TimelineEmployee = { id: number; empName: string; empTypeCode: string; postCode: string; cutoffDays: number | null; baselineRule: string | null; priorityRosterEnable: number };
export type TimelineRecord = { id: number; empId: number; businessDate: string; statusCode: string; sourceCode: string; startTime: string; endTime: string; remark: string | null; locked: number };
export type TimelineShift = { id: number; empId: number; businessDate: string; shiftName: string; startTime: string; endTime: string; durationMinutes: number };
type Form = { statusCode: string; allDay: boolean; startTime: string; endTime: string; endDayOffset: number; remark: string };
type Dialog = { employee: TimelineEmployee; day: string; row: TimelineRecord | null };
type Segment<T> = { item: T; start: number; end: number; lane: number; continued: boolean };
type Drag = { pointerId: number; empId: number; day: string; start: number; end: number };

const hours = Array.from({ length: 13 }, (_, index) => index * 2);
const dateWeekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const defaultColor = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9";
const minuteOf = (iso: string) => { const [hour, minute] = hkTime(iso).split(":").map(Number); return hour * 60 + minute; };
const timeOf = (minute: number) => minute === 1440 ? "00:00" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const position = (start: number, end: number) => ({ left: `${start / 1440 * 100}%`, width: `${(end - start) / 1440 * 100}%` });
const draftPosition = (drag: Drag) => position(Math.min(drag.start, drag.end), drag.start === drag.end ? drag.start + 15 : Math.max(drag.start, drag.end));

function textColor(hex: string): string {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) return "#fff";
  const value = match[1];
  const brightness = (Number.parseInt(value.slice(0, 2), 16) * 299 + Number.parseInt(value.slice(2, 4), 16) * 587 + Number.parseInt(value.slice(4, 6), 16) * 114) / 1000;
  return brightness > 155 ? "#172b3a" : "#fff";
}

function segmentsFor<T extends { businessDate: string; startTime: string; endTime: string }>(items: T[], day: string, showZero = false): Segment<T>[] {
  const visible = items.flatMap((item) => {
    const continued = item.businessDate !== day;
    if (continued && hkDate(item.endTime) !== day) return [];
    const start = continued ? 0 : minuteOf(item.startTime);
    const end = continued || hkDate(item.endTime) === day ? minuteOf(item.endTime) : 1440;
    return end > start || (showZero && !continued && end === start) ? [{ item, start, end, continued }] : [];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  return visible.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.end;
    return { ...segment, lane };
  });
}

export function ManagerDayTimeline({ day, days, employees, records, shifts, statuses, sources, profile, chosenStatus, onStatusChange, onChanged, addRequest, onAddRequestHandled }: {
  day: string; days?: string[]; employees: TimelineEmployee[]; records: TimelineRecord[]; shifts: TimelineShift[];
  statuses: StatusDictionaryItem[]; sources: SourceDictionaryItem[]; profile: MockProfile;
  chosenStatus: string; onStatusChange: (statusCode: string) => void; onChanged: (message: string) => void;
  addRequest?: { empId: number; day: string } | null; onAddRequestHandled?: () => void;
}) {
  const priorityEnabled = employees[0]?.priorityRosterEnable === 1;
  const activeStatuses = statuses.filter((status) => status.enabled === 1 && (status.statusCode === RosterabilityStatus.ROSTERABLE || status.statusCode === RosterabilityStatus.UNROSTERABLE || (status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE && priorityEnabled)));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState<Form>({ statusCode: "ROSTERABLE", allDay: false, startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const statusCode = activeStatuses.some((status) => status.statusCode === chosenStatus) ? chosenStatus : activeStatuses[0]?.statusCode ?? "";
  const dialogBaselineMessage = dialog ? baselineStatusMessage(dialog.employee.baselineRule, form.statusCode) : null;
  const rows = days ? employees[0] ? days.map((rowDay) => ({ employee: employees[0], day: rowDay })) : [] : employees.map((employee) => ({ employee, day }));
  const today = hkToday();

  useEffect(() => {
    if (!dialog) return;
    dialogRef.current?.querySelector("select")?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setDialog(null); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [dialog, busy]);

  function openNew(employee: TimelineEmployee, rowDay: string, start = 540, end = 1020) {
    if (employee.cutoffDays === null || dayLocked(rowDay, employee.cutoffDays) || !statusCode) return;
    setError("");
    setForm({ statusCode, allDay: false, startTime: timeOf(start), endTime: timeOf(end), endDayOffset: end === 1440 ? 1 : 0, remark: "" });
    setDialog({ employee, day: rowDay, row: null });
  }

  function openExisting(employee: TimelineEmployee, rowDay: string, row: TimelineRecord) {
    setError("");
    setForm({ statusCode: row.statusCode, allDay: hkTime(row.startTime) === "00:00" && hkTime(row.endTime) === "00:00" && hkDate(row.endTime) !== row.businessDate, startTime: hkTime(row.startTime), endTime: hkTime(row.endTime), endDayOffset: hkDate(row.endTime) === row.businessDate ? 0 : 1, remark: row.remark ?? "" });
    setDialog({ employee, day: rowDay, row });
  }

  useEffect(() => {
    const employee = employees.find((item) => item.id === addRequest?.empId);
    if (employee && addRequest) { openNew(employee, addRequest.day); onAddRequestHandled?.(); }
  }, [addRequest]);

  function atPointer(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1440, Math.round((event.clientX - rect.left) / rect.width * 96) * 15));
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>, employee: TimelineEmployee, rowDay: string) {
    if (event.button !== 0 || busy || !statusCode || employee.cutoffDays === null || dayLocked(rowDay, employee.cutoffDays)) return;
    const start = Math.min(1425, atPointer(event));
    const next = { pointerId: event.pointerId, empId: employee.id, day: rowDay, start, end: start + 15 };
    dragRef.current = next; setDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { ...current, end: atPointer(event) };
    dragRef.current = next; setDrag(next);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>, employee: TimelineEmployee, rowDay: string) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.empId !== employee.id || current.day !== rowDay) return;
    const last = atPointer(event);
    let start = Math.min(current.start, last);
    let end = Math.max(current.start, last);
    if (start === end) end = Math.min(1440, start + 15);
    if (start === 1440) { start = 1425; end = 1440; }
    dragRef.current = null; setDrag(null);
    openNew(employee, rowDay, start, end);
  }

  const readOnly = !dialog || dialog.employee.cutoffDays === null || dayLocked(dialog.row?.businessDate ?? dialog.day, dialog.employee.cutoffDays) || Boolean(dialog.row?.locked) || dialog.row?.sourceCode === "EXTERNAL_SYNC" || dialog.row?.sourceCode === "BULK_IMPORT";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || readOnly || busy) return;
    const values = new FormData(event.currentTarget);
    const warning = baselineStatusMessage(dialog.employee.baselineRule, String(values.get("statusCode")));
    if (warning) { setError(warning); return; }
    const body = {
      empId: dialog.employee.id, businessDate: dialog.row?.businessDate ?? dialog.day,
      statusCode: String(values.get("statusCode")), startTime: form.allDay ? "00:00" : String(values.get("startTime")),
      endTime: form.allDay ? "00:00" : String(values.get("endTime")), endDayOffset: form.allDay ? 1 : Number(values.get("endDayOffset")),
      remark: String(values.get("remark") ?? "") || null,
    };
    setBusy(true); setError("");
    try {
      if (dialog.row) await apiPatch(`/rosterability-records/${dialog.row.id}`, profile, body);
      else await apiPost("/rosterability-records", profile, body);
      setDialog(null); onChanged("可排性时段已保存");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!dialog?.row || readOnly || busy || !window.confirm("删除这条可排性记录？")) return;
    setBusy(true); setError("");
    try {
      await apiDelete(`/rosterability-records/${dialog.row.id}`, profile);
      setDialog(null); onChanged("可排性时段已删除");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return <div className={`manager-day-timeline-page ${days ? "by-date" : ""}`}>
    <div className="manager-day-statuses" role="group" aria-label="拖拽创建状态">
      {activeStatuses.map((status) => <button type="button" key={status.statusCode} className={statusCode === status.statusCode ? "selected" : ""} aria-pressed={statusCode === status.statusCode} onClick={() => onStatusChange(status.statusCode)}><i style={{ backgroundColor: status.colorHex ?? defaultColor(status.statusCode) }} />{status.statusName}</button>)}
    </div>
    {!activeStatuses.length && <p className="form-error">当前没有启用的可排性状态</p>}
    <div className="manager-day-scroll"><div className={`manager-day-grid ${days ? "by-date" : ""}`}>
      <div className="manager-day-person-head">{days ? "日期" : "员工"}</div>
      <div className="manager-day-ruler" aria-label={`${days ? `${days[0]} 至 ${days[days.length - 1]}` : day} 00:00 至 24:00`}>
        {hours.map((hour) => <span key={hour} className={hour === 0 ? "first" : hour === 24 ? "last" : ""} style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}
      </div>
      {rows.map(({ employee, day: rowDay }) => {
        const locked = employee.cutoffDays === null || dayLocked(rowDay, employee.cutoffDays);
        const lockKind = rowDay < today ? "past" : employee.cutoffDays !== null && dayLocked(rowDay, employee.cutoffDays) ? "cutoff" : locked ? "unknown" : null;
        const baseline = employee.baselineRule === BaselineRule.BASE_ROSTERABLE ? "rosterable" : employee.baselineRule === BaselineRule.BASE_UNROSTERABLE ? "unrosterable" : null;
        const baselineText = baseline === "rosterable" ? "默认全部可排" : baseline === "unrosterable" ? "默认全部不可排" : null;
        const lockMessage = locked ? managerLockMessage(rowDay, employee.cutoffDays) ?? "暂无可排性参数" : null;
        const trackLabel = lockMessage ?? baselineText;
        const dayRecords = segmentsFor(records.filter((row) => row.empId === employee.id), rowDay);
        const dayShifts = segmentsFor(shifts.filter((row) => row.empId === employee.id), rowDay, true);
        const lanes = Math.max(1, ...dayRecords.map((segment) => segment.lane + 1));
        return <div className="manager-day-grid-row" key={`${employee.id}-${rowDay}`}>
          <div className={`manager-day-person ${days ? "week-date" : ""} ${locked ? "locked" : ""} ${lockKind ? `locked-${lockKind}` : ""}`}>
            {days ? <><strong>{rowDay}<span>{dateWeekdays[new Date(`${rowDay}T00:00:00Z`).getUTCDay()]}</span></strong></> : <><strong>{employee.empName}</strong><small>{`${labelOf(employeeTypes, employee.empTypeCode)} · ${labelOf(posts, employee.postCode)}`}</small></>}
            <Button type="button" variant="ghost" size="icon" title={`为${employee.empName}在${rowDay}新增时段`} aria-label={`为${employee.empName}在${rowDay}新增时段`} disabled={locked || !statusCode} onClick={() => openNew(employee, rowDay)}><Plus size={15} /></Button>
          </div>
          <div className={`manager-day-row-body ${locked ? "locked" : ""} ${lockKind ? `locked-${lockKind}` : ""}`}>
            <div className={`manager-day-track ${baseline ? `baseline-${baseline}` : ""} ${lockKind ? `locked-${lockKind}` : ""}`} style={{ height: `${Math.max(54, lanes * 30 + 24)}px` }} onPointerDown={(event) => pointerDown(event, employee, rowDay)} onPointerMove={pointerMove} onPointerUp={(event) => pointerUp(event, employee, rowDay)} onPointerCancel={() => { dragRef.current = null; setDrag(null); }} aria-label={`${employee.empName} ${rowDay} 时间轴${baselineText ? `，${baselineText}` : ""}`}>
              {trackLabel && <span className="manager-day-baseline-mark" aria-hidden="true">{lockKind === "cutoff" && <LockKeyhole className="manager-day-lock-icon" size={12} strokeWidth={2.2} />}{trackLabel}</span>}
              {dayRecords.map(({ item, start, end, lane, continued }) => {
                const status = statuses.find((value) => value.statusCode === item.statusCode);
                const color = status?.colorHex ?? defaultColor(item.statusCode);
                const label = `${continued ? "前日延续 · " : ""}${status?.statusName ?? item.statusCode} ${hkTime(item.startTime)}–${hkDate(item.endTime) !== item.businessDate ? "次日 " : ""}${hkTime(item.endTime)}`;
                return <button type="button" className="manager-day-bar" key={item.id} style={{ ...position(start, end), top: `${lane * 30 + 7}px`, backgroundColor: color, color: textColor(color) }} title={label} aria-label={`${employee.empName} ${rowDay} ${label}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => openExisting(employee, rowDay, item)}><span>{label}</span></button>;
              })}
              {drag?.empId === employee.id && drag.day === rowDay && <div className="manager-day-draft" style={draftPosition(drag)} />}
            </div>
            {dayShifts.length > 0 && <div className="manager-day-shifts">{dayShifts.map(({ item, start, end, continued }) => <span key={item.id} style={position(start, end)} title={`${continued ? "前日延续 · " : ""}${item.shiftName} ${hkTime(item.startTime)}–${hkTime(item.endTime)}`}>{item.shiftName}</span>)}</div>}
          </div>
        </div>;
      })}
    </div></div>
    {dialog && <div className="manager-day-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
      <div className="manager-day-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${dialog.employee.empName} ${dialog.row ? "编辑" : "新增"}可排性时段`}>
        <div className="manager-day-dialog-head"><div><h2>{dialog.employee.empName} · {dialog.row?.businessDate ?? dialog.day}</h2><span>{dialog.row ? "编辑可排性时段" : "新增可排性时段"}</span></div><Button type="button" variant="ghost" size="icon" title="关闭" aria-label="关闭编辑面板" disabled={busy} onClick={() => setDialog(null)}><X size={17} /></Button></div>
        {dialog.row && <p className="manager-day-source">来源：{sources.find((source) => source.sourceCode === dialog.row?.sourceCode)?.sourceName ?? dialog.row.sourceCode}</p>}
        {readOnly && <p className="employee-readonly">{(() => { const lockMessage = managerLockMessage(dialog.row?.businessDate ?? dialog.day, dialog.employee.cutoffDays); return dialog.row?.locked || lockMessage ? lockMessage ?? "已提前锁定可排时间" : "该记录来源只读"; })()}</p>}
        <form onSubmit={save} className="manager-day-dialog-form">
          <label>可排性状态<select name="statusCode" value={form.statusCode} disabled={readOnly || busy} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, statusCode: value })); }}>{form.statusCode && !activeStatuses.some((status) => status.statusCode === form.statusCode) && <option value={form.statusCode}>{form.statusCode}</option>}{activeStatuses.map((status) => <option key={status.statusCode} value={status.statusCode}>{status.statusName}</option>)}</select></label>
          <fieldset className="manager-day-pattern"><legend>时间模式</legend><label><input type="radio" name="timePattern" checked={!form.allDay} disabled={readOnly || busy} onChange={() => setForm((current) => ({ ...current, allDay: false }))} />时段</label><label><input type="radio" name="timePattern" checked={form.allDay} disabled={readOnly || busy} onChange={() => setForm((current) => ({ ...current, allDay: true }))} />全天</label></fieldset>
          <div className="manager-day-time-fields">
            <label>开始时间<input type="time" name="startTime" required value={form.allDay ? "00:00" : form.startTime} disabled={readOnly || busy || form.allDay} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} /></label>
            <label>结束时间<input type="time" name="endTime" required value={form.allDay ? "00:00" : form.endTime} disabled={readOnly || busy || form.allDay} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} /></label>
          </div>
          <label>结束日期<select name="endDayOffset" value={form.allDay ? 1 : form.endDayOffset} disabled={readOnly || busy || form.allDay} onChange={(event) => { const value = Number(event.currentTarget.value); setForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
          <label>备注<textarea name="remark" maxLength={500} rows={3} value={form.remark} disabled={readOnly || busy} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, remark: value })); }} /></label>
          {dialogBaselineMessage && <p className="form-error" role="alert">{dialogBaselineMessage}</p>}{error && <p className="form-error" role="alert">{error}</p>}
          <div className="manager-day-dialog-actions">{dialog.row && !readOnly && <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />删除</Button>}<Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>取消</Button>{!readOnly && <Button type="submit" disabled={busy || Boolean(dialogBaselineMessage) || !activeStatuses.some((status) => status.statusCode === form.statusCode)}><Save size={15} />确认</Button>}</div>
        </form>
      </div>
    </div>}
  </div>;
}
