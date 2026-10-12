import { AppShell } from "@/components/app-shell";
import { SectionHeading, Status } from "@/components/pieces";
import { issues } from "@/lib/demo-data";
import { requireMember } from "@/lib/access";

export default async function IssuesPage() { await requireMember(); return <AppShell active="/issues" title="ปัญหา" description="รวมเรื่องที่ทีมพบ พร้อมสถานะและคนที่กำลังดูแล"><section className="panel full-panel"><div className="panel-header"><SectionHeading title="ปัญหาที่เปิดอยู่" detail="จัดลำดับและติดตามจนปิดเรื่อง"/><span className="count-chip">{issues.length} เรื่อง</span></div><div className="issue-list">{issues.map(issue=><article className="issue-item" key={issue.id}><span className="issue-id">{issue.id}</span><div><h3>{issue.title}</h3><p>ผู้ดูแล: {issue.owner}</p></div><span className="priority">{issue.priority}</span><Status value={issue.state}/></article>)}</div></section><div className="hint-panel">เมื่อเชื่อม Google Sheets แล้ว หน้านี้จะใช้แท็บ <strong>Issues</strong> เป็นแหล่งข้อมูล</div></AppShell>; }
