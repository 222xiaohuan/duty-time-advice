import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiPatch, apiPost, type StatusDictionaryItem } from "@/lib/api";
import { RosterabilityStatus } from "@/lib/enums";
import type { MockProfile } from "@/lib/identity";

export type TemplateTimelineItem = {
  id: number;
  weekday: number;
  statusCode: string;
  startTime: string;
  endTime: string;
  endDayOffset: number;
  remark: string | null;
};

type Form = { statusCode: string; allDay: boolean; startTime: string; endTime: string; endDayOffset: number; remark: string };
type Dialog = { weekday: number; row: TemplateTimelineItem | null };
type Drag = { pointerId: number; weekday: number; start: number; end: number };
type Segment = { item: TemplateTimelineItem; rowWeekday: number; start: number; end: number; lane: number; continued: boolean };

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const hours = Array.from({ length: 13 }, (_, index) => index * 2);
const minuteOf = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const timeOf = (minute: number) => minute === 1440 ? "00:00" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const position = (start: number, end: number) => ({ left: `${start / 1440 * 100}%`, width: `${Math.max(0, end - start) / 1440 * 100}%` });
const draftPosition = (drag: Drag) => position(Math.min(drag.start, drag.end), drag.start === drag.end ? drag.start + 15 : Math.max(drag.start, drag.end));
const nextWeekday = (weekday: number) => weekday === 7 ? 1 : weekday + 1;
const fallbackColor = (code: string) => code === RosterabilityStatus.ROSTERABLE ? "#4a90e2" : code === RosterabilityStatus.PRIORITY_ROSTERABLE ? "#2e8b57" : "#a9a9a9";
const textColor = (hex: string) => {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) return "#fff";
  const value = match[1];
  const brightness = (Number.parseInt(value.slice(0, 2), 16) * 299 + Number.parseInt(value.slice(2, 4), 16) * 587 + Number.parseInt(value.slice(4, 6), 16) * 114) / 1000;
  return brightness > 155 ? "#172b3a" : "#fff";
};

function segmentsFor(items: TemplateTimelineItem[], rowWeekday: number): Segment[] {
  const visible = items.flatMap((item) => {
    const end = minuteOf(item.endTime);
    if (item.weekday === rowWeekday) {
      const start = minuteOf(item.startTime);
      const dayEnd = item.endDayOffset ? 1440 : end;
      return dayEnd > start || (start === dayEnd && !item.endDayOffset) ? [{ item, rowWeekday, start, end: dayEnd, continued: false }] : [];
    }
    if (item.endDayOffset && nextWeekday(item.weekday) === rowWeekday && end > 0) {
      return [{ item, rowWeekday, start: 0, end, continued: true }];
    }
    return [];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  return visible.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.end;
    return { ...segment, lane };
  });
}

