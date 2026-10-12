import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { KanbanBoard, type BoardTask } from "@/components/kanban-board";
import { CreateTaskForm } from "@/components/create-task-form";
import { tasks as demoTasks } from "@/lib/demo-data";
import { discordConfigured, getSession } from "@/lib/session";
import { getMembers, getTasks, sheetsConfigured, type SheetMember } from "@/lib/sheets";
import { requireMember } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  await requireMember();
  const live = discordConfigured() && sheetsConfigured();
  const session = live ? await getSession() : null;
  let tasks: BoardTask[] = demoTasks.map((task, index) => ({ id: `DEMO-${index + 1}`, title: task.title, description: task.area, owner: task.owner, status: task.status === "รอข้อมูล" ? "รอตรวจ" : task.status, dueDate: task.due }));
  let members: SheetMember[] = [];
  let currentRole = session?.role;
  let error = false;
  if (live && session) {
    try {
      const [sheetTasks, sheetMembers] = await Promise.all([getTasks(), getMembers()]);
      members = sheetMembers;
      const member = members.find((item) => item.discordUserId === session.discordId && item.active);
      if (!member) throw new Error("Membership revoked");
      currentRole = member.role;
      const names = new Map(members.map((member) => [member.discordUserId, member.displayName]));
      tasks = sheetTasks.map((task) => ({ id: task.id, title: task.title, description: task.description, owner: names.get(task.assigneeDiscordId) || "ยังไม่มอบหมาย", status: task.status, dueDate: task.dueDate, canEdit: member.role === "admin" || member.role === "lead" || (member.role === "member" && task.assigneeDiscordId === session.discordId), reviewRequested: task.reviewRequested }));
    } catch { error = true; tasks = []; }
  }
  return <AppShell active="/tasks" title="บอร์ดงาน" description="เห็นงานของทุกคนตามสถานะ และวางแผนสิ่งที่จะทำต่อ" demo={!live} memberName={session?.name}>
    {live && !session ? <div className="hint-panel">เชื่อมข้อมูลจริงแล้ว กรุณา <Link href="/login"><strong>เข้าสู่ระบบด้วย Discord</strong></Link> เพื่อดูงาน</div> : error ? <div className="hint-panel">อ่าน Google Sheets ไม่สำเร็จ กรุณาตรวจสิทธิ์ service account และชื่อแท็บ Tasks</div> : <>
      <div className="board-toolbar"><div><strong>{tasks.length} งาน</strong><span>{live ? `สมาชิก: ${session?.name}` : "ตัวอย่างรูปแบบ Kanban"}</span></div>{live ? <Link href="/api/auth/logout" className="board-action">ออกจากระบบ</Link> : <span className="count-chip">ข้อมูลสาธิต</span>}</div>
      {live && (currentRole === "admin" || currentRole === "lead") && <CreateTaskForm assignees={members.filter((member) => member.active).map((member) => ({ discordId: member.discordUserId, name: member.displayName, teamRole: member.teamRole }))}/>}
      <KanbanBoard key={tasks.map((task) => `${task.id}:${task.status}`).join("|")} initialTasks={tasks} editable={live && currentRole !== "viewer"}/>
      {!live && <div className="hint-panel board-hint">เมื่อเชื่อม Discord และ Google Sheets แล้ว บอร์ดจะแสดงงานจริงและให้สมาชิกที่มีสิทธิ์เปลี่ยนสถานะได้</div>}
    </>}
  </AppShell>;
}
