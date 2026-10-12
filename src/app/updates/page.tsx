import { AppShell } from "@/components/app-shell";
import { SectionHeading } from "@/components/pieces";
import { updates } from "@/lib/demo-data";
import { requireMember } from "@/lib/access";

export default async function UpdatesPage() { await requireMember(); return <AppShell active="/updates" title="อัปเดตทีม" description="บอกสิ่งที่ทำวันนี้ และสิ่งที่จะทำต่อพรุ่งนี้"><section className="panel full-panel"><div className="panel-header"><SectionHeading title="บันทึกของทีม" detail="ทุกคนเห็นความคืบหน้าร่วมกัน"/><span className="count-chip">วันนี้</span></div><div className="feed">{updates.map((item,index)=><article className="feed-item" key={item.person}><span className={`avatar ${["lavender","peach","blue"][index]}`}>{item.person.slice(-1)}</span><div className="feed-body"><div className="feed-top"><strong>{item.person}</strong><span>{item.time}</span></div><p>{item.text}</p><div className="tomorrow-note"><span>พรุ่งนี้</span>{item.tomorrow}</div></div></article>)}</div></section><div className="hint-panel">ข้อมูลจริงจะอยู่ในแท็บ <strong>Updates</strong> พร้อม Discord ID ของผู้เขียน</div></AppShell>; }
