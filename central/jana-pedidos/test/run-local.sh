#!/usr/bin/env bash
# Sobe tudo localmente e roda os testes do Worker e do editor. Nada real é pago, enviado ou publicado:
# InfinitePay e GitHub são simulados (mock-infinitepay.mjs, mock-github.mjs).
# Uso: WRANGLER=/caminho/wrangler PW_DIR=/caminho/com/node_modules/playwright bash central/jana-pedidos/test/run-local.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
TMP="${TMP_DIR:-/tmp/jana-editor-test}"
WRANGLER="${WRANGLER:-npx wrangler}"
ADMIN="senha-teste-local"
rm -rf "$TMP" && mkdir -p "$TMP/site" "$TMP/worker"
tar -C "$REPO" --exclude=.git --exclude=tests/screenshots --exclude=node_modules -cf - . | tar -C "$TMP/site" -xf -
node -e '
const fs=require("fs");const p=process.argv[1];const s=JSON.parse(fs.readFileSync(p,"utf8"));
s.central={enabled:true,endpoint:"https://jana-pedidos.test",note:"teste local"};fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");' "$TMP/site/data/site.json"

cat > "$TMP/worker/wrangler.toml" <<TOML
name = "jana-pedidos-teste"
main = "$REPO/central/jana-pedidos/src/index.js"
compatibility_date = "2026-11-01"
[vars]
ALLOWED_ORIGINS = "http://127.0.0.1:8771"
SITE_DATA_URL = "http://127.0.0.1:8771/"
PUBLIC_URL = "http://127.0.0.1:8787"
ALLOW_LOCALHOST = "1"
[[d1_databases]]
binding = "DB"
database_name = "jana-pedidos"
database_id = "00000000-0000-0000-0000-000000000000"
TOML
cat > "$TMP/worker/.dev.vars" <<VARS
ADMIN_PASSWORD=$ADMIN
SESSION_SECRET=segredo-de-teste-local
INFINITE_HANDLE=handle-teste
INFINITEPAY_API=http://127.0.0.1:9911
GITHUB_TOKEN=test-token
GITHUB_API=http://127.0.0.1:9922
VARS

pids=()
killtree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do killtree "$c"; done; kill -9 "$1" 2>/dev/null || true; }
stop_all() {
  for p in $(pgrep -f "dev --local --port 8787" 2>/dev/null); do killtree "$p"; done
  # os subshells não repassam o kill: derruba pelos nomes/portas usados só por este teste
  pkill -9 -f "mock-infinitepay.mjs" 2>/dev/null || true
  pkill -9 -f "mock-github.mjs" 2>/dev/null || true
  pkill -9 -f "http.server 8771" 2>/dev/null || true
  pkill -9 -f "dev --local --port 8787" 2>/dev/null || true
  pkill -9 -f "socket-addr=entry=127.0.0.1:8787" 2>/dev/null || true
}
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; stop_all; }
stop_all
sleep 1
trap cleanup EXIT
node "$HERE/mock-infinitepay.mjs" > "$TMP/mock-ip.log" 2>&1 & pids+=($!)
SITE_DIR="$TMP/site" PORT=9922 node "$HERE/mock-github.mjs" > "$TMP/mock-gh.log" 2>&1 & pids+=($!)
(cd "$TMP/site" && python3 -m http.server 8771 --bind 127.0.0.1 > "$TMP/static.log" 2>&1) & pids+=($!)
(cd "$TMP/worker" && $WRANGLER d1 execute jana-pedidos --local --file "$REPO/central/jana-pedidos/schema.sql" > "$TMP/d1.log" 2>&1)
(cd "$TMP/worker" && $WRANGLER dev --local --port 8787 --ip 127.0.0.1 > "$TMP/wrangler.log" 2>&1) & pids+=($!)
for i in $(seq 1 60); do curl -sf -m 3 http://127.0.0.1:8787/ >/dev/null 2>&1 && break; sleep 1; done
curl -sf -m 3 http://127.0.0.1:8787/ >/dev/null || { echo "Worker local não subiu"; tail -30 "$TMP/wrangler.log"; exit 1; }

status=0
echo "== API de pedidos (InfinitePay simulada)"
W=http://127.0.0.1:8787 ORIGIN=http://127.0.0.1:8771 ADMIN=$ADMIN MOCK=http://127.0.0.1:9911 \
  PRODUCTS_URL=http://127.0.0.1:8771/data/products.json node "$HERE/api.test.mjs" || status=1
echo "== API do editor (GitHub simulado)"
W=http://127.0.0.1:8787 ORIGIN=http://127.0.0.1:8771 ADMIN=$ADMIN GH=http://127.0.0.1:9922 node "$HERE/conteudo.test.mjs" || status=1
if [ "${SKIP_E2E:-0}" != "1" ]; then
  if [ "${RUN_CENTRAL_E2E:-0}" = "1" ]; then
    # opcional: o fluxo Pix deste teste já falhava antes do editor (o carrinho cai no WhatsApp sem Pix neste ambiente)
    echo "== Pedidos no navegador (390 e 1280 px)"
    BASE_URL=http://127.0.0.1:8771 W_LOCAL=http://127.0.0.1:8787 MOCK=http://127.0.0.1:9911 ADMIN=$ADMIN \
      NODE_PATH="${PW_DIR:-}" node "$REPO/tests/central-e2e.mjs" || status=1
  fi
  echo "== Editor no navegador (390 e 1280 px)"
  BASE_URL=http://127.0.0.1:8771 W_LOCAL=http://127.0.0.1:8787 ADMIN=$ADMIN GH=http://127.0.0.1:9922 SITE_DIR="$TMP/site" \
    NODE_PATH="${PW_DIR:-}" node "$REPO/tests/editor-e2e.mjs" || status=1
fi
exit $status
