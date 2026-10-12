"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/notifications/unread", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { count: number };
        if (active) setCount(data.count);
      } catch { /* Keep the last known count during a network interruption. */ }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("hh-notifications-changed", onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("hh-notifications-changed", onFocus); };
  }, []);
  return <Link href="/notifications" className="icon-button notification-bell" aria-label={count ? `การแจ้งเตือนที่ยังไม่อ่าน ${count} รายการ` : "การแจ้งเตือน"}><Bell size={19}/>{count > 0 && <span className="notification-count">{count > 99 ? "99+" : count}</span>}</Link>;
}
