const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const ID = "1AjOYO0EwPoUUOgUKjo47Dv0ZDuXccspJfYZtDDZdzP0";
let tokenCache: { value: string; expiresAt: number } | null = null;

const bytes = (value: string) => new TextEncoder().encode(value);
const base64url = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const encode = (value: unknown) => base64url(bytes(JSON.stringify(value)));

export type SheetTask = { id: string; title: string; description: string; assigneeDiscordId: string; status: string; dueDate: string; updatedAt: string; reviewRequested: boolean; createdByDiscordId: string; createdAt: string; row: number };
export type SheetMember = { discordUserId: string; displayName: string; role: "admin" | "lead" | "member" | "viewer"; active: boolean; teamRole: string };
export type SheetNotification = { id: string; recipientDiscordId: string; taskId: string; type: string; title: string; body: string; createdAt: string; readAt: string; row: number };

export function sheetsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const pem = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replaceAll("\\n", "\n");
  if (!email || !pem) throw new Error("Google Sheets credentials are missing");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = base64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, bytes(unsigned))));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), cache: "no-store" });
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
  const result = await response.json() as { access_token: string; expires_in?: number };
  tokenCache = { value: result.access_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID || ID}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets request failed (${response.status})`);
  return response.json();
}

async function rows(tab: string) {
  const range = encodeURIComponent(`'${tab}'!A:Z`);
  const data = await sheetsFetch(`/values/${range}`) as { values?: string[][] };
  return data.values || [];
}

export async function getMembers(): Promise<SheetMember[]> {
  const data = await rows("Members");
  return data.slice(1).filter((row) => row[0]).map((row) => ({ discordUserId: row[0], displayName: row[1] || row[0], role: (["admin", "lead", "member", "viewer"].includes(row[2]) ? row[2] : "viewer") as SheetMember["role"], active: row[3]?.toLowerCase() === "true", teamRole: row[5] || "สมาชิกทีม" }));
}

export async function getTasks(): Promise<SheetTask[]> {
  const data = await rows("Tasks");
  return data.slice(1).map((row, index) => ({ id: row[0] || "", title: row[1] || "ไม่มีชื่อ", description: row[2] || "", assigneeDiscordId: row[3] || "", status: row[4] || "ถัดไป", dueDate: row[5] || "", updatedAt: row[6] || "", reviewRequested: row[7]?.toLowerCase() === "true", createdByDiscordId: row[8] || "", createdAt: row[9] || "", row: index + 2 })).filter((task) => task.id);
}

export async function createTask(input: { title: string; description: string; assigneeDiscordId: string; dueDate: string; reviewRequested: boolean; createdByDiscordId: string; creatorName: string }) {
  const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const taskValues = [[id, input.title, input.description, input.assigneeDiscordId, "ถัดไป", input.dueDate, now, String(input.reviewRequested).toUpperCase(), input.createdByDiscordId, now]];
  await sheetsFetch(`/values/${encodeURIComponent("'Tasks'!A:J")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: taskValues }) });
  const notificationId = crypto.randomUUID();
  let notificationCreated = true;
  try {
    const heading = input.reviewRequested ? "มีงานที่อยากให้คุณช่วยดู" : "มีงานใหม่ที่มอบหมายให้คุณ";
    const notificationValues = [[notificationId, input.assigneeDiscordId, id, input.reviewRequested ? "review_request" : "new_task", heading, `${input.creatorName} มอบหมายงาน: ${input.title}`, now, ""]];
    await sheetsFetch(`/values/${encodeURIComponent("'Notifications'!A:H")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: notificationValues }) });
  } catch { notificationCreated = false; }
  return { id, notificationCreated };
}

export async function getNotifications(discordId: string): Promise<SheetNotification[]> {
  const data = await rows("Notifications");
  return data.slice(1).map((row, index) => ({ id: row[0] || "", recipientDiscordId: row[1] || "", taskId: row[2] || "", type: row[3] || "", title: row[4] || "", body: row[5] || "", createdAt: row[6] || "", readAt: row[7] || "", row: index + 2 })).filter((item) => item.id && item.recipientDiscordId === discordId).reverse();
}

export async function markNotificationRead(row: number) {
  const range = `'Notifications'!H${row}`;
  await sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range, values: [[new Date().toISOString()]] }) });
}

export async function updateTaskStatus(row: number, status: string) {
  await sheetsFetch("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: [
    { range: `'Tasks'!E${row}`, values: [[status]] },
    { range: `'Tasks'!G${row}`, values: [[new Date().toISOString()]] },
  ] }) });
}
