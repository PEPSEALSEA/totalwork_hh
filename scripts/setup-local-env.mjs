import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const [keyPath, sheetId] = process.argv.slice(2);
if (!keyPath || !sheetId) throw new Error("Usage: node scripts/setup-local-env.mjs <service-account-json> <sheet-id>");
const account = JSON.parse(await readFile(keyPath, "utf8"));
if (account.type !== "service_account" || !account.private_key || !account.client_email) throw new Error("Invalid Google service account file");
const secret = randomBytes(32).toString("base64url");
const values = {
  AUTH_SECRET: secret,
  GOOGLE_SHEET_ID: sheetId,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: account.client_email,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: account.private_key,
};
const content = Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n";
await writeFile(".env.local", content, { flag: "wx", mode: 0o600 });
await writeFile(".dev.vars", content, { flag: "wx", mode: 0o600 });
console.log("Created ignored .env.local and .dev.vars with Google Sheets credentials and a local session secret. Discord credentials remain unset.");
