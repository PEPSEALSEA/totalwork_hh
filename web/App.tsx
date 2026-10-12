import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Check, ChevronRight, ClipboardList, Home, LayoutGrid, LogOut, MessageCircleWarning, Plus, ShieldCheck, Users, X } from "lucide-react";
import { API, api, clearToken, getToken, setToken } from "./api";

type Member = { discordUserId: string; displayName: string; role: "admin" | "lead" | "member" | "viewer"; active: boolean; teamRole: string };
type Task = { id: string; title: string; description: string; assigneeDiscordId: string; status: string; dueDate: string; reviewRequested: boolean; updatedAt: string };
type Notice = { id: string; taskId: string; title: string; body: string; createdAt: string; readAt: string };
type Issue = { id: string; title: string; description: string; ownerDiscordId: string; priority: string; status: string; createdAt: string };
type Update = { id: string; authorDiscordId: string; workDate: string; today: string; blockers: string; tomorrow: string; createdAt: string };
type Announcement = { id: string; title: string; body: string; publishedAt: string };
type Section = "home" | "tasks" | "issues" | "updates" | "notifications" | "team";
const columns = [{ name: "ถัดไป", color: "slate" }, { name: "กำลังทำ", color: "violet" }, { name: "รอตรวจ", color: "amber" }, { name: "เสร็จแล้ว", color: "green" }];
const navigation = [{ id: "home", name: "ภาพรวม", icon: Home }, { id: "tasks", name: "บอร์ดงาน", icon: LayoutGrid }, { id: "issues", name: "ปัญหา", icon: MessageCircleWarning }, { id: "updates", name: "อัปเดตทีม", icon: ClipboardList }, { id: "notifications", name: "การแจ้งเตือน", icon: Bell }, { id: "team", name: "ทีม", icon: Users }] as const;
function currentSection(): Section { const hash = location.hash.slice(2); return navigation.some((item) => item.id === hash) ? hash as Section : "home"; }

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
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authPending, setAuthPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    if (code || state || oauthError) {
      history.replaceState(null, "", `${location.pathname}#/tasks`);
      const expectedState = sessionStorage.getItem("hh_oauth_state");
      sessionStorage.removeItem("hh_oauth_state");
      if (oauthError) setError("Discord ไม่อนุญาตให้เข้าสู่ระบบ กรุณาลองอีกครั้ง");
      else if (!code || !state || state !== expectedState) setError("การยืนยันตัวตนไม่ตรงกัน กรุณาเริ่มเข้าสู่ระบบใหม่");
      else {
        setAuthPending(true);
        void fetch(`${API}/api/auth/callback/discord`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, state }) })
          .then(async (response) => { const result = await response.json() as { token?: string; error?: string }; if (!response.ok || !result.token) throw new Error(result.error || "เข้าสู่ระบบไม่สำเร็จ"); return result.token; })
          .then((newToken) => { setToken(newToken); changeToken(newToken); setSection("tasks"); setError(""); })
          .catch((failure) => setError(failure instanceof Error ? failure.message : "เข้าสู่ระบบไม่สำเร็จ"))
          .finally(() => setAuthPending(false));
      }
    }
    const onHash = () => setSection(currentSection());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

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
      const [identity, team, work, notices, problems, reports, news] = await Promise.all([
        api<{ member: Member }>("/api/me"), api<{ members: Member[] }>("/api/team"), api<{ tasks: Task[] }>("/api/tasks"), api<{ notifications: Notice[] }>("/api/notifications"), api<{ issues: Issue[] }>("/api/issues"), api<{ updates: Update[] }>("/api/updates"), api<{ announcements: Announcement[] }>("/api/announcements"),
      ]);
      setMe(identity.member); setMembers(team.members); setTasks(work.tasks); setNotifications(notices.notifications); setIssues(problems.issues); setUpdates(reports.updates); setAnnouncements(news.announcements);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "โหลดข้อมูลไม่สำเร็จ"); if (!getToken()) { changeToken(null); setMe(null); } }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (token) void reload(); }, [token, reload]);
  useEffect(() => { if (!token) return; const timer = setInterval(() => { void reload(); }, 60_000); return () => clearInterval(timer); }, [token, reload]);

  function logout() { clearToken(); changeToken(null); setMe(null); setTasks([]); setNotifications([]); location.hash = "/home"; }
  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await api<{ notificationCreated: boolean }>("/api/tasks", { method: "POST", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), assigneeDiscordId: data.get("assigneeDiscordId"), dueDate: data.get("dueDate"), reviewRequested: data.get("reviewRequested") === "on" }) });
      setMessage(result.notificationCreated ? "มอบหมายงานและแจ้งเตือนแล้ว" : "มอบหมายงานแล้ว แต่แจ้งเตือนไม่สำเร็จ");
      setFormOpen(false); form.reset(); await reload();
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function createUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try { await api("/api/updates", { method: "POST", body: JSON.stringify({ today: data.get("today"), blockers: data.get("blockers"), tomorrow: data.get("tomorrow") }) }); form.reset(); setFormOpen(false); setMessage("บันทึกอัปเดตแล้ว"); await reload(); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function createIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try { await api("/api/issues", { method: "POST", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), ownerDiscordId: data.get("ownerDiscordId"), priority: data.get("priority") }) }); form.reset(); setFormOpen(false); setMessage("รายงานปัญหาแล้ว"); await reload(); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function moveTask(task: Task, status: string) {
    setBusy(true); setMessage("");
    try { await api(`/api/tasks/${encodeURIComponent(task.id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await reload(); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function markRead(notice: Notice) {
    try { await api(`/api/notifications/${encodeURIComponent(notice.id)}/read`, { method: "PATCH" }); await reload(); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : "บันทึกไม่สำเร็จ"); }
  }
  const name = (id: string) => members.find((member) => member.discordUserId === id)?.displayName || "ไม่ทราบชื่อ";
  const unread = notifications.filter((item) => !item.readAt).length;

  if (!token) return <main className="login-wrap"><div className="panel login-card"><div className="brand-mark">H</div><h1>Totalwork HH</h1><p>พื้นที่ติดตามงานของทีม</p><small>สมาชิกที่ได้รับสิทธิ์เท่านั้นจึงจะดูข้อมูลงานได้</small>{error && <div className="board-error" role="alert">{error}</div>}<button className="discord-button" disabled={authPending} onClick={() => void startLogin()}>{authPending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบด้วย Discord"}</button></div></main>;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">H</span><div><strong>Totalwork</strong><small>HAMSTER HUB</small></div></div><div className="workspace-switch"><span className="workspace-avatar">HH</span><div><strong>Hamster Hub</strong><small>Team workspace</small></div></div><p className="nav-caption">WORKSPACE</p><nav className="nav-links" aria-label="เมนูหลัก">{navigation.map((item) => <a key={item.id} href={`#/${item.id}`} className={`nav-link ${section === item.id ? "active" : ""}`}><item.icon size={17}/>{item.name}{item.id === "notifications" && unread > 0 && <span className="nav-count">{unread}</span>}</a>)}</nav><div className="sidebar-bottom"><button className="nav-link logout-link" onClick={logout}><LogOut size={17}/>ออกจากระบบ</button><div className="sidebar-user"><span className="avatar lavender">{me?.displayName.slice(0, 1) || "H"}</span><div><strong>{me?.displayName || "กำลังโหลด"}</strong><small>{me?.teamRole || "สมาชิก"}</small></div></div></div></aside>
    <div className="main-area"><header className="topbar"><div className="mobile-brand"><span className="brand-mark">H</span><strong>Totalwork</strong></div><div className="breadcrumb">Workspace <span>/</span> <strong>{navigation.find((item) => item.id === section)?.name}</strong></div><div className="top-actions"><button className="icon-button" aria-label="โหลดข้อมูลใหม่" onClick={() => void reload()}>↻</button><a href="#/notifications" className="icon-button notification-bell" aria-label="การแจ้งเตือน"><Bell size={17}/>{unread > 0 && <span className="notification-count">{unread}</span>}</a><span className="avatar lavender top-avatar">{me?.displayName.slice(0, 1) || "H"}</span></div></header>
      <main className="content"><div className="page-heading"><div><p className="eyebrow">TEAM WORKSPACE</p><h1>{navigation.find((item) => item.id === section)?.name}</h1><p className="page-description">งานและความคืบหน้าของ Hamster Hub</p></div><span className="date-chip">{new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        {error && <div className="board-error" role="alert">{error}</div>}
        {message && <div className="hint-panel" role="status">{message}</div>}
        {loading && !me ? <div className="panel loading-panel">กำลังโหลดข้อมูลทีม…</div> : me && <>
          {section === "home" && <><div className="welcome-banner"><div><p>ยินดีต้อนรับกลับ, {me.displayName}</p><h2>ทุกงานของทีม อยู่ในที่เดียว</h2><span>ติดตามความคืบหน้าและงานที่ต้องช่วยดู</span></div><div className="banner-orbit"><div className="orbit-one"/><div className="orbit-two"/><div className="orbit-core"><ClipboardList size={28}/></div></div></div><div className="stat-grid"><Stat label="งานทั้งหมด" value={tasks.length} icon={<ClipboardList size={18}/>} tone="violet"/><Stat label="งานของฉัน" value={tasks.filter((t) => t.assigneeDiscordId === me.discordUserId && t.status !== "เสร็จแล้ว").length} icon={<Home size={18}/>} tone="sky"/><Stat label="รอตรวจ" value={tasks.filter((t) => t.status === "รอตรวจ").length} icon={<ShieldCheck size={18}/>} tone="coral"/><Stat label="แจ้งเตือนใหม่" value={unread} icon={<Bell size={18}/>} tone="mint"/></div><div className="panel"><div className="panel-header"><div className="section-heading"><h2>งานล่าสุด</h2><span>ดูสถานะจาก Google Sheets</span></div><a className="text-link" href="#/tasks">ดูบอร์ดงาน <ChevronRight size={13}/></a></div><div className="task-list">{tasks.length === 0 ? <div className="empty-note">ยังไม่มีงาน</div> : tasks.slice(0, 6).map((task) => <div className="task-row" key={task.id}><span className="task-bullet"/><div className="task-main"><strong>{task.title}</strong><span>{name(task.assigneeDiscordId)}</span></div><span className="status next"><span/>{task.status}</span></div>)}</div></div></>}
          {section === "tasks" && <><div className="board-toolbar"><div><strong>{tasks.length} งาน</strong><span>สมาชิก: {me.displayName}</span></div></div>{(me.role === "admin" || me.role === "lead") && <div className="task-create"><button className="primary-button" onClick={() => setFormOpen(!formOpen)}><Plus size={16}/>มอบหมายงาน</button>{formOpen && <form className="create-form" onSubmit={createTask}><div className="create-form-top"><div><h2>มอบหมายงานใหม่</h2><p>ผู้รับจะเห็นงานและการแจ้งเตือนในเว็บ</p></div><button className="icon-button" type="button" onClick={() => setFormOpen(false)} aria-label="ปิด"><X size={18}/></button></div><div className="create-form-grid"><label className="field wide">ชื่องาน<input name="title" required maxLength={160}/></label><label className="field">มอบหมายให้<select name="assigneeDiscordId" required defaultValue=""><option value="" disabled>เลือกสมาชิก</option>{members.map((member) => <option key={member.discordUserId} value={member.discordUserId}>{member.displayName} · {member.teamRole}</option>)}</select></label><label className="field">กำหนดส่ง<input name="dueDate" type="date"/></label><label className="field wide">รายละเอียด<textarea name="description" rows={3} maxLength={2000}/></label></div><label className="review-check"><input name="reviewRequested" type="checkbox"/><span><strong>อยากให้คนนี้ช่วยดูเป็นพิเศษ</strong><small>ระบบจะแจ้งว่าเป็นคำขอให้ช่วยตรวจงาน</small></span></label><div className="create-form-actions"><button className="primary-button" disabled={busy}>มอบหมายงาน</button></div></form>}</div>}<div className="kanban-grid">{columns.map((column) => <section className="kanban-column" key={column.name}><div className="kanban-heading"><span className={`kanban-dot ${column.color}`}/><h2>{column.name}</h2><span className="kanban-count">{tasks.filter((task) => task.status === column.name).length}</span></div><div className="kanban-items">{tasks.filter((task) => task.status === column.name).length === 0 ? <div className="kanban-empty">ยังไม่มีงานในขั้นนี้</div> : tasks.filter((task) => task.status === column.name).map((task) => <article className="kanban-card" key={task.id}><div className="card-top"><span>{task.id}</span>{task.reviewRequested && <span className="review-badge">ขอให้ช่วยดู</span>}</div><h3>{task.title}</h3><p>{task.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p><div className="card-footer"><span className="card-owner"><span>{name(task.assigneeDiscordId).slice(0, 1)}</span>{name(task.assigneeDiscordId)}</span>{task.dueDate && <span className="card-date">{task.dueDate}</span>}</div>{(me.role === "admin" || me.role === "lead" || (me.role === "member" && task.assigneeDiscordId === me.discordUserId)) && <label className="status-select">ย้ายไป<select value={task.status} disabled={busy} onChange={(event) => void moveTask(task, event.target.value)}>{columns.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>}</article>)}</div></section>)}</div></>}
          {section === "issues" && <>
            {me.role !== "viewer" && <div className="task-create"><button className="primary-button" onClick={() => setFormOpen(!formOpen)}><Plus size={16}/> รายงานปัญหา</button>{formOpen && <form className="create-form" onSubmit={createIssue}><div className="create-form-top"><div><h2>รายงานปัญหา</h2><p>ให้ทีมเห็นสิ่งที่ต้องช่วยกันแก้</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="ปิด"><X size={18}/></button></div><div className="create-form-grid"><label className="field wide">หัวข้อ<input name="title" required maxLength={160}/></label><label className="field">ผู้ดูแล<select name="ownerDiscordId" defaultValue=""><option value="">ยังไม่กำหนด</option>{members.map((person) => <option value={person.discordUserId} key={person.discordUserId}>{person.displayName}</option>)}</select></label><label className="field">ความสำคัญ<select name="priority" defaultValue="ปกติ"><option>ต่ำ</option><option>ปกติ</option><option>สูง</option><option>ด่วน</option></select></label><label className="field wide">รายละเอียด<textarea name="description" rows={3} maxLength={2000}/></label></div><div className="create-form-actions"><button className="primary-button" disabled={busy}>บันทึกปัญหา</button></div></form>}</div>}
            <section className="panel"><div className="panel-header"><div className="section-heading"><h2>ปัญหาที่ทีมติดตาม</h2><span>ข้อมูลจาก Google Sheets</span></div><span className="count-chip">{issues.length} เรื่อง</span></div><div className="issue-list">{issues.length === 0 ? <div className="empty-note">ยังไม่มีปัญหาที่รายงาน</div> : issues.map((issue) => <article className="issue-item" key={issue.id}><span className="issue-id">{issue.id}</span><div><h3>{issue.title}</h3><p>{issue.description || "ไม่มีรายละเอียด"} · ผู้ดูแล: {issue.ownerDiscordId ? name(issue.ownerDiscordId) : "ยังไม่กำหนด"}</p></div><span className="priority">{issue.priority}</span><span className="status waiting"><span/>{issue.status}</span></article>)}</div></section>
          </>}
          {section === "updates" && <>
            {me.role !== "viewer" && <div className="task-create"><button className="primary-button" onClick={() => setFormOpen(!formOpen)}><Plus size={16}/> เพิ่มอัปเดต</button>{formOpen && <form className="create-form" onSubmit={createUpdate}><div className="create-form-top"><div><h2>บันทึกความคืบหน้า</h2><p>บอกทีมว่าทำอะไร และพรุ่งนี้จะทำอะไรต่อ</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="ปิด"><X size={18}/></button></div><div className="create-form-grid"><label className="field wide">วันนี้ทำอะไร<textarea name="today" required rows={3} maxLength={2000}/></label><label className="field wide">สิ่งที่ติดขัด<textarea name="blockers" rows={2} maxLength={2000}/></label><label className="field wide">พรุ่งนี้จะทำอะไร<textarea name="tomorrow" rows={2} maxLength={2000}/></label></div><div className="create-form-actions"><button className="primary-button" disabled={busy}>บันทึกอัปเดต</button></div></form>}</div>}
            {announcements.length > 0 && <section className="panel full-panel"><div className="panel-header"><div className="section-heading"><h2>ข่าวสารทีม</h2><span>ประกาศล่าสุด</span></div></div><div className="feed">{announcements.map((item) => <article className="feed-item" key={item.id}><div className="feed-body"><div className="feed-top"><strong>{item.title}</strong><span>{item.publishedAt}</span></div><p>{item.body}</p></div></article>)}</div></section>}
            <section className="panel"><div className="panel-header"><div className="section-heading"><h2>บันทึกของทีม</h2><span>วันนี้และแผนสำหรับพรุ่งนี้</span></div><span className="count-chip">{updates.length} รายการ</span></div><div className="feed">{updates.length === 0 ? <div className="empty-note">ยังไม่มีอัปเดต</div> : updates.map((item) => <article className="feed-item" key={item.id}><span className="avatar lavender">{name(item.authorDiscordId).slice(0, 1)}</span><div className="feed-body"><div className="feed-top"><strong>{name(item.authorDiscordId)}</strong><span>{item.workDate}</span></div><p>{item.today}</p>{item.blockers && <div className="tomorrow-note"><span>ติดขัด</span>{item.blockers}</div>}{item.tomorrow && <div className="tomorrow-note"><span>พรุ่งนี้</span>{item.tomorrow}</div>}</div></article>)}</div></section>
          </>}
          {section === "notifications" && <><div className="notification-summary"><strong>การแจ้งเตือนทั้งหมด {notifications.length} รายการ</strong><span>ยังไม่ได้อ่าน {unread} รายการ</span></div>{notifications.length === 0 ? <div className="notification-empty"><strong>ยังไม่มีการแจ้งเตือน</strong><p>เมื่อมีงานใหม่ ระบบจะแสดงที่นี่</p></div> : <div className="notification-list">{notifications.map((notice) => <article className={`notification-item ${notice.readAt ? "read" : "unread"}`} key={notice.id}><span className="notification-indicator"/><div className="notification-body"><div className="notification-top"><h2>{notice.title}</h2><time>{new Date(notice.createdAt).toLocaleDateString("th-TH")}</time></div><p>{notice.body}</p><div className="notification-actions"><a href="#/tasks">ดูงาน</a>{!notice.readAt && <button onClick={() => void markRead(notice)}><Check size={12}/> ทำเครื่องหมายว่าอ่านแล้ว</button>}</div></div></article>)}</div>}</>}
          {section === "team" && <div className="panel"><div className="panel-header"><div className="section-heading"><h2>สมาชิกทีม</h2><span>เฉพาะบัญชี Discord ที่ได้รับสิทธิ์</span></div><span className="count-chip">{members.length} คน</span></div><div className="people-grid">{members.map((member) => <article className="person-card" key={member.discordUserId}><span className="avatar large lavender">{member.displayName.slice(0, 1)}</span><div><h3>{member.displayName}</h3><p>{member.teamRole}</p></div><span className="member-badge">{member.role}</span></article>)}</div></div>}
        </>}
      </main></div><nav className="mobile-nav" aria-label="เมนูมือถือ">{navigation.map((item) => <a key={item.id} className={`mobile-link ${section === item.id ? "active" : ""}`} href={`#/${item.id}`}><item.icon size={18}/>{item.name}</a>)}</nav>
  </div>;
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: string }) { return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>ข้อมูลล่าสุด</small></div></div>; }
