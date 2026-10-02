# ❯ link

**Make long links less annoying.**

[link.tristian.id](https://link.tristian.id) is a small Cloudflare-native URL shortener with a Termux Zenburn-inspired interface.

The application is intentionally boring operationally: one Worker, static assets at the edge, D1 for links and analytics, and native Workers rate limiting for anonymous creation. The public service is fully serverless; the admin API is deliberately disabled until its infrastructure-owned authentication gate is provisioned.

## Architecture

```text
browser
   │
   ▼
Cloudflare edge
   │
   ├── static assets
   │     └── Zenburn UI
   │
   ├── POST /api/links
   │     ├── per-client rate limit
   │     └── D1 insert
   │
   ├── GET /<slug>
   │     ├── D1 lookup
   │     ├── bounded click metadata
   │     └── 302 target
   │
   └── /admin/*
         └── disabled by default
               └── enable only after an infrastructure auth gate exists
```

Production does not require a VM, Node server, Redis, Postgres, nginx, or a permanent application fork.

## What is preserved

The serverless rewrite keeps the behavior that matters from the previous Kutt deployment:

- anonymous URL shortening;
- custom aliases;
- optional expiry;
- optional link passwords;
- redirect click counts;
- bounded country/referrer/browser/OS analytics without retaining visitor IP addresses;
- an admin list/delete API that is fail-closed until the private authentication gate is deployed;
- the existing `❯ link` visual language, mobile fixes and exact `tristian.id` favicon family;
- branded 404, terms and abuse-report pages.

The old Kutt database is migrated directly into D1 by a private CI job. URL targets never become workflow artifacts or Git content.

## Data model

`migrations/0001_initial.sql` owns three tables:

- `links` — canonical redirect state;
- `legacy_visits` — read-only aggregate Kutt analytics preserved during migration;
- `clicks` — new edge-era click events.

Only bounded metadata is written for new clicks: country code supplied by Cloudflare, referrer hostname, coarse browser family and coarse OS family. Client IP addresses are used only as an ephemeral rate-limit key and are not persisted.

## Security

- Targets are restricted to `http://` and `https://`.
- Embedded URL credentials are rejected.
- Public creation is same-origin and rate limited.
- Link passwords are HMAC-SHA-256 hashes using a Worker secret that is never stored in Git.
- Admin endpoints require both an explicit production enable flag and the authenticated-email signal from the infrastructure gate. Production currently keeps the flag disabled because the Cloudflare IaC token does not yet have Access Apps/Policies Write.
- Static pages ship a strict CSP, no-referrer policy, frame denial and locked-down Permissions Policy.
- Production `workers.dev` and preview URLs are disabled.

## Deployment

The public repository owns application code and D1 migrations.

```text
pull request
    │
    ├── static/unit validation
    └── isolated Workers preview
             │
             ▼
           main
             │
             ├── D1 migrations
             └── wrangler deploy
                     │
                     ▼
                 tristian-link
```

Cloudflare routing and administrator authentication remain owned by the separate infrastructure repository so application deployment, privileged access, and traffic cutover are independent operations.

## Migration safety

The Kutt-to-D1 migration is deliberately fail-closed:

1. inspect the live Kutt schema;
2. refuse migration if custom domains, passworded legacy links, or API keys appear without an adapter;
3. export links and aggregate visits into a mode-0700 temporary workspace on the self-hosted runner;
4. transform directly to idempotent D1 SQL;
5. import into production D1;
6. compare source/D1 link count, visit-row count and historical-click total;
7. destroy the temporary workspace.

At the migration point the live Kutt state contained 8 links, 27 aggregate visit rows and 58 historical clicks, with no custom domains, passworded links or API keys.

## Local checks

```bash
node --check src/worker.js
node test/serverless.test.mjs
python3 -m py_compile scripts/kutt-to-d1.py
```

The live preview workflow additionally proves create → redirect, protected-link challenge, missing-link 404 behavior and D1 migrations against an isolated preview database.

## History

Tristian Link originally shipped as an upstream-compatible customization layer for [Kutt](https://github.com/thedevs-network/kutt). That design deliberately avoided a permanent fork and made upstream upgrades safe. The serverless rewrite retired the runtime dependency after the production data and behavior could be reproduced directly on Cloudflare.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
