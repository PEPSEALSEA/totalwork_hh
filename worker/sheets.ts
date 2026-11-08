import { bangkokDate, parseAssignees } from "./helpers";

export interface Env {
  AUTH_SECRET: string;
  AUTH_DISCORD_ID: string;
  AUTH_DISCORD_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  GOOGLE_SHEET_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  DISCORD_WEBHOOK_URL?: string;
  CALENDAR_SYNC_ENABLED?: string;
  REMINDERS_ENABLED?: string;
}

export type Member = { discordUserId: string; displayName: string; role: "admin" | "lead" | "member" | "viewer"; active: boolean; teamRole: string; googleEmail?: string; discordName?: string; discordUsername?: string; avatarUrl?: string };
export type Task = { id: string; title: string; description: string; assigneeDiscordId: string; assigneeIds: string[]; status: string; dueDate: string; updatedAt: string; reviewRequested: boolean; createdByDiscordId: string; createdAt: string; row: number };
export type Notification = { id: string; recipientDiscordId: string; taskId: string; type: string; title: string; body: string; createdAt: string; readAt: string; row: number };
export type Issue = { id: string; title: string; description: string; reporterDiscordId: string; ownerDiscordId: string; priority: string; status: string; createdAt: string; row: number };
export type Update = { id: string; authorDiscordId: string; workDate: string; today: string; blockers: string; tomorrow: string; createdAt: string };
export type Announcement = { id: string; title: string; body: string; authorDiscordId: string; publishedAt: string; audience: string; meetingTopic: string; note: string; hasRawText: boolean; row: number };
export type AnnouncementComment = { id: string; announcementId: string; authorDiscordId: string; authorName: string; body: string; createdAt: string; row: number };

const bytes = (value: string) => new TextEncoder().encode(value);
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const encode = (value: unknown) => b64(bytes(JSON.stringify(value)));
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const tokenCache = new Map<string, { value: string; expires: number }>();
const pendingTokens = new Map<string, Promise<string>>();
const commentSheetSetup = new Map<string, Promise<void>>();

