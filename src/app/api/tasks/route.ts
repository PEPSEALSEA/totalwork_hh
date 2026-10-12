import { currentMember, sameOrigin } from "@/lib/access";
import { createTask, getMembers } from "@/lib/sheets";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Invalid origin", { status: 403 });
  const creator = await currentMember();
  if (!creator) return new Response("Unauthorized", { status: 401 });
  if (creator.role !== "admin" && creator.role !== "lead") return new Response("Forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return new Response("Invalid JSON", { status: 400 }); }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const assigneeDiscordId = typeof body.assigneeDiscordId === "string" ? body.assigneeDiscordId : "";
  const dueDate = typeof body.dueDate === "string" ? body.dueDate : "";
  const reviewRequested = body.reviewRequested === true;
  if (!title || title.length > 160 || description.length > 2000 || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) return new Response("Invalid task fields", { status: 400 });
  const assignee = (await getMembers()).find((item) => item.discordUserId === assigneeDiscordId && item.active);
  if (!assignee) return new Response("Assignee not found", { status: 400 });
  const result = await createTask({ title, description, assigneeDiscordId, dueDate, reviewRequested, createdByDiscordId: creator.discordUserId, creatorName: creator.displayName });
  return Response.json(result, { status: 201 });
}
