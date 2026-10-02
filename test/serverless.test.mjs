import assert from "node:assert/strict";
import {
  RESERVED,
  constantTimeEqual,
  normalizeSlug,
  normalizeTarget,
  parseExpiry,
  randomSlug,
} from "../src/util.js";
import { clearAccessJwksCacheForTest } from "../src/access.js";
import { requireAdmin } from "../src/links.js";

assert.equal(normalizeSlug("abc-123_X"), "abc-123_X");
assert.throws(() => normalizeSlug("api"), /reserved/);
assert.throws(() => normalizeSlug("x"), /3–64/);
assert.equal(normalizeTarget("https://example.com/a").startsWith("https://example.com/a"), true);
assert.throws(() => normalizeTarget("ftp://example.com/file"), /Only http/);
assert.throws(() => normalizeTarget("https://user:pass@example.com/"), /credentials/);
assert.equal(constantTimeEqual("abc", "abc"), true);
assert.equal(constantTimeEqual("abc", "abd"), false);
assert.equal(RESERVED.has("admin"), true);

const expiry = Date.parse(parseExpiry("2 hours"));
assert.ok(expiry > Date.now() + 60 * 60 * 1000);
assert.ok(expiry < Date.now() + 3 * 60 * 60 * 1000);

for (let i = 0; i < 100; i++) {
  assert.match(randomSlug(), /^[23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]{7}$/);
}
const accessEnv = {
  ENVIRONMENT: "production",
  ADMIN_ACCESS_ENABLED: "true",
  ACCESS_TEAM_DOMAIN: "https://tristian-id.cloudflareaccess.com",
  ACCESS_AUD: "test-audience",
};

const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
Object.assign(publicJwk, { kid: "unit-test-key", alg: "RS256", use: "sig" });

let jwksFetches = 0;
const mockJwksFetch = async (url) => {
  jwksFetches += 1;
  assert.equal(
    String(url),
    "https://tristian-id.cloudflareaccess.com/cdn-cgi/access/certs",
  );
  return new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
function encodedJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signAccessToken(payload, header = { alg: "RS256", kid: "unit-test-key", typ: "JWT" }) {
  const encodedHeader = encodedJson(header);
  const encodedPayload = encodedJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

const now = Math.floor(Date.now() / 1000);
const baseClaims = {
  aud: [accessEnv.ACCESS_AUD],
  email: "irvan@tristian.id",
  exp: now + 300,
  iat: now,
  nbf: now - 1,
  iss: accessEnv.ACCESS_TEAM_DOMAIN,
  type: "app",
  sub: "unit-test-user",
};

const validToken = await signAccessToken(baseClaims);
const validRequest = new Request("https://link.tristian.id/admin/api/links", {
  headers: { "cf-access-jwt-assertion": validToken },
});

clearAccessJwksCacheForTest();
assert.equal(await requireAdmin(validRequest, accessEnv, mockJwksFetch), true);
assert.equal(jwksFetches, 1);
const forgedEmailOnly = new Request("https://link.tristian.id/admin/api/links", {
  headers: { "cf-access-authenticated-user-email": "irvan@tristian.id" },
});
assert.equal(await requireAdmin(forgedEmailOnly, accessEnv, mockJwksFetch), false);

const wrongAudience = await signAccessToken({ ...baseClaims, aud: ["wrong-audience"] });
assert.equal(
  await requireAdmin(
    new Request("https://link.tristian.id/admin/api/links", {
      headers: { "cf-access-jwt-assertion": wrongAudience },
    }),
    accessEnv,
    mockJwksFetch,
  ),
  false,
);

const expired = await signAccessToken({ ...baseClaims, exp: now - 120 });
assert.equal(
  await requireAdmin(
    new Request("https://link.tristian.id/admin/api/links", {
      headers: { "cf-access-jwt-assertion": expired },
    }),
    accessEnv,
    mockJwksFetch,
  ),
  false,
);
const wrongEmail = await signAccessToken({ ...baseClaims, email: "someone@example.com" });
assert.equal(
  await requireAdmin(
    new Request("https://link.tristian.id/admin/api/links", {
      headers: { "cf-access-jwt-assertion": wrongEmail },
    }),
    accessEnv,
    mockJwksFetch,
  ),
  false,
);

const tamperedParts = validToken.split(".");
tamperedParts[1] = encodedJson({ ...baseClaims, email: "attacker@example.com" });
assert.equal(
  await requireAdmin(
    new Request("https://link.tristian.id/admin/api/links", {
      headers: { "cf-access-jwt-assertion": tamperedParts.join(".") },
    }),
    accessEnv,
    mockJwksFetch,
  ),
  false,
);

assert.equal(
  await requireAdmin(validRequest, { ...accessEnv, ADMIN_ACCESS_ENABLED: "false" }, mockJwksFetch),
  false,
);

console.log("serverless unit contract: PASS");
