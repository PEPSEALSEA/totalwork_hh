import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";

const [keyPath, sheetId] = process.argv.slice(2);
if (!keyPath || !sheetId) throw new Error("Usage: node scripts/setup-sheet.mjs <service-account-json> <sheet-id>");
const account = JSON.parse(await readFile(keyPath, "utf8"));
if (account.type !== "service_account") throw new Error("Expected a Google service account JSON file");
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url");
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
if (!tokenResponse.ok) throw new Error(`Google token request failed (${tokenResponse.status})`);
const { access_token } = await tokenResponse.json();
const api = async (path, init) => {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}${path}`, { ...init, headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" } });
  if (!response.ok) throw new Error(`Sheets API failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  return response.json();
};
const columns = {
  Members: ["discord_user_id", "display_name", "role", "active", "joined_at", "team_role"],
  Tasks: ["id", "title", "description", "assignee_discord_id", "status", "due_date", "updated_at", "review_requested", "created_by_discord_id", "created_at"],
  Issues: ["id", "title", "description", "reporter_discord_id", "owner_discord_id", "priority", "status", "created_at", "updated_at"],
  Updates: ["id", "author_discord_id", "work_date", "today", "blockers", "tomorrow", "created_at"],
  Announcements: ["id", "title", "body", "author_discord_id", "published_at", "audience", "meeting_topic", "has_raw_text", ...Array.from({ length: 18 }, (_, i) => `raw_text_${i + 1}`)],
  AnnouncementComments: ["id", "announcement_id", "author_discord_id", "body", "created_at", "author_name"],
  Notifications: ["id", "recipient_discord_id", "task_id", "type", "title", "body", "created_at", "read_at"],
};
const meta = await api("?fields=sheets(properties(sheetId,title))");
const existing = meta.sheets.map((sheet) => sheet.properties.title);
const requests = [];
if (existing.length === 1 && existing[0] === "ชีต1") {
  const first = await api(`/values/${encodeURIComponent("'ชีต1'!A1:Z10")}`);
  if (first.values?.length) throw new Error("Default sheet is not empty; refusing to rename it");
  requests.push({ updateSheetProperties: { properties: { sheetId: meta.sheets[0].properties.sheetId, title: "Members" }, fields: "title" } });
  existing[0] = "Members";
}
for (const tab of Object.keys(columns)) if (!existing.includes(tab)) requests.push({ addSheet: { properties: { title: tab } } });
if (requests.length) await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests }) });
const data = [];
for (const [tab, header] of Object.entries(columns)) {
  const current = await api(`/values/${encodeURIComponent(`'${tab}'!A1:Z1`)}`);
  const existingHeader = current.values?.[0] || [];
  if (existingHeader.some((value, index) => value !== header[index]) || existingHeader.length > header.length) throw new Error(`${tab} has a different header; no data changed in that tab`);
  if (existingHeader.length < header.length) data.push({ range: `'${tab}'!A1`, values: [header] });
}
if (data.length) await api("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
const team = [
  ["780979517224386560", "Nook", "member", "website design"],
  ["353540188565274624", "หวาย", "member", "game design"],
  ["811956374157918208", "เจ", "member", "game design"],
  ["696240544510378074", "โดม", "member", "game design"],
  ["873223520178540594", "เทียน", "member", "poster"],
  ["417675346209538048", "พีพีspp", "member", "สมาชิกทีม"],
  ["851726736911630357", "Kong", "member", "Consultant"],
  ["933205385194639400", "เป๊ป", "admin", "นักสืบ (คนหาข้อมูล)"],
];
const memberValues = await api(`/values/${encodeURIComponent("'Members'!A:F")}`);
const existingIds = new Set((memberValues.values || []).slice(1).map((row) => row[0]));
const newMembers = team.filter((row) => !existingIds.has(row[0])).map(([id, name, role, teamRole]) => [id, name, role, "TRUE", new Date().toISOString(), teamRole]);
if (newMembers.length) await api(`/values/${encodeURIComponent("'Members'!A:F")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: newMembers }) });
console.log(JSON.stringify({ ready: Object.keys(columns), tabsCreated: requests.length, headersWritten: data.length, membersAdded: newMembers.length }));
