// Dev-only preview data. Loaded only by `npm run dev:pages` with `?mock` in the URL; never part of the production build.
import { API } from "./api";

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const members = [
  { discordUserId: "100000000000000001", displayName: "เป๊ป", role: "admin", active: true, teamRole: "ผู้จัดการทีม", googleEmail: "" },
  { discordUserId: "100000000000000002", displayName: "พีพี", role: "member", active: true, teamRole: "เว็บ" },
  { discordUserId: "100000000000000003", displayName: "เทียน", role: "member", active: true, teamRole: "โปสเตอร์" },
  { discordUserId: "100000000000000004", displayName: "หวาย", role: "member", active: true, teamRole: "เกม" },
];
const tasks = [
  { id: "TASK-1", title: "ปรับหน้าแรกของคอร์ส", description: "ย้ายราคาและวันที่ขึ้นบนสุด", assigneeDiscordId: `${members[1].discordUserId},${members[2].discordUserId}`, assigneeIds: [members[1].discordUserId, members[2].discordUserId], status: "กำลังทำ", dueDate: day(1), reviewRequested: true, updatedAt: "", createdByDiscordId: members[0].discordUserId },
  { id: "TASK-2", title: "โปสเตอร์รอบใหม่", description: "", assigneeDiscordId: members[2].discordUserId, assigneeIds: [members[2].discordUserId], status: "ถัดไป", dueDate: day(-2), reviewRequested: false, updatedAt: "", createdByDiscordId: members[0].discordUserId },
  { id: "TASK-3", title: "สรุปคำถามจากผู้ปกครอง", description: "", assigneeDiscordId: members[0].discordUserId, assigneeIds: [members[0].discordUserId], status: "รอตรวจ", dueDate: day(4), reviewRequested: false, updatedAt: "", createdByDiscordId: members[0].discordUserId },
  { id: "TASK-4", title: "ทดสอบเกมรอบซ้อม", description: "", assigneeDiscordId: members[3].discordUserId, assigneeIds: [members[3].discordUserId], status: "เสร็จแล้ว", dueDate: day(-5), reviewRequested: false, updatedAt: "", createdByDiscordId: members[0].discordUserId },
];
const updates = [
  { id: "U1", authorDiscordId: members[1].discordUserId, workDate: today, today: "แก้ข้อความหน้าแรก", blockers: "รอรูปจากเทียน", tomorrow: "ทดสอบบนมือถือ", createdAt: "" },
  { id: "U2", authorDiscordId: members[2].discordUserId, workDate: day(-3), today: "ร่างโปสเตอร์", blockers: "", tomorrow: "", createdAt: "" },
];
const issues = [{ id: "I1", title: "ลิงก์สมัครเปิดไม่ได้บนมือถือ", description: "", reporterDiscordId: members[2].discordUserId, ownerDiscordId: members[1].discordUserId, priority: "สูง", status: "เปิด", createdAt: new Date().toISOString() }];
const announcements = [{ id: "N1", title: "สรุปประชุมทีม", body: "ตกลงทดลองกระดานงานหนึ่งสัปดาห์", authorDiscordId: members[0].discordUserId, publishedAt: new Date().toISOString(), meetingTopic: "ระบบงานทีม", note: "", hasRawText: false }];
const notifications = [{ id: "A1", taskId: "TASK-1", title: "มีงานใหม่ที่มอบหมายให้คุณ", body: "เป๊ป มอบหมายงาน: ปรับหน้าแรกของคอร์ส", createdAt: new Date().toISOString(), readAt: "" }];

export function installMock() {
  const query = new URLSearchParams(location.search);
  const empty = query.has("empty");
  const role = query.get("role") ?? "admin";
  sessionStorage.setItem("hh_session_token", "mock");
  const me = { ...members[role === "admin" ? 0 : 1], role };
  const data: Record<string, unknown> = {
    "/api/me": { member: me },
    "/api/team": { members },
    "/api/tasks": { tasks: empty ? [] : tasks },
    "/api/notifications": { notifications: empty ? [] : notifications },
    "/api/issues": { issues: empty ? [] : issues },
    "/api/updates": { updates: empty ? [] : updates },
    "/api/announcements": { announcements: empty ? [] : announcements },
    "/api/announcement-comments": { comments: [] },
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API)) return realFetch(input, init);
    const path = url.slice(API.length).split("?")[0];
    return Response.json(path in data ? data[path] : { ok: true });
  };
}
