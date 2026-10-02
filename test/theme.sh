#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CUSTOM="$ROOT/custom"
CONTRACT="$ROOT/compatibility/upstream-contract.json"
COMPOSE="$ROOT/compatibility/compose.yaml"

for f in \
  "$CUSTOM/REVISION" \
  "$CUSTOM/css/zenburn.css" \
  "$CUSTOM/views/homepage.hbs" \
  "$CUSTOM/views/layout.hbs" \
  "$CUSTOM/views/partials/header.hbs" \
  "$CUSTOM/views/partials/shortener.hbs" \
  "$CUSTOM/views/partials/footer.hbs" \
  "$CUSTOM/views/404.hbs" \
  "$CUSTOM/images/favicon.ico" \
  "$CUSTOM/images/favicon-32x32.png" \
  "$CUSTOM/images/favicon-16x16.png" \
  "$CUSTOM/images/apple-touch-icon.png" \
  "$CONTRACT" "$COMPOSE"; do
  [[ -f "$f" ]] || { echo "missing required file: $f" >&2; exit 1; }
done

CSS="$CUSTOM/css/zenburn.css"
for token in '#000010' '#ff00ff' '#9e1828' '#aece92' '#968a38' '#414171' '#963c59' '#418179' '#cf6171' '#c5f779' '#fff796' '#4186be' '#cf9ebe' '#71bebe'; do
  grep -qiF -- "$token" "$CSS" || { echo "Termux Zenburn token missing: $token" >&2; exit 1; }
done

grep -qF 'data-tristian-link-theme="zenburn"' "$CUSTOM/views/partials/header.hbs"
grep -qF 'Make long links less annoying.' "$CUSTOM/views/layout.hbs"
grep -qF '/images/favicon.ico' "$CUSTOM/views/layout.hbs"
grep -qF '/images/favicon-32x32.png' "$CUSTOM/views/layout.hbs"
grep -qF '/images/favicon-16x16.png' "$CUSTOM/views/layout.hbs"
grep -qF '/images/apple-touch-icon.png' "$CUSTOM/views/layout.hbs"

for token in 'safe-area-inset-left' 'font-size:16px!important' '-webkit-overflow-scrolling:touch' '@media (max-width:520px)' 'overscroll-behavior-x:contain' 'box-sizing:border-box' 'max-width:100%'; do
  grep -qF -- "$token" "$CSS" || { echo "mobile contract missing: $token" >&2; exit 1; }
done

test "$(git hash-object "$CUSTOM/images/favicon.ico")" = "fc4b7a0039764a3483d68e7024335aa5ea9378a6"
test "$(git hash-object "$CUSTOM/images/favicon-32x32.png")" = "9427b4149d80f146b242791cdace6f5427418390"
test "$(git hash-object "$CUSTOM/images/favicon-16x16.png")" = "bd48fe31a219a3503d323e5ec6286c6523197674"
test "$(git hash-object "$CUSTOM/images/apple-touch-icon.png")" = "a07d12fa8bdbaef2687cbd3aee3ddd7c225f715d"

SHORT="$CUSTOM/views/partials/shortener.hbs"
for needle in 'id="shortener-form"' 'hx-post="/api/links"' 'name="target"' 'name="domain"' 'name="customurl"' 'name="password"' 'name="expire_in"' 'name="description"'; do
  grep -qF -- "$needle" "$SHORT" || { echo "shortener contract missing: $needle" >&2; exit 1; }
done

python3 - "$CONTRACT" "$COMPOSE" <<'PY'
import json,re,sys
x=json.load(open(sys.argv[1],encoding='utf-8'))
assert x['upstream']=='thedevs-network/kutt'
required={
 'server/views/homepage.hbs','server/views/layout.hbs',
 'server/views/partials/header.hbs','server/views/partials/footer.hbs',
 'server/views/partials/shortener.hbs','server/views/404.hbs'
}
assert set(x['files'])==required
assert all(re.fullmatch(r'[0-9a-f]{40}',v) for v in x['files'].values())
text=open(sys.argv[2],encoding='utf-8').read()
assert re.search(r'kutt/kutt:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}',text)
PY

! grep -RniE '<(script|link)[^>]+https?://|@import[[:space:]]+url\(https?://' "$CUSTOM" --include='*.hbs' --include='*.css'
echo 'theme contract: PASS'
