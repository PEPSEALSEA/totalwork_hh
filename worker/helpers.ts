// Pure helpers (no I/O) so they can be unit-tested with plain node.
export type HelperMember = { discordUserId: string; displayName: string; role: string; active: boolean; googleEmail?: string };
export type HelperTask = { id: string; title: string; assigneeDiscordId: string; status: string; dueDate: string };
export type HelperUpdate = { authorDiscordId: string; workDate: string };
export type WantedEvent = { id: string; summary: string; date: string; description: string };
export type ExistingEvent = { id: string; summary?: string; description?: string; date?: string; cancelled?: boolean };
export type ReminderMessage = { key: string; content: string; mentionIds: string[] };

export const DONE_STATUS = "เสร็จแล้ว";
export const MANAGED_PROPERTY = "totalwork";
export const CENTRAL_KEY = "central";
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;

/** A task may have several assignees, stored in one cell as comma-separated Discord ids. */
export const parseAssignees = (value: string): string[] => [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];

export const personalKey = (discordId: string) => `member:${discordId}`;

/** Calendar date (YYYY-MM-DD) in Asia/Bangkok (UTC+7, no DST). */
export function bangkokDate(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/.test(value);
}

/** Calendar event ids must use base32hex characters (a-v, 0-9); lowercase hex is a safe subset. */
export function eventIdForTask(taskId: string): string {
  const hex = Array.from(new TextEncoder().encode(taskId.toLowerCase()), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t${hex}`;
}

function activeTasks(tasks: HelperTask[]): HelperTask[] {
  return tasks.filter((task) => task.id && validDate(task.dueDate) && task.status !== DONE_STATUS);
}

/** Wanted managed events per calendar key. Central mirrors every open task; personal holds only that person's tasks. */
export function wantedEvents(tasks: HelperTask[], members: HelperMember[]): Map<string, WantedEvent[]> {
  const byId = new Map(members.filter((m) => m.active).map((m) => [m.discordUserId, m]));
  const result = new Map<string, WantedEvent[]>();
  const push = (key: string, event: WantedEvent) => result.set(key, [...(result.get(key) ?? []), event]);
  for (const task of activeTasks(tasks)) {
    const assignees = parseAssignees(task.assigneeDiscordId).map((id) => byId.get(id)).filter((m): m is HelperMember => Boolean(m));
    if (!assignees.length) continue;
    const id = eventIdForTask(task.id);
    const description = `งาน ${task.id} · สถานะ: ${task.status}`;
    push(CENTRAL_KEY, { id, summary: `[${assignees.map((m) => m.displayName).join(", ")}] ${task.title}`, date: task.dueDate, description });
    for (const assignee of assignees) if (assignee.googleEmail) push(personalKey(assignee.discordUserId), { id, summary: task.title, date: task.dueDate, description });
  }
  return result;
}

export type EventDiff = { create: WantedEvent[]; update: WantedEvent[]; remove: string[] };

/** Compare wanted events with existing managed events; unchanged events are skipped to save API quota. */
export function diffEvents(wanted: WantedEvent[], existing: ExistingEvent[]): EventDiff {
  const live = new Map(existing.filter((event) => !event.cancelled).map((event) => [event.id, event]));
  const wantedIds = new Set(wanted.map((event) => event.id));
  const create: WantedEvent[] = [];
  const update: WantedEvent[] = [];
  for (const event of wanted) {
    const current = live.get(event.id);
    if (!current) create.push(event);
    else if (current.summary !== event.summary || current.date !== event.date || (current.description ?? "") !== event.description) update.push(event);
  }
  const remove = [...live.keys()].filter((id) => !wantedIds.has(id));
  return { create, update, remove };
}

const MAX_DISCORD_CONTENT = 1900;
const clip = (text: string) => (text.length > MAX_DISCORD_CONTENT ? `${text.slice(0, MAX_DISCORD_CONTENT - 1)}…` : text);

/** Build one reminder message, or null when there is nothing to say. `sentKeys` holds keys already posted. */
export function buildReminder(kind: "morning" | "evening", input: { tasks: HelperTask[]; members: HelperMember[]; updates: HelperUpdate[]; now: Date; sentKeys: Set<string> }): ReminderMessage | null {
  const today = bangkokDate(input.now);
  const key = `${kind}:${today}`;
  if (input.sentKeys.has(key)) return null;
  const members = input.members.filter((m) => m.active && m.role !== "viewer");
  if (kind === "morning") {
    const mentionIds: string[] = [];
    const lines: string[] = [];
    for (const member of members) {
      const due = activeTasks(input.tasks).filter((t) => parseAssignees(t.assigneeDiscordId).includes(member.discordUserId) && t.dueDate <= addDays(today, 1));
      if (!due.length) continue;
      mentionIds.push(member.discordUserId);
      lines.push(`<@${member.discordUserId}>`, ...due.map((t) => `• ${t.dueDate < today ? "เลยกำหนด" : t.dueDate === today ? "วันนี้" : "พรุ่งนี้"} — ${t.title}`));
    }
    if (!lines.length) return null;
    return { key, content: clip(`**งานที่ใกล้ถึงกำหนด (${today})**\n${lines.join("\n")}`), mentionIds };
  }
  const posted = new Set(input.updates.filter((u) => u.workDate === today).map((u) => u.authorDiscordId));
  const missing = members.filter((m) => !posted.has(m.discordUserId));
  if (!missing.length) return null;
  return { key, content: clip(`**ยังไม่ได้อัปเดตวันนี้ (${today})**\n${missing.map((m) => `<@${m.discordUserId}>`).join(" ")}\nกรอก: วันนี้ทำอะไร / ติดอะไรไหม / พรุ่งนี้จะทำอะไร`), mentionIds: missing.map((m) => m.discordUserId) };
}
