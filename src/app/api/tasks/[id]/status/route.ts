import { getSession } from "@/lib/session";
import { getMembers, getTasks, updateTaskStatus } from "@/lib/sheets";

const allowed = new Set(["ถัดไป", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return new Response("Invalid origin", { status: 403 });
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const member = (await getMembers()).find((item) => item.discordUserId === session.discordId && item.active);
  if (!member || member.role === "viewer") return new Response("Forbidden", { status: 403 });
  const { status } = await request.json() as { status?: string };
  if (!status || !allowed.has(status)) return new Response("Invalid status", { status: 400 });
  const { id } = await context.params;
  const task = (await getTasks()).find((item) => item.id === id);
  if (!task) return new Response("Task not found", { status: 404 });
  if (member.role === "member" && task.assigneeDiscordId !== session.discordId) return new Response("Forbidden", { status: 403 });
  await updateTaskStatus(task.row, status);
  return Response.json({ ok: true });
}