export function TemplateWeekTimeline({ templateId, items, statuses, profile, onChanged }: {
  templateId: number;
  items: TemplateTimelineItem[];
  statuses: StatusDictionaryItem[];
  profile: MockProfile;
  onChanged: (message: string) => void;
}) {
  const activeStatuses = statuses.filter((status) => status.enabled === 1 && (status.statusCode === RosterabilityStatus.ROSTERABLE || status.statusCode === RosterabilityStatus.UNROSTERABLE || status.statusCode === RosterabilityStatus.PRIORITY_ROSTERABLE));
  const [chosenStatus, setChosenStatus] = useState(activeStatuses[0]?.statusCode ?? RosterabilityStatus.ROSTERABLE);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState<Form>({ statusCode: chosenStatus, allDay: false, startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeStatuses.some((status) => status.statusCode === chosenStatus)) setChosenStatus(activeStatuses[0]?.statusCode ?? "");
  }, [activeStatuses, chosenStatus]);

  useEffect(() => {
    if (!dialog) return;
    dialogRef.current?.querySelector("select")?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setDialog(null); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [dialog, busy]);

  function openNew(weekday: number, start = 540, end = 1020) {
    if (!chosenStatus) return;
    setError("");
    setForm({ statusCode: chosenStatus, allDay: false, startTime: timeOf(start), endTime: timeOf(end), endDayOffset: end === 1440 ? 1 : 0, remark: "" });
    setDialog({ weekday, row: null });
  }

  function openExisting(row: TemplateTimelineItem) {
    setError("");
    setForm({ statusCode: row.statusCode, allDay: row.endDayOffset === 1 && row.startTime === "00:00" && row.endTime === "00:00", startTime: row.startTime, endTime: row.endTime, endDayOffset: row.endDayOffset, remark: row.remark ?? "" });
    setDialog({ weekday: row.weekday, row });
  }

  function atPointer(event: PointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1440, Math.round((event.clientX - rect.left) / rect.width * 96) * 15));
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>, weekday: number) {
    if (event.button !== 0 || busy || !chosenStatus) return;
    const start = Math.min(1425, atPointer(event));
    const next = { pointerId: event.pointerId, weekday, start, end: start + 15 };
    dragRef.current = next; setDrag(next); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { ...current, end: atPointer(event) };
    dragRef.current = next; setDrag(next);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>, weekday: number) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.weekday !== weekday) return;
    const last = atPointer(event);
    let start = Math.min(current.start, last);
    let end = Math.max(current.start, last);
    if (start === end) end = Math.min(1440, start + 15);
    if (start === 1440) { start = 1425; end = 1440; }
    dragRef.current = null; setDrag(null); openNew(weekday, start, end);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    const values = new FormData(event.currentTarget);
    const body = {
      weekday: dialog.row?.weekday ?? dialog.weekday,
      statusCode: String(values.get("statusCode")),
      startTime: form.allDay ? "00:00" : String(values.get("startTime")),
      endTime: form.allDay ? "00:00" : String(values.get("endTime")),
      endDayOffset: form.allDay ? 1 : Number(values.get("endDayOffset")),
      remark: String(values.get("remark") ?? "") || null,
    };
    setBusy(true); setError("");
    try {
      if (dialog.row) await apiPatch(`/templates/${templateId}/items/${dialog.row.id}`, profile, body);
      else await apiPost(`/templates/${templateId}/items`, profile, body);
      setDialog(null); onChanged(dialog.row ? "模板可排性时段已保存" : "模板可排性时段已添加");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!dialog?.row || busy || !window.confirm("删除这条模板可排性时段？")) return;
    setBusy(true); setError("");
    try { await apiDelete(`/templates/${templateId}/items/${dialog.row.id}`, profile); setDialog(null); onChanged("模板可排性时段已删除"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }

  return <div className="manager-day-timeline-page template-week-timeline">
    <div className="manager-day-statuses" role="group" aria-label="拖拽创建状态">
      {activeStatuses.map((status) => <button type="button" key={status.statusCode} className={chosenStatus === status.statusCode ? "selected" : ""} aria-pressed={chosenStatus === status.statusCode} onClick={() => setChosenStatus(status.statusCode)}><i style={{ backgroundColor: status.colorHex ?? fallbackColor(status.statusCode) }} />{status.statusName}</button>)}
    </div>
    {!activeStatuses.length && <p className="form-error">当前没有启用的可排性状态</p>}
    <div className="manager-day-scroll"><div className="manager-day-grid template-week-grid">
      <div className="manager-day-person-head">星期</div>
      <div className="manager-day-ruler" aria-label="周模板 00:00 至 24:00">{hours.map((hour) => <span key={hour} className={hour === 0 ? "first" : hour === 24 ? "last" : ""} style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}</div>
      {weekdays.map((day, index) => {
        const weekday = index + 1;
        const daySegments = segmentsFor(items, weekday);
        const lanes = Math.max(1, ...daySegments.map((segment) => segment.lane + 1));
        return <div className="manager-day-grid-row" key={day}>
          <div className="manager-day-person week-date"><strong>{day}</strong><Button type="button" variant="ghost" size="icon" title={`为${day}新增时段`} aria-label={`为${day}新增时段`} disabled={!chosenStatus} onClick={() => openNew(weekday)}><Plus size={16} /></Button></div>
          <div className="manager-day-row-body"><div className="manager-day-track" style={{ height: `${Math.max(80, lanes * 30 + 25)}px` }} onPointerDown={(event) => pointerDown(event, weekday)} onPointerMove={pointerMove} onPointerUp={(event) => pointerUp(event, weekday)} onPointerCancel={() => { dragRef.current = null; setDrag(null); }} aria-label={`${day} 模板可排性时间轴`}>
            {daySegments.map(({ item, start, end, lane, continued }) => {
              const status = statuses.find((value) => value.statusCode === item.statusCode);
              const color = status?.colorHex ?? fallbackColor(item.statusCode);
              const label = `${continued ? "前日延续 · " : ""}${status?.statusName ?? item.statusCode} ${item.startTime}–${item.endDayOffset ? "次日 " : ""}${item.endTime}`;
              return <button type="button" className="manager-day-bar" key={`${item.id}-${continued ? "continuation" : "start"}`} style={{ ...position(start, end), top: `${lane * 30 + 7}px`, backgroundColor: color, color: textColor(color) }} title={`${label}${item.remark ? ` · ${item.remark}` : ""}`} aria-label={`${day} ${label}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => openExisting(item)}><span>{label}</span></button>;
            })}
            {drag?.weekday === weekday && <div className="manager-day-draft" style={draftPosition(drag)} />}
          </div></div>
        </div>;
      })}
    </div></div>
    {dialog && <div className="manager-day-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
      <div className="manager-day-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${weekdays[dialog.weekday - 1]} ${dialog.row ? "编辑" : "新增"}模板可排性时段`}>
        <div className="manager-day-dialog-head"><div><h2>{weekdays[dialog.weekday - 1]} · 模板可排性</h2><span>{dialog.row ? "编辑可排性时段" : "新增可排性时段"}</span></div><Button type="button" variant="ghost" size="icon" title="关闭" aria-label="关闭编辑面板" disabled={busy} onClick={() => setDialog(null)}><X size={17} /></Button></div>
        <form onSubmit={save} className="manager-day-dialog-form">
          <label>可排性状态<select name="statusCode" value={form.statusCode} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, statusCode: event.currentTarget.value }))}>{form.statusCode && !activeStatuses.some((status) => status.statusCode === form.statusCode) && <option value={form.statusCode} disabled>{form.statusCode}（当前不可选择）</option>}{activeStatuses.map((status) => <option key={status.statusCode} value={status.statusCode}>{status.statusName}</option>)}</select></label>
          <fieldset className="manager-day-pattern"><legend>时间模式</legend><label><input type="radio" name="timePattern" checked={!form.allDay} disabled={busy} onChange={() => setForm((current) => ({ ...current, allDay: false }))} />时段</label><label><input type="radio" name="timePattern" checked={form.allDay} disabled={busy} onChange={() => setForm((current) => ({ ...current, allDay: true }))} />全天</label></fieldset>
          <div className="manager-day-time-fields"><label>开始时间<input type="time" name="startTime" required value={form.allDay ? "00:00" : form.startTime} disabled={busy || form.allDay} onInput={(event) => setForm((current) => ({ ...current, startTime: event.currentTarget.value }))} onChange={(event) => setForm((current) => ({ ...current, startTime: event.currentTarget.value }))} /></label><label>结束时间<input type="time" name="endTime" required value={form.allDay ? "00:00" : form.endTime} disabled={busy || form.allDay} onInput={(event) => setForm((current) => ({ ...current, endTime: event.currentTarget.value }))} onChange={(event) => setForm((current) => ({ ...current, endTime: event.currentTarget.value }))} /></label></div>
          <label>结束日期<select name="endDayOffset" value={form.allDay ? 1 : form.endDayOffset} disabled={busy || form.allDay} onChange={(event) => setForm((current) => ({ ...current, endDayOffset: Number(event.currentTarget.value) }))}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label>
          <label>备注<textarea name="remark" maxLength={500} rows={3} value={form.remark} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, remark: event.currentTarget.value }))} /></label>
          <div className="manager-day-dialog-actions">{dialog.row && <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />删除</Button>}<Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>取消</Button><Button type="submit" disabled={busy || !activeStatuses.length || !activeStatuses.some((status) => status.statusCode === form.statusCode)}><Save size={15} />保存</Button></div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </div>
    </div>}
  </div>;
}
