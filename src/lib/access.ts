import { getSession } from "@/lib/session";
import { getMembers } from "@/lib/sheets";
import { redirect } from "next/navigation";

export async function currentMember() {
  const session = await getSession();
  if (!session) return null;
  const member = (await getMembers()).find((item) => item.discordUserId === session.discordId && item.active);
  return member || null;
}

export async function requireMember() {
  const member = await currentMember();
  if (!member) redirect("/login");
  return member;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
