import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Check, ChevronDown, ChevronRight, ClipboardList, Columns3, Ellipsis, Grid2X2, House, List, LogOut, MessageSquareWarning, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { API, api, clearToken, getToken, setToken } from "./api";
import { MarkdownText } from "./MarkdownText";

type Member = { discordUserId: string; displayName: string; role: "admin" | "lead" | "member" | "viewer"; active: boolean; teamRole: string; discordName?: string; discordUsername?: string; avatarUrl?: string };
type Task = { id: string; title: string; description: string; assigneeDiscordId: string; status: string; dueDate: string; reviewRequested: boolean; updatedAt: string; createdByDiscordId: string };
type Notice = { id: string; taskId: string; title: string; body: string; createdAt: string; readAt: string };
type Issue = { id: string; title: string; description: string; reporterDiscordId: string; ownerDiscordId: string; priority: string; status: string; createdAt: string };
type Update = { id: string; authorDiscordId: string; workDate: string; today: string; blockers: string; tomorrow: string; createdAt: string };
type Announcement = { id: string; title: string; body: string; authorDiscordId: string; publishedAt: string };
type Section = "home" | "tasks" | "issues" | "updates" | "notifications" | "team";
type ModalKind = "task" | "issue" | "update" | "announcement" | "task-detail" | "issue-detail" | null;

