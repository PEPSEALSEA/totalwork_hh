"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X } from "lucide-react";

type Assignee = { discordId: string; name: string; teamRole: string };

export function CreateTaskForm({ assignees }: { assignees: Assignee[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: data.get("title"), description: data.get("description"), assigneeDiscordId: data.get("assigneeDiscordId"), dueDate: data.get("dueDate"), reviewRequested: data.get("reviewRequested") === "on" }) });
      if (!response.ok) throw new Error("บันทึกงานไม่สำเร็จ โปรดตรวจข้อมูลและลองอีกครั้ง");
      const result = await response.json() as { notificationCreated: boolean };
      form.reset();
      setOpen(false);
      setMessage(result.notificationCreated ? "มอบหมายงานและส่งการแจ้งเตือนในเว็บแล้ว" : "เพิ่มงานแล้ว แต่สร้างการแจ้งเตือนไม่สำเร็จ โปรดแจ้งผู้รับงานโดยตรง");
      router.refresh();
      window.dispatchEvent(new Event("hh-notifications-changed"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกงานไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <div className="task-create"><button className="primary-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open}><Plus size={16}/> มอบหมายงาน</button>{message && <span className="create-message" role="status">{message}</span>}{open && <form className="create-form" onSubmit={submit}><div className="create-form-top"><div><h2>มอบหมายงานใหม่</h2><p>ผู้รับงานจะเห็นรายการนี้ในบอร์ดและหน้าการแจ้งเตือน</p></div><button type="button" className="icon-button" aria-label="ปิดฟอร์ม" onClick={() => setOpen(false)}><X size={18}/></button></div><div className="create-form-grid"><label className="field wide">ชื่องาน<input name="title" required maxLength={160} placeholder="เช่น ตรวจแบบหน้าแรกก่อนส่งงาน"/></label><label className="field">มอบหมายให้<select name="assigneeDiscordId" required defaultValue=""><option value="" disabled>เลือกสมาชิก</option>{assignees.map((person) => <option key={person.discordId} value={person.discordId}>{person.name} · {person.teamRole}</option>)}</select></label><label className="field">กำหนดส่ง<input name="dueDate" type="date"/></label><label className="field wide">รายละเอียด<textarea name="description" rows={3} maxLength={2000} placeholder="ขอบเขตงาน สิ่งที่ต้องส่ง หรือข้อมูลประกอบ"/></label></div><label className="review-check"><input name="reviewRequested" type="checkbox"/><span><strong>อยากให้คนนี้ช่วยดูเป็นพิเศษ</strong><small>การแจ้งเตือนจะระบุว่าเป็นคำขอให้ช่วยตรวจงาน</small></span></label><div className="create-form-actions"><button className="primary-button" type="submit" disabled={busy || assignees.length === 0}>{busy ? "กำลังบันทึก..." : "มอบหมายงาน"}</button></div></form>}</div>;
}
