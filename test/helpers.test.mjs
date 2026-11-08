import test from "node:test";
import assert from "node:assert/strict";
import { parseAssignees, addDays, bangkokDate, buildReminder, diffEvents, eventIdForTask, personalKey, validDate, validEmail, wantedEvents } from "../worker/helpers.ts";

const members = [
  { discordUserId: "111", displayName: "A", role: "member", active: true, googleEmail: "a@example.com" },
  { discordUserId: "222", displayName: "B", role: "member", active: true },
  { discordUserId: "333", displayName: "V", role: "viewer", active: true },
  { discordUserId: "444", displayName: "Off", role: "member", active: false },
];

test("bangkokDate uses UTC+7", () => {
  assert.equal(bangkokDate(new Date("2026-11-08T17:30:00Z")), "2026-11-09");
  assert.equal(bangkokDate(new Date("2026-11-08T16:59:00Z")), "2026-11-08");
});
test("addDays and validDate", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-02-28"), true);
});
test("validEmail", () => {
  assert.equal(validEmail("a@example.com"), true);
  assert.equal(validEmail("a b@example.com"), false);
  assert.equal(validEmail("nope"), false);
});
test("eventIdForTask is base32hex-safe and stable", () => {
  const id = eventIdForTask("TASK-1A2B3C4D");
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.equal(id, eventIdForTask("task-1a2b3c4d"));
});
test("wantedEvents: central has all open tasks, personal only for members with email", () => {
  const tasks = [
    { id: "T1", title: "x", assigneeDiscordId: "111", status: "ถัดไป", dueDate: "2026-11-10" },
    { id: "T2", title: "y", assigneeDiscordId: "222", status: "กำลังทำ", dueDate: "2026-11-11" },
    { id: "T3", title: "done", assigneeDiscordId: "111", status: "เสร็จแล้ว", dueDate: "2026-11-12" },
    { id: "T4", title: "nodate", assigneeDiscordId: "111", status: "ถัดไป", dueDate: "" },
    { id: "T5", title: "off", assigneeDiscordId: "444", status: "ถัดไป", dueDate: "2026-11-13" },
  ];
  const wanted = wantedEvents(tasks, members);
  assert.equal(wanted.get("central").length, 2);
  assert.equal(wanted.get(personalKey("111")).length, 1);
  assert.equal(wanted.get(personalKey("222")), undefined);
});
test("diffEvents creates, updates, removes and skips unchanged", () => {
  const wanted = [
    { id: "a", summary: "s", date: "2026-11-10", description: "d" },
    { id: "b", summary: "new title", date: "2026-11-10", description: "d" },
    { id: "c", summary: "s", date: "2026-11-10", description: "d" },
  ];
  const existing = [
    { id: "a", summary: "s", date: "2026-11-10", description: "d" },
    { id: "b", summary: "old title", date: "2026-11-10", description: "d" },
    { id: "z", summary: "gone", date: "2026-11-10", description: "d" },
  ];
  const diff = diffEvents(wanted, existing);
  assert.deepEqual(diff.create.map((e) => e.id), ["c"]);
  assert.deepEqual(diff.update.map((e) => e.id), ["b"]);
  assert.deepEqual(diff.remove, ["z"]);
});
test("morning reminder lists due/overdue tasks and dedupes by key", () => {
  const now = new Date("2026-11-08T01:00:00Z");
  const tasks = [
    { id: "T1", title: "due today", assigneeDiscordId: "111", status: "ถัดไป", dueDate: "2026-11-08" },
    { id: "T2", title: "far", assigneeDiscordId: "111", status: "ถัดไป", dueDate: "2026-11-20" },
  ];
  const message = buildReminder("morning", { tasks, members, updates: [], now, sentKeys: new Set() });
  assert.ok(message.content.includes("due today"));
  assert.ok(!message.content.includes("far"));
  assert.deepEqual(message.mentionIds, ["111"]);
  assert.equal(buildReminder("morning", { tasks, members, updates: [], now, sentKeys: new Set([message.key]) }), null);
});
test("evening reminder mentions only active non-viewers without an update today", () => {
  const now = new Date("2026-11-08T13:00:00Z");
  const updates = [{ authorDiscordId: "111", workDate: "2026-11-08" }];
  const message = buildReminder("evening", { tasks: [], members, updates, now, sentKeys: new Set() });
  assert.deepEqual(message.mentionIds, ["222"]);
  const all = [...updates, { authorDiscordId: "222", workDate: "2026-11-08" }];
  assert.equal(buildReminder("evening", { tasks: [], members, updates: all, now, sentKeys: new Set() }), null);
});

test("parseAssignees splits, trims and de-duplicates", () => {
  assert.deepEqual(parseAssignees("111, 222,111,"), ["111", "222"]);
  assert.deepEqual(parseAssignees(""), []);
});
test("shared task appears on every assignee's calendar and in one central event", () => {
  const tasks = [{ id: "T9", title: "shared", assigneeDiscordId: "111,222", status: "ถัดไป", dueDate: "2026-11-10" }];
  const withEmail = members.map((m) => (m.discordUserId === "222" ? { ...m, googleEmail: "b@example.com" } : m));
  const wanted = wantedEvents(tasks, withEmail);
  assert.equal(wanted.get("central").length, 1);
  assert.ok(wanted.get("central")[0].summary.startsWith("[A, B]"));
  assert.equal(wanted.get(personalKey("111")).length, 1);
  assert.equal(wanted.get(personalKey("222")).length, 1);
});
test("morning reminder reaches every assignee of a shared task", () => {
  const now = new Date("2026-11-08T01:00:00Z");
  const tasks = [{ id: "T9", title: "shared", assigneeDiscordId: "111,222", status: "ถัดไป", dueDate: "2026-11-08" }];
  const message = buildReminder("morning", { tasks, members, updates: [], now, sentKeys: new Set() });
  assert.deepEqual(message.mentionIds.sort(), ["111", "222"]);
});
