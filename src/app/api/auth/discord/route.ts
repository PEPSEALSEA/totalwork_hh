import { NextResponse } from "next/server";
import { discordConfigured } from "@/lib/session";

export async function GET(request: Request) {
  if (!discordConfigured()) return new Response("Discord login is not configured", { status: 503 });
  const state = crypto.randomUUID();
  const redirect = `${new URL(request.url).origin}/api/auth/callback/discord`;
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: process.env.AUTH_DISCORD_ID!, response_type: "code", redirect_uri: redirect, scope: "identify", state }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("hh_oauth_state", state, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
