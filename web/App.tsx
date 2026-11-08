import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bell, X } from "lucide-react";
import { API, api, clearToken, getToken, setToken } from "./api";
import { MarkdownText } from "./MarkdownText";
import { AnnouncementCard, type Announcement, type AnnouncementComment } from "./AnnouncementCard";

type Role = "admin" | "lead" | "member" | "viewer";
type Member = { discordUserId: string; displayName: string; role: Role; active: boolean; teamRole: string; googleEmail?: string; discordName?: string; discordUsername?: string; avatarUrl?: string };
type Task = { id: string; title: string; description: string; assigneeDiscordId: string; assigneeIds: string[]; status: string; dueDate: string; reviewRequested: boolean; updatedAt: string; createdByDiscordId: string };
type Notice = { id: string; taskId: string; title: string; body: string; createdAt: string; readAt: string };
type Issue = { id: string; title: string; description: string; reporterDiscordId: string; ownerDiscordId: string; priority: string; status: string; createdAt: string };
type Update = { id: string; authorDiscordId: string; workDate: string; today: string; blockers: string; tomorrow: string; createdAt: string };
type Section = "tasks" | "calendar" | "updates" | "issues" | "team" | "assign";
type ModalKind = "day" | "task" | "issue" | "update" | "announcement" | "task-detail" | "issue-detail" | null;

const PREVIEW_ID = "1133361505832800347";
const stages = ["ถัดไป", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว"];
const tabs: { id: Section; label: string }[] = [
  { id: "tasks", label: "งาน" },
  { id: "calendar", label: "ปฏิทิน" },
  { id: "updates", label: "อัปเดต" },
  { id: "issues", label: "ปัญหา" },
  { id: "team", label: "ทีม" },
  { id: "assign", label: "มอบหมาย" },
];

function currentSection(): Section {
  const name = location.hash.slice(2);
  return tabs.some((item) => item.id === name) ? name as Section : "tasks";
}
const todayKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
function shortDate(value: string) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
const weekdays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
function monthCells(y: number, m: number) {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = Date.UTC(y, m - 1, 1 - first.getUTCDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start + i * 86_400_000); return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 }; });
  return cells.slice(35).some((cell) => cell.inMonth) ? cells : cells.slice(0, 35);
}
const monthLabel = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
// Skip Thai leading vowels so the avatar shows the first consonant.
const initial = (name: string) => Array.from(name.trim()).find((char) => !"เแโใไ".includes(char)) || "?";
function fail(failure: unknown, fallback: string) { return failure instanceof Error ? failure.message : fallback; }

