import { currentMember } from "@/lib/access";
import { getNotifications } from "@/lib/sheets";

export async function GET() {
  const member = await currentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });
  const notifications = await getNotifications(member.discordUserId);
  return Response.json({ count: notifications.filter((item) => !item.readAt).length });
}
