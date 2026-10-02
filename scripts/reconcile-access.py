#!/usr/bin/env python3
"""Reconcile the Cloudflare Access gate for link.tristian.id/admin/*.

The Worker remains publicly reachable for redirects and link creation. Only the
admin UI/API is protected. A reusable Access policy allows exactly the owner's
email; the Worker also checks Cloudflare's authenticated-user header as
defense-in-depth.

Required environment:
  CLOUDFLARE_API_TOKEN  account-owned token with Access Apps/Policies Write
  CLOUDFLARE_ACCOUNT_ID
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ADMIN = "irvan@tristian.id"
POLICY_NAME = "Tristian Link admin owner"
APP_NAME = "Tristian Link admin"
APP_DOMAIN = "link.tristian.id/admin/*"

if not ACCOUNT or not TOKEN:
    raise SystemExit("Cloudflare credentials are not configured")

BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/access"


def call(method: str, path: str, payload=None):
    data = None
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:1200]
        raise SystemExit(f"Cloudflare Access API HTTP {exc.code}: {detail}") from None
    if body.get("success") is not True:
        raise SystemExit("Cloudflare Access API returned success=false")
    return body.get("result")


def one(rows, predicate, label):
    matches = [row for row in rows if predicate(row)]
    if len(matches) > 1:
        raise SystemExit(f"multiple Cloudflare Access {label} objects match desired state")
    return matches[0] if matches else None


policy_body = {
    "name": POLICY_NAME,
    "decision": "allow",
    "include": [{"email": {"email": ADMIN}}],
    "session_duration": "24h",
}

policies = call("GET", "/policies") or []
policy = one(policies, lambda row: row.get("name") == POLICY_NAME, "policy")
if policy is None:
    policy = call("POST", "/policies", policy_body)
    print("Access policy created")
else:
    policy = call("PUT", f"/policies/{policy['id']}", policy_body)
    print("Access policy reconciled")

policy_id = policy.get("id")
if not policy_id:
    raise SystemExit("Cloudflare Access policy id is missing")

app_body = {
    "name": APP_NAME,
    "domain": APP_DOMAIN,
    "type": "self_hosted",
    "session_duration": "24h",
    "app_launcher_visible": False,
    "policies": [{"id": policy_id, "precedence": 1}],
}

apps = call("GET", "/apps") or []
app = one(
    apps,
    lambda row: row.get("name") == APP_NAME or row.get("domain") == APP_DOMAIN,
    "application",
)
if app is None:
    app = call("POST", "/apps", app_body)
    print("Access application created")
else:
    app = call("PUT", f"/apps/{app['id']}", app_body)
    print("Access application reconciled")

if app.get("domain") != APP_DOMAIN or app.get("type") != "self_hosted":
    raise SystemExit("Cloudflare Access application did not converge")
linked = app.get("policies") or []
if not any(
    (row == policy_id) or (isinstance(row, dict) and row.get("id") == policy_id)
    for row in linked
):
    raise SystemExit("Cloudflare Access application is missing owner policy")

print("Cloudflare Access admin gate: PASS")
