import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";

const [keyPath, sheetId] = process.argv.slice(2);
if (!keyPath || !sheetId) throw new Error("Usage: node scripts/inspect-sheet.mjs <service-account-json> <sheet-id>");
const account = JSON.parse(await readFile(keyPath, "utf8"));
if (account.type !== "service_account") throw new Error("Expected a Google service account JSON file");

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url");
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
if (!tokenResponse.ok) throw new Error(`Google token request failed (${tokenResponse.status})`);
const { access_token } = await tokenResponse.json();
const api = async (url) => {
  const response = await fetch(url, { headers: { authorization: `Bearer ${access_token}` } });
  if (!response.ok) throw new Error(`Sheets API failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
};
const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=${encodeURIComponent("properties(title),sheets(properties(title,gridProperties(rowCount,columnCount)))")}`);
const ranges = meta.sheets.map(({ properties }) => `'${properties.title.replaceAll("'", "''")}'!1:1`);
const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&");
const headers = await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${query}`);
console.log(JSON.stringify({ spreadsheet: meta.properties?.title, tabs: meta.sheets.map(({ properties }, index) => ({ name: properties.title, rows: properties.gridProperties?.rowCount, columns: properties.gridProperties?.columnCount, header: headers.valueRanges?.[index]?.values?.[0] || [] })) }, null, 2));
