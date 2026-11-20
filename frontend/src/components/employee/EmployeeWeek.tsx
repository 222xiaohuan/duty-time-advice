import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, GripVertical, LockKeyhole, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPatch, apiPost, type SourceDictionaryItem } from "@/lib/api";
import { errorText, weekdays } from "@/lib/admin";
import { RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";
import { baselineStatusMessage } from "@/lib/rosterability";
import { addDays, dayLocked, hkDate, hkTime, hkToday, mondayOf, shortDay } from "@/lib/week";

type AllowedStatus = { statusCode: string; statusName: string; colorHex: string | null };
type Config = { empId: number; empName: string; cutoffDays: number; baselineRule: string; submitMode: string; empEditEnable: number; priorityRosterEnable: number; allowedStatuses: AllowedStatus[] };
type RecordRow = { id: number; businessDate: string; statusCode: string; sourceCode: string; startTime: string; endTime: string; remark: string | null; locked: number };
type Form = { businessDate: string; statusCode: string; allDay: boolean; startTime: string; endTime: string; endDayOffset: number; remark: string };
type BatchResult = { businessDate: string; sourceId?: number | null; success: boolean; recordId?: number; message?: string };
type BatchResponse = { created: number; failed: number; results: BatchResult[] };
const initialForm = (date: string, statusCode: string): Form => ({ businessDate: date, statusCode, allDay: false, startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" });
const statusClass = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "rosterable" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "priority" : "unrosterable";
const baselineLabel = (rule?: string | null) => rule === "BASE_UNROSTERABLE" ? "默认全部不可排" : rule === "BASE_ROSTERABLE" ? "默认全部可排" : "默认可排性未配置";
const statusColor = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9";
const timeOfMinute = (minute: number) => minute === 1440 ? "24:00" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minuteOfIso = (iso: string) => { const [hour, minute] = hkTime(iso).split(":").map(Number); return hour * 60 + minute; };
const durationLabel = (start: string, end: string) => {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return `${Number((minutes / 60).toFixed(1))}h`;
};
function submittedForm(element: HTMLFormElement, current: Form): Form {
  const values = new FormData(element);
  return { ...current,
    statusCode: String(values.get("statusCode") ?? current.statusCode),
    allDay: values.get("timeMode") === "allDay",
    startTime: String(values.get("startTime") ?? current.startTime),
    endTime: String(values.get("endTime") ?? current.endTime),
    endDayOffset: Number(values.get("endDayOffset") ?? current.endDayOffset),
    remark: String(values.get("remark") ?? current.remark),
  };
}

export function EmployeeWeek({ profile, sources }: { profile: MockProfile; sources: SourceDictionaryItem[] }) {
  const [monday, setMonday] = useState(() => mondayOf(hkToday()));
  const [config, setConfig] = useState<Config | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selectedDay, setSelectedDay] = useState(() => hkToday());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [copyDates, setCopyDates] = useState<string[]>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [batchMode, setBatchMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(() => initialForm(hkToday(), "ROSTERABLE"));
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [batchResult, setBatchResult] = useState<BatchResponse | null>(null);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const canEdit = Boolean(config?.empEditEnable && config.allowedStatuses.length);
  const formStatusAllowed = Boolean(config?.allowedStatuses.some((status) => status.statusCode === form.statusCode));
  const baselineMessage = config ? baselineStatusMessage(config.baselineRule, form.statusCode) : null;
  const selectedLocked = config ? dayLocked(selectedDay, config.cutoffDays) : true;

  useEffect(() => {
    const nextMidnight = Date.parse(`${addDays(hkToday(), 1)}T00:00:00+08:00`);
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(1, nextMidnight - Date.now() + 10));
    return () => window.clearTimeout(timer);
  }, [clock]);

  async function loadRecords(week = monday) {
    const rows = await apiGet<RecordRow[]>(`/rosterability-records?from=${week}&to=${addDays(week, 6)}`, profile);
    setRecords(rows);
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Promise.all([apiGet<Config>("/me/rosterability-config", profile), apiGet<RecordRow[]>(`/rosterability-records?from=${monday}&to=${addDays(monday, 6)}`, profile)])
      .then(([nextConfig, rows]) => {
        if (!active) return;
        setConfig(nextConfig); setRecords(rows);
        setForm((current) => ({ ...current, statusCode: nextConfig.allowedStatuses.some((status) => status.statusCode === current.statusCode) ? current.statusCode : nextConfig.allowedStatuses[0]?.statusCode ?? "" }));
      }).catch((cause) => { if (active) setError(errorText(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile, monday]);

  function openDayEditor(day: string, startMinute = 540, endMinute = 1020) {
    const start = Math.max(0, Math.min(1425, startMinute));
    const end = Math.max(start + 15, Math.min(1440, endMinute));
    setSelectedDay(day); setEditingId(null); setCopyDates([]); setRepeatWeeks(0);
    setForm({ ...initialForm(day, config?.allowedStatuses[0]?.statusCode ?? ""), startTime: timeOfMinute(start), endTime: end === 1440 ? "00:00" : timeOfMinute(end), endDayOffset: end === 1440 ? 1 : 0 });
    setError(""); setEditorOpen(true);
  }
  function chooseDay(day: string) {
    if (batchMode) {
      setSelectedDates((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
      setEditorOpen(true);
      return;
    }
    openDayEditor(day);
  }
  function edit(row: RecordRow) {
    setBatchMode(false); setEditingId(row.id); setSelectedDay(row.businessDate); setCopyDates([]); setRepeatWeeks(0);
    setForm({ businessDate: row.businessDate, statusCode: row.statusCode, allDay: hkTime(row.startTime) === "00:00" && hkTime(row.endTime) === "00:00" && hkDate(row.endTime) !== row.businessDate, startTime: hkTime(row.startTime), endTime: hkTime(row.endTime), endDayOffset: hkDate(row.endTime) === row.businessDate ? 0 : 1, remark: row.remark ?? "" });
    setError(""); setEditorOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!canEdit || selectedLocked || !formStatusAllowed || baselineMessage) { if (baselineMessage) setError(baselineMessage); return; }
    setBusy(true); setError(""); setMessage(""); setBatchResult(null);
    try {
      const entered = submittedForm(event.currentTarget as HTMLFormElement, form);
      const payload = { ...entered, startTime: entered.allDay ? "00:00" : entered.startTime, endTime: entered.allDay ? "00:00" : entered.endTime, endDayOffset: entered.allDay ? 1 : entered.endDayOffset, remark: entered.remark || null };
      const baseDates = [selectedDay, ...copyDates];
      const repeatedDates = Array.from({ length: repeatWeeks }, (_, index) => baseDates.map((day) => addDays(day, (index + 1) * 7))).flat();
      const targetDates = editingId === null && (copyDates.length > 0 || repeatWeeks > 0) ? [...new Set([...baseDates, ...repeatedDates])].sort() : [];
      if (targetDates.length > 0) {
        const result = await apiPost<BatchResponse>("/rosterability-records/batch/set-dates", profile, { dates: targetDates, statusCode: payload.statusCode, startTime: payload.startTime, endTime: payload.endTime, endDayOffset: payload.endDayOffset, remark: payload.remark });
        setBatchResult(result); await loadRecords(); setMessage(`已处理 ${result.created} 条，失败 ${result.failed} 条`);
      } else {
        if (editingId === null) await apiPost("/rosterability-records", profile, payload);
        else await apiPatch(`/rosterability-records/${editingId}`, profile, payload);
        await loadRecords(); setMessage("时段已保存");
      }
      setEditingId(null); setCopyDates([]); setRepeatWeeks(0); setEditorOpen(false);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function remove(row: RecordRow) {
    if (!window.confirm("删除此时段？")) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiDelete(`/rosterability-records/${row.id}`, profile); await loadRecords(); setEditingId(null); setEditorOpen(false); setMessage("时段已删除"); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function resize(row: RecordRow, edge: "start" | "end", minute: number) {
    setBusy(true); setError(""); setMessage("");
    try {
      const change = edge === "start" ? { startTime: timeOfMinute(minute) } : { endTime: minute === 1440 ? "00:00" : timeOfMinute(minute), endDayOffset: minute === 1440 ? 1 : 0 };
      await apiPatch(`/rosterability-records/${row.id}`, profile, change);
      await loadRecords(); setMessage("时段已更新");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function runBatch(path: string, payload: unknown) {
    setBusy(true); setError(""); setMessage(""); setBatchResult(null);
    try {
      const result = await apiPost<BatchResponse>(path, profile, payload);
      setBatchResult(result); await loadRecords(); setSelectedDates([]); setCopyDates([]); setRepeatWeeks(0); setEditingId(null); setBatchMode(false); setEditorOpen(false);
      setMessage(`新增 ${result.created} 条，失败 ${result.failed} 条`);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  function moveWeek(shift: number) {
    setMonday((current) => addDays(current, shift * 7)); setSelectedDates([]); setCopyDates([]); setRepeatWeeks(0); setEditingId(null); setBatchResult(null); setEditorOpen(false);
    const nextDay = addDays(monday, shift * 7); setSelectedDay(nextDay); setForm(initialForm(nextDay, config?.allowedStatuses[0]?.statusCode ?? ""));
  }

  return <div className="employee-page">
    <div className="employee-toolbar">
      <div className="week-nav"><Button size="icon" variant="outline" title="上一周" aria-label="上一周" onClick={() => moveWeek(-1)}><ChevronLeft size={17} /></Button><strong>{shortDay(monday)} – {shortDay(addDays(monday, 6))}</strong><Button size="icon" variant="outline" title="下一周" aria-label="下一周" onClick={() => moveWeek(1)}><ChevronRight size={17} /></Button><Button size="sm" variant="ghost" onClick={() => { const today = hkToday(); const current = mondayOf(today); setMonday(current); setSelectedDay(today); setEditingId(null); setSelectedDates([]); setEditorOpen(false); setForm(initialForm(today, config?.allowedStatuses[0]?.statusCode ?? "")); }}>本周</Button></div>
    </div>
    {config && <div className="employee-context"><strong>{config.empName}</strong><span>{baselineLabel(config.baselineRule)}</span><span>提前 {config.cutoffDays} 天锁定</span>{!config.empEditEnable && <span>员工编辑已关闭</span>}{config.submitMode === "MODE_NO_SUBMIT" && <span>无需提报</span>}</div>}
    {config && <div className="employee-status-legend" aria-label="可排性状态说明"><span>可维护状态</span>{config.allowedStatuses.length ? config.allowedStatuses.map((status) => <span className={`employee-status-legend-item ${statusClass(status.statusCode)}`} key={status.statusCode}><i style={{ backgroundColor: status.colorHex ?? statusColor(status.statusCode) }} />{status.statusName}</span>) : <span>无</span>}</div>}
    <details className="employee-quick-actions"><summary><Copy size={15} />快捷操作</summary><div className="employee-batch-toolbar"><Button size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => void runBatch("/rosterability-records/batch/copy-previous-week", {})}>复制上周至本周</Button><Button size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => void runBatch("/rosterability-records/batch/copy-current-to-next", {})}>复制本周至下周</Button><Button size="sm" variant={batchMode ? "default" : "outline"} disabled={!canEdit} onClick={() => { const next = !batchMode; setBatchMode(next); setEditingId(null); setSelectedDates([]); setBatchResult(null); setEditorOpen(next); }}>多日期统一设置</Button></div></details>
    {loading ? <div className="employee-loading">正在加载周记录</div> : <div className="employee-week" role="group" aria-label="周日历">{dates.map((day, index) => {
      const locked = config ? dayLocked(day, config.cutoffDays) : true;
      const dayRecords = records.filter((row) => row.businessDate === day);
      return <section className={`employee-day ${selectedDay === day && !batchMode ? "selected" : ""} ${locked ? "locked" : ""}`} key={day}>
        <button type="button" className="employee-day-head" onClick={() => chooseDay(day)} aria-pressed={batchMode ? selectedDates.includes(day) : selectedDay === day}><span><strong>{weekdays[index]}</strong><small>{shortDay(day)}</small></span><span className="day-head-side">{batchMode ? <input type="checkbox" tabIndex={-1} readOnly checked={selectedDates.includes(day)} /> : locked ? "只读" : <Plus size={15} />}</span></button>
        <div className="employee-day-entries">
          <EmployeeDayTimeline day={day} records={dayRecords} config={config} locked={locked} canDrag={canEdit && !batchMode && !busy} onCreate={(start, end) => openDayEditor(day, start, end)} onEdit={edit} onResize={resize} />
          <div className="employee-entry-list">{dayRecords.map((row) => <button type="button" className={`employee-entry ${statusClass(row.statusCode)}`} key={row.id} onClick={() => edit(row)}><strong>{config?.allowedStatuses.find((status) => status.statusCode === row.statusCode)?.statusName ?? row.statusCode}</strong><span>{hkTime(row.startTime)}–{hkDate(row.endTime) !== day ? "次日 " : ""}{hkTime(row.endTime)}</span></button>)}{dayRecords.length === 0 && <span className="day-empty">无记录</span>}</div>
        </div>
      </section>;
    })}</div>}
    <div className={`employee-lower ${editorOpen ? "employee-editor-open" : ""}`}>
      <section className="employee-editor">
        <div className="admin-intro"><div><h2>{batchMode ? "多日期统一设置" : editingId ? "编辑时段" : "新增时段"}</h2><span>{batchMode ? `${selectedDates.length} 个日期` : selectedDay}</span></div><Button type="button" variant="ghost" size="icon" className="employee-editor-close" title="关闭维护面板" aria-label="关闭维护面板" onClick={() => setEditorOpen(false)}><X size={17} /></Button></div>
        {config && <div className="employee-status-guide"><span>默认：{baselineLabel(config.baselineRule)}</span><span>可维护：{config.allowedStatuses.length ? config.allowedStatuses.map((status) => status.statusName).join("、") : "无"}</span></div>}
        {batchMode ? <form onSubmit={(event) => { event.preventDefault(); if (selectedDates.length && !baselineMessage) { const entered = submittedForm(event.currentTarget, form); void runBatch("/rosterability-records/batch/set-dates", { dates: selectedDates, statusCode: entered.statusCode, startTime: entered.allDay ? "00:00" : entered.startTime, endTime: entered.allDay ? "00:00" : entered.endTime, endDayOffset: entered.allDay ? 1 : entered.endDayOffset, remark: entered.remark || null }); } else if (baselineMessage) setError(baselineMessage); }} className="employee-form">
          <RecordFields form={form} setForm={setForm} statuses={config?.allowedStatuses ?? []} disabled={!canEdit || busy} />
          {baselineMessage && <p className="form-error" role="alert">{baselineMessage}</p>}<div className="admin-actions"><Button type="submit" disabled={!canEdit || !formStatusAllowed || Boolean(baselineMessage) || busy || selectedDates.length === 0}><Save size={16} />应用到所选日期</Button></div>
        </form> : selectedLocked || !canEdit ? <div className="employee-readonly">{selectedLocked ? "该业务日期已到报备截止时间，记录只读" : "当前参数不允许员工提报"}</div> : <form onSubmit={save} className="employee-form">
          <RecordFields form={form} setForm={setForm} statuses={config?.allowedStatuses ?? []} disabled={busy} repeat={editingId === null ? { dates, selectedDay, copyDates, setCopyDates, repeatWeeks, setRepeatWeeks } : undefined} />
          {!formStatusAllowed && <p className="form-error">当前状态已不允许员工提报，请选择其他状态。</p>}{baselineMessage && <p className="form-error" role="alert">{baselineMessage}</p>}
          <div className="admin-actions"><Button type="submit" disabled={busy || !formStatusAllowed || Boolean(baselineMessage)}><Save size={16} />{editingId ? "保存修改" : "新增时段"}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(initialForm(selectedDay, config?.allowedStatuses[0]?.statusCode ?? "")); }}>取消</Button>}{editingId && <Button type="button" variant="outline" disabled={busy} onClick={() => { const row = records.find((record) => record.id === editingId); if (row) void remove(row); }}><Trash2 size={15} />删除</Button>}</div>
        </form>}
      </section>
      <aside className="employee-detail"><h2>当天记录</h2>{records.filter((row) => row.businessDate === selectedDay).map((row) => <div className="employee-detail-row" key={row.id}><strong>{config?.allowedStatuses.find((status) => status.statusCode === row.statusCode)?.statusName ?? row.statusCode} · {hkTime(row.startTime)}–{hkDate(row.endTime) !== selectedDay ? "次日 " : ""}{hkTime(row.endTime)}</strong><span>{sources.find((source) => source.sourceCode === row.sourceCode)?.sourceName ?? row.sourceCode}</span>{row.remark && <p>{row.remark}</p>}</div>)}{records.every((row) => row.businessDate !== selectedDay) && <p className="muted-text">当天暂无记录</p>}<p className="employee-note">标准产品对接独立消息提醒模块，Demo 不发送消息。</p></aside>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success employee-success-toast" role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>{message}</span></p>}
    {batchResult && <section className="batch-results" aria-label="批量操作结果"><h2>逐项结果</h2>{batchResult.results.length === 0 && <p className="muted-text">没有可复制的记录</p>}{batchResult.results.map((result, index) => <div className={result.success ? "batch-ok" : "batch-fail"} key={`${result.businessDate}-${result.sourceId ?? index}`}><strong>{result.businessDate}</strong><span>{result.success ? "已新增" : result.message ?? "失败"}</span></div>)}</section>}
  </div>;
}

type EmployeeTimelineProps = {
  day: string;
  records: RecordRow[];
  config: Config | null;
  locked: boolean;
  canDrag: boolean;
  onCreate: (start: number, end: number) => void;
  onEdit: (row: RecordRow) => void;
  onResize: (row: RecordRow, edge: "start" | "end", minute: number) => Promise<void>;
};

type ResizeDrag = { pointerId: number; row: RecordRow; edge: "start" | "end"; start: number; end: number; original: number };

function EmployeeDayTimeline({ day, records, config, locked, canDrag, onCreate, onEdit, onResize }: EmployeeTimelineProps) {
  const dragRef = useRef<{ pointerId: number; start: number; end: number } | null>(null);
  const resizeRef = useRef<ResizeDrag | null>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<ResizeDrag | null>(null);
  const hours = [0, 4, 8, 12, 16, 20, 24];
  const baseline = config?.baselineRule === "BASE_ROSTERABLE" ? "rosterable" : config?.baselineRule === "BASE_UNROSTERABLE" ? "unrosterable" : "none";
  const baselineText = !config ? "暂无可排性参数" : locked ? (day < hkToday() ? "无法修改过去日期的可排时间" : "已提前锁定可排时间") : baselineLabel(config.baselineRule);
  const labelStatus = (code: string) => config?.allowedStatuses.find((status) => status.statusCode === code)?.statusName ?? code;
  const rangeFor = (row: RecordRow) => {
    const start = minuteOfIso(row.startTime);
    const overnight = hkDate(row.endTime) !== row.businessDate;
    const end = overnight ? 1440 : minuteOfIso(row.endTime);
    return { start, end: Math.max(start + 15, end) };
  };
  const minuteAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1440, Math.round((event.clientX - rect.left) / rect.width * 96) * 15));
  };
  const overlaps = (start: number, end: number, excludeId?: number) => records.some((row) => {
    if (row.id === excludeId) return false;
    const range = rangeFor(row);
    return start < range.end && end > range.start;
  });
  function resizeDown(event: PointerEvent<HTMLButtonElement>, row: RecordRow, edge: "start" | "end") {
    event.stopPropagation();
    if (!canDrag || locked || row.locked || event.button !== 0) return;
    const range = rangeFor(row);
    const next = { pointerId: event.pointerId, row, edge, ...range, original: range[edge] };
    resizeRef.current = next; setResizePreview(next);
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function nextResize(current: ResizeDrag, minute: number): ResizeDrag {
    const next = current.edge === "start"
      ? { ...current, start: Math.max(0, Math.min(current.end - 15, minute)) }
      : { ...current, end: Math.min(1440, Math.max(current.start + 15, minute)) };
    return overlaps(next.start, next.end, current.row.id) ? current : next;
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDrag || locked || event.button !== 0) return;
    const start = Math.min(1425, minuteAt(event));
    if (overlaps(start, start + 15)) return;
    const next = { pointerId: event.pointerId, start, end: start + 15 };
    dragRef.current = next; setDrag(next); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const resizing = resizeRef.current;
    if (resizing?.pointerId === event.pointerId) {
      const next = nextResize(resizing, minuteAt(event));
      resizeRef.current = next; setResizePreview(next);
      return;
    }
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const pointer = minuteAt(event);
    const next = { start: Math.min(current.start, pointer), end: Math.max(current.start + 15, pointer) };
    setDrag(next);
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const resizing = resizeRef.current;
    if (resizing?.pointerId === event.pointerId) {
      const next = nextResize(resizing, minuteAt(event));
      resizeRef.current = null;
      if (next[next.edge] !== next.original) void onResize(next.row, next.edge, next[next.edge]).finally(() => setResizePreview(null));
      else setResizePreview(null);
      return;
    }
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const pointer = minuteAt(event);
    let start = Math.min(current.start, pointer);
    let end = Math.max(current.start, pointer);
    if (start === end) end = Math.min(1440, start + 15);
    if (start === 1440) { start = 1425; end = 1440; }
    dragRef.current = null; setDrag(null);
    if (end > start && !overlaps(start, end)) onCreate(start, end);
  }
  return <div className={`employee-day-timeline ${locked ? "locked" : ""}`}>
    <div className="employee-timeline-ruler" aria-hidden="true">{hours.map((hour) => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}</div>
    <div className={`employee-timeline-track baseline-${baseline} ${locked ? "locked" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { dragRef.current = null; resizeRef.current = null; setDrag(null); setResizePreview(null); }} aria-label={`${day} 可排性时间轴`}>
      <span className="employee-timeline-baseline">{locked && <LockKeyhole size={12} strokeWidth={2.2} />}{baselineText}</span>
      {records.map((row) => {
        const preview = resizePreview?.row.id === row.id ? resizePreview : null;
        const range = preview ?? rangeFor(row);
        const overnight = hkDate(row.endTime) !== row.businessDate;
        const previewEnd = preview?.edge === "start" ? `${overnight ? "次日 " : ""}${hkTime(row.endTime)}` : range.end === 1440 ? "次日 00:00" : timeOfMinute(range.end);
        const previewMinutes = preview?.edge === "start"
          ? (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 60000 + minuteOfIso(row.startTime) - range.start
          : range.end - range.start;
        const label = preview
          ? `${labelStatus(row.statusCode)} ${timeOfMinute(range.start)}–${previewEnd} · ${Number((previewMinutes / 60).toFixed(1))}h`
          : `${labelStatus(row.statusCode)} ${hkTime(row.startTime)}–${overnight ? "次日 " : ""}${hkTime(row.endTime)} · ${durationLabel(row.startTime, row.endTime)}`;
        const editable = canDrag && !locked && !row.locked && row.sourceCode !== "EXTERNAL_SYNC" && row.sourceCode !== "BULK_IMPORT";
        const canResizeEnd = editable && (!overnight || hkTime(row.endTime) === "00:00");
        return <div className={`employee-timeline-record ${statusClass(row.statusCode)} ${editable ? "resizable" : ""} ${editable && !canResizeEnd ? "resizable-start-only" : ""}`} key={row.id} style={{ left: `${range.start / 1440 * 100}%`, width: `${Math.max(1.4, (range.end - range.start) / 1440 * 100)}%`, backgroundColor: config?.allowedStatuses.find((status) => status.statusCode === row.statusCode)?.colorHex ?? statusColor(row.statusCode) }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="employee-timeline-record-main" title={label} aria-label={`${day} ${label}`} onClick={() => onEdit(row)}><span>{label}</span></button>
          {editable && <button type="button" className="employee-timeline-resize start" title="拖动调整开始时间" aria-label={`${day} ${labelStatus(row.statusCode)} 拖动调整开始时间`} onPointerDown={(event) => resizeDown(event, row, "start")}><GripVertical size={12} /></button>}
          {canResizeEnd && <button type="button" className="employee-timeline-resize end" title="拖动调整结束时间" aria-label={`${day} ${labelStatus(row.statusCode)} 拖动调整结束时间`} onPointerDown={(event) => resizeDown(event, row, "end")}><GripVertical size={12} /></button>}
        </div>;
      })}
      {drag && <span className="employee-timeline-draft" style={{ left: `${Math.min(drag.start, drag.end) / 1440 * 100}%`, width: `${Math.max(1.4, (Math.max(drag.start, drag.end) - Math.min(drag.start, drag.end)) / 1440 * 100)}%` }}><span>待维护 {timeOfMinute(Math.min(drag.start, drag.end))}–{timeOfMinute(Math.max(drag.start, drag.end))}</span></span>}
    </div>
  </div>;
}

type RepeatProps = { dates: string[]; selectedDay: string; copyDates: string[]; setCopyDates: React.Dispatch<React.SetStateAction<string[]>>; repeatWeeks: number; setRepeatWeeks: React.Dispatch<React.SetStateAction<number>> };

function RecordFields({ form, setForm, statuses, disabled, repeat }: { form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>; statuses: AllowedStatus[]; disabled: boolean; repeat?: RepeatProps }) {
  return <div className="admin-form-grid employee-record-fields">
    <label>可排性状态<select name="statusCode" value={form.statusCode} disabled={disabled} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, statusCode: value })); }}>{form.statusCode && !statuses.some((status) => status.statusCode === form.statusCode) && <option value={form.statusCode} disabled>{form.statusCode}（当前不可选择）</option>}{statuses.map((status) => <option value={status.statusCode} key={status.statusCode}>{status.statusName}</option>)}</select></label>
    <div className="employee-time-mode" role="group" aria-label="时间模式"><span>时间模式</span><div><label><input type="radio" name="timeMode" value="segment" checked={!form.allDay} disabled={disabled} onChange={() => setForm((current) => ({ ...current, allDay: false }))} />时段</label><label><input type="radio" name="timeMode" value="allDay" checked={form.allDay} disabled={disabled} onChange={() => setForm((current) => ({ ...current, allDay: true }))} />全天</label></div></div>
    <label>开始时间<input name="startTime" type="time" required disabled={disabled || form.allDay} value={form.allDay ? "00:00" : form.startTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} /></label>
    <label>结束时间<input name="endTime" type="time" required disabled={disabled || form.allDay} value={form.allDay ? "00:00" : form.endTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} /></label>
    <label>结束日期<select name="endDayOffset" value={form.allDay ? 1 : form.endDayOffset} disabled={disabled || form.allDay} onChange={(event) => { const value = Number(event.currentTarget.value); setForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
    {repeat && <EmployeeRepeatFields {...repeat} disabled={disabled} />}
    <label className="employee-remark">备注<textarea name="remark" maxLength={500} rows={3} disabled={disabled} value={form.remark} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, remark: value })); }} /></label>
  </div>;
}

function EmployeeRepeatFields({ dates, selectedDay, copyDates, setCopyDates, repeatWeeks, setRepeatWeeks, disabled }: RepeatProps & { disabled: boolean }) {
  const selectableDates = dates.filter((day) => day !== selectedDay);
  const copyLabel = copyDates.length ? `已选 ${copyDates.length} 天` : "选择日期";
  return <>
    <details className="employee-repeat-picker"><summary><span>复制到</span><span>{copyLabel}</span></summary><div className="employee-repeat-options">{selectableDates.map((day) => <label key={day}><input type="checkbox" disabled={disabled} checked={copyDates.includes(day)} onChange={() => setCopyDates((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())} />{shortDay(day)}</label>)}</div></details>
    <label>重复周期<select value={repeatWeeks} disabled={disabled} onChange={(event) => setRepeatWeeks(Number(event.currentTarget.value))}><option value={0}>不重复</option><option value={1}>本周及未来 1 周</option><option value={2}>本周及未来 2 周</option><option value={3}>本周及未来 3 周</option><option value={4}>本周及未来 4 周</option><option value={5}>本周及未来 5 周</option><option value={6}>本周及未来 6 周</option><option value={7}>本周及未来 7 周</option><option value={8}>本周及未来 8 周</option></select></label>
  </>;
}
