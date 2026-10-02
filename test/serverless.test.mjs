import assert from "node:assert/strict";
import {
  RESERVED,
  constantTimeEqual,
  normalizeSlug,
  normalizeTarget,
  parseExpiry,
  randomSlug,
} from "../src/util.js";

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

console.log("serverless unit contract: PASS");
