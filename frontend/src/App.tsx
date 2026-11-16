import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import { AlertCircle, CalendarDays, Check, CircleHelp, RefreshCw, Settings2, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import { Parameters } from "@/components/admin/Parameters";
import { Templates } from "@/components/admin/Templates";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiGet, type Health, type MockIdentity, type SourceDictionaryItem, type StatusDictionaryItem } from "@/lib/api";
import { initialProfile, profiles, rememberProfile, type MockProfile } from "@/lib/identity";

type LoadState = {
  phase: "loading" | "ready" | "error";
  identity: MockIdentity | null;
  health: Health | null;
  statuses: StatusDictionaryItem[];
  sources: SourceDictionaryItem[];
  message: string | null;
};

const initialState: LoadState = { phase: "loading", identity: null, health: null, statuses: [], sources: [], message: null };
const groups = [...new Set(profiles.map((profile) => profile.group))];
const roleNames = { admin: "管理员", manager: "主管", employee: "员工" } as const;

function App() {
  const [profile, setProfile] = useState<MockProfile>(initialProfile);
  const [view, setView] = useState<"workspace" | "parameters" | "templates">("workspace");
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<LoadState>(initialState);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, phase: "loading", message: null }));
    Promise.all([
      apiGet<Health>("/health", undefined, controller.signal),
      apiGet<MockIdentity>("/me", profile, controller.signal),
      apiGet<StatusDictionaryItem[]>("/dictionaries/statuses", profile, controller.signal),
      apiGet<SourceDictionaryItem[]>("/dictionaries/sources", profile, controller.signal),
    ]).then(([health, identity, statuses, sources]) => {
      if (identity.role !== profile.role || identity.userId !== profile.userId || identity.orgId !== (profile.orgId ?? null)) {
        throw new ApiError("身份校验未通过", 403);
      }
      setState({ phase: "ready", health, identity, statuses, sources, message: null });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ phase: "error", identity: null, health: null, statuses: [], sources: [], message: error instanceof Error ? error.message : "请求失败" });
    });
    return () => controller.abort();
  }, [profile, refreshKey]);

  function switchProfile(key: string) {
    const next = profiles.find((item) => item.key === key);
    if (!next) return;
    rememberProfile(next);
    setProfile(next);
    setView("workspace");
  }

  const activeStatuses = state.statuses.filter((item) => item.enabled === 1);
  const activeSources = state.sources.filter((item) => item.enabled === 1);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><CalendarDays size={19} strokeWidth={2.2} /></div>
        <div className="brand-text"><span>Duty Time Advice</span><small>排班时间报备</small></div>
      </div>
      <div className="topbar-actions">
        <div className="environment-label">HKJC DEMO</div>
        <label className="sr-only" htmlFor="identity-selector">当前身份</label>
        <Select value={profile.key} onValueChange={switchProfile}>
          <SelectTrigger id="identity-selector" className="identity-trigger" aria-label="当前身份">
            <UserRound className="h-4 w-4 shrink-0 text-primary" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {profiles.filter((item) => item.group === group).map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
            </SelectGroup>)}
          </SelectContent>
        </Select>
      </div>
    </header>

    <div className="workspace">
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-section-label">排班管理</div>
        <button className={`sidebar-link ${view === "workspace" ? "sidebar-active" : ""}`} onClick={() => setView("workspace")}><CalendarDays size={17} /><span>排班时间报备</span></button>
        {profile.role === "admin" && <><div className="sidebar-section-label admin-nav-label">管理设置</div><button className={`sidebar-link ${view === "parameters" ? "sidebar-active" : ""}`} onClick={() => setView("parameters")}><Settings2 size={17} /><span>组织参数</span></button><button className={`sidebar-link ${view === "templates" ? "sidebar-active" : ""}`} onClick={() => setView("templates")}><CalendarDays size={17} /><span>周模板</span></button></>}
        <div className="sidebar-footer"><span className="sidebar-footer-mark">HKJC</span><span>Workforce Management</span></div>
      </aside>

      <main className="main-content">
        {profile.role === "admin" && <nav className="admin-mobile-nav" aria-label="管理设置"><button className={view === "workspace" ? "selected" : ""} onClick={() => setView("workspace")}>工作台</button><button className={view === "parameters" ? "selected" : ""} onClick={() => setView("parameters")}>组织参数</button><button className={view === "templates" ? "selected" : ""} onClick={() => setView("templates")}>周模板</button></nav>}
        <div className="breadcrumb">排班管理 <span>/</span> {view === "parameters" ? "组织参数" : view === "templates" ? "周模板" : "排班时间报备"}</div>
        <div className="page-heading">
          <div><h1>{view === "parameters" ? "组织参数" : view === "templates" ? "周模板" : "排班时间报备"}</h1><p>{view === "workspace" ? "工作台" : "管理员设置"}</p></div>
          <div className="heading-actions">
            <span className={`connection-state ${state.phase === "ready" ? "is-ready" : state.phase === "error" ? "is-error" : ""}`}>
              <span className="connection-dot" />
              {state.phase === "ready" ? "服务正常" : state.phase === "error" ? "连接失败" : "连接中"}
            </span>
            <Button variant="outline" size="icon" title="刷新数据" aria-label="刷新数据" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        {state.message && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{state.message}</span><Button size="sm" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>重试</Button></div>}

        {profile.role === "admin" && view !== "workspace" ? <>
          {view === "parameters" ? <Parameters profile={profile} /> : <Templates profile={profile} />}
        </> : <><div className="summary-strip" aria-label="当前概览">
          <div className="summary-item"><span className="summary-label">当前身份</span><strong>{profile.label}</strong><span className="summary-meta">{roleNames[profile.role]} · ID {state.identity?.userId ?? profile.userId}</span></div>
          <div className="summary-item"><span className="summary-label">服务状态</span><strong>{state.phase === "ready" ? "运行正常" : state.phase === "error" ? "连接失败" : "正在检查"}</strong><span className="summary-meta">{state.health?.db === "sqlite" ? "SQLite · 本地演示" : "Duty Time Advice API"}</span></div>
          <div className="summary-item"><span className="summary-label">可排性状态</span><strong>{state.phase === "ready" ? activeStatuses.length : "—"}</strong><span className="summary-meta">已启用状态</span></div>
        </div>

        <div className="content-grid">
          <section className="calendar-section" aria-label="日历">
            <div className="section-heading"><h2>日历</h2><span>Asia/Hong_Kong</span></div>
            <FullCalendar plugins={[dayGridPlugin]} initialView="dayGridMonth" locale={zhCnLocale} timeZone="Asia/Hong_Kong" firstDay={1} height="auto" dayMaxEvents={true} headerToolbar={{ left: "prev,next today", center: "title", right: "" }} events={[]} />
          </section>

          <aside className="detail-rail" aria-label="字典信息">
            <section className="rail-section">
              <div className="rail-heading"><ShieldCheck size={17} /><h2>可排性状态</h2></div>
              {state.phase === "loading" ? <div className="loading-line" /> : activeStatuses.length > 0 ? <div className="status-list">
                {activeStatuses.map((item) => <div className="status-row" key={item.statusCode}>
                  <span className="status-swatch" style={{ backgroundColor: item.colorHex ?? "#64748b" }} />
                  <div><strong>{item.statusName}</strong><small>{item.statusCode}</small></div>
                  <Check size={15} className="status-check" />
                </div>)}
              </div> : <div className="rail-empty"><WifiOff size={16} />暂无状态数据</div>}
            </section>
            <section className="rail-section">
              <div className="rail-heading"><CircleHelp size={17} /><h2>记录来源</h2></div>
              {state.phase === "loading" ? <div className="loading-line" /> : activeSources.length > 0 ? <div className="source-list">
                {activeSources.map((item) => <div className="source-row" key={item.sourceCode}><span className="source-marker" /><span>{item.sourceName}</span></div>)}
              </div> : <div className="rail-empty"><WifiOff size={16} />暂无来源数据</div>}
            </section>
          </aside>
        </div></>}
      </main>
    </div>
  </div>;
}

export default App;
