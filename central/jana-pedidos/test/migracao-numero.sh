#!/usr/bin/env bash
# Testa a migração do número curto do pedido num D1 LOCAL (nada em produção):
#  1) banco no formato antigo (sem order_number) com pedidos antigos fora de ordem de seq;
#  2) Worker novo sobe, numera os antigos em ordem de criação (1001…) e segue a sequência;
#  3) 30 pedidos simultâneos (junto com a primeira carga) recebem números únicos e seguidos;
#  4) o SQL manual (migrations/0003_order_number.sql) dá o mesmo resultado num banco antigo.
# Uso: WRANGLER=/caminho/wrangler bash central/jana-pedidos/test/migracao-numero.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
TMP="${TMP_DIR:-/tmp/jana-numero-test}"
WRANGLER="${WRANGLER:-npx wrangler}"
PORT="${PORT:-8797}"
rm -rf "$TMP" && mkdir -p "$TMP/a" "$TMP/b"
# esquema antigo = schema.sql sem a numeração
python3 - "$REPO/central/jana-pedidos/schema.sql" "$TMP/old-schema.sql" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = s.replace(",\n  order_number INTEGER\n);", "\n);")
s = re.sub(r"CREATE TABLE IF NOT EXISTS order_counter \(.*?\);\n", "", s, flags=re.S)
s = "\n".join(l for l in s.split("\n") if "order_number" not in l and "order_counter" not in l and "Número curto" not in l)
open(sys.argv[2], "w").write(s)
PY
if grep -q "order_number\|order_counter" "$TMP/old-schema.sql"; then echo "esquema antigo ainda tem a numeração"; exit 1; fi
cat > "$TMP/seed.sql" <<'SQL'
INSERT INTO orders (nsu, token_hash, created_at, updated_at, method, status, payment_status, client_name, notes)
VALUES ('JA-20261116-LDVCYX', 'x', '2026-11-16T20:37:59.979Z', '2026-11-16T20:37:59.979Z', 'pix', 'confirmado', 'declarado', 'Segundo', ''),
       ('JA-20261121-D2XA8S', 'x', '2026-11-21T19:07:29.543Z', '2026-11-21T19:07:29.543Z', 'pix', 'aguardando pagamento', 'declarado', 'Terceiro', ''),
       ('JA-LOCAL-PED-1101', 'x', '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z', 'whatsapp', 'solicitado', 'a_combinar', 'Primeiro (importado)', '');
SQL
for d in a b; do
  cat > "$TMP/$d/wrangler.toml" <<TOML
name = "jana-pedidos-numero-$d"
main = "$REPO/central/jana-pedidos/src/index.js"
compatibility_date = "2026-11-01"
[vars]
ALLOWED_ORIGINS = "http://127.0.0.1:8771"
SITE_DATA_URL = "http://127.0.0.1:1/"
PUBLIC_URL = "http://127.0.0.1:$PORT"
ALLOW_LOCALHOST = "1"
[[d1_databases]]
binding = "DB"
database_name = "jana-pedidos"
database_id = "00000000-0000-0000-0000-00000000000$([ $d = a ] && echo 1 || echo 2)"
TOML
  (cd "$TMP/$d" && $WRANGLER d1 execute jana-pedidos --local --file "$TMP/old-schema.sql" >/dev/null 2>&1)
  (cd "$TMP/$d" && $WRANGLER d1 execute jana-pedidos --local --file "$TMP/seed.sql" >/dev/null 2>&1)
done
printf 'ADMIN_PASSWORD=senha-local\nSESSION_SECRET=segredo-local\n' > "$TMP/a/.dev.vars"

status=0
echo "== SQL manual (0003) num banco antigo"
(cd "$TMP/b" && $WRANGLER d1 execute jana-pedidos --local --file "$REPO/central/jana-pedidos/migrations/0003_order_number.sql" >/dev/null 2>&1)
out=$(cd "$TMP/b" && $WRANGLER d1 execute jana-pedidos --local --json --command "SELECT nsu, order_number FROM orders ORDER BY order_number" 2>/dev/null)
node -e '
const r = JSON.parse(process.argv[1])[0].results.map((x) => x.nsu + "=" + x.order_number).join(" ");
const want = "JA-LOCAL-PED-1101=1001 JA-20261116-LDVCYX=1002 JA-20261121-D2XA8S=1003";
console.log((r === want ? "ok   " : "FAIL ") + "SQL manual numera em ordem de criação — " + r);
process.exit(r === want ? 0 : 1);' "$out" || status=1

echo "== Worker novo num banco antigo"
(cd "$TMP/a" && exec $WRANGLER dev --local --port "$PORT" --ip 127.0.0.1 > "$TMP/wrangler.log" 2>&1) &
WPID=$!
killtree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do killtree "$c"; done; kill -9 "$1" 2>/dev/null || true; }
cleanup() { killtree "$WPID"; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -s -m 3 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 1; done
W="http://127.0.0.1:$PORT" node - <<'JS' || status=1
const W = process.env.W;
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "ok   " : "FAIL ") + n + (d ? " — " + d : "")); if (!c) fails++; };
const call = async (method, path, body, headers) => {
  const res = await fetch(W + path, { method, headers: Object.assign({ "Content-Type": "application/json", Origin: "http://127.0.0.1:8771" }, headers || {}), body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
};
const login = await call("POST", "/admin/login", { password: "senha-local" });
const auth = { Authorization: "Bearer " + login.data.token };
const base = { method: "whatsapp", nome: "Concorrente", telefone: "61900000000", modalidade: "retirada", observacoes: "teste local" };
const [, ...burst] = await Promise.all([call("GET", "/admin/pedidos", null, auth)].concat(
  Array.from({ length: 30 }, (_, i) => call("POST", "/pedidos", Object.assign({}, base, { nome: "Concorrente " + i })))));
ok("30 pedidos simultâneos criados", burst.every((r) => r.status === 201), burst.filter((r) => r.status !== 201).map((r) => r.status + ":" + (r.data && r.data.error)).join(","));
const nums = burst.map((r) => Number(r.data.number)).sort((a, b) => a - b);
ok("números simultâneos únicos e seguidos, depois dos antigos", new Set(nums).size === 30 && nums[0] === 1004 && nums[29] === 1033, nums.join(","));
const list = await call("GET", "/admin/pedidos", null, auth);
const by = Object.fromEntries(list.data.orders.map((o) => [o.id, o.number]));
ok("antigos numerados em ordem de criação", by["JA-LOCAL-PED-1101"] === "1001" && by["JA-20261116-LDVCYX"] === "1002" && by["JA-20261121-D2XA8S"] === "1003", JSON.stringify([by["JA-LOCAL-PED-1101"], by["JA-20261116-LDVCYX"], by["JA-20261121-D2XA8S"]]));
ok("todos os pedidos têm número", list.data.orders.every((o) => /^\d{4,}$/.test(o.number)));
const st = await call("GET", "/pedidos/JA-20261121-D2XA8S/status");
ok("status público traz o número", st.data.number === "1003", st.data.number);
process.exit(fails ? 1 : 0);
JS
exit $status
