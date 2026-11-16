import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiDelete, apiGet, apiPatch, apiPost, type SourceDictionaryItem } from "@/lib/api";
import { errorText, weekdays } from "@/lib/admin";
import type { MockProfile } from "@/lib/identity";
import { addDays, dayLocked, hkDate, hkTime, hkToday, mondayOf, shortDay } from "@/lib/week";

type AllowedStatus = { statusCode: string; statusName: string; colorHex: string | null };
type Config = { empId: number; empName: string; cutoffDays: number; baselineRule: string; submitMode: string; empEditEnable: number; allowedStatuses: AllowedStatus[] };
type RecordRow = { id: number; businessDate: string; statusCode: string; sourceCode: string; startTime: string; endTime: string; remark: string | null; locked: number };
type Form = { businessDate: string; statusCode: string; startTime: string; endTime: string; endDayOffset: number; remark: string };
type BatchResult = { businessDate: string; sourceId?: number | null; success: boolean; recordId?: number; message?: string };
type BatchResponse = { created: number; failed: number; results: BatchResult[] };
const initialForm = (date: string, statusCode: string): Form => ({ businessDate: date, statusCode, startTime: "09:00", endTime: "17:00", endDayOffset: 0, remark: "" });
function submittedForm(element: HTMLFormElement, current: Form): Form {
  const values = new FormData(element);
  return { ...current,
    statusCode: String(values.get("statusCode") ?? current.statusCode),
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
  const [batchMode, setBatchMode] = useState(false);
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

  function chooseDay(day: string) {
    if (batchMode) {
      setSelectedDates((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
      return;
    }
    setSelectedDay(day); setEditingId(null); setForm(initialForm(day, config?.allowedStatuses[0]?.statusCode ?? "")); setError("");
  }
  function edit(row: RecordRow) {
    setBatchMode(false); setEditingId(row.id); setSelectedDay(row.businessDate);
    setForm({ businessDate: row.businessDate, statusCode: row.statusCode, startTime: hkTime(row.startTime), endTime: hkTime(row.endTime), endDayOffset: hkDate(row.endTime) === row.businessDate ? 0 : 1, remark: row.remark ?? "" });
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!canEdit || selectedLocked || !formStatusAllowed) return;
    setBusy(true); setError(""); setMessage(""); setBatchResult(null);
    try {
      const entered = submittedForm(event.currentTarget as HTMLFormElement, form);
      const payload = { ...entered, remark: entered.remark || null };
      if (editingId === null) await apiPost("/rosterability-records", profile, payload);
      else await apiPatch(`/rosterability-records/${editingId}`, profile, payload);
      await loadRecords(); setEditingId(null); setMessage("时段已保存");
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function remove(row: RecordRow) {
    if (!window.confirm("删除此时段？")) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiDelete(`/rosterability-records/${row.id}`, profile); await loadRecords(); setEditingId(null); setMessage("时段已删除"); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  async function runBatch(path: string, payload: unknown) {
    setBusy(true); setError(""); setMessage(""); setBatchResult(null);
    try {
      const result = await apiPost<BatchResponse>(path, profile, payload);
      setBatchResult(result); await loadRecords(); setSelectedDates([]);
      setMessage(`新增 ${result.created} 条，失败 ${result.failed} 条`);
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  function moveWeek(shift: number) {
    setMonday((current) => addDays(current, shift * 7)); setSelectedDates([]); setEditingId(null); setBatchResult(null);
    const nextDay = addDays(monday, shift * 7); setSelectedDay(nextDay); setForm(initialForm(nextDay, config?.allowedStatuses[0]?.statusCode ?? ""));
  }

  return <div className="employee-page">
    <div className="employee-toolbar">
      <div className="week-nav"><Button size="icon" variant="outline" title="上一周" aria-label="上一周" onClick={() => moveWeek(-1)}><ChevronLeft size={17} /></Button><strong>{shortDay(monday)} – {shortDay(addDays(monday, 6))}</strong><Button size="icon" variant="outline" title="下一周" aria-label="下一周" onClick={() => moveWeek(1)}><ChevronRight size={17} /></Button><Button size="sm" variant="ghost" onClick={() => { const today = hkToday(); const current = mondayOf(today); setMonday(current); setSelectedDay(today); setEditingId(null); setSelectedDates([]); setForm(initialForm(today, config?.allowedStatuses[0]?.statusCode ?? "")); }}>本周</Button></div>
      <div className="employee-toolbar-actions"><Button size="sm" variant="outline" onClick={() => { setMessage("Demo 版本未开放，标准产品提供批量导入导出能力"); setBatchResult(null); }}><Upload size={15} />导入</Button><Button size="sm" variant="outline" onClick={() => { setMessage("Demo 版本未开放，标准产品提供批量导入导出能力"); setBatchResult(null); }}><Download size={15} />导出</Button></div>
    </div>
    {config && <div className="employee-context"><strong>{config.empName}</strong><span>{config.baselineRule === "BASE_ROSTERABLE" ? "默认可排" : "默认不可排"}</span><span>提前 {config.cutoffDays} 天锁定</span>{!config.empEditEnable && <span>员工编辑已关闭</span>}{config.submitMode === "MODE_NO_SUBMIT" && <span>无需提报</span>}</div>}
    <div className="employee-batch-toolbar"><Button size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => void runBatch("/rosterability-records/batch/copy-previous-week", {})}><Copy size={15} />复制上周至本周</Button><Button size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => void runBatch("/rosterability-records/batch/copy-current-to-next", {})}><Copy size={15} />复制本周至下周</Button><Button size="sm" variant={batchMode ? "default" : "outline"} disabled={!canEdit} onClick={() => { setBatchMode((current) => !current); setSelectedDates([]); setBatchResult(null); }}>多日期设置</Button></div>
    {loading ? <div className="employee-loading">正在加载周记录</div> : <div className="employee-week" role="group" aria-label="周日历">{dates.map((day, index) => {
      const locked = config ? dayLocked(day, config.cutoffDays) : true;
      const dayRecords = records.filter((row) => row.businessDate === day);
      return <section className={`employee-day ${selectedDay === day && !batchMode ? "selected" : ""} ${locked ? "locked" : ""}`} key={day}>
        <button type="button" className="employee-day-head" onClick={() => chooseDay(day)} aria-pressed={batchMode ? selectedDates.includes(day) : selectedDay === day}><span><strong>{weekdays[index]}</strong><small>{shortDay(day)}</small></span><span className="day-head-side">{batchMode ? <input type="checkbox" tabIndex={-1} readOnly checked={selectedDates.includes(day)} /> : locked ? "只读" : <Plus size={15} />}</span></button>
        <div className="employee-day-entries">{dayRecords.map((row) => <button type="button" className={`employee-entry ${row.statusCode === "ROSTERABLE" ? "rosterable" : "unrosterable"}`} key={row.id} onClick={() => edit(row)}><strong>{row.statusCode === "ROSTERABLE" ? "可排" : "不可排"}</strong><span>{hkTime(row.startTime)}–{hkDate(row.endTime) !== day ? "次日 " : ""}{hkTime(row.endTime)}</span></button>)}{dayRecords.length === 0 && <span className="day-empty">无记录</span>}</div>
      </section>;
    })}</div>}
    <div className="employee-lower">
      <section className="employee-editor">
        <div className="admin-intro"><h2>{batchMode ? "多日期统一设置" : editingId ? "编辑时段" : "新增时段"}</h2><span>{batchMode ? `${selectedDates.length} 个日期` : selectedDay}</span></div>
        {batchMode ? <form onSubmit={(event) => { event.preventDefault(); if (selectedDates.length) { const entered = submittedForm(event.currentTarget, form); void runBatch("/rosterability-records/batch/set-dates", { dates: selectedDates, statusCode: entered.statusCode, startTime: entered.startTime, endTime: entered.endTime, endDayOffset: entered.endDayOffset, remark: entered.remark || null }); } }} className="employee-form">
          <RecordFields form={form} setForm={setForm} statuses={config?.allowedStatuses ?? []} disabled={!canEdit || busy} />
          <Button type="submit" disabled={!canEdit || !formStatusAllowed || busy || selectedDates.length === 0}><Save size={16} />应用到所选日期</Button>
        </form> : selectedLocked || !canEdit ? <div className="employee-readonly">{selectedLocked ? "该业务日期已到报备截止时间，记录只读" : "当前参数不允许员工提报"}</div> : <form onSubmit={save} className="employee-form">
          <RecordFields form={form} setForm={setForm} statuses={config?.allowedStatuses ?? []} disabled={busy} />
          {!formStatusAllowed && <p className="form-error">当前状态已不允许员工提报，请选择其他状态。</p>}
          <div className="admin-actions"><Button type="submit" disabled={busy || !formStatusAllowed}><Save size={16} />{editingId ? "保存修改" : "新增时段"}</Button>{editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(initialForm(selectedDay, config?.allowedStatuses[0]?.statusCode ?? "")); }}>取消</Button>}{editingId && <Button type="button" variant="outline" disabled={busy} onClick={() => { const row = records.find((record) => record.id === editingId); if (row) void remove(row); }}><Trash2 size={15} />删除</Button>}</div>
        </form>}
      </section>
      <aside className="employee-detail"><h2>当天记录</h2>{records.filter((row) => row.businessDate === selectedDay).map((row) => <div className="employee-detail-row" key={row.id}><strong>{row.statusCode === "ROSTERABLE" ? "可排" : "不可排"} · {hkTime(row.startTime)}–{hkDate(row.endTime) !== selectedDay ? "次日 " : ""}{hkTime(row.endTime)}</strong><span>{sources.find((source) => source.sourceCode === row.sourceCode)?.sourceName ?? row.sourceCode}</span>{row.remark && <p>{row.remark}</p>}</div>)}{records.every((row) => row.businessDate !== selectedDay) && <p className="muted-text">当天暂无记录</p>}<p className="employee-note">标准产品对接独立消息提醒模块，Demo 不发送消息。</p></aside>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    {batchResult && <section className="batch-results" aria-label="批量操作结果"><h2>逐项结果</h2>{batchResult.results.length === 0 && <p className="muted-text">没有可复制的记录</p>}{batchResult.results.map((result, index) => <div className={result.success ? "batch-ok" : "batch-fail"} key={`${result.businessDate}-${result.sourceId ?? index}`}><strong>{result.businessDate}</strong><span>{result.success ? "已新增" : result.message ?? "失败"}</span></div>)}</section>}
  </div>;
}

function RecordFields({ form, setForm, statuses, disabled }: { form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>; statuses: AllowedStatus[]; disabled: boolean }) {
  return <div className="admin-form-grid"><label>可排性状态<select name="statusCode" value={form.statusCode} disabled={disabled} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, statusCode: value })); }}>{form.statusCode && !statuses.some((status) => status.statusCode === form.statusCode) && <option value={form.statusCode} disabled>{form.statusCode}（当前不可选择）</option>}{statuses.map((status) => <option value={status.statusCode} key={status.statusCode}>{status.statusName}</option>)}</select></label><label>开始时间<input name="startTime" type="time" required disabled={disabled} value={form.startTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, startTime: value })); }} /></label><label>结束时间<input name="endTime" type="time" required disabled={disabled} value={form.endTime} onInput={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, endTime: value })); }} /></label><label>结束日期<select name="endDayOffset" value={form.endDayOffset} disabled={disabled} onChange={(event) => { const value = Number(event.currentTarget.value); setForm((current) => ({ ...current, endDayOffset: value })); }}><option value={0}>当天</option><option value={1}>次日（跨午夜）</option></select></label><label className="employee-remark">备注<input name="remark" maxLength={500} disabled={disabled} value={form.remark} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, remark: value })); }} /></label></div>;
}