const stages = ["ถัดไป", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว"];
const navigation = [
  { id: "home", label: "ภาพรวม", Icon: House },
  { id: "tasks", label: "งาน", Icon: ClipboardList },
  { id: "issues", label: "ปัญหา", Icon: MessageSquareWarning },
  { id: "updates", label: "อัปเดต", Icon: Grid2X2 },
  { id: "notifications", label: "แจ้งเตือน", Icon: Bell },
  { id: "team", label: "ทีม", Icon: Users },
] as const;
const headings: Record<Section, { title: string; caption: string }> = {
  home: { title: "ภาพรวม", caption: "สิ่งที่ทีมกำลังทำในตอนนี้" },
  tasks: { title: "งานทั้งหมด", caption: "มอบหมาย ติดตาม และส่งตรวจงานในที่เดียว" },
  issues: { title: "ปัญหา", caption: "เรื่องที่ทีมต้องช่วยกันแก้" },
  updates: { title: "อัปเดตทีม", caption: "วันนี้ทำอะไร และพรุ่งนี้จะทำอะไรต่อ" },
  notifications: { title: "การแจ้งเตือน", caption: "งานใหม่และสิ่งที่มีคนอยากให้คุณช่วยดู" },
  team: { title: "ทีม", caption: "คนที่ทำงานร่วมกันในพื้นที่นี้" },
};

function currentSection(): Section {
  const name = location.hash.slice(2);
  return navigation.some((item) => item.id === name) ? name as Section : "home";
}
function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
function Avatar({ name, avatarUrl, small = false }: { name: string; avatarUrl?: string; small?: boolean }) {
  return <span className={`person-initial ${small ? "person-initial-small" : ""}`} aria-hidden="true">{name.trim().slice(0, 1) || "?"}{avatarUrl && <img src={avatarUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }}/>}</span>;
}
function Modal({ title, error, onClose, children }: { title: string; error?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="app-dialog" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
    <div className="dialog-content"><header className="dialog-head"><h2>{title}</h2><button type="button" className="icon-action" aria-label="ปิด" onClick={() => dialog.current?.close()}><X size={20}/></button></header>{error && <p className="dialog-error" role="alert">{error}</p>}{children}</div>
  </dialog>;
}

export default function App() {
  const [token, changeToken] = useState(() => getToken());
  const [section, setSection] = useState<Section>(currentSection);
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [authPending, setAuthPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const noticesRef = useRef<HTMLDivElement>(null);
  const [taskView, setTaskView] = useState<"list" | "board">("board");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (code || state || oauthError) {
      history.replaceState(null, "", `${location.pathname}#/tasks`);
      const expected = sessionStorage.getItem("hh_oauth_state");
      sessionStorage.removeItem("hh_oauth_state");
      if (oauthError) setError("Discord ไม่อนุญาตให้เข้าสู่ระบบ กรุณาลองอีกครั้ง");
      else if (!code || !state || state !== expected) setError("การยืนยันตัวตนไม่ตรงกัน กรุณาเริ่มเข้าสู่ระบบใหม่");
      else {
        setAuthPending(true);
        void fetch(`${API}/api/auth/callback/discord`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, state }) })
          .then(async (response) => { const result = await response.json() as { token?: string; error?: string }; if (!response.ok || !result.token) throw new Error(result.error || "เข้าสู่ระบบไม่สำเร็จ"); return result.token; })
          .then((newToken) => { setToken(newToken); changeToken(newToken); setSection("tasks"); setError(""); })
          .catch((failure) => setError(failure instanceof Error ? failure.message : "เข้าสู่ระบบไม่สำเร็จ"))
          .finally(() => setAuthPending(false));
      }
    }
    const onHash = () => { setSection(currentSection()); setModal(null); setNoticesOpen(false); };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(""), 4500); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if (!noticesOpen) return;
    const onPointer = (event: PointerEvent) => { if (event.target instanceof Element && event.target.closest("[data-notice-trigger]")) return; if (!noticesRef.current?.contains(event.target as Node)) setNoticesOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setNoticesOpen(false); };
    addEventListener("pointerdown", onPointer); addEventListener("keydown", onKey);
    return () => { removeEventListener("pointerdown", onPointer); removeEventListener("keydown", onKey); };
  }, [noticesOpen]);

  async function startLogin() {
    setAuthPending(true); setError("");
    try {
      const response = await fetch(`${API}/api/auth/discord`);
      const result = await response.json() as { authorizationUrl?: string; state?: string; error?: string };
      if (!response.ok || !result.authorizationUrl || !result.state) throw new Error(result.error || "เริ่มเข้าสู่ระบบไม่สำเร็จ");
      sessionStorage.setItem("hh_oauth_state", result.state);
      clearToken();
      location.assign(result.authorizationUrl);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "เริ่มเข้าสู่ระบบไม่สำเร็จ"); setAuthPending(false); }
  }

  const reload = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true); setError("");
    try {
      const [identity, team, work, notices, problems, reports, news] = await Promise.allSettled([
        api<{ member: Member }>("/api/me"), api<{ members: Member[] }>("/api/team"), api<{ tasks: Task[] }>("/api/tasks"),
        api<{ notifications: Notice[] }>("/api/notifications"), api<{ issues: Issue[] }>("/api/issues"),
        api<{ updates: Update[] }>("/api/updates"), api<{ announcements: Announcement[] }>("/api/announcements"),
      ]);
      if (identity.status === "fulfilled") setMe(identity.value.member);
      if (team.status === "fulfilled") setMembers(team.value.members);
      if (work.status === "fulfilled") setTasks(work.value.tasks);
      if (notices.status === "fulfilled") setNotifications(notices.value.notifications);
      if (problems.status === "fulfilled") setIssues(problems.value.issues);
      if (reports.status === "fulfilled") setUpdates(reports.value.updates);
      if (news.status === "fulfilled") setAnnouncements(news.value.announcements);
      if ([identity, team, work, notices, problems, reports, news].some((result) => result.status === "rejected")) setError("โหลดข้อมูลบางส่วนไม่สำเร็จ กดโหลดใหม่อีกครั้ง");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "โหลดข้อมูลไม่สำเร็จ");
      if (!getToken()) { changeToken(null); setMe(null); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (token) void reload(); }, [token, reload]);
  useEffect(() => { if (!token) return; const timer = setInterval(() => { void reload(); }, 60_000); return () => clearInterval(timer); }, [token, reload]);

  const person = (id: string) => members.find((member) => member.discordUserId === id) || (me?.discordUserId === id ? me : undefined);
  const name = (id: string) => person(id)?.displayName || (id === "1133361505832800347" ? "ผู้ทดลองใช้" : "ยังไม่กำหนด");
  const avatar = (id: string) => person(id)?.avatarUrl;
  const unread = notifications.filter((item) => !item.readAt).length;
  const openIssues = issues.filter((issue) => issue.status !== "แก้แล้ว");
  const canAssign = Boolean(me && me.role !== "viewer" && members.some((member) => member.discordUserId === me.discordUserId));
  const canWrite = me?.role !== "viewer";
  const canMove = (task: Task) => me?.role === "admin" || me?.role === "lead" || (me?.role === "member" && task.assigneeDiscordId === me.discordUserId);
  function logout() { clearToken(); changeToken(null); setMe(null); setTasks([]); setNotifications([]); location.hash = "/home"; }
  function openDetail(task: Task) { setDetailTask(task); setModal("task-detail"); }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ notificationCreated: boolean }>("/api/tasks", { method: "POST", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), assigneeDiscordId: data.get("assigneeDiscordId"), dueDate: data.get("dueDate"), reviewRequested: data.get("reviewRequested") === "on" }) });
      setModal(null); setMessage(result.notificationCreated ? "มอบหมายงานและส่งการแจ้งเตือนแล้ว" : "มอบหมายงานแล้ว แต่แจ้งเตือนไม่สำเร็จ"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function createIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/issues", { method: "POST", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), ownerDiscordId: data.get("ownerDiscordId"), priority: data.get("priority") }) });
      setModal(null); setMessage("รายงานปัญหาแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกปัญหาไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function createUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/updates", { method: "POST", body: JSON.stringify({ today: data.get("today"), blockers: data.get("blockers"), tomorrow: data.get("tomorrow") }) });
      setModal(null); setMessage("บันทึกอัปเดตแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกอัปเดตไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/announcements", { method: "POST", body: JSON.stringify({ title: data.get("title"), body: data.get("body") }) });
      setModal(null); setMessage("ประกาศข่าวแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ประกาศข่าวไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function deleteAnnouncement(item: Announcement) {
    if (!window.confirm(`ลบประกาศ “${item.title}”?`)) return;
    setBusy(true); setError("");
    try {
      await api(`/api/announcements/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setMessage("ลบประกาศแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ลบประกาศไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function changeIssueStatus(issue: Issue, status: "เปิด" | "แก้แล้ว") {
    setBusy(true); setError("");
    try {
      await api(`/api/issues/${encodeURIComponent(issue.id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setDetailIssue({ ...issue, status }); setMessage(status === "แก้แล้ว" ? "ปิดปัญหาแล้ว" : "เปิดปัญหาอีกครั้งแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function deleteIssue(issue: Issue) {
    if (!window.confirm(`ลบปัญหา “${issue.title}”?`)) return;
    setBusy(true); setError("");
    try {
      await api(`/api/issues/${encodeURIComponent(issue.id)}`, { method: "DELETE" });
      setModal(null); setMessage("ลบปัญหาแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ลบปัญหาไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function deleteTask(task: Task) {
    if (!window.confirm(`ลบงาน “${task.title}” และการแจ้งเตือนของงานนี้?`)) return;
    setBusy(true); setError("");
    try {
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      setModal(null); setMessage("ลบงานแล้ว"); await reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "ลบงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function moveTask(task: Task, status: string) {
    setBusy(true); setError("");
    try { await api(`/api/tasks/${encodeURIComponent(task.id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); setModal(null); setMessage("เปลี่ยนสถานะงานแล้ว"); await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function markRead(notice: Notice) {
    try { await api(`/api/notifications/${encodeURIComponent(notice.id)}/read`, { method: "PATCH" }); await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
  }
  function openNotice(notice: Notice) {
    setNoticesOpen(false);
    const task = tasks.find((item) => item.id === notice.taskId);
    if (task) openDetail(task);
    else { location.hash = "/tasks"; setMessage("ไม่พบงานนี้แล้ว"); }
  }

  if (!token) return <main className="entry-page"><div className="entry-brand"><span className="entry-symbol">hh.</span><span>totalwork</span></div><div className="entry-main"><p className="entry-intro">Hamster Hub / Team workspace</p><h1>งานของทีม<br/>อยู่ที่นี่</h1><p className="entry-description">เปิดดูงานที่ได้รับมอบหมาย ติดตามปัญหา และบอกทีมว่าพรุ่งนี้จะทำอะไรต่อ</p>{error && <p className="inline-error" role="alert">{error}</p>}<button className="entry-button" disabled={authPending} onClick={() => void startLogin()}>{authPending ? "กำลังเชื่อมต่อ Discord…" : "เข้าสู่ระบบด้วย Discord"}<ChevronRight size={19}/></button><p className="entry-note">ใช้ได้เฉพาะ Discord ที่ได้รับสิทธิ์</p></div><div className="entry-bottom"><span>Hamster Hub</span><span>PRIVATE WORKSPACE</span></div></main>;

  return <div className="workspace">
    <aside className="rail" aria-label="เมนูหลัก"><a className="rail-brand" href="#/home" aria-label="ไปหน้าภาพรวม">hh.</a><nav className="rail-links">{navigation.map(({ id, label, Icon }) => id === "notifications" ? <button key={id} type="button" data-notice-trigger className={`rail-link ${noticesOpen ? "selected" : ""}`} aria-label={label} aria-expanded={noticesOpen} onClick={() => setNoticesOpen((open) => !open)}><Icon size={20}/>{unread > 0 && <span className="rail-unread"/>}</button> : <a key={id} href={`#/${id}`} title={label} aria-label={label} aria-current={section === id ? "page" : undefined} className={`rail-link ${section === id ? "selected" : ""}`}><Icon size={20} strokeWidth={section === id ? 2.3 : 1.8}/></a>)}</nav><details className="account-menu"><summary aria-label="บัญชีของฉัน" title={me?.displayName || "บัญชี"}><Avatar name={me?.displayName || "H"} avatarUrl={me?.avatarUrl}/></summary><div className="account-popover"><strong>{me?.displayName}</strong>{me?.discordUsername && <small>@{me.discordUsername}</small>}<small>{me?.teamRole}</small><button onClick={logout}><LogOut size={15}/> ออกจากระบบ</button></div></details></aside>
    <div className="workspace-main"><header className="workspace-top"><span>HAMSTER HUB <span className="top-slash">/</span> {headings[section].title}</span><div><button className="icon-action" onClick={() => void reload()} aria-label="โหลดข้อมูลใหม่" title="โหลดข้อมูลใหม่"><RefreshCw size={17}/></button><button type="button" data-notice-trigger className="icon-action top-bell" aria-label={`การแจ้งเตือน ${unread} รายการ`} aria-expanded={noticesOpen} onClick={() => setNoticesOpen((open) => !open)}><Bell size={18}/>{unread > 0 && <span className="bell-badge">{unread}</span>}</button><span className="top-name">{me?.displayName || "สมาชิก"}</span></div></header>
      {noticesOpen && <div ref={noticesRef} className="notification-panel" role="dialog" aria-label="การแจ้งเตือน"><header><strong>การแจ้งเตือน</strong><button className="icon-action" onClick={() => setNoticesOpen(false)} aria-label="ปิดการแจ้งเตือน"><X size={17}/></button></header><p>{unread} ยังไม่ได้อ่าน</p><div className="notification-list">{notifications.length === 0 ? <span className="notification-empty">ยังไม่มีการแจ้งเตือน</span> : notifications.map((notice) => <article key={notice.id} className={notice.readAt ? "" : "unread"}><button className="notification-open" onClick={() => openNotice(notice)}><strong>{notice.title}</strong><span>{notice.body}</span><small>{displayDate(notice.createdAt)}</small></button>{!notice.readAt && <button className="notification-read" onClick={() => void markRead(notice)} aria-label={`อ่านแล้ว: ${notice.title}`}><Check size={16}/></button>}</article>)}</div></div>}
      <main className="workspace-content"><div className="page-intro"><div><h1>{headings[section].title}</h1><p>{headings[section].caption}</p></div><span className="page-date">{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        {error && !modal && <div className="toast toast-error" role="alert">{error}<button onClick={() => setError("")} aria-label="ปิดข้อความ"><X size={14}/></button></div>}
        {message && <div className="toast toast-success" role="status">{message}<button onClick={() => setMessage("")} aria-label="ปิดข้อความ"><X size={14}/></button></div>}
        {loading && !me ? <p className="loading-text">กำลังโหลดข้อมูลงาน…</p> : me && <>
          {section === "home" && <><div className="overview-line"><strong>สวัสดี, {me.displayName}</strong><span>งานของทีมวันนี้</span></div><div className="overview-stats"><div><strong>{tasks.filter((task) => task.assigneeDiscordId === me.discordUserId && task.status !== "เสร็จแล้ว").length}</strong><span>งานของฉัน</span></div><div><strong>{tasks.filter((task) => task.status === "กำลังทำ").length}</strong><span>กำลังทำ</span></div><div><strong>{tasks.filter((task) => task.status === "รอตรวจ").length}</strong><span>รอตรวจ</span></div><div><strong>{unread}</strong><span>แจ้งเตือนใหม่</span></div></div><SectionTitle title="งานล่าสุด" action={<a href="#/tasks">ดูทั้งหมด <ChevronRight size={15}/></a>}/><TaskTable tasks={tasks.slice(0, 7)} name={name} avatar={avatar} canMove={canMove} busy={busy} onDetail={openDetail} onMove={moveTask}/><div className="home-bottom"><div><SectionTitle title="ปัญหาที่เปิดอยู่" action={<a href="#/issues">ดูทั้งหมด <ChevronRight size={15}/></a>}/>{openIssues.length === 0 ? <EmptyText>ไม่มีปัญหาที่เปิดอยู่</EmptyText> : openIssues.slice(0, 3).map((issue) => <div className="short-row" key={issue.id}><span>{issue.title}</span><small>{issue.priority}</small></div>)}</div><div><SectionTitle title="อัปเดตล่าสุด" action={<a href="#/updates">ดูทั้งหมด <ChevronRight size={15}/></a>}/>{updates.length === 0 ? <EmptyText>ยังไม่มีอัปเดตจากทีม</EmptyText> : updates.slice(0, 3).map((item) => <div className="short-row" key={item.id}><span>{name(item.authorDiscordId)}: {item.today}</span><small>{displayDate(item.workDate)}</small></div>)}</div></div></>}
          {section === "tasks" && <><div className="list-toolbar"><div className="view-switch"><button className={taskView === "list" ? "active" : ""} onClick={() => setTaskView("list")} aria-pressed={taskView === "list"}><List size={16}/> รายการ</button><button className={taskView === "board" ? "active" : ""} onClick={() => setTaskView("board")} aria-pressed={taskView === "board"}><Columns3 size={16}/> บอร์ด</button></div><div className="toolbar-end"><span>{tasks.length} งาน</span>{canAssign && <button className="text-add" onClick={() => { setError(""); setModal("task"); }}><Plus size={17}/> มอบหมายงาน</button>}</div></div>{taskView === "list" ? <TaskTable tasks={tasks} name={name} avatar={avatar} canMove={canMove} busy={busy} onDetail={openDetail} onMove={moveTask}/> : <div className="simple-board">{stages.map((stage) => <section key={stage} className="board-lane"><header><span className={`stage-dot ${stageClass(stage)}`}/><h2>{stage}</h2><small>{tasks.filter((task) => task.status === stage).length}</small></header>{tasks.filter((task) => task.status === stage).length === 0 ? <p className="lane-empty">ยังไม่มีงาน</p> : tasks.filter((task) => task.status === stage).map((task) => <button key={task.id} className="lane-task" onClick={() => openDetail(task)}><strong>{task.title}</strong><span>{name(task.assigneeDiscordId)}</span></button>)}</section>)}</div>}</>}
          {section === "issues" && <><div className="list-toolbar"><span>{issues.filter((issue) => issue.status !== "แก้แล้ว").length} ยังเปิดอยู่ · {issues.length} ทั้งหมด</span>{canWrite && <button className="text-add" onClick={() => { setError(""); setModal("issue"); }}><Plus size={17}/> รายงานปัญหา</button>}</div><div className="table-head issue-columns"><span>ปัญหา</span><span>ผู้ดูแล</span><span>ความสำคัญ</span><span>สถานะ</span></div>{issues.length === 0 ? <EmptyText>ยังไม่มีปัญหา กด “รายงานปัญหา” เมื่อมีเรื่องที่ทีมต้องช่วยกันแก้</EmptyText> : issues.map((issue) => <button type="button" className="table-row issue-columns issue-row" key={issue.id} onClick={() => { setDetailIssue(issue); setModal("issue-detail"); }}><span className="cell-main"><strong>{issue.title}</strong><small>{issue.description || "กดเพื่อดูรายละเอียด"}</small></span><span>{issue.ownerDiscordId ? name(issue.ownerDiscordId) : "ยังไม่กำหนด"}</span><span>{issue.priority}</span><span className={issue.status === "แก้แล้ว" ? "issue-resolved" : "issue-open"}>{issue.status}</span></button>)}</>}
          {section === "updates" && <><div className="list-toolbar"><span>{updates.length} อัปเดต</span><div className="toolbar-end">{canAssign && <button className="text-add" onClick={() => { setError(""); setModal("announcement"); }}><Plus size={17}/> ประกาศข่าว</button>}{canWrite && <button className="text-add" onClick={() => { setError(""); setModal("update"); }}><Plus size={17}/> เพิ่มอัปเดต</button>}</div></div>{announcements.length > 0 && <><SectionTitle title="ข่าวสาร"/>{announcements.map((item) => <article className="journal-row" key={item.id}><div><strong>{item.title}</strong><MarkdownText text={item.body}/></div><div className="journal-tools"><time>{displayDate(item.publishedAt)}</time>{item.authorDiscordId === me.discordUserId && <button type="button" disabled={busy} onClick={() => void deleteAnnouncement(item)} aria-label={`ลบประกาศ ${item.title}`}><Trash2 size={14}/></button>}</div></article>)}</>}<SectionTitle title="บันทึกของทีม"/>{updates.length === 0 ? <EmptyText>ยังไม่มีอัปเดต กด “เพิ่มอัปเดต” เพื่อบอกทีมว่าวันนี้ทำอะไร</EmptyText> : updates.map((item) => <article className="journal-row" key={item.id}><Avatar name={name(item.authorDiscordId)} avatarUrl={avatar(item.authorDiscordId)}/><div><div className="journal-title"><strong>{name(item.authorDiscordId)}</strong><time>{displayDate(item.workDate)}</time></div><MarkdownText text={item.today}/>{item.blockers && <div className="journal-meta"><b>ติดขัด</b><MarkdownText text={item.blockers}/></div>}{item.tomorrow && <div className="journal-meta"><b>พรุ่งนี้</b><MarkdownText text={item.tomorrow}/></div>}</div></article>)}</>}
          {section === "notifications" && <><div className="list-toolbar"><span>{unread} ยังไม่ได้อ่าน</span><span>{notifications.length} รายการทั้งหมด</span></div>{notifications.length === 0 ? <EmptyText>ยังไม่มีการแจ้งเตือน เมื่องานใหม่เข้ามาจะปรากฏที่นี่</EmptyText> : notifications.map((notice) => <article className={`notice-row ${notice.readAt ? "" : "unread"}`} key={notice.id}><span className="notice-dot"/><div><strong>{notice.title}</strong><p>{notice.body}</p><div className="notice-actions"><a href="#/tasks">ดูงาน</a>{!notice.readAt && <button onClick={() => void markRead(notice)}><Check size={15}/> อ่านแล้ว</button>}</div></div><time>{displayDate(notice.createdAt)}</time></article>)}</>}
          {section === "team" && <><div className="list-toolbar"><span>{members.length} สมาชิก</span></div><div className="table-head people-columns"><span>ชื่อ</span><span>หน้าที่</span><span>สิทธิ์</span></div>{members.map((person) => <div className="table-row people-columns" key={person.discordUserId}><div className="person-cell"><Avatar name={person.displayName} avatarUrl={person.avatarUrl}/><span className="person-identity"><strong>{person.displayName}</strong>{person.discordUsername && <small>@{person.discordUsername}</small>}</span></div><span>{person.teamRole}</span><span className="role-text">{person.role}</span></div>)}</>}
        </>}
      </main>
    </div>
    <nav className="mobile-bar" aria-label="เมนูมือถือ">{navigation.map(({ id, label, Icon }) => id === "notifications" ? <button key={id} type="button" data-notice-trigger className={noticesOpen ? "selected" : ""} aria-label={label} aria-expanded={noticesOpen} onClick={() => setNoticesOpen((open) => !open)}><Icon size={20}/><small>{label}</small></button> : <a key={id} href={`#/${id}`} aria-label={label} aria-current={section === id ? "page" : undefined} className={section === id ? "selected" : ""}><Icon size={20}/><small>{label}</small></a>)}</nav>
    {modal === "task" && <Modal title="มอบหมายงาน" error={error} onClose={() => setModal(null)}><p className="dialog-description">ผู้รับจะเห็นงานนี้พร้อมการแจ้งเตือนในเว็บ</p><form className="dialog-form" onSubmit={createTask}><label>ชื่องาน<input name="title" required maxLength={160} placeholder="งานที่ต้องทำ" autoFocus/></label><div className="form-pair"><label>มอบหมายให้<select name="assigneeDiscordId" required defaultValue=""><option value="" disabled>เลือกสมาชิก</option>{members.map((person) => <option key={person.discordUserId} value={person.discordUserId}>{person.displayName} · {person.teamRole}</option>)}</select></label><label>กำหนดส่ง<input name="dueDate" type="date"/></label></div><label>รายละเอียด<textarea name="description" maxLength={2000} rows={4} placeholder="ขอบเขตงานหรือสิ่งที่ต้องส่ง"/></label><label className="check-line"><input name="reviewRequested" type="checkbox"/><span>อยากให้คนนี้ช่วยดูเป็นพิเศษ</span></label><div className="dialog-actions"><button type="button" onClick={() => setModal(null)}>ยกเลิก</button><button className="submit-button" disabled={busy}>มอบหมายงาน</button></div></form></Modal>}
    {modal === "issue" && <Modal title="รายงานปัญหา" error={error} onClose={() => setModal(null)}><form className="dialog-form" onSubmit={createIssue}><label>หัวข้อ<input name="title" required maxLength={160} placeholder="ปัญหาที่พบ" autoFocus/></label><div className="form-pair"><label>ผู้ดูแล<select name="ownerDiscordId" defaultValue=""><option value="">ยังไม่กำหนด</option>{members.map((person) => <option value={person.discordUserId} key={person.discordUserId}>{person.displayName}</option>)}</select></label><label>ความสำคัญ<select name="priority" defaultValue="ปกติ"><option>ต่ำ</option><option>ปกติ</option><option>สูง</option><option>ด่วน</option></select></label></div><label>รายละเอียด<textarea name="description" maxLength={2000} rows={4}/></label><div className="dialog-actions"><button type="button" onClick={() => setModal(null)}>ยกเลิก</button><button className="submit-button" disabled={busy}>บันทึกปัญหา</button></div></form></Modal>}
    {modal === "update" && <Modal title="เพิ่มอัปเดต" error={error} onClose={() => setModal(null)}><form className="dialog-form" onSubmit={createUpdate}><label>วันนี้ทำอะไร<textarea name="today" required maxLength={2000} rows={4} autoFocus/></label><label>ติดขัดตรงไหน<textarea name="blockers" maxLength={2000} rows={3}/></label><label>พรุ่งนี้จะทำอะไร<textarea name="tomorrow" maxLength={2000} rows={3}/></label><div className="dialog-actions"><button type="button" onClick={() => setModal(null)}>ยกเลิก</button><button className="submit-button" disabled={busy}>บันทึกอัปเดต</button></div></form></Modal>}
    {modal === "announcement" && <Modal title="ประกาศข่าว" error={error} onClose={() => setModal(null)}><form className="dialog-form" onSubmit={createAnnouncement}><label>หัวข้อ<input name="title" required maxLength={160} autoFocus/></label><label>รายละเอียด<textarea name="body" required maxLength={2000} rows={5}/></label><div className="dialog-actions"><button type="button" onClick={() => setModal(null)}>ยกเลิก</button><button className="submit-button" disabled={busy}>ประกาศข่าว</button></div></form></Modal>}
    {modal === "issue-detail" && detailIssue && <Modal title="รายละเอียดปัญหา" error={error} onClose={() => setModal(null)}><div className="detail-content"><span className="detail-id">{detailIssue.id}</span><h3>{detailIssue.title}</h3><MarkdownText text={detailIssue.description || "ไม่มีรายละเอียดเพิ่มเติม"}/><dl><div><dt>ผู้รายงาน</dt><dd>{name(detailIssue.reporterDiscordId)}</dd></div><div><dt>ผู้ดูแล</dt><dd>{detailIssue.ownerDiscordId ? name(detailIssue.ownerDiscordId) : "ยังไม่กำหนด"}</dd></div><div><dt>ความสำคัญ</dt><dd>{detailIssue.priority}</dd></div><div><dt>สถานะ</dt><dd>{detailIssue.status}</dd></div><div><dt>วันที่แจ้ง</dt><dd>{displayDate(detailIssue.createdAt)}</dd></div></dl>{(me?.role === "admin" || me?.role === "lead" || me?.discordUserId === detailIssue.reporterDiscordId || me?.discordUserId === detailIssue.ownerDiscordId) && <div className="detail-status"><span>จัดการปัญหา</span><div><button disabled={busy || detailIssue.status === "แก้แล้ว"} onClick={() => void changeIssueStatus(detailIssue, "แก้แล้ว")}>แก้แล้ว</button><button disabled={busy || detailIssue.status === "เปิด"} onClick={() => void changeIssueStatus(detailIssue, "เปิด")}>เปิดอีกครั้ง</button></div></div>}{detailIssue.reporterDiscordId === me?.discordUserId && <div className="detail-delete"><button type="button" disabled={busy} onClick={() => void deleteIssue(detailIssue)}><Trash2 size={15}/> ลบปัญหานี้</button></div>}</div></Modal>}
    {modal === "task-detail" && detailTask && <Modal title="รายละเอียดงาน" error={error} onClose={() => setModal(null)}><div className="detail-content"><span className="detail-id">{detailTask.id}</span><h3>{detailTask.title}</h3><MarkdownText text={detailTask.description || "ไม่มีรายละเอียดเพิ่มเติม"}/><dl><div><dt>ผู้รับงาน</dt><dd>{name(detailTask.assigneeDiscordId)}</dd></div><div><dt>กำหนดส่ง</dt><dd>{displayDate(detailTask.dueDate)}</dd></div><div><dt>สถานะ</dt><dd>{detailTask.status}</dd></div>{detailTask.reviewRequested && <div><dt>คำขอ</dt><dd>อยากให้ช่วยดูงานนี้</dd></div>}</dl>{canMove(detailTask) && <div className="detail-status"><span>เปลี่ยนสถานะ</span><div>{stages.map((stage) => <button key={stage} className={stage === detailTask.status ? "active" : ""} disabled={busy || stage === detailTask.status} onClick={() => void moveTask(detailTask, stage)}>{stage}</button>)}</div></div>}{detailTask.createdByDiscordId === me?.discordUserId && <div className="detail-delete"><button type="button" disabled={busy} onClick={() => void deleteTask(detailTask)}><Trash2 size={15}/> ลบงานนี้</button></div>}</div></Modal>}
  </div>;
}

function stageClass(status: string) { return status === "เสร็จแล้ว" ? "done" : status === "รอตรวจ" ? "review" : status === "กำลังทำ" ? "doing" : "next"; }
function EmptyText({ children }: { children: ReactNode }) { return <p className="empty-text">{children}</p>; }
function SectionTitle({ title, action }: { title: string; action?: ReactNode }) { return <div className="section-title"><h2>{title}</h2>{action}</div>; }
function TaskTable({ tasks, name, avatar, canMove, busy, onDetail, onMove }: { tasks: Task[]; name: (id: string) => string; avatar: (id: string) => string | undefined; canMove: (task: Task) => boolean; busy: boolean; onDetail: (task: Task) => void; onMove: (task: Task, status: string) => Promise<void> }) {
  return <div className="task-table"><div className="table-head task-columns"><span>งาน</span><span>ผู้รับงาน</span><span>กำหนดส่ง</span><span>สถานะ</span><span className="sr-only">ตัวเลือก</span></div>{tasks.length === 0 ? <EmptyText>ยังไม่มีงานในพื้นที่นี้</EmptyText> : tasks.map((task, index) => <div className="table-row task-columns" key={task.id}><div className="task-cell"><span className="row-number">{String(index + 1).padStart(2, "0")}</span><div><button className="row-title" onClick={() => onDetail(task)}>{task.title}</button>{task.reviewRequested && <span className="review-note">ขอให้ช่วยดู</span>}<small>{task.description || task.id}</small></div></div><span className="owner-cell"><Avatar name={name(task.assigneeDiscordId)} avatarUrl={avatar(task.assigneeDiscordId)} small/>{name(task.assigneeDiscordId)}</span><time>{displayDate(task.dueDate)}</time><span className="stage-cell"><i className={`stage-dot ${stageClass(task.status)}`}/>{task.status}</span><details className="row-menu"><summary aria-label={`ตัวเลือกของงาน ${task.title}`} title="ตัวเลือก"><Ellipsis size={18}/></summary><div className="row-popover"><button onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDetail(task); }}>ดูรายละเอียด <ChevronRight size={14}/></button>{canMove(task) && <div className="popover-status"><span>เปลี่ยนสถานะ <ChevronDown size={13}/></span>{stages.filter((stage) => stage !== task.status).map((stage) => <button key={stage} disabled={busy} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void onMove(task, stage); }}>{stage}</button>)}</div>}</div></details></div>)}</div>;
}
