export interface Env {
  AUTH_SECRET: string;
  AUTH_DISCORD_ID: string;
  AUTH_DISCORD_SECRET: string;
  GOOGLE_SHEET_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
}

export type Member = { discordUserId: string; displayName: string; role: "admin" | "lead" | "member" | "viewer"; active: boolean; teamRole: string };
export type Task = { id: string; title: string; description: string; assigneeDiscordId: string; status: string; dueDate: string; updatedAt: string; reviewRequested: boolean; createdByDiscordId: string; createdAt: string; row: number };
export type Notification = { id: string; recipientDiscordId: string; taskId: string; type: string; title: string; body: string; createdAt: string; readAt: string; row: number };
export type Issue = { id: string; title: string; description: string; reporterDiscordId: string; ownerDiscordId: string; priority: string; status: string; createdAt: string };
export type Update = { id: string; authorDiscordId: string; workDate: string; today: string; blockers: string; tomorrow: string; createdAt: string };
export type Announcement = { id: string; title: string; body: string; authorDiscordId: string; publishedAt: string; audience: string };

const bytes = (value: string) => new TextEncoder().encode(value);
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const encode = (value: unknown) => b64(bytes(JSON.stringify(value)));
let cached: { key: string; value: string; expires: number } | undefined;

export function sheets(env: Env) {
  async function accessToken() {
    const cacheKey = `${env.GOOGLE_SERVICE_ACCOUNT_EMAIL}:${env.GOOGLE_SHEET_ID}`;
    if (cached?.key === cacheKey && cached.expires > Date.now() + 60_000) return cached.value;
    const pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replaceAll("\\n", "\n");
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !pem) throw new Error("Google credentials missing");
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (char) => char.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signature = b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, bytes(unsigned))));
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
    if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
    const result = await response.json() as { access_token: string; expires_in?: number };
    cached = { key: cacheKey, value: result.access_token, expires: Date.now() + (result.expires_in ?? 3600) * 1000 };
    return cached.value;
  }
  async function call(path: string, init?: RequestInit) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}${path}`, { ...init, headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...init?.headers } });
    if (!response.ok) throw new Error(`Google Sheets failed (${response.status})`);
    return response.json();
  }
  async function rows(tab: string): Promise<string[][]> {
    const result = await call(`/values/${encodeURIComponent(`'${tab}'!A:Z`)}`) as { values?: string[][] };
    return result.values ?? [];
  }
  async function members(): Promise<Member[]> {
    return (await rows("Members")).slice(1).filter((r) => r[0]).map((r) => ({ discordUserId: r[0], displayName: r[1] || r[0], role: (["admin", "lead", "member", "viewer"].includes(r[2]) ? r[2] : "viewer") as Member["role"], active: r[3]?.toLowerCase() === "true", teamRole: r[5] || "สมาชิกทีม" }));
  }
  async function tasks(): Promise<Task[]> {
    return (await rows("Tasks")).slice(1).map((r, i) => ({ id: r[0] || "", title: r[1] || "ไม่มีชื่อ", description: r[2] || "", assigneeDiscordId: r[3] || "", status: r[4] || "ถัดไป", dueDate: r[5] || "", updatedAt: r[6] || "", reviewRequested: r[7]?.toLowerCase() === "true", createdByDiscordId: r[8] || "", createdAt: r[9] || "", row: i + 2 })).filter((t) => t.id);
  }
  async function notifications(discordId: string): Promise<Notification[]> {
    return (await rows("Notifications")).slice(1).map((r, i) => ({ id: r[0] || "", recipientDiscordId: r[1] || "", taskId: r[2] || "", type: r[3] || "", title: r[4] || "", body: r[5] || "", createdAt: r[6] || "", readAt: r[7] || "", row: i + 2 })).filter((n) => n.id && n.recipientDiscordId === discordId).reverse();
  }
  async function issues(): Promise<Issue[]> {
    return (await rows("Issues")).slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], title: r[1] || "ไม่มีชื่อ", description: r[2] || "", reporterDiscordId: r[3] || "", ownerDiscordId: r[4] || "", priority: r[5] || "ปกติ", status: r[6] || "เปิด", createdAt: r[7] || "" })).reverse();
  }
  async function updates(): Promise<Update[]> {
    return (await rows("Updates")).slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], authorDiscordId: r[1] || "", workDate: r[2] || "", today: r[3] || "", blockers: r[4] || "", tomorrow: r[5] || "", createdAt: r[6] || "" })).reverse();
  }
  async function announcements(): Promise<Announcement[]> {
    return (await rows("Announcements")).slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], title: r[1] || "", body: r[2] || "", authorDiscordId: r[3] || "", publishedAt: r[4] || "", audience: r[5] || "all" })).reverse();
  }
  async function createUpdate(input: { authorDiscordId: string; today: string; blockers: string; tomorrow: string }) {
    const id = `UPDATE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await call(`/values/${encodeURIComponent("'Updates'!A:G")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.authorDiscordId, now.slice(0, 10), input.today, input.blockers, input.tomorrow, now]] }) });
    return { id };
  }
  async function createIssue(input: { title: string; description: string; reporterDiscordId: string; ownerDiscordId: string; priority: string }) {
    const id = `ISSUE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await call(`/values/${encodeURIComponent("'Issues'!A:I")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.title, input.description, input.reporterDiscordId, input.ownerDiscordId, input.priority, "เปิด", now, now]] }) });
    return { id };
  }
  async function createTask(input: { title: string; description: string; assigneeDiscordId: string; dueDate: string; reviewRequested: boolean; creator: Member }) {
    const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    await call(`/values/${encodeURIComponent("'Tasks'!A:J")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[id, input.title, input.description, input.assigneeDiscordId, "ถัดไป", input.dueDate, now, String(input.reviewRequested).toUpperCase(), input.creator.discordUserId, now]] }) });
    let notificationCreated = true;
    try {
      const heading = input.reviewRequested ? "มีงานที่อยากให้คุณช่วยดู" : "มีงานใหม่ที่มอบหมายให้คุณ";
      await call(`/values/${encodeURIComponent("'Notifications'!A:H")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [[crypto.randomUUID(), input.assigneeDiscordId, id, input.reviewRequested ? "review_request" : "new_task", heading, `${input.creator.displayName} มอบหมายงาน: ${input.title}`, now, ""]] }) });
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
  return { members, tasks, notifications, issues, updates, announcements, createTask, createUpdate, createIssue, updateTaskStatus, markNotificationRead };
}
