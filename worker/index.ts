import { sheets, type Env, type Member } from "./sheets";

const SITE = "https://pepsealsea.github.io/totalwork_hh/";
const ALLOWED_ORIGINS = new Set(["https://pepsealsea.github.io", "http://localhost:5173"]);
const statuses = new Set(["ถัดไป", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว"]);
const encoder = new TextEncoder();
const b64 = (data: Uint8Array) => btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const unb64 = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));

async function signingKey(secret: string) {
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is missing");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(id: string, secret: string) {
  const payload = b64(encoder.encode(JSON.stringify({ id, exp: Math.floor(Date.now() / 1000) + 12 * 3600 })));
  const signature = b64(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload))));
  return `${payload}.${signature}`;
}
async function verify(token: string, secret: string): Promise<string | null> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload + signature)) return null;
  try {
    if (!await crypto.subtle.verify("HMAC", await signingKey(secret), unb64(signature), encoder.encode(payload))) return null;
    const session = JSON.parse(new TextDecoder().decode(unb64(payload))) as { id?: string; exp?: number };
    return typeof session.id === "string" && /^\d{17,20}$/.test(session.id) && typeof session.exp === "number" && session.exp > Date.now() / 1000 ? session.id : null;
  } catch { return null; }
}
async function createOAuthState(secret: string) {
  const payload = b64(encoder.encode(JSON.stringify({ nonce: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 600 })));
  const signature = b64(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload))));
  return `${payload}.${signature}`;
}
async function validOAuthState(state: string, secret: string) {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload + signature)) return false;
  try {
    if (!await crypto.subtle.verify("HMAC", await signingKey(secret), unb64(signature), encoder.encode(payload))) return false;
    const value = JSON.parse(new TextDecoder().decode(unb64(payload))) as { nonce?: string; exp?: number };
    return typeof value.nonce === "string" && typeof value.exp === "number" && value.exp > Date.now() / 1000;
  } catch { return false; }
}
function cors(origin: string | null) {
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }
  return headers;
}
function json(value: unknown, status = 200) { return Response.json(value, { status }); }
function error(message: string, status: number) { return json({ error: message }, status); }
async function body(request: Request): Promise<Record<string, unknown> | null> {
  try { const result = await request.json(); return result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null; }
  catch { return null; }
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const db = sheets(env);
  if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, service: "totalwork-hh-api" });
  if (url.pathname === "/api/auth/discord" && request.method === "GET") {
    if (!env.AUTH_DISCORD_ID || !env.AUTH_DISCORD_SECRET) return error("Discord login unavailable", 503);
    const state = await createOAuthState(env.AUTH_SECRET);
    const authorize = new URL("https://discord.com/oauth2/authorize");
    authorize.search = new URLSearchParams({ client_id: env.AUTH_DISCORD_ID, response_type: "code", redirect_uri: SITE, scope: "identify", state }).toString();
    return json({ authorizationUrl: authorize.toString(), state });
  }
  if (url.pathname === "/api/auth/callback/discord" && request.method === "POST") {
    const input = await body(request);
    const state = typeof input?.state === "string" ? input.state : "";
    const code = typeof input?.code === "string" ? input.code : "";
    if (!code || code.length > 512 || !await validOAuthState(state, env.AUTH_SECRET)) return error("Invalid login request", 400);
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.AUTH_DISCORD_ID, client_secret: env.AUTH_DISCORD_SECRET, grant_type: "authorization_code", code, redirect_uri: SITE }) });
    if (!tokenResponse.ok) return error("Discord authorization failed", 401);
    const discordToken = await tokenResponse.json() as { access_token: string };
    const profileResponse = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${discordToken.access_token}` } });
    if (!profileResponse.ok) return error("Discord profile request failed", 401);
    const profile = await profileResponse.json() as { id: string };
    const member = (await db.members()).find((item) => item.discordUserId === profile.id && item.active);
    if (!member) return error("Discord account is not a member of this workspace", 403);
    return json({ token: await sign(member.discordUserId, env.AUTH_SECRET) });
  }
  if (!url.pathname.startsWith("/api/")) return error("API only", 404);
  const auth = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const id = auth ? await verify(auth, env.AUTH_SECRET) : null;
  if (!id) return error("Unauthorized", 401);
  const member = (await db.members()).find((item) => item.discordUserId === id && item.active);
  if (!member) return error("Forbidden", 403);
  if (url.pathname === "/api/me" && request.method === "GET") return json({ member });
  if (url.pathname === "/api/team" && request.method === "GET") return json({ members: (await db.members()).filter((item) => item.active) });
  if (url.pathname === "/api/issues" && request.method === "GET") return json({ issues: await db.issues() });
  if (url.pathname === "/api/issues" && request.method === "POST") {
    if (member.role === "viewer") return error("Forbidden", 403);
    const input = await body(request);
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    const ownerDiscordId = typeof input?.ownerDiscordId === "string" ? input.ownerDiscordId : "";
    const priority = typeof input?.priority === "string" ? input.priority : "ปกติ";
    if (!title || title.length > 160 || description.length > 2000 || !["ต่ำ", "ปกติ", "สูง", "ด่วน"].includes(priority)) return error("Invalid issue fields", 400);
    if (ownerDiscordId && !(await db.members()).some((item) => item.discordUserId === ownerDiscordId && item.active)) return error("Owner not found", 400);
    return json(await db.createIssue({ title, description, reporterDiscordId: member.discordUserId, ownerDiscordId, priority }), 201);
  }
  if (url.pathname === "/api/updates" && request.method === "GET") return json({ updates: await db.updates() });
  if (url.pathname === "/api/updates" && request.method === "POST") {
    if (member.role === "viewer") return error("Forbidden", 403);
    const input = await body(request);
    const today = typeof input?.today === "string" ? input.today.trim() : "";
    const blockers = typeof input?.blockers === "string" ? input.blockers.trim() : "";
    const tomorrow = typeof input?.tomorrow === "string" ? input.tomorrow.trim() : "";
    if (!today || today.length > 2000 || blockers.length > 2000 || tomorrow.length > 2000) return error("Invalid update fields", 400);
    return json(await db.createUpdate({ authorDiscordId: member.discordUserId, today, blockers, tomorrow }), 201);
  }
  if (url.pathname === "/api/announcements" && request.method === "GET") return json({ announcements: await db.announcements() });
  if (url.pathname === "/api/tasks" && request.method === "GET") return json({ tasks: await db.tasks() });
  if (url.pathname === "/api/tasks" && request.method === "POST") {
    if (member.role !== "admin" && member.role !== "lead") return error("Forbidden", 403);
    const input = await body(request);
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    const assigneeDiscordId = typeof input?.assigneeDiscordId === "string" ? input.assigneeDiscordId : "";
    const dueDate = typeof input?.dueDate === "string" ? input.dueDate : "";
    if (!title || title.length > 160 || description.length > 2000 || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) return error("Invalid task fields", 400);
    if (!(await db.members()).some((item) => item.discordUserId === assigneeDiscordId && item.active)) return error("Assignee not found", 400);
    return json(await db.createTask({ title, description, assigneeDiscordId, dueDate, reviewRequested: input?.reviewRequested === true, creator: member }), 201);
  }
  const statusMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    if (member.role === "viewer") return error("Forbidden", 403);
    const input = await body(request);
    if (typeof input?.status !== "string" || !statuses.has(input.status)) return error("Invalid status", 400);
    const task = (await db.tasks()).find((item) => item.id === decodeURIComponent(statusMatch[1]));
    if (!task) return error("Task not found", 404);
    if (member.role === "member" && task.assigneeDiscordId !== member.discordUserId) return error("Forbidden", 403);
    await db.updateTaskStatus(task.row, input.status);
    return json({ ok: true });
  }
  if (url.pathname === "/api/notifications" && request.method === "GET") return json({ notifications: await db.notifications(member.discordUserId) });
  if (url.pathname === "/api/notifications/unread" && request.method === "GET") return json({ count: (await db.notifications(member.discordUserId)).filter((item) => !item.readAt).length });
  const readMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (readMatch && request.method === "PATCH") {
    const notification = (await db.notifications(member.discordUserId)).find((item) => item.id === decodeURIComponent(readMatch[1]));
    if (!notification) return error("Notification not found", 404);
    if (!notification.readAt) await db.markNotificationRead(notification.row);
    return json({ ok: true });
  }
  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) return error("Invalid origin", 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    try {
      const response = await handle(request, env);
      const headers = cors(origin);
      headers.forEach((value, key) => { if (!response.headers.has(key)) response.headers.set(key, value); });
      return response;
    } catch (failure) {
      console.error("Worker API failed", failure instanceof Error ? failure.message : "unknown error");
      const headers = cors(origin);
      headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers });
    }
  },
};
