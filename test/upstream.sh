#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE="$ROOT/compatibility/compose.yaml"
CONTRACT="$ROOT/compatibility/upstream-contract.json"

image=$(sed -nE 's|^[[:space:]]*image:[[:space:]]+(kutt/kutt:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64})[[:space:]]*$|\1|p' "$COMPOSE")
[[ -n "$image" ]] || { echo 'unable to resolve immutable Kutt image' >&2; exit 1; }
tag=${image%@*}
tag=${tag#kutt/kutt:}
contract_tmp=$(mktemp)
home_tmp=$(mktemp)
trap 'rm -f "$contract_tmp" "$home_tmp"; docker rm -f tristian-link-smoke >/dev/null 2>&1 || true' EXIT

python3 - "$CONTRACT" > "$contract_tmp" <<'PY'
import json,sys
x=json.load(open(sys.argv[1],encoding='utf-8'))
for path,sha in x['files'].items():
    print(sha,path)
PY

while read -r expected path; do
  url="https://raw.githubusercontent.com/thedevs-network/kutt/$tag/$path"
  actual=$(curl --fail --silent --show-error --location "$url" | git hash-object --stdin)
  if [[ "$actual" != "$expected" ]]; then
    echo "upstream customization contract changed: $path" >&2
    echo "expected blob $expected, got $actual at $tag" >&2
    echo 'Review the upstream template and adapt the override intentionally.' >&2
    exit 1
  fi
done < "$contract_tmp"

docker run -d --rm --name tristian-link-smoke \
  -p 127.0.0.1:3000:3000 \
  -e JWT_SECRET='ci-only-not-a-production-secret-0123456789' \
  -e SITE_NAME='link.tristian.id' \
  -e DEFAULT_DOMAIN='localhost:3000' \
  -e DISALLOW_ANONYMOUS_LINKS='false' \
  -e DISALLOW_REGISTRATION='true' \
  -e ENABLE_RATE_LIMIT='true' \
  -v "$ROOT/custom:/kutt/custom:ro" \
  "$image"

branded=0
for _ in $(seq 1 45); do
  code=$(curl -sS -o "$home_tmp" -w '%{http_code}' http://127.0.0.1:3000/ || true)
  if [[ "$code" == 302 ]] && grep -qF 'Found. Redirecting to /create-admin' "$home_tmp"; then
    if curl -fsS http://127.0.0.1:3000/create-admin > "$home_tmp" &&
       grep -qF 'data-tristian-link-theme="zenburn"' "$home_tmp" &&
       grep -qF 'link.tristian.id' "$home_tmp"; then
      branded=1
      break
    fi
  elif [[ "$code" == 200 ]] &&
       grep -qF 'data-tristian-link-theme="zenburn"' "$home_tmp" &&
       grep -qF 'Make long links' "$home_tmp"; then
    branded=1
    break
  fi
  sleep 2
done

[[ "$branded" == 1 ]] || { docker logs tristian-link-smoke >&2 || true; exit 1; }
curl -fsS http://127.0.0.1:3000/css/zenburn.css | grep -qiF -- '#000010'
test "$(docker inspect tristian-link-smoke --format '{{range .Mounts}}{{if eq .Destination "/kutt/custom"}}{{.RW}}{{end}}{{end}}')" = false

echo "upstream compatibility: PASS ($image)"
