import { cookies } from "next/headers";

const encoder = new TextEncoder();
const decode = (part: string) => Uint8Array.from(atob(part.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export type Session = { discordId: string; name: string; role: "admin" | "lead" | "member" | "viewer"; exp: number };

async function key() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return crypto.subtle.importKey("raw", encoder.encode(process.env.AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(session: Session) {
  const payload = b64(encoder.encode(JSON.stringify(session)));
  const signature = b64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload))));
  return `${payload}.${signature}`;
}

export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get("hh_session")?.value;
  if (!value || !process.env.AUTH_SECRET) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await key(), decode(signature), encoder.encode(payload));
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(decode(payload))) as Session;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch { return null; }
}

export function discordConfigured() {
  return Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET && process.env.AUTH_SECRET);
}
