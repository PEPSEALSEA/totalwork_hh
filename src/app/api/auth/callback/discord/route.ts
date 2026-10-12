import { NextRequest, NextResponse } from "next/server";
import { getMembers } from "@/lib/sheets";
import { discordConfigured, signSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!discordConfigured() || !code || !state || state !== request.cookies.get("hh_oauth_state")?.value) return new Response("Invalid login request", { status: 400 });
  const redirect = `${url.origin}/api/auth/callback/discord`;
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.AUTH_DISCORD_ID!, client_secret: process.env.AUTH_DISCORD_SECRET!, grant_type: "authorization_code", code, redirect_uri: redirect }), cache: "no-store" });
  if (!tokenResponse.ok) return new Response("Discord authorization failed", { status: 401 });
  const token = await tokenResponse.json() as { access_token: string };
  const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  if (!userResponse.ok) return new Response("Discord profile request failed", { status: 401 });
  const user = await userResponse.json() as { id: string; global_name?: string; username: string };
  let member;
  try { member = (await getMembers()).find((item) => item.discordUserId === user.id && item.active); }
  catch { return new Response("Team membership is unavailable", { status: 503 }); }
  if (!member) return new Response("Discord account is not a member of this workspace", { status: 403 });
  const session = await signSession({ discordId: user.id, name: member.displayName || user.global_name || user.username, role: member.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 });
  const response = NextResponse.redirect(new URL("/tasks", request.url));
  response.cookies.delete("hh_oauth_state");
  response.cookies.set("hh_session", session, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return response;
}
