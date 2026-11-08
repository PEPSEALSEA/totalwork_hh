import { buildReminder, CENTRAL_KEY, diffEvents, MANAGED_PROPERTY, personalKey, wantedEvents, addDays, type ExistingEvent, type WantedEvent } from "./helpers";
import { sheets, type Env } from "./sheets";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
// Cloudflare Free allows 50 subrequests per invocation; leave headroom for Sheets and token calls.
const CALENDAR_CALL_BUDGET = 30;

export type SyncOptions = { dryRun: boolean; share: boolean };
export type SyncReport = { dryRun: boolean; calendarsCreated: string[]; shared: string[]; created: number; updated: number; removed: number; skipped: string[]; truncated: boolean };

export async function runCalendarSync(env: Env, options: SyncOptions): Promise<SyncReport> {
  const db = sheets(env);
  const report: SyncReport = { dryRun: options.dryRun, calendarsCreated: [], shared: [], created: 0, updated: 0, removed: 0, skipped: [], truncated: false };
  let budget = CALENDAR_CALL_BUDGET;
  const [members, tasks, registry] = await Promise.all([db.members(), db.tasks(), db.calendarRegistry(options.dryRun)]);
  const wanted = wantedEvents(tasks, members);
  const byKey = new Map(registry.map((entry) => [entry.key, entry]));
  const token = options.dryRun && !registry.length ? "" : await db.accessToken(CALENDAR_SCOPE);

  async function api(path: string, init?: RequestInit): Promise<Response> {
    if (budget <= 0) { report.truncated = true; throw new Error("budget"); }
    budget--;
    return fetch(`${CALENDAR_API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers } });
  }
  const eventBody = (event: WantedEvent) => ({ id: event.id, summary: event.summary, description: event.description, start: { date: event.date }, end: { date: addDays(event.date, 1) }, reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 900 }] }, extendedProperties: { private: { managed: MANAGED_PROPERTY } } });

  async function listManaged(calendarId: string): Promise<ExistingEvent[]> {
    const found: ExistingEvent[] = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({ privateExtendedProperty: `managed=${MANAGED_PROPERTY}`, maxResults: "250", showDeleted: "false" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await api(`/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
      if (!response.ok) throw new Error(`Calendar list failed (${response.status})`);
      const page = await response.json() as { items?: { id: string; summary?: string; description?: string; status?: string; start?: { date?: string } }[]; nextPageToken?: string };
      for (const item of page.items ?? []) found.push({ id: item.id, summary: item.summary, description: item.description, date: item.start?.date, cancelled: item.status === "cancelled" });
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
    return found;
  }

  const keys = [CENTRAL_KEY, ...members.filter((m) => m.active && m.googleEmail).map((m) => personalKey(m.discordUserId))];
  try {
    for (const key of keys) {
      let entry = byKey.get(key);
      const member = members.find((m) => personalKey(m.discordUserId) === key);
      const title = key === CENTRAL_KEY ? "HamsterHub Team" : `HamsterHub — ${member?.displayName ?? key}`;
      if (!entry) {
        if (options.dryRun) { report.calendarsCreated.push(`${key} (would create)`); continue; }
        const response = await api("/calendars", { method: "POST", body: JSON.stringify({ summary: title, timeZone: "Asia/Bangkok" }) });
        if (!response.ok) throw new Error(`Calendar create failed (${response.status})`);
        const created = await response.json() as { id: string };
        const fresh = { key, calendarId: created.id, googleEmail: member?.googleEmail ?? "", sharedAt: "" };
        await db.saveCalendarEntry(fresh);
        entry = { ...fresh, row: 0 };
        byKey.set(key, entry);
        report.calendarsCreated.push(key);
      }
      const diff = diffEvents(wanted.get(key) ?? [], await listManaged(entry.calendarId));
      report.created += diff.create.length; report.updated += diff.update.length; report.removed += diff.remove.length;
      if (!options.dryRun) {
        for (const event of diff.create) {
          const response = await api(`/calendars/${encodeURIComponent(entry.calendarId)}/events`, { method: "POST", body: JSON.stringify(eventBody(event)) });
          // 409: a cancelled event with the same id still exists; restore it with an update instead.
          if (response.status === 409) await api(`/calendars/${encodeURIComponent(entry.calendarId)}/events/${event.id}`, { method: "PUT", body: JSON.stringify({ ...eventBody(event), status: "confirmed" }) });
          else if (!response.ok) report.skipped.push(`create ${event.id}: ${response.status}`);
        }
        for (const event of diff.update) {
          const response = await api(`/calendars/${encodeURIComponent(entry.calendarId)}/events/${event.id}`, { method: "PUT", body: JSON.stringify(eventBody(event)) });
          if (!response.ok) report.skipped.push(`update ${event.id}: ${response.status}`);
        }
        for (const id of diff.remove) await api(`/calendars/${encodeURIComponent(entry.calendarId)}/events/${id}`, { method: "DELETE" });
      }
      // Sharing emails real people, so it only happens on an explicit admin request, never from cron.
      if (options.share && member?.googleEmail && !entry.sharedAt) {
        if (options.dryRun) { report.shared.push(`${key} (would share)`); continue; }
        const response = await api(`/calendars/${encodeURIComponent(entry.calendarId)}/acl?sendNotifications=true`, { method: "POST", body: JSON.stringify({ role: "reader", scope: { type: "user", value: member.googleEmail } }) });
        if (response.ok) {
          await db.saveCalendarEntry({ key, calendarId: entry.calendarId, googleEmail: member.googleEmail, sharedAt: new Date().toISOString() }, entry.row || undefined);
          report.shared.push(key);
        } else report.skipped.push(`share ${key}: ${response.status}`);
      }
    }
  } catch (failure) {
    if (!(failure instanceof Error) || failure.message !== "budget") throw failure;
  }
  return report;
}

export type ReminderReport = { kind: string; dryRun: boolean; sent: boolean; reason?: string; preview?: string };

export async function runReminder(env: Env, kind: "morning" | "evening", options: { dryRun: boolean; now?: Date }): Promise<ReminderReport> {
  const db = sheets(env);
  const [members, tasks, updates, sentKeys] = await Promise.all([db.members(), db.tasks(), db.updates(), db.reminderKeys(options.dryRun)]);
  const message = buildReminder(kind, { members, tasks, updates, now: options.now ?? new Date(), sentKeys });
  if (!message) return { kind, dryRun: options.dryRun, sent: false, reason: "nothing to send or already sent" };
  if (options.dryRun) return { kind, dryRun: true, sent: false, preview: message.content };
  const url = env.DISCORD_WEBHOOK_URL ?? "";
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) return { kind, dryRun: false, sent: false, reason: "webhook not configured" };
  const response = await fetch(`${url}?wait=false`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: message.content, allowed_mentions: { users: message.mentionIds } }) });
  if (!response.ok) return { kind, dryRun: false, sent: false, reason: `webhook failed (${response.status})` };
  await db.logReminder(message.key);
  return { kind, dryRun: false, sent: true };
}
