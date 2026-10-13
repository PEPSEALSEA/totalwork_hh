import { sheets, type Env, type Member } from "./sheets";

const SITE = "https://pepsealsea.github.io/totalwork_hh/";
const ALLOWED_ORIGINS = new Set(["https://pepsealsea.github.io", "http://localhost:5173"]);
const statuses = new Set(["ถัดไป", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว"]);
const PREVIEW_MEMBER_ID = "1133361505832800347";
const previewMember: Member = { discordUserId: PREVIEW_MEMBER_ID, displayName: "ผู้ทดลองใช้", role: "member", active: true, teamRole: "ทดลองใช้งาน" };
type DiscordProfile = { id: string; username?: string; global_name?: string | null; avatar?: string | null };
const profileCache = new Map<string, { profile: DiscordProfile | null; expires: number }>();

async function discordProfile(id: string, env: Env): Promise<DiscordProfile | null> {
  const hit = profileCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.profile;
  if (!env.DISCORD_BOT_TOKEN) return null;
  try {
    const response = await fetch(`https://discord.com/api/v10/users/${id}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (!response.ok) return null;
    const profile = await response.json() as DiscordProfile;
    if (profile.id !== id) return null;
    profileCache.set(id, { profile, expires: Date.now() + 10 * 60_000 });
    return profile;
  } catch { return null; }
}

async function withDiscordProfile(member: Member, env: Env): Promise<Member> {
  const profile = await discordProfile(member.discordUserId, env);
  if (!profile) return member;
  const avatar = profile.avatar;
  return {
    ...member,
    displayName: member.discordUserId === PREVIEW_MEMBER_ID ? profile.global_name || profile.username || member.displayName : member.displayName,
    discordName: profile.global_name || profile.username || undefined,
    discordUsername: profile.username,
    avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${member.discordUserId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "webp"}?size=128` : undefined,
  };
}

function findMember(members: Member[], id: string): Member | undefined {
  return members.find((item) => item.discordUserId === id && item.active) || (id === PREVIEW_MEMBER_ID ? previewMember : undefined);
}
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
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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
    if (request.headers.get("sec-fetch-mode") === "navigate" || request.headers.get("accept")?.includes("text/html")) {
      return new Response(null, { status: 302, headers: { Location: SITE } });
    }
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
    const member = findMember(await db.members(), profile.id);
    if (!member) return error("Discord account is not a member of this workspace", 403);
    return json({ token: await sign(member.discordUserId, env.AUTH_SECRET) });
  }
  if (!url.pathname.startsWith("/api/")) return error("API only", 404);
  const auth = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const id = auth ? await verify(auth, env.AUTH_SECRET) : null;
  if (!id) return error("Unauthorized", 401);
  const member = findMember(await db.members(), id);
  if (!member) return error("Forbidden", 403);
  if (url.pathname === "/api/me" && request.method === "GET") return json({ member: await withDiscordProfile(member, env) });
  if (url.pathname === "/api/team" && request.method === "GET") return json({ members: await Promise.all((await db.members()).filter((item) => item.active).map((item) => withDiscordProfile(item, env))) });
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
  const issueMatch = url.pathname.match(/^\/api\/issues\/([^/]+)$/);
  if (issueMatch && request.method === "DELETE") {
    const issue = (await db.issues()).find((item) => item.id === decodeURIComponent(issueMatch[1]));
    if (!issue) return error("Issue not found", 404);
    if (issue.reporterDiscordId !== id) return error("Forbidden", 403);
    await db.deleteIssue(issue.row);
    return json({ ok: true });
  }
  const issueStatusMatch = url.pathname.match(/^\/api\/issues\/([^/]+)\/status$/);
  if (issueStatusMatch && request.method === "PATCH") {
    const issue = (await db.issues()).find((item) => item.id === decodeURIComponent(issueStatusMatch[1]));
    if (!issue) return error("Issue not found", 404);
    if (member.role === "viewer" || (member.role !== "admin" && member.role !== "lead" && issue.reporterDiscordId !== id && issue.ownerDiscordId !== id)) return error("Forbidden", 403);
    const input = await body(request);
    if (input?.status !== "เปิด" && input?.status !== "แก้แล้ว") return error("Invalid status", 400);
    await db.updateIssueStatus(issue.row, input.status);
    return json({ ok: true });
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
  if (url.pathname === "/api/announcement-comments" && request.method === "GET") {
    const announcementIds = new Set((await db.announcements()).map((item) => item.id));
    return json({ comments: (await db.announcementComments()).filter((item) => announcementIds.has(item.announcementId)).map(({ row, ...comment }) => comment) });
  }
  if (url.pathname === "/api/announcements" && request.method === "POST") {
    if (id === PREVIEW_MEMBER_ID || member.role === "viewer") return error("Forbidden", 403);
    const input = await body(request);
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    const text = typeof input?.body === "string" ? input.body.trim() : "";
    const meetingTopic = typeof input?.meetingTopic === "string" ? input.meetingTopic.trim() : "";
    const note = typeof input?.note === "string" ? input.note.trim() : "";
    const rawText = typeof input?.rawText === "string" ? input.rawText : "";
    if (!title || title.length > 160 || !text || text.length > 2000 || meetingTopic.length > 160 || note.length > 2000 || rawText.length > 500_000) return error("Invalid announcement fields", 400);
    return json(await db.createAnnouncement({ title, body: text, authorDiscordId: id, meetingTopic, note, rawText }), 201);
  }
  const announcementCommentsMatch = url.pathname.match(/^\/api\/announcements\/([^/]+)\/comments$/);
  if (announcementCommentsMatch && request.method === "POST") {
    if (id === PREVIEW_MEMBER_ID || member.role === "viewer") return error("Forbidden", 403);
    const announcementId = decodeURIComponent(announcementCommentsMatch[1]);
    if (!(await db.announcements()).some((item) => item.id === announcementId)) return error("Announcement not found", 404);
    const input = await body(request);
    const text = typeof input?.body === "string" ? input.body.trim() : "";
    if (!text || text.length > 2000) return error("Invalid comment", 400);
    const { row, ...comment } = await db.createAnnouncementComment({ announcementId, authorDiscordId: id, authorName: member.displayName, body: text });
    return json({ comment }, 201);
  }
  const announcementCommentMatch = url.pathname.match(/^\/api\/announcements\/([^/]+)\/comments\/([^/]+)$/);
  if (announcementCommentMatch && request.method === "DELETE") {
    const announcementId = decodeURIComponent(announcementCommentMatch[1]);
    const commentId = decodeURIComponent(announcementCommentMatch[2]);
    const comment = (await db.announcementComments()).find((item) => item.id === commentId && item.announcementId === announcementId);
    if (!comment) return error("Comment not found", 404);
    if (comment.authorDiscordId !== id && member.role !== "admin") return error("Forbidden", 403);
    await db.deleteAnnouncementComment(comment.row);
    return json({ ok: true });
  }
  const announcementRawMatch = url.pathname.match(/^\/api\/announcements\/([^/]+)\/raw$/);
  if (announcementRawMatch && request.method === "GET") {
    const announcement = (await db.announcements()).find((item) => item.id === decodeURIComponent(announcementRawMatch[1]));
    if (!announcement || !announcement.hasRawText) return error("Raw text not found", 404);
    return json({ rawText: await db.announcementRawText(announcement.row) });
  }
  const announcementMatch = url.pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (announcementMatch && request.method === "PATCH") {
    const announcement = (await db.announcements()).find((item) => item.id === decodeURIComponent(announcementMatch[1]));
    if (!announcement) return error("Announcement not found", 404);
    if (announcement.authorDiscordId !== id) return error("Forbidden", 403);
    const input = await body(request);
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    const text = typeof input?.body === "string" ? input.body.trim() : "";
    const meetingTopic = typeof input?.meetingTopic === "string" ? input.meetingTopic.trim() : "";
    const note = typeof input?.note === "string" ? input.note.trim() : "";
    if (!title || title.length > 160 || !text || text.length > 2000 || meetingTopic.length > 160 || note.length > 2000 || (input?.rawText !== undefined && (typeof input.rawText !== "string" || input.rawText.length > 500_000))) return error("Invalid announcement fields", 400);
    await db.updateAnnouncement(announcement, { title, body: text, meetingTopic, note, rawText: input?.rawText as string | undefined });
    return json({ ok: true });
  }
  if (announcementMatch && request.method === "DELETE") {
    const announcement = (await db.announcements()).find((item) => item.id === decodeURIComponent(announcementMatch[1]));
    if (!announcement) return error("Announcement not found", 404);
    if (announcement.authorDiscordId !== id) return error("Forbidden", 403);
    await db.deleteAnnouncement(announcement);
    return json({ ok: true });
  }
  if (url.pathname === "/api/tasks" && request.method === "GET") return json({ tasks: await db.tasks() });
  if (url.pathname === "/api/tasks" && request.method === "POST") {
    if (id === PREVIEW_MEMBER_ID || member.role === "viewer") return error("Forbidden", 403);
    const input = await body(request);
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    const assigneeDiscordId = typeof input?.assigneeDiscordId === "string" ? input.assigneeDiscordId : "";
    const dueDate = typeof input?.dueDate === "string" ? input.dueDate : "";
    if (!title || title.length > 160 || description.length > 2000 || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) return error("Invalid task fields", 400);
    if (!(await db.members()).some((item) => item.discordUserId === assigneeDiscordId && item.active)) return error("Assignee not found", 400);
    return json(await db.createTask({ title, description, assigneeDiscordId, dueDate, reviewRequested: input?.reviewRequested === true, creator: member }), 201);
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "DELETE") {
    const task = (await db.tasks()).find((item) => item.id === decodeURIComponent(taskMatch[1]));
    if (!task) return error("Task not found", 404);
    if (task.createdByDiscordId !== id) return error("Forbidden", 403);
    await db.deleteTask(task);
    return json({ ok: true });
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
