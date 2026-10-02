const JWKS_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;
const jwksCache = new Map();
const encoder = new TextEncoder();

function base64UrlBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

function normalizeTeamDomain(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Invalid Access team domain.");
  }
  if (!url.hostname.endsWith(".cloudflareaccess.com") || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Invalid Access team domain.");
  }
  if (url.search || url.hash) throw new Error("Invalid Access team domain.");
  return url.origin;
}
function validJwk(key) {
  return Boolean(
    key &&
    key.kty === "RSA" &&
    key.alg === "RS256" &&
    key.use === "sig" &&
    typeof key.kid === "string" &&
    typeof key.n === "string" &&
    typeof key.e === "string"
  );
}

async function loadJwks(teamDomain, fetchImpl, force = false) {
  const now = Date.now();
  const cached = jwksCache.get(teamDomain);
  if (!force && cached && cached.expiresAt > now) return cached.keys;

  const response = await fetchImpl(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Could not load Access signing keys.");

  const data = await response.json();
  const keys = Array.isArray(data?.keys) ? data.keys.filter(validJwk) : [];
  if (!keys.length) throw new Error("No usable Access signing keys.");

  jwksCache.set(teamDomain, { keys, expiresAt: now + JWKS_TTL_MS });
  return keys;
}

async function keyForKid(teamDomain, kid, fetchImpl) {
  let keys = await loadJwks(teamDomain, fetchImpl);
  let key = keys.find((candidate) => candidate.kid === kid);
  if (key) return key;

  keys = await loadJwks(teamDomain, fetchImpl, true);
  key = keys.find((candidate) => candidate.kid === kid);
  if (!key) throw new Error("Unknown Access signing key.");
  return key;
}
async function verifyRs256(signingInput, signature, jwk) {
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    encoder.encode(signingInput),
  );
}

function audienceMatches(aud, expected) {
  if (Array.isArray(aud)) return aud.includes(expected);
  return aud === expected;
}

function claimsAreValid(payload, teamDomain, audience) {
  const now = Math.floor(Date.now() / 1000);
  if (payload?.iss !== teamDomain) return false;
  if (!audienceMatches(payload?.aud, audience)) return false;
  if (payload?.type !== "app") return false;
  if (!Number.isFinite(payload?.exp) || payload.exp <= now - CLOCK_SKEW_SECONDS) return false;
  if (Number.isFinite(payload?.nbf) && payload.nbf > now + CLOCK_SKEW_SECONDS) return false;
  if (Number.isFinite(payload?.iat) && payload.iat > now + CLOCK_SKEW_SECONDS) return false;
  return true;
}

export async function verifyAccessRequest(request, env, fetchImpl = fetch) {
  try {
    const token = request.headers.get("cf-access-jwt-assertion") || "";
    if (!token || token.length > 16384) return null;

    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJsonSegment(encodedHeader);
    if (header?.alg !== "RS256" || typeof header?.kid !== "string") return null;
    const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
    const audience = String(env.ACCESS_AUD || "").trim();
    if (!audience) return null;

    const jwk = await keyForKid(teamDomain, header.kid, fetchImpl);
    const validSignature = await verifyRs256(
      `${encodedHeader}.${encodedPayload}`,
      base64UrlBytes(encodedSignature),
      jwk,
    );
    if (!validSignature) return null;

    const payload = decodeJsonSegment(encodedPayload);
    if (!claimsAreValid(payload, teamDomain, audience)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function clearAccessJwksCacheForTest() {
  jwksCache.clear();
}