function Avatar({ name, avatarUrl, small = false }: { name: string; avatarUrl?: string; small?: boolean }) {
  return <span className={`avatar ${small ? "small" : ""}`} aria-hidden="true">{initial(name)}{avatarUrl && <img src={avatarUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }}/>}</span>;
}
function Modal({ title, error, onClose, children }: { title: string; error?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="dialog" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
    <div className="dialog-body">
      <header className="dialog-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="ปิด" onClick={() => dialog.current?.close()}><X size={18}/></button></header>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      {children}
    </div>
  </dialog>;
}
function Empty({ label, actionLabel, onAction }: { label: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="empty"><span>{label}</span>{onAction && <button type="button" className="btn" onClick={onAction}>{actionLabel}</button>}</div>;
}
function Actions({ onCancel, submit, busy }: { onCancel: () => void; submit: string; busy: boolean }) {
  return <div className="actions"><button type="button" className="link" onClick={onCancel}>ยกเลิก</button><button className="btn" disabled={busy}>{submit}</button></div>;
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
  const [announcementComments, setAnnouncementComments] = useState<AnnouncementComment[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [authPending, setAuthPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailIssue, setDetailIssue] = useState<Issue | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const noticesRef = useRef<HTMLDivElement>(null);
  const [taskView, setTaskView] = useState<"list" | "board">("list");
  const [onlyMine, setOnlyMine] = useState(false);
  const [feed, setFeed] = useState<"updates" | "news">("updates");
  const [issueFilter, setIssueFilter] = useState<"open" | "all">("open");
  const [month, setMonth] = useState(() => { const [y, m] = todayKey().split("-").map(Number); return { y, m }; });
  const [dayKey, setDayKey] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [taskText, setTaskText] = useState("");
  const [split, setSplit] = useState(false);
  const assignForm = useRef<HTMLFormElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (code || state || oauthError) {
      history.replaceState(null, "", `${location.pathname}#/tasks`);
      const expected = sessionStorage.getItem("hh_oauth_state");
      sessionStorage.removeItem("hh_oauth_state");
      if (oauthError) setError("Discord ไม่อนุญาต ลองอีกครั้ง");
      else if (!code || !state || state !== expected) setError("ยืนยันตัวตนไม่ตรงกัน ลองอีกครั้ง");
      else {
        setAuthPending(true);
        void fetch(`${API}/api/auth/callback/discord`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, state }) })
          .then(async (response) => { const result = await response.json() as { token?: string; error?: string }; if (!response.ok || !result.token) throw new Error(result.error || "เข้าสู่ระบบไม่สำเร็จ"); return result.token; })
          .then((newToken) => { setToken(newToken); changeToken(newToken); setSection("tasks"); setError(""); })
          .catch((failure) => setError(fail(failure, "เข้าสู่ระบบไม่สำเร็จ")))
          .finally(() => setAuthPending(false));
      }
    }
    const onHash = () => { setSection(currentSection()); setModal(null); setNoticesOpen(false); };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(""), 4000); return () => clearTimeout(timer); }, [message]);
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
    } catch (failure) { setError(fail(failure, "เริ่มเข้าสู่ระบบไม่สำเร็จ")); setAuthPending(false); }
  }

  const reload = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true); setError("");
    try {
      const identity = await api<{ member: Member }>("/api/me", { signal: AbortSignal.timeout(20_000) });
      setMe(identity.member);
      setLoading(false);
      let failed = false;
      const load = <T,>(path: string, update: (value: T) => void) => api<T>(path, { signal: AbortSignal.timeout(20_000) }).then(update, () => { failed = true; });
      await Promise.all([
        load<{ members: Member[] }>("/api/team", (value) => setMembers(value.members)),
        load<{ tasks: Task[] }>("/api/tasks", (value) => setTasks(value.tasks)),
        load<{ notifications: Notice[] }>("/api/notifications", (value) => setNotifications(value.notifications)),
        load<{ issues: Issue[] }>("/api/issues", (value) => setIssues(value.issues)),
        load<{ updates: Update[] }>("/api/updates", (value) => setUpdates(value.updates)),
        load<{ announcements: Announcement[] }>("/api/announcements", (value) => setAnnouncements(value.announcements)),
        load<{ comments: AnnouncementComment[] }>("/api/announcement-comments", (value) => setAnnouncementComments(value.comments)),
      ]);
      if (failed) setError("โหลดข้อมูลไม่ครบ ลองโหลดใหม่");
    } catch (failure) {
      setError(fail(failure, "โหลดข้อมูลไม่สำเร็จ"));
      if (!getToken()) { changeToken(null); setMe(null); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (token) void reload(); }, [token, reload]);
  useEffect(() => { if (!token) return; const timer = setInterval(() => { void reload(); }, 60_000); return () => clearInterval(timer); }, [token, reload]);

  const person = (id: string) => members.find((member) => member.discordUserId === id) || (me?.discordUserId === id ? me : undefined);
  const name = (id: string) => person(id)?.displayName || (id === PREVIEW_ID ? "ผู้ทดลองใช้" : "-");
  const avatar = (id: string) => person(id)?.avatarUrl;
  const names = (task: Task) => (task.assigneeIds.length ? task.assigneeIds.map(name).join(", ") : "-");
  const who = (task: Task) => (task.assigneeIds.length > 1 ? `${name(task.assigneeIds[0])} +${task.assigneeIds.length - 1}` : name(task.assigneeIds[0] ?? ""));
  const unread = notifications.filter((item) => !item.readAt).length;
  const canWrite = me?.role !== "viewer";
  const canAssign = Boolean(me && me.role !== "viewer");
  const isManager = me?.role === "admin" || me?.role === "lead";
  const canMove = (task: Task) => me?.role === "admin" || me?.role === "lead" || (me?.role === "member" && task.assigneeIds.includes(me.discordUserId));
  const today = todayKey();
  useEffect(() => { if (me && section === "assign" && !isManager) location.hash = "/tasks"; }, [me, section, isManager]);

  const visibleTasks = useMemo(() => {
    const rank = (task: Task) => (task.status === "เสร็จแล้ว" ? 1 : 0);
    return tasks
      .filter((task) => !onlyMine || task.assigneeIds.includes(me?.discordUserId ?? ""))
      .sort((a, b) => rank(a) - rank(b) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title));
  }, [tasks, onlyMine, me]);
  const visibleIssues = useMemo(() => issues.filter((issue) => issueFilter === "all" || issue.status !== "แก้แล้ว"), [issues, issueFilter]);
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate || (onlyMine && !task.assigneeIds.includes(me?.discordUserId ?? ""))) continue;
      map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    }
    return map;
  }, [tasks, onlyMine, me]);
  const lastUpdateDays = (id: string) => {
    const latest = updates.filter((item) => item.authorDiscordId === id).map((item) => item.workDate).sort().pop();
    if (!latest) return null;
    return Math.max(0, Math.round((new Date(`${today}T00:00:00+07:00`).getTime() - new Date(`${latest}T00:00:00+07:00`).getTime()) / 86_400_000));
  };

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("hh_theme", next);
    setTheme(next);
  }
  function logout() { clearToken(); changeToken(null); setMe(null); setTasks([]); setNotifications([]); setAnnouncementComments([]); location.hash = "/tasks"; }
  function open(kind: Exclude<ModalKind, null>) { setError(""); setModal(kind); }
  function openTask(task: Task) { setDetailTask(task); setModal("task-detail"); }
  function openIssue(issue: Issue) { setDetailIssue(issue); setModal("issue-detail"); }
  function openAnnouncement(item: Announcement | null) { setEditingAnnouncement(item); open("announcement"); }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true); setError("");
    try { await action(); } catch (failure) { setError(fail(failure, fallback)); } finally { setBusy(false); }
  }
  const submit = (handler: (data: FormData) => Promise<void>, fallback: string) => (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(() => handler(data), fallback); };

  const createTask = submit(async (data) => {
    if (!data.getAll("assignee").length) throw new Error("เลือกผู้รับงานอย่างน้อย 1 คน");
    const result = await api<{ notificationCreated: boolean }>("/api/tasks", { method: "POST", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), assigneeDiscordIds: data.getAll("assignee"), dueDate: data.get("dueDate"), reviewRequested: data.get("reviewRequested") === "on" }) });
    setModal(null); setMessage(result.notificationCreated ? "สร้างงานแล้ว" : "สร้างงานแล้ว แจ้งเตือนไม่สำเร็จ"); await reload();
  }, "สร้างงานไม่สำเร็จ");
  const assignTasks = submit(async (data) => {
    const lines = taskText.split("\n").map((line) => line.trim()).filter(Boolean);
    const jobs = split ? selected.flatMap((id) => lines.map((title) => ({ ids: [id], title }))) : lines.map((title) => ({ ids: selected, title }));
    if (!selected.length) throw new Error("เลือกผู้รับงานและพิมพ์งาน");
    if (!jobs.length) throw new Error("เลือกผู้รับงานและพิมพ์งาน");
    if (jobs.length > 20) throw new Error("สร้างได้ครั้งละไม่เกิน 20 งาน");
    let done = 0;
    for (const job of jobs) {
      try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: job.title, description: data.get("description"), assigneeDiscordIds: job.ids, dueDate: data.get("dueDate"), reviewRequested: data.get("reviewRequested") === "on" }) }); done++; }
      catch (failure) { setError(`สร้างได้ ${done} จาก ${jobs.length} งาน: ${fail(failure, "ผิดพลาด")}`); await reload(); return; }
    }
    setTaskText(""); setSelected([]); setSplit(false); assignForm.current?.reset(); setMessage(`สร้าง ${done} งานแล้ว`); await reload();
  }, "สร้างงานไม่สำเร็จ");
  const createIssue = submit(async (data) => {
    await api("/api/issues", { method: "POST", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), ownerDiscordId: data.get("ownerDiscordId"), priority: data.get("priority") }) });
    setModal(null); setMessage("บันทึกแล้ว"); await reload();
  }, "บันทึกไม่สำเร็จ");
  const createUpdate = submit(async (data) => {
    await api("/api/updates", { method: "POST", body: JSON.stringify({ today: data.get("today"), blockers: data.get("blockers"), tomorrow: data.get("tomorrow") }) });
    setModal(null); setMessage("บันทึกแล้ว"); await reload();
  }, "บันทึกไม่สำเร็จ");
  const saveAnnouncement = submit(async (data) => {
    const rawFile = data.get("rawFile");
    if (rawFile instanceof File && rawFile.name && !rawFile.name.toLowerCase().endsWith(".txt")) throw new Error("ใช้ไฟล์ .txt เท่านั้น");
    if (rawFile instanceof File && rawFile.size > 2_000_000) throw new Error("ไฟล์ใหญ่เกิน 2 MB");
    let rawText = String(data.get("rawText") || "");
    if (rawFile instanceof File && rawFile.name) {
      const bytes = await rawFile.arrayBuffer();
      try { rawText = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { rawText = new TextDecoder("windows-874").decode(bytes); }
    }
    if (rawText.length > 500_000) throw new Error("ข้อความยาวเกิน 500,000 ตัวอักษร");
    const fields = { title: data.get("title"), meetingTopic: data.get("meetingTopic"), body: data.get("body"), note: data.get("note"), ...(editingAnnouncement ? (rawText ? { rawText } : {}) : { rawText }) };
    if (editingAnnouncement) await api(`/api/announcements/${encodeURIComponent(editingAnnouncement.id)}`, { method: "PATCH", body: JSON.stringify(fields) });
    else await api("/api/announcements", { method: "POST", body: JSON.stringify(fields) });
    setModal(null); setEditingAnnouncement(null); setMessage("บันทึกแล้ว"); await reload();
  }, "บันทึกไม่สำเร็จ");
  const saveGoogleEmail = submit(async (data) => {
    const email = String(data.get("email") || "");
    await api("/api/me/google-email", { method: "PATCH", body: JSON.stringify({ email }) });
    setMessage(email.trim() ? "บันทึกแล้ว" : "ลบแล้ว"); await reload();
  }, "บันทึกไม่สำเร็จ");

  async function deleteAnnouncement(item: Announcement) {
    if (!window.confirm(`ลบ “${item.title}”?`)) return;
    await run(async () => { await api(`/api/announcements/${encodeURIComponent(item.id)}`, { method: "DELETE" }); setMessage("ลบแล้ว"); await reload(); }, "ลบไม่สำเร็จ");
  }
  async function changeIssueStatus(issue: Issue, status: "เปิด" | "แก้แล้ว") {
    await run(async () => { await api(`/api/issues/${encodeURIComponent(issue.id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); setDetailIssue({ ...issue, status }); await reload(); }, "เปลี่ยนสถานะไม่สำเร็จ");
  }
  async function deleteIssue(issue: Issue) {
    if (!window.confirm(`ลบ “${issue.title}”?`)) return;
    await run(async () => { await api(`/api/issues/${encodeURIComponent(issue.id)}`, { method: "DELETE" }); setModal(null); setMessage("ลบแล้ว"); await reload(); }, "ลบไม่สำเร็จ");
  }
  async function deleteTask(task: Task) {
    if (!window.confirm(`ลบ “${task.title}”?`)) return;
    await run(async () => { await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" }); setModal(null); setMessage("ลบแล้ว"); await reload(); }, "ลบไม่สำเร็จ");
  }
  async function moveTask(task: Task, status: string) {
    await run(async () => { await api(`/api/tasks/${encodeURIComponent(task.id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); if (detailTask?.id === task.id) setDetailTask({ ...task, status }); await reload(); }, "เปลี่ยนสถานะไม่สำเร็จ");
  }
  async function markRead(notice: Notice) {
    try { await api(`/api/notifications/${encodeURIComponent(notice.id)}/read`, { method: "PATCH" }); await reload(); }
    catch (failure) { setError(fail(failure, "บันทึกไม่สำเร็จ")); }
  }
  function openNotice(notice: Notice) {
    setNoticesOpen(false);
    const task = tasks.find((item) => item.id === notice.taskId);
    if (task) openTask(task); else location.hash = "/tasks";
  }

  if (!token) return <main className="login">
    <h1>Totalwork</h1>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="btn" disabled={authPending} onClick={() => void startLogin()}>{authPending ? "กำลังเชื่อมต่อ…" : "เข้าสู่ระบบด้วย Discord"}</button>
  </main>;

  const chipClass = (task: Task) => (task.status === "เสร็จแล้ว" ? "chip finished" : task.dueDate < today ? "chip late" : "chip");
  const taskChip = (task: Task, withName: boolean) => <button key={task.id} className={chipClass(task)} title={`${task.title} · ${names(task)}`} onClick={() => openTask(task)}>{withName ? `${who(task)} · ` : ""}{task.title}</button>;
  const statusControl = (task: Task) => canMove(task)
    ? <select className="status" aria-label="สถานะ" value={task.status} disabled={busy} onChange={(event) => void moveTask(task, event.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
    : <span className="cell">{task.status}</span>;

  return <div>
    <header className="bar"><div className="bar-inner">
      <span className="brand">Totalwork</span>
      <nav className="tabs" aria-label="เมนู">{tabs.filter((item) => item.id !== "assign" || isManager).map((item) => <a key={item.id} href={`#/${item.id}`} aria-current={section === item.id ? "page" : undefined}>{item.label}</a>)}</nav>
      <div className="bar-end">
        <button type="button" data-notice-trigger className="icon-btn" aria-label={`แจ้งเตือน ${unread}`} aria-expanded={noticesOpen} onClick={() => setNoticesOpen((value) => !value)}><Bell size={19}/>{unread > 0 && <span className="count">{unread}</span>}</button>
        <details className="account"><summary aria-label="บัญชี"><Avatar name={me?.displayName || "?"} avatarUrl={me?.avatarUrl}/></summary><div className="menu"><strong>{me?.displayName}</strong><span className="muted">{me?.teamRole}</span><button className="link" onClick={toggleTheme}>{theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}</button><button className="link" onClick={logout}>ออกจากระบบ</button></div></details>
      </div>
    </div></header>

    {noticesOpen && <div ref={noticesRef} className="panel" role="dialog" aria-label="แจ้งเตือน">
      {notifications.length === 0 ? <p className="panel-empty">ไม่มีแจ้งเตือน</p> : notifications.map((notice) => <div key={notice.id} className={`panel-item ${notice.readAt ? "" : "unread"}`}>
        <button className="panel-open" onClick={() => openNotice(notice)}><strong>{notice.title}</strong><span>{notice.body}</span><small>{shortDate(notice.createdAt)}</small></button>
        {!notice.readAt && <button className="link" onClick={() => void markRead(notice)}>อ่านแล้ว</button>}
      </div>)}
    </div>}

    <main className="page">
      {!me ? (loading ? <p className="muted">กำลังโหลด…</p> : <button className="btn" onClick={() => void reload()}>โหลดใหม่</button>) : <>
        {section === "tasks" && <>
          <div className="toolbar">
            <div className="toolbar-group">
              <div className="seg"><button aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>ทั้งหมด</button><button aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>ของฉัน</button></div>
              <div className="seg"><button aria-pressed={taskView === "list"} onClick={() => setTaskView("list")}>รายการ</button><button aria-pressed={taskView === "board"} onClick={() => setTaskView("board")}>บอร์ด</button></div>
            </div>
            {canAssign && <button className="btn" onClick={() => open("task")}>งานใหม่</button>}
          </div>
          {visibleTasks.length === 0 ? <Empty label="ยังไม่มีงาน" actionLabel="งานใหม่" onAction={canAssign ? () => open("task") : undefined}/> : taskView === "list"
            ? <div className="list">{visibleTasks.map((task) => <div key={task.id} className={`row row-task ${task.status === "เสร็จแล้ว" ? "done" : ""}`}>
                <div className="cell-title"><button className="title-btn" onClick={() => openTask(task)}>{task.title}</button>{task.reviewRequested && <span className="tag">ขอให้ช่วยดู</span>}</div>
                <span className="cell"><Avatar name={name(task.assigneeIds[0] ?? "")} avatarUrl={avatar(task.assigneeIds[0] ?? "")} small/>{names(task)}</span>
                <span className={`cell ${task.dueDate && task.dueDate < today && task.status !== "เสร็จแล้ว" ? "warn" : ""}`}>{shortDate(task.dueDate)}</span>
                {statusControl(task)}
              </div>)}</div>
            : <div className="board">{stages.map((stage) => { const lane = visibleTasks.filter((task) => task.status === stage); return <section key={stage} className="lane"><h2>{stage}<span>{lane.length}</span></h2>{lane.map((task) => <button key={task.id} className="card" onClick={() => openTask(task)}>{task.title}<small>{who(task)}{task.dueDate ? ` · ${shortDate(task.dueDate)}` : ""}</small></button>)}</section>; })}</div>}
        </>}

        {section === "assign" && isManager && (() => {
          const people = members.filter((item) => item.role !== "viewer");
          const lineCount = taskText.split("\n").filter((line) => line.trim()).length;
          const total = selected.length === 0 ? 0 : split ? lineCount * selected.length : lineCount;
          const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
          return <form ref={assignForm} className="form" onSubmit={assignTasks}>
            <div className="toolbar"><h2 className="section-h">ผู้รับงาน</h2><div className="tools"><button type="button" className="link" onClick={() => setSelected(people.map((item) => item.discordUserId))}>เลือกทั้งหมด</button><button type="button" className="link" onClick={() => setSelected([])}>ล้าง</button></div></div>
            <div className="list">{people.map((item) => {
              const open = tasks.filter((task) => task.assigneeIds.includes(item.discordUserId) && task.status !== "เสร็จแล้ว");
              const late = open.filter((task) => task.dueDate && task.dueDate < today).length;
              const days = lastUpdateDays(item.discordUserId);
              return <button type="button" key={item.discordUserId} className="row row-assign" aria-pressed={selected.includes(item.discordUserId)} onClick={() => toggle(item.discordUserId)}>
                <span className="cell" style={{ color: "var(--ink)" }}><span className="tick"/><Avatar name={item.displayName} avatarUrl={item.avatarUrl} small/>{item.displayName}</span>
                <span className="cell">เปิดอยู่ {open.length}</span>
                <span className={`cell ${late ? "warn" : ""}`}>เลยกำหนด {late}</span>
                <span className={`cell ${days === null || days >= 2 ? "warn" : ""}`}>{days === null ? "ยังไม่เคยอัปเดต" : days === 0 ? "อัปเดตวันนี้" : `${days} วันก่อน`}</span>
              </button>;
            })}</div>
            <label>งาน (หนึ่งบรรทัดต่อหนึ่งงาน)<textarea value={taskText} onChange={(event) => setTaskText(event.target.value)} rows={4}/></label>
            <div className="pair"><label>กำหนดส่ง<input name="dueDate" type="date"/></label><label>รายละเอียด (ไม่บังคับ)<input name="description" maxLength={2000}/></label></div>
            <label className="check"><input name="reviewRequested" type="checkbox"/>ขอให้ช่วยดู</label>
            <label className="check"><input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)}/>แยกเป็นคนละงาน</label>
            <div className="actions"><span className="muted">{total > 0 ? `${total} งาน` : ""}</span><button className="btn" disabled={busy || total === 0}>สร้างงาน</button></div>
          </form>;
        })()}

        {section === "calendar" && (() => {
          const cells = monthCells(month.y, month.m);
          const shift = (delta: number) => setMonth(({ y, m }) => { const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; });
          const goToday = () => { const [y, m] = today.split("-").map(Number); setMonth({ y, m }); };
          const withTasks = cells.filter((cell) => cell.inMonth && tasksByDay.has(cell.key));
          const undated = tasks.filter((task) => !task.dueDate && task.status !== "เสร็จแล้ว" && (!onlyMine || task.assigneeIds.includes(me.discordUserId))).length;
          return <>
            <div className="cal-bar">
              <div className="cal-nav"><h2 className="cal-title">{monthLabel(month.y, month.m)}</h2><button className="link" onClick={() => shift(-1)}>ก่อนหน้า</button><button className="link" onClick={goToday}>วันนี้</button><button className="link" onClick={() => shift(1)}>ถัดไป</button></div>
              <div className="toolbar-group"><div className="seg"><button aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>ทั้งหมด</button><button aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>ของฉัน</button></div>{canAssign && <button className="btn" onClick={() => open("task")}>งานใหม่</button>}</div>
            </div>
            <div className="cal-grid">{weekdays.map((weekday) => <div key={weekday} className="cal-dow">{weekday}</div>)}{cells.map((cell) => {
              const list = tasksByDay.get(cell.key) ?? [];
              return <div key={cell.key} className={`cal-day ${cell.inMonth ? "" : "out"} ${cell.key === today ? "today" : ""}`}><span className="cal-num">{cell.day}</span>{list.slice(0, 3).map((task) => taskChip(task, !onlyMine))}{list.length > 3 && <button className="more" onClick={() => { setDayKey(cell.key); setModal("day"); }}>อีก {list.length - 3} งาน</button>}</div>;
            })}</div>
            <div className="cal-agenda">{withTasks.length === 0 ? <Empty label="ไม่มีงานในเดือนนี้"/> : withTasks.map((cell) => <section key={cell.key} className="agenda-day"><h3 className={cell.key === today ? "is-today" : ""}>{shortDate(cell.key)}</h3>{(tasksByDay.get(cell.key) ?? []).map((task) => taskChip(task, !onlyMine))}</section>)}</div>
            {undated > 0 && <p className="cal-note">{undated} งานยังไม่มีกำหนดส่ง</p>}
          </>;
        })()}

        {section === "updates" && <>
          <div className="toolbar">
            <div className="seg"><button aria-pressed={feed === "updates"} onClick={() => setFeed("updates")}>อัปเดต</button><button aria-pressed={feed === "news"} onClick={() => setFeed("news")}>ประกาศ</button></div>
            {feed === "updates" ? canWrite && <button className="btn" onClick={() => open("update")}>อัปเดตวันนี้</button> : canWrite && me.discordUserId !== PREVIEW_ID && <button className="btn" onClick={() => openAnnouncement(null)}>ประกาศใหม่</button>}
          </div>
          {feed === "updates" ? (updates.length === 0 ? <Empty label="ยังไม่มีอัปเดต" actionLabel="อัปเดตวันนี้" onAction={canWrite ? () => open("update") : undefined}/> : <div className="list">{updates.map((item) => <article className="entry" key={item.id}>
              <div className="entry-head"><strong>{name(item.authorDiscordId)}</strong><time>{shortDate(item.workDate)}</time></div>
              <MarkdownText text={item.today}/>
              {item.blockers && <><p className="label">ติดขัด</p><MarkdownText text={item.blockers}/></>}
              {item.tomorrow && <><p className="label">พรุ่งนี้</p><MarkdownText text={item.tomorrow}/></>}
            </article>)}</div>)
            : (announcements.length === 0 ? <Empty label="ไม่มีประกาศ" actionLabel="ประกาศใหม่" onAction={canWrite && me.discordUserId !== PREVIEW_ID ? () => openAnnouncement(null) : undefined}/> : <div className="list">{announcements.map((item) => <AnnouncementCard
                key={item.id}
                announcement={item}
                comments={announcementComments.filter((comment) => comment.announcementId === item.id)}
                currentUserId={me.discordUserId}
                canComment={canWrite && me.discordUserId !== PREVIEW_ID}
                isAdmin={me.role === "admin"}
                name={name}
                onCommentAdded={(comment) => setAnnouncementComments((current) => [...current, comment])}
                onCommentDeleted={(commentId) => setAnnouncementComments((current) => current.filter((comment) => comment.id !== commentId))}
                onEditAnnouncement={openAnnouncement}
                onDeleteAnnouncement={deleteAnnouncement}
              />)}</div>)}
        </>}

        {section === "issues" && <>
          <div className="toolbar">
            <div className="seg"><button aria-pressed={issueFilter === "open"} onClick={() => setIssueFilter("open")}>เปิดอยู่</button><button aria-pressed={issueFilter === "all"} onClick={() => setIssueFilter("all")}>ทั้งหมด</button></div>
            {canWrite && <button className="btn" onClick={() => open("issue")}>แจ้งปัญหา</button>}
          </div>
          {visibleIssues.length === 0 ? <Empty label="ไม่มีปัญหา" actionLabel="แจ้งปัญหา" onAction={canWrite ? () => open("issue") : undefined}/> : <div className="list">{visibleIssues.map((issue) => <button key={issue.id} className={`row row-issue ${issue.status === "แก้แล้ว" ? "done" : ""}`} onClick={() => openIssue(issue)}>
            <span className="cell-title">{issue.title}</span>
            <span className="cell">{issue.ownerDiscordId ? name(issue.ownerDiscordId) : "-"}</span>
            <span className={`cell ${issue.priority === "ด่วน" || issue.priority === "สูง" ? "warn" : ""}`}>{issue.priority}</span>
            <span className="cell">{issue.status}</span>
          </button>)}</div>}
        </>}

        {section === "team" && <>
          <div className="list">{members.map((item) => { const days = lastUpdateDays(item.discordUserId); return <div key={item.discordUserId} className="row row-person">
            <span className="cell" style={{ color: "var(--ink)" }}><Avatar name={item.displayName} avatarUrl={item.avatarUrl}/><span><strong style={{ fontWeight: 500 }}>{item.displayName}</strong><br/><span className="muted" style={{ fontSize: 15 }}>{item.teamRole}</span></span></span>
            <span className="cell">{item.role}</span>
            {isManager && item.role !== "viewer" ? <span className={`cell ${days === null || days >= 2 ? "warn" : ""}`}>{days === null ? "ยังไม่เคยอัปเดต" : days === 0 ? "อัปเดตวันนี้" : `${days} วันก่อน`}</span> : <span/>}
          </div>; })}</div>
          {me.discordUserId !== PREVIEW_ID && <form className="form" style={{ marginTop: 32, maxWidth: 420 }} onSubmit={saveGoogleEmail}>
            <label>อีเมล Google สำหรับปฏิทิน (ไม่บังคับ)<input name="email" type="email" maxLength={254} defaultValue={me.googleEmail || ""} placeholder="name@gmail.com"/></label>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>ใช้แชร์ปฏิทินงานของคุณเท่านั้น คนอื่นไม่เห็น</p>
            <div className="actions" style={{ justifyContent: "flex-start" }}><button className="btn" disabled={busy}>บันทึก</button></div>
          </form>}
        </>}
      </>}
    </main>

    {error && !modal && <div className="toast bad" role="alert">{error}<button onClick={() => setError("")} aria-label="ปิด"><X size={14}/></button></div>}
    {message && <div className="toast" role="status">{message}</div>}

    {modal === "day" && <Modal title={shortDate(dayKey)} onClose={() => setModal(null)}><div className="agenda-day" style={{ border: 0, padding: 0 }}>{(tasksByDay.get(dayKey) ?? []).map((task) => taskChip(task, true))}</div></Modal>}

    {modal === "task" && <Modal title="งานใหม่" error={error} onClose={() => setModal(null)}><form className="form" onSubmit={createTask}>
      <label>ชื่องาน<input name="title" required maxLength={160} autoFocus/></label>
      <fieldset className="people"><legend>ผู้รับงาน</legend>{members.filter((item) => item.role !== "viewer").map((item) => <label key={item.discordUserId} className="check"><input type="checkbox" name="assignee" value={item.discordUserId}/>{item.displayName}</label>)}</fieldset>
      <label>กำหนดส่ง<input name="dueDate" type="date"/></label>
      <label>รายละเอียด<textarea name="description" maxLength={2000} rows={3}/></label>
      <label className="check"><input name="reviewRequested" type="checkbox"/>ขอให้ช่วยดู</label>
      <Actions onCancel={() => setModal(null)} submit="สร้าง" busy={busy}/>
    </form></Modal>}

    {modal === "issue" && <Modal title="แจ้งปัญหา" error={error} onClose={() => setModal(null)}><form className="form" onSubmit={createIssue}>
      <label>หัวข้อ<input name="title" required maxLength={160} autoFocus/></label>
      <div className="pair"><label>ผู้ดูแล<select name="ownerDiscordId" defaultValue=""><option value="">ไม่ระบุ</option>{members.map((item) => <option value={item.discordUserId} key={item.discordUserId}>{item.displayName}</option>)}</select></label><label>ความสำคัญ<select name="priority" defaultValue="ปกติ"><option>ต่ำ</option><option>ปกติ</option><option>สูง</option><option>ด่วน</option></select></label></div>
      <label>รายละเอียด<textarea name="description" maxLength={2000} rows={3}/></label>
      <Actions onCancel={() => setModal(null)} submit="บันทึก" busy={busy}/>
    </form></Modal>}

    {modal === "update" && <Modal title="อัปเดตวันนี้" error={error} onClose={() => setModal(null)}><form className="form" onSubmit={createUpdate}>
      <label>วันนี้ทำอะไร<textarea name="today" required maxLength={2000} rows={3} autoFocus/></label>
      <label>ติดขัดอะไรไหม<textarea name="blockers" maxLength={2000} rows={2}/></label>
      <label>พรุ่งนี้ทำอะไร<textarea name="tomorrow" maxLength={2000} rows={2}/></label>
      <Actions onCancel={() => setModal(null)} submit="บันทึก" busy={busy}/>
    </form></Modal>}

    {modal === "announcement" && <Modal title={editingAnnouncement ? "แก้ประกาศ" : "ประกาศใหม่"} error={error} onClose={() => setModal(null)}><form className="form" onSubmit={saveAnnouncement}>
      <label>หัวข้อ<input name="title" required maxLength={160} defaultValue={editingAnnouncement?.title || ""} autoFocus/></label>
      <label>เรื่องที่ประชุม<input name="meetingTopic" maxLength={160} defaultValue={editingAnnouncement?.meetingTopic || ""}/></label>
      <label>รายละเอียด<textarea name="body" required maxLength={2000} rows={4} defaultValue={editingAnnouncement?.body || ""}/></label>
      <label>Note<textarea name="note" maxLength={2000} rows={2} defaultValue={editingAnnouncement?.note || ""}/></label>
      <label>ข้อความดิบ{editingAnnouncement?.hasRawText ? " (เว้นว่างเพื่อเก็บของเดิม)" : ""}<textarea name="rawText" rows={3}/></label>
      <label>หรือไฟล์ .txt<input name="rawFile" type="file" accept=".txt,text/plain"/></label>
      <Actions onCancel={() => setModal(null)} submit="บันทึก" busy={busy}/>
    </form></Modal>}

    {modal === "issue-detail" && detailIssue && <Modal title="ปัญหา" error={error} onClose={() => setModal(null)}><div className="detail">
      <h3>{detailIssue.title}</h3>
      {detailIssue.description && <MarkdownText text={detailIssue.description}/>}
      <dl>
        <div><dt>ผู้แจ้ง</dt><dd>{name(detailIssue.reporterDiscordId)}</dd></div>
        <div><dt>ผู้ดูแล</dt><dd>{detailIssue.ownerDiscordId ? name(detailIssue.ownerDiscordId) : "-"}</dd></div>
        <div><dt>ความสำคัญ</dt><dd>{detailIssue.priority}</dd></div>
        <div><dt>สถานะ</dt><dd>{detailIssue.status}</dd></div>
        <div><dt>วันที่</dt><dd>{shortDate(detailIssue.createdAt)}</dd></div>
      </dl>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        {detailIssue.reporterDiscordId === me?.discordUserId ? <button className="link danger" disabled={busy} onClick={() => void deleteIssue(detailIssue)}>ลบ</button> : <span/>}
        {(isManager || me?.discordUserId === detailIssue.reporterDiscordId || me?.discordUserId === detailIssue.ownerDiscordId) && (detailIssue.status === "แก้แล้ว"
          ? <button className="btn" disabled={busy} onClick={() => void changeIssueStatus(detailIssue, "เปิด")}>เปิดอีกครั้ง</button>
          : <button className="btn" disabled={busy} onClick={() => void changeIssueStatus(detailIssue, "แก้แล้ว")}>แก้แล้ว</button>)}
      </div>
    </div></Modal>}

    {modal === "task-detail" && detailTask && <Modal title="งาน" error={error} onClose={() => setModal(null)}><div className="detail">
      <h3>{detailTask.title}</h3>
      {detailTask.description && <MarkdownText text={detailTask.description}/>}
      <dl>
        <div><dt>ผู้รับงาน</dt><dd>{names(detailTask)}</dd></div>
        <div><dt>กำหนดส่ง</dt><dd>{detailTask.dueDate ? shortDate(detailTask.dueDate) : "-"}</dd></div>
        <div><dt>สถานะ</dt><dd>{statusControl(detailTask)}</dd></div>
        {detailTask.reviewRequested && <div><dt>ขอให้ช่วยดู</dt><dd>ใช่</dd></div>}
      </dl>
      {detailTask.createdByDiscordId === me?.discordUserId && <div className="actions" style={{ justifyContent: "flex-start" }}><button className="link danger" disabled={busy} onClick={() => void deleteTask(detailTask)}>ลบงาน</button></div>}
    </div></Modal>}
  </div>;
}
