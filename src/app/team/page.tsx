import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionHeading } from "@/components/pieces";
import { requireMember } from "@/lib/access";
import { getMembers } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const current = await requireMember();
  if (!current) return <AppShell active="/team" title="สมาชิก" description="รู้จักหน้าที่ของทุกคนในทีม" demo={false}><div className="hint-panel">กรุณา <Link href="/login"><strong>เข้าสู่ระบบด้วย Discord</strong></Link> เพื่อดูรายชื่อทีม</div></AppShell>;
  const members = (await getMembers()).filter((member) => member.active);
  return <AppShell active="/team" title="สมาชิก" description="รู้จักหน้าที่ของทุกคนในทีม" demo={false} memberName={current.displayName}><section className="panel full-panel"><div className="panel-header"><SectionHeading title="ทีม HH Workspace" detail="สมาชิกและหน้าที่ในระบบ"/><span className="count-chip">{members.length} คน</span></div><div className="people-grid">{members.map((person, index) => <article className="person-card" key={person.discordUserId}><span className={`avatar large ${["lavender", "peach", "blue", "green"][index % 4]}`}>{person.displayName.slice(0, 1)}</span><div><h3>{person.displayName}</h3><p>{person.teamRole}</p></div><span className="member-badge">{person.role === "admin" ? "ผู้ดูแล" : person.role === "lead" ? "หัวหน้าทีม" : person.role === "viewer" ? "ดูข้อมูล" : "สมาชิก"}</span></article>)}</div></section></AppShell>;
}
