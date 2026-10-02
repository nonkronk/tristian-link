import { ADMIN_EMAIL, RESERVED, json, parseBody, text } from "./util.js";
import {
  createLink,
  findLink,
  isExpired,
  recordVisit,
  requireAdmin,
  verifyLinkPassword,
} from "./links.js";

function notFound(request) {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#000010"><title>link not found | link.tristian.id</title><link rel="stylesheet" href="/styles.css"></head><body><div class="main-wrapper"><header class="tl-header" data-tristian-link-theme="zenburn"><a class="tl-brand" href="/"><span class="tl-prompt">❯</span><span>link</span><span class="tl-cursor"></span></a></header><main class="tl-notfound"><div class="tl-command"><span class="tl-prompt">❯</span> link not found</div><h1>404</h1><p>Either it never existed, expired, or someone cleaned up after themselves.</p><p><a class="button primary" href="/">go home</a></p></main></div></body></html>`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

function protectedPage(slug) {
  const action = "/" + encodeURIComponent(slug);
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>protected link | link.tristian.id</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="main-wrapper">
<header class="tl-header" data-tristian-link-theme="zenburn">
<a class="tl-brand" href="/"><span class="tl-prompt">❯</span><span>link</span><span class="tl-cursor"></span></a>
</header>
<main class="tl-notfound tl-protected">
<div class="tl-command"><span class="tl-prompt">❯</span> protected</div>
<h2>This link needs a password.</h2>
<form method="post" action="${action}" class="tl-protected-form">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button class="primary" type="submit">open link ↵</button>
</form>
</main>
</div>
</body>
</html>`;
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

async function adminApi(request, env, pathname) {
  if (!requireAdmin(request, env)) return text("Not found", 404);

  if (pathname === "/admin/api/links" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT id,address,target,description,expire_at,visit_count,created_at,updated_at,owner_email,banned,
              CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS passworded
       FROM links
       ORDER BY created_at DESC`
    ).all();
    return json({ links: results });
  }

  if (pathname === "/admin/api/links" && request.method === "POST") {
    return createLink(request, env, ADMIN_EMAIL);
  }

  const match = pathname.match(/^\/admin\/api\/links\/([A-Za-z0-9_-]{3,64})$/);
  if (match && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM links WHERE address = ?").bind(match[1]).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: "Link not found." }, 404);
  }

  return json({ error: "Not found." }, 404);
}

async function api(request, env, pathname) {
  if (pathname === "/api/health" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: row?.ok === 1 });
  }
  if (pathname === "/api/links" && request.method === "POST") {
    return createLink(request, env, null);
  }
  return json({ error: "Not found." }, 404);
}

async function resolveShortLink(request, env, ctx, slug) {
  const row = await findLink(env, slug);
  if (!row || row.banned || isExpired(row)) return notFound(request);

  if (row.password_hash) {
    if (request.method === "GET" || request.method === "HEAD") return protectedPage(slug);
    if (request.method !== "POST") return text("Method not allowed", 405, { allow: "GET, HEAD, POST" });
    let body;
    try {
      body = await parseBody(request);
    } catch {
      return text("Bad request", 400);
    }
    const ok = await verifyLinkPassword(env, body.password, row.password_hash);
    if (!ok) {
      const response = protectedPage(slug);
      return new Response(response.body, { status: 401, headers: response.headers });
    }
  } else if (!["GET", "HEAD"].includes(request.method)) {
    return text("Method not allowed", 405, { allow: "GET, HEAD" });
  }

  if (request.method !== "HEAD") ctx.waitUntil(recordVisit(env, request, row.id));
  return Response.redirect(row.target, 302);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/admin/api/")) return adminApi(request, env, pathname);
    if (pathname.startsWith("/api/")) return api(request, env, pathname);
    if (pathname === "/admin") return Response.redirect(new URL("/admin/", url), 308);

    if (pathname === "/" || pathname.startsWith("/admin/")) {
      return env.ASSETS.fetch(request);
    }

    const raw = pathname.slice(1);
    if (!raw || raw.includes("/") || RESERVED.has(raw.toLowerCase())) {
      return env.ASSETS.fetch(request);
    }

    let slug;
    try {
      slug = decodeURIComponent(raw);
    } catch {
      return notFound(request);
    }
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(slug)) return env.ASSETS.fetch(request);
    return resolveShortLink(request, env, ctx, slug);
  },
};
