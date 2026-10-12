import Link from "next/link";
import { Activity, ArrowUpRight, Bell, ClipboardList, CircleHelp, LayoutDashboard, Megaphone, Users } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

const links = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/tasks", label: "บอร์ดงาน", icon: ClipboardList },
  { href: "/notifications", label: "แจ้งเตือน", icon: Bell },
  { href: "/issues", label: "ปัญหา", icon: CircleHelp },
  { href: "/updates", label: "อัปเดตทีม", icon: Megaphone },
  { href: "/team", label: "สมาชิก", icon: Users },
];

export function AppShell({ children, active, title, description, demo = true, memberName }: { children: React.ReactNode; active: string; title: string; description: string; demo?: boolean; memberName?: string }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Activity size={19} strokeWidth={2.7} /></span><span><strong>totalwork</strong><small>TEAM WORKSPACE</small></span></Link>
      <div className="workspace-switch"><span className="workspace-avatar">H</span><span><strong>HH Workspace</strong><small>ทีมของเรา</small></span><span className="switch-chevron">⌄</span></div>
      <p className="nav-caption">พื้นที่ทำงาน</p>
      <nav className="nav-links" aria-label="เมนูหลัก">{links.map(({href,label,icon:Icon}) => <Link key={href} href={href} className={active === href ? "nav-link active" : "nav-link"}><Icon size={18}/><span>{label}</span>{active === href && <span className="active-dot"/>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><CircleHelp size={18}/></span><strong>งานที่เข้ามา</strong><p>งานที่มอบหมายให้คุณและคำขอให้ช่วยดูจะอยู่ในหน้าการแจ้งเตือน</p><Link href="/notifications">ดูการแจ้งเตือน <ArrowUpRight size={14}/></Link></div><div className="sidebar-user"><span className="avatar lavender">{memberName?.slice(0, 1) || "ท"}</span><span><strong>{memberName || "ทีมตัวอย่าง"}</strong><small>{demo ? "โหมดสาธิต" : "สมาชิกทีม"}</small></span><span className="online-dot" /></div></div>
    </aside>
    <div className="main-area"><header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Activity size={16}/></span><strong>totalwork</strong></div><div className="breadcrumb">HH Workspace <span>/</span> <strong>{title}</strong></div><div className="top-actions"><span className="demo-pill"><span/> {demo ? "ข้อมูลสาธิต" : memberName ? "ข้อมูลจริง" : "รอเข้าสู่ระบบ"}</span><NotificationBell/><span className="avatar lavender top-avatar">{memberName?.slice(0, 1) || "ท"}</span></div></header><main className="content"><div className="page-heading"><div><p className="eyebrow">HH WORKSPACE</p><h1>{title}</h1><p className="page-description">{description}</p></div><span className="date-chip">พื้นที่ทำงานของทีม</span></div>{children}</main><nav className="mobile-nav" aria-label="เมนูมือถือ">{links.map(({href,label,icon:Icon})=><Link href={href} key={href} className={active===href?"mobile-link active":"mobile-link"}><Icon size={19}/><span>{label}</span></Link>)}</nav></div>
  </div>;
}
