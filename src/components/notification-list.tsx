"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export type NotificationItem = { id: string; taskId: string; title: string; body: string; createdAt: string; readAt: string; type: string };

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function markRead(id: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      if (!response.ok) throw new Error("บันทึกสถานะอ่านแล้วไม่สำเร็จ");
      router.refresh();
      window.dispatchEvent(new Event("hh-notifications-changed"));
    } catch { setError("บันทึกสถานะอ่านแล้วไม่สำเร็จ โปรดลองอีกครั้ง"); }
    finally { setBusy(null); }
  }
  if (!items.length) return <div className="notification-empty"><strong>ยังไม่มีการแจ้งเตือน</strong><p>เมื่อมีคนมอบหมายงานให้คุณ รายการจะปรากฏที่นี่</p><Link href="/tasks">ไปที่บอร์ดงาน</Link></div>;
  return <div className="notification-list">{error && <p className="board-error" role="alert">{error}</p>}{items.map((item) => <article className={`notification-item ${item.readAt ? "read" : "unread"}`} key={item.id}><span className="notification-indicator"/><div className="notification-body"><div className="notification-top"><h2>{item.title}</h2><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</time></div><p>{item.body}</p><div className="notification-actions"><Link href="/tasks">ดูงานในบอร์ด</Link>{!item.readAt && <button type="button" disabled={busy === item.id} onClick={() => markRead(item.id)}>ทำเครื่องหมายว่าอ่านแล้ว</button>}</div></div></article>)}</div>;
}
