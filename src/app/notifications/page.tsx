import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { NotificationList } from "@/components/notification-list";
import { requireMember } from "@/lib/access";
import { getNotifications } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const member = await requireMember();
  if (!member) return <AppShell active="/notifications" title="การแจ้งเตือน" description="งานใหม่และคำขอให้ช่วยดูจากทีม" demo={false}><div className="hint-panel">กรุณา <Link href="/login"><strong>เข้าสู่ระบบด้วย Discord</strong></Link> เพื่อดูการแจ้งเตือนของคุณ</div></AppShell>;
  let notifications;
  try { notifications = await getNotifications(member.discordUserId); }
  catch { return <AppShell active="/notifications" title="การแจ้งเตือน" description="งานใหม่และคำขอให้ช่วยดูจากทีม" demo={false} memberName={member.displayName}><div className="hint-panel">อ่านการแจ้งเตือนไม่สำเร็จ โปรดลองอีกครั้ง</div></AppShell>; }
  const unread = notifications.filter((item) => !item.readAt).length;
  return <AppShell active="/notifications" title="การแจ้งเตือน" description="งานใหม่และคำขอให้ช่วยดูจากทีม" demo={false} memberName={member.displayName}><div className="notification-summary"><strong>{unread} รายการยังไม่อ่าน</strong><span>แจ้งเตือนเฉพาะงานที่มอบหมายให้คุณ</span></div><NotificationList items={notifications}/></AppShell>;
}
