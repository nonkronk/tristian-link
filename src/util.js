export const ADMIN_EMAIL = "irvan@tristian.id";

export const RESERVED = new Set([
  "", "api", "admin", "assets", "favicon.ico", "favicon-16x16.png",
  "favicon-32x32.png", "apple-touch-icon.png", "robots.txt", "terms",
  "report", "404.html", "styles.css", "app.js"
]);

const encoder = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function normalizeSlug(value) {
  const slug = String(value || "").trim();
  if (!slug) return "";
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(slug)) {
    throw new Error("Alias must be 3–64 characters using letters, numbers, _ or -.");
  }
  if (RESERVED.has(slug.toLowerCase())) throw new Error("That alias is reserved.");
  return slug;
}

export function normalizeTarget(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4096) throw new Error("Enter a valid URL.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing embedded credentials are not allowed.");
  }
  return url.toString();
}

export function parseExpiry(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,6})\s*(minute|hour|day|week|month|year)s?$/);
  if (!match) throw new Error("Expiry examples: 2 hours, 30 days, 1 year.");
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    minute: 60000,
    hour: 3600000,
    day: 86400000,
    week: 604800000,
    month: 2629746000,
    year: 31556952000,
  };
  const when = Date.now() + amount * multipliers[unit];
  if (!Number.isFinite(when) || when > Date.now() + 10 * multipliers.year) {
    throw new Error("Expiry must be within 10 years.");
  }
  return new Date(when).toISOString();
}

export function randomSlug(length = 7) {
  const chars = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function parseBody(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json();
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    return Object.fromEntries(await request.formData());
  }
  throw new Error("Unsupported request body.");
}
