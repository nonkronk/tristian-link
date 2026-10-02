import {
  ADMIN_EMAIL,
  constantTimeEqual,
  hmacHex,
  json,
  normalizeSlug,
  normalizeTarget,
  parseBody,
  parseExpiry,
  randomSlug,
} from "./util.js";

function referrerHost(request) {
  const ref = request.headers.get("referer");
  if (!ref) return null;
  try {
    return new URL(ref).hostname.slice(0, 255);
  } catch {
    return null;
  }
}

function browserFamily(ua) {
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/OPR\//i.test(ua)) return "opera";
  if (/Chrome\//i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

function osFamily(ua) {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

export async function recordVisit(env, request, linkId) {
  const ua = request.headers.get("user-agent") || "";
  const country = String(request.cf?.country || "").slice(0, 2) || null;
  await env.DB.batch([
    env.DB.prepare("UPDATE links SET visit_count = visit_count + 1 WHERE id = ?").bind(linkId),
    env.DB.prepare(
      "INSERT INTO clicks (link_id, occurred_at, country, referrer_host, browser, os) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
      linkId,
      new Date().toISOString(),
      country,
      referrerHost(request),
      browserFamily(ua),
      osFamily(ua),
    ),
  ]);
}

export async function findLink(env, slug) {
  return env.DB.prepare(
    "SELECT id,address,target,description,password_hash,expire_at,visit_count,banned FROM links WHERE address = ?"
  ).bind(slug).first();
}

export function isExpired(row) {
  return Boolean(row?.expire_at && Date.parse(row.expire_at) <= Date.now());
}

export async function createLink(request, env, ownerEmail = null) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin link creation is not allowed." }, 403);
  }

  if (!ownerEmail) {
    const key = request.headers.get("cf-connecting-ip") || "unknown";
    const [client, global] = await Promise.all([
      env.CLIENT_CREATE_LIMIT.limit({ key }),
      env.GLOBAL_CREATE_LIMIT.limit({ key: "anonymous-create" }),
    ]);
    if (!client.success || !global.success) {
      return json({ error: "Too many links created. Try again in a minute." }, 429);
    }
  }

  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  let target;
  let slug;
  let expireAt;
  try {
    target = normalizeTarget(body.target);
    slug = normalizeSlug(body.customurl || body.alias || "");
    expireAt = parseExpiry(body.expire_in || "");
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const description = String(body.description || "").trim().slice(0, 500) || null;
  const password = String(body.password || "");
  if (password.length > 200) return json({ error: "Password is too long." }, 400);
  const passwordHash = password ? await hmacHex(env.LINK_PASSWORD_PEPPER, password) : null;
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 8; attempt++) {
    const address = slug || randomSlug();
    try {
      const row = await env.DB.prepare(
        `INSERT INTO links
          (address,target,description,password_hash,expire_at,visit_count,created_at,updated_at,owner_email,banned)
         VALUES (?,?,?,?,?,0,?,?,?,0)
         RETURNING id,address`
      ).bind(address, target, description, passwordHash, expireAt, now, now, ownerEmail).first();

      const origin = new URL(request.url).origin;
      return json({
        id: row.id,
        address: row.address,
        link: `${new URL(request.url).host}/${row.address}`,
        url: `${origin}/${row.address}`,
      }, 201);
    } catch (error) {
      const message = String(error?.message || error);
      if (slug || !/UNIQUE|constraint/i.test(message)) {
        return json({ error: slug ? "That alias is already in use." : "Could not create link." }, slug ? 409 : 500);
      }
    }
  }
  return json({ error: "Could not allocate a short URL." }, 503);
}

export async function verifyLinkPassword(env, candidate, storedHash) {
  const hash = await hmacHex(env.LINK_PASSWORD_PEPPER, String(candidate || ""));
  return constantTimeEqual(hash, storedHash);
}

export function requireAdmin(request, env) {
  // Fail closed until the infrastructure-owned Cloudflare Access application
  // is actually deployed. A client-supplied header alone must never unlock
  // the admin API.
  if (env.ENVIRONMENT !== "production" || env.ADMIN_ACCESS_ENABLED !== "true") return false;
  const email = request.headers.get("cf-access-authenticated-user-email") || "";
  return email.toLowerCase() === ADMIN_EMAIL;
}
