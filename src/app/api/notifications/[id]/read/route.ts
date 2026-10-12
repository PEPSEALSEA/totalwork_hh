import { currentMember, sameOrigin } from "@/lib/access";
import { getNotifications, markNotificationRead } from "@/lib/sheets";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return new Response("Invalid origin", { status: 403 });
  const member = await currentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const item = (await getNotifications(member.discordUserId)).find((notification) => notification.id === id);
  if (!item) return new Response("Notification not found", { status: 404 });
  if (!item.readAt) await markNotificationRead(item.row);
  return Response.json({ ok: true });
}
