import bcrypt from "bcryptjs";
import { constantTimeEqual, json, parseBody } from "./util.js";

const COOKIE = "tristian_link_session";
const MAX_AGE = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unb64url(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function sign(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return b64url(new Uint8Array(sig));
}

function cookieHeader(request) {
  return request.headers.get("cookie") || "";
}

function readCookie(request, name) {
  for (const part of cookieHeader(request).split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

export async function issueSession(env, email) {
  const payload = {
    email: String(email).toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
    nonce: crypto.randomUUID(),
  };
  const encoded = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(env.SESSION_SECRET, encoded);
  return `${encoded}.${signature}`;
}

export async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = await sign(env.SESSION_SECRET, encoded);
  if (!constantTimeEqual(signature, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(decoder.decode(unb64url(encoded)));
  } catch {
    return null;
  }
  if (
    typeof payload?.email !== "string" ||
    !Number.isInteger(payload?.exp) ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) return null;
  return payload;
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function isAdmin(request, env) {
  if (env.ENVIRONMENT !== "production") return false;
  const session = await readSession(request, env);
  return session?.email === "irvan@tristian.id";
}

export async function login(request, env) {
  if (env.ENVIRONMENT !== "production") return json({ error: "Not found." }, 404);

  const key = request.headers.get("cf-connecting-ip") || "unknown";
  const limited = await env.LOGIN_LIMIT.limit({ key });
  if (!limited.success) return json({ error: "Too many login attempts. Try again in a minute." }, 429);

  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password || password.length > 500) {
    return json({ error: "Invalid email or password." }, 401);
  }

  const row = await env.DB.prepare(
    "SELECT email,password_hash,verified,banned FROM admin_users WHERE lower(email)=? LIMIT 1"
  ).bind(email).first();

  const ok = Boolean(
    row &&
    row.verified &&
    !row.banned &&
    await bcrypt.compare(password, row.password_hash)
  );
  if (!ok) return json({ error: "Invalid email or password." }, 401);

  const token = await issueSession(env, row.email);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token) });
}

export function logout() {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}