export function sheets(env: Env) {
  async function accessToken(scope = SHEETS_SCOPE) {
    const cacheKey = `${env.GOOGLE_SERVICE_ACCOUNT_EMAIL}:${scope}`;
    const hit = tokenCache.get(cacheKey);
    if (hit && hit.expires > Date.now() + 60_000) return hit.value;
    const pending = pendingTokens.get(cacheKey);
    if (pending) return pending;
    const promise = requestAccessToken(cacheKey, scope);
    pendingTokens.set(cacheKey, promise);
    try { return await promise; }
    finally { if (pendingTokens.get(cacheKey) === promise) pendingTokens.delete(cacheKey); }
  }
  async function requestAccessToken(cacheKey: string, scope: string) {
    const pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replaceAll("\\n", "\n");
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !pem) throw new Error("Google credentials missing");
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signature = b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, bytes(unsigned))));
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
    if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
    const result = await response.json() as { access_token: string; expires_in?: number };
    tokenCache.set(cacheKey, { value: result.access_token, expires: Date.now() + (result.expires_in ?? 3600) * 1000 });
    return result.access_token;
  }
  async function call(path: string, init?: RequestInit) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}${path}`, { ...init, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...init?.headers } });
    if (!response.ok) throw new Error(`Google Sheets failed (${response.status})`);
    return response.json();
  }
  async function rows(tab: string, lastColumn = "Z"): Promise<string[][]> {
    const result = await call(`/values/${encodeURIComponent(`'${tab}'!A:${lastColumn}`)}`) as { values?: string[][] };
    return result.values ?? [];
  }
  async function ensureCommentSheet() {
    let setup = commentSheetSetup.get(env.GOOGLE_SHEET_ID);
    if (!setup) {
      setup = (async () => {
        const metadata = await call("?fields=sheets(properties(title))") as { sheets?: { properties?: { title?: string } }[] };
        if (!metadata.sheets?.some((sheet) => sheet.properties?.title === "AnnouncementComments")) {
          try {
            await call(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: "AnnouncementComments" } } }] }) });
          } catch (failure) {
            const latest = await call("?fields=sheets(properties(title))") as { sheets?: { properties?: { title?: string } }[] };
            if (!latest.sheets?.some((sheet) => sheet.properties?.title === "AnnouncementComments")) throw failure;
          }
        }
        const range = "'AnnouncementComments'!A1:F1";
        const header = await call(`/values/${encodeURIComponent(range)}`) as { values?: string[][] };
        if (header.values?.[0]?.[0] !== "id") await call(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, values: [["id", "announcement_id", "author_discord_id", "body", "created_at", "author_name"]] }) });
      })().catch((failure) => { commentSheetSetup.delete(env.GOOGLE_SHEET_ID); throw failure; });
      commentSheetSetup.set(env.GOOGLE_SHEET_ID, setup);
    }
    await setup;
  }
  async function members(): Promise<Member[]> {
    return (await rows("Members")).slice(1).filter((r) => r[0]).map((r) => ({ discordUserId: r[0], displayName: r[1] || r[0], role: (["admin", "lead", "member", "viewer"].includes(r[2]) ? r[2] : "viewer") as Member["role"], active: r[3]?.toLowerCase() === "true", teamRole: r[5] || "สมาชิกทีม", googleEmail: r[6] || "" }));
  }
  async function tasks(): Promise<Task[]> {
    return (await rows("Tasks")).slice(1).map((r, i) => ({ id: r[0] || "", title: r[1] || "ไม่มีชื่อ", description: r[2] || "", assigneeDiscordId: r[3] || "", assigneeIds: parseAssignees(r[3] || ""), status: r[4] || "ถัดไป", dueDate: r[5] || "", updatedAt: r[6] || "", reviewRequested: r[7]?.toLowerCase() === "true", createdByDiscordId: r[8] || "", createdAt: r[9] || "", row: i + 2 })).filter((t) => t.id);
  }
  async function notifications(discordId: string): Promise<Notification[]> {
    return (await rows("Notifications")).slice(1).map((r, i) => ({ id: r[0] || "", recipientDiscordId: r[1] || "", taskId: r[2] || "", type: r[3] || "", title: r[4] || "", body: r[5] || "", createdAt: r[6] || "", readAt: r[7] || "", row: i + 2 })).filter((n) => n.id && n.recipientDiscordId === discordId).reverse();
  }
  async function issues(): Promise<Issue[]> {
    return (await rows("Issues")).slice(1).map((r, i) => ({ id: r[0] || "", title: r[1] || "ไม่มีชื่อ", description: r[2] || "", reporterDiscordId: r[3] || "", ownerDiscordId: r[4] || "", priority: r[5] || "ปกติ", status: r[6] || "เปิด", createdAt: r[7] || "", row: i + 2 })).filter((issue) => issue.id).reverse();
  }
  async function updates(): Promise<Update[]> {
    return (await rows("Updates")).slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], authorDiscordId: r[1] || "", workDate: r[2] || "", today: r[3] || "", blockers: r[4] || "", tomorrow: r[5] || "", createdAt: r[6] || "" })).reverse();
  }
  async function announcements(): Promise<Announcement[]> {
    return (await rows("Announcements", "H")).slice(1).map((r, i) => {
      let note = "";
      let hasRawText = r[7] === "TRUE";
      if (r[7]?.startsWith("{")) {
        try { const meta = JSON.parse(r[7]) as { note?: string; hasRawText?: boolean }; note = meta.note || ""; hasRawText = meta.hasRawText === true; }
        catch { /* Legacy metadata remains readable. */ }
      }
      return { id: r[0] || "", title: r[1] || "", body: r[2] || "", authorDiscordId: r[3] || "", publishedAt: r[4] || "", audience: r[5] || "all", meetingTopic: r[6] || "", note, hasRawText, row: i + 2 };
    }).filter((item) => item.id).reverse();
  }
  async function announcementRawText(row: number): Promise<string> {
    const result = await call(`/values/${encodeURIComponent(`'Announcements'!I${row}:Z${row}`)}`) as { values?: string[][] };
    return (result.values?.[0] || []).join("");
  }
  async function announcementComments(): Promise<AnnouncementComment[]> {
    await ensureCommentSheet();
    return (await rows("AnnouncementComments", "F")).slice(1).map((r, i) => ({ id: r[0] || "", announcementId: r[1] || "", authorDiscordId: r[2] || "", body: r[3] || "", createdAt: r[4] || "", authorName: r[5] || "", row: i + 2 })).filter((comment) => comment.id && comment.announcementId);
  }
  async function createAnnouncementComment(input: { announcementId: string; authorDiscordId: string; authorName: string; body: string }) {
    await ensureCommentSheet();
    const comment: AnnouncementComment = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString(), row: 0 };
    await call(`/values/${encodeURIComponent("'AnnouncementComments'!A:F")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[comment.id, comment.announcementId, comment.authorDiscordId, comment.body, comment.createdAt, comment.authorName]] }) });
    return comment;
  }
  async function deleteAnnouncementComment(row: number) {
    await call("/values:batchClear", { method: "POST", body: JSON.stringify({ ranges: [`'AnnouncementComments'!A${row}:F${row}`] }) });
  }
  async function createUpdate(input: { authorDiscordId: string; today: string; blockers: string; tomorrow: string }) {
    const id = `UPDATE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await call(`/values/${encodeURIComponent("'Updates'!A:G")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.authorDiscordId, bangkokDate(new Date(now)), input.today, input.blockers, input.tomorrow, now]] }) });
    return { id };
  }
  async function createIssue(input: { title: string; description: string; reporterDiscordId: string; ownerDiscordId: string; priority: string }) {
    const id = `ISSUE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await call(`/values/${encodeURIComponent("'Issues'!A:I")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.title, input.description, input.reporterDiscordId, input.ownerDiscordId, input.priority, "เปิด", now, now]] }) });
    return { id };
  }
  async function createAnnouncement(input: { title: string; body: string; authorDiscordId: string; meetingTopic: string; note: string; rawText: string }) {
    const id = `NEWS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await ensureAnnouncementColumns();
    await call(`/values/${encodeURIComponent("'Announcements'!A:Z")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.title, input.body, input.authorDiscordId, new Date().toISOString(), "all", input.meetingTopic, JSON.stringify({ note: input.note, hasRawText: Boolean(input.rawText) }), ...rawChunks(input.rawText)]] }) });
    return { id };
  }
  async function ensureAnnouncementColumns() {
    const range = "'Announcements'!G1:Z1";
    await call(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, values: [["meeting_topic", "announcement_meta", ...Array.from({ length: 18 }, (_, i) => `raw_text_${i + 1}`)]] }) });
  }
  function rawChunks(text: string): string[] {
    const chunks: string[] = [];
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 40_000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      chunks.push(text.slice(start, end));
      start = end;
    }
    return chunks;
  }
  async function updateAnnouncement(announcement: Announcement, input: { title: string; body: string; meetingTopic: string; note: string; rawText?: string }) {
    await ensureAnnouncementColumns();
    const row = announcement.row;
    const data = [
      { range: `'Announcements'!B${row}:C${row}`, values: [[input.title, input.body]] },
      { range: `'Announcements'!G${row}`, values: [[input.meetingTopic]] },
      { range: `'Announcements'!H${row}`, values: [[JSON.stringify({ note: input.note, hasRawText: input.rawText !== undefined ? Boolean(input.rawText) : announcement.hasRawText })]] },
    ];
    if (input.rawText !== undefined) {
      const chunks = rawChunks(input.rawText);
      data.push({ range: `'Announcements'!I${row}:Z${row}`, values: [Array.from({ length: 18 }, (_, i) => chunks[i] || "")] });
    }
    await call("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
  }
  async function updateIssueStatus(row: number, status: string) {
    await call("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: `'Issues'!G${row}`, values: [[status]] }, { range: `'Issues'!I${row}`, values: [[new Date().toISOString()]] }] }) });
  }
  async function deleteIssue(row: number) {
    await call("/values:batchClear", { method: "POST", body: JSON.stringify({ ranges: [`'Issues'!A${row}:I${row}`] }) });
  }
  async function deleteAnnouncement(announcement: Announcement) {
    const related = (await announcementComments()).filter((comment) => comment.announcementId === announcement.id).map((comment) => `'AnnouncementComments'!A${comment.row}:F${comment.row}`);
    await call("/values:batchClear", { method: "POST", body: JSON.stringify({ ranges: [`'Announcements'!A${announcement.row}:Z${announcement.row}`, ...related] }) });
  }
  async function deleteTask(task: Task) {
    const related = (await rows("Notifications")).slice(1).flatMap((row, i) => row[2] === task.id ? [`'Notifications'!A${i + 2}:H${i + 2}`] : []);
    await call("/values:batchClear", { method: "POST", body: JSON.stringify({ ranges: [`'Tasks'!A${task.row}:J${task.row}`, ...related] }) });
  }
  async function createTask(input: { title: string; description: string; assigneeDiscordIds: string[]; dueDate: string; reviewRequested: boolean; creator: Member }) {
    const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await call(`/values/${encodeURIComponent("'Tasks'!A:J")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.title, input.description, input.assigneeDiscordIds.join(","), "ถัดไป", input.dueDate, now, String(input.reviewRequested).toUpperCase(), input.creator.discordUserId, now]] }) });
    let notificationCreated = true;
    try {
      const heading = input.reviewRequested ? "มีงานที่อยากให้คุณช่วยดู" : "มีงานใหม่ที่มอบหมายให้คุณ";
      await call(`/values/${encodeURIComponent("'Notifications'!A:H")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: input.assigneeDiscordIds.map((assignee) => [crypto.randomUUID(), assignee, id, input.reviewRequested ? "review_request" : "new_task", heading, `${input.creator.displayName} มอบหมายงาน: ${input.title}`, now, ""]) }) });
    } catch { notificationCreated = false; }
    return { id, notificationCreated };
  }
  async function updateTaskStatus(row: number, status: string) {
    await call("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: `'Tasks'!E${row}`, values: [[status]] }, { range: `'Tasks'!G${row}`, values: [[new Date().toISOString()]] }] }) });
  }
  async function markNotificationRead(row: number) {
    const range = `'Notifications'!H${row}`;
    await call(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, values: [[new Date().toISOString()]] }) });
  }
  const tabSetup = new Map<string, Promise<void>>();
  async function ensureTab(tab: string, header: string[]) {
    const key = `${env.GOOGLE_SHEET_ID}:${tab}`;
    let setup = tabSetup.get(key);
    if (!setup) {
      setup = (async () => {
        const metadata = await call("?fields=sheets(properties(title))") as { sheets?: { properties?: { title?: string } }[] };
        if (!metadata.sheets?.some((sheet) => sheet.properties?.title === tab)) {
          try { await call(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) }); }
          catch (failure) {
            const latest = await call("?fields=sheets(properties(title))") as { sheets?: { properties?: { title?: string } }[] };
            if (!latest.sheets?.some((sheet) => sheet.properties?.title === tab)) throw failure;
          }
        }
        const range = `'${tab}'!A1:${String.fromCharCode(64 + header.length)}1`;
        const current = await call(`/values/${encodeURIComponent(range)}`) as { values?: string[][] };
        if (current.values?.[0]?.[0] !== header[0]) await call(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, values: [header] }) });
      })().catch((failure) => { tabSetup.delete(key); throw failure; });
      tabSetup.set(key, setup);
    }
    await setup;
  }
  async function setMemberGoogleEmail(discordUserId: string, email: string) {
    const all = await rows("Members");
    const index = all.findIndex((r, i) => i > 0 && r[0] === discordUserId);
    if (index < 0) throw new Error("Member not found");
    await call("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: "'Members'!G1", values: [["google_email"]] }, { range: `'Members'!G${index + 1}`, values: [[email]] }] }) });
  }
  const calendarHeader = ["key", "calendar_id", "google_email", "shared_at"];
  // readOnly: never create the tab (used by dry runs); a missing tab simply reads as empty.
  async function calendarRegistry(readOnly = false): Promise<{ key: string; calendarId: string; googleEmail: string; sharedAt: string; row: number }[]> {
    if (!readOnly) await ensureTab("Calendars", calendarHeader);
    const tabRows = readOnly ? await rows("Calendars", "D").catch(() => [] as string[][]) : await rows("Calendars", "D");
    return tabRows.slice(1).map((r, i) => ({ key: r[0] || "", calendarId: r[1] || "", googleEmail: r[2] || "", sharedAt: r[3] || "", row: i + 2 })).filter((entry) => entry.key && entry.calendarId);
  }
  async function saveCalendarEntry(entry: { key: string; calendarId: string; googleEmail: string; sharedAt: string }, row?: number) {
    await ensureTab("Calendars", calendarHeader);
    const values = [[entry.key, entry.calendarId, entry.googleEmail, entry.sharedAt]];
    if (row) await call(`/values/${encodeURIComponent(`'Calendars'!A${row}:D${row}`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range: `'Calendars'!A${row}:D${row}`, values }) });
    else await call(`/values/${encodeURIComponent("'Calendars'!A:D")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values }) });
  }
  async function reminderKeys(readOnly = false): Promise<Set<string>> {
    if (!readOnly) await ensureTab("ReminderLog", ["key", "sent_at"]);
    const tabRows = readOnly ? await rows("ReminderLog", "B").catch(() => [] as string[][]) : await rows("ReminderLog", "B");
    return new Set(tabRows.slice(1).map((r) => r[0]).filter(Boolean));
  }
  async function logReminder(key: string) {
    await ensureTab("ReminderLog", ["key", "sent_at"]);
    await call(`/values/${encodeURIComponent("'ReminderLog'!A:B")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[key, new Date().toISOString()]] }) });
  }
  return { accessToken, setMemberGoogleEmail, calendarRegistry, saveCalendarEntry, reminderKeys, logReminder, members, tasks, notifications, issues, updates, announcements, announcementRawText, announcementComments, createTask, createUpdate, createIssue, createAnnouncement, updateAnnouncement, createAnnouncementComment, updateIssueStatus, deleteIssue, deleteAnnouncement, deleteAnnouncementComment, deleteTask, updateTaskStatus, markNotificationRead };
}
