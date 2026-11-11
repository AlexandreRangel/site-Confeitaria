// Testes de API do Worker. Uso: W=http://127.0.0.1:8787 ORIGIN=http://127.0.0.1:8765 ADMIN=... MOCK=http://127.0.0.1:9911 node test/api.test.mjs
const W = process.env.W;
const ORIGIN = process.env.ORIGIN;
const ADMIN = process.env.ADMIN;
const MOCK = process.env.MOCK || "";
let fails = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? "ok   " : "FAIL ") + name + (detail ? " — " + detail : ""));
  if (!cond) fails++;
};
async function call(method, path, body, headers) {
  const res = await fetch(W + path, {
    method,
    headers: Object.assign({ "Content-Type": "application/json", Origin: ORIGIN }, headers || {}),
    body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data, headers: res.headers };
}
const products = await (await fetch(process.env.PRODUCTS_URL)).json();
const p = products.find((x) => typeof x.price === "number" && x.price > 0 && x.active !== false);
const base = {
  nome: "Teste Automatizado", telefone: "61900000000", email: "teste@example.com",
  modalidade: "retirada", data: "2026-12-20", observacoes: "TESTE — ignorar",
  items: [{ id: p.id, name: p.name, price: p.price, quantity: 2, flavor: "" }],
};
const redirect = ORIGIN + (process.env.BASEPATH || "/") + "pagamento/";

// CORS
let r = await call("OPTIONS", "/pedidos", null, { Origin: "https://evil.example" });
ok("CORS recusa origem estranha", r.status === 403 && !r.headers.get("access-control-allow-origin"));
r = await call("OPTIONS", "/pedidos");
ok("CORS aceita origem do site", r.status === 204 && r.headers.get("access-control-allow-origin") === ORIGIN);
r = await call("POST", "/pedidos", Object.assign({ method: "pix" }, base), { Origin: "https://evil.example" });
ok("POST de origem estranha bloqueado", r.status === 403);

// validação
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "pix", telefone: "12" }));
ok("telefone inválido → 400", r.status === 400);
r = await call("POST", "/pedidos", "x".repeat(40000));
ok("corpo grande → 413", r.status === 413);
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "infinitepay", redirect_url: "https://evil.example/pagamento/" }));
ok("redirect_url de fora → 400", r.status === 400);

function ymdSP(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now || new Date());
  const map = {};
  parts.forEach((p) => { if (p.type !== "literal") map[p.type] = p.value; });
  return map.year + "-" + map.month + "-" + map.day;
}
function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (x) => ("0" + x).slice(-2);
  return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
}
const todaySP = ymdSP();
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "whatsapp", data: todaySP }));
ok("data de hoje recusada", r.status === 400 && /pelo menos 2 dias/.test((r.data && r.data.error) || ""), JSON.stringify(r.data));
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "whatsapp", data: addDaysYmd(todaySP, 1) }));
ok("data de amanhã recusada", r.status === 400);
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "whatsapp", data: addDaysYmd(todaySP, 2) }));
ok("data de hoje+2 aceita", r.status === 201, JSON.stringify(r.data && { status: r.status, error: r.data && r.data.error }));
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "whatsapp", data: "" }));
ok("data vazia continua opcional", r.status === 201);

// preço adulterado é corrigido pelo catálogo
r = await call("POST", "/pedidos", Object.assign({}, base, { method: "infinitepay", redirect_url: redirect, total: 0.02, createLink: !!MOCK,
  items: [{ id: p.id, name: p.name, price: 0.01, quantity: 2 }] }));
ok("cria pedido InfinitePay", r.status === 201 && /^JA-\d{8}-/.test(r.data.nsu), JSON.stringify(r.data && r.data.totals));
ok("total recalculado com preço oficial", r.data.totals.total === Math.round(p.price * 2 * 100) / 100);
const ip = r.data;
if (MOCK) ok("Worker criou link com webhook_url", /\/webhook\/infinitepay$/.test(ip.webhookUrl) && !!ip.checkoutUrl, ip.linkError);

// status público sem token não expõe dados
r = await call("GET", "/pedidos/" + ip.nsu + "/status");
ok("status pendente", r.status === 200 && r.data.paid === false && r.data.paymentStatus === "pendente" && !r.data.order);
r = await call("GET", "/pedidos/" + ip.nsu + "/status?t=" + ip.token);
ok("status com token traz detalhes", !!(r.data.order && r.data.order.clientName === base.nome));

// webhook falso NÃO marca pago
const fake = { invoice_slug: "slug-falso", amount: 1, paid_amount: 1, installments: 1, capture_method: "credit_card",
  transaction_nsu: "00000000-fake-fake-fake-000000000000", order_nsu: ip.nsu, receipt_url: "https://evil.example/r" };
r = await call("POST", "/webhook/infinitepay", fake, { Origin: "" });
ok("webhook falso recusado (400)", r.status === 400, JSON.stringify(r.data));
r = await call("GET", "/pedidos/" + ip.nsu + "/status");
ok("pedido continua pendente após webhook falso", r.data.paid === false && r.data.paymentStatus === "pendente");
r = await call("POST", "/webhook/infinitepay", { order_nsu: "JA-20260101-ZZZZZZ", transaction_nsu: "x", invoice_slug: "y" }, { Origin: "" });
ok("webhook de pedido inexistente não quebra", r.status === 200 || r.status === 400, String(r.status));

// retorno com parâmetros forjados também não marca pago
r = await call("GET", "/pedidos/" + ip.nsu + "/status?transaction_nsu=forjado&slug=forjado");
ok("retorno forjado continua pendente", r.data.paid === false && r.data.checked === true);

if (MOCK) {
  // pagamento simulado no mock (nunca real) → webhook verificado marca pago, idempotente
  const txn = "11111111-2222-3333-4444-555555555555";
  await fetch(MOCK + "/__pay", { method: "POST", body: JSON.stringify({ order_nsu: ip.nsu, transaction_nsu: txn, slug: "slug-ok", amount: Math.round(p.price * 200) }) });
  const real = Object.assign({}, fake, { transaction_nsu: txn, invoice_slug: "slug-ok", receipt_url: "https://comprovante.example/1" });
  r = await call("POST", "/webhook/infinitepay", real, { Origin: "" });
  ok("webhook verificado marca pago", r.status === 200 && r.data.paid === true && !r.data.already);
  r = await call("POST", "/webhook/infinitepay", real, { Origin: "" });
  ok("webhook repetido é idempotente", r.status === 200 && r.data.already === true);
  r = await call("GET", "/pedidos/" + ip.nsu + "/status?t=" + ip.token);
  ok("status pago", r.data.paid === true && r.data.captureMethod === "credit_card" && r.data.order.receiptUrl === "https://comprovante.example/1");
}

if (MOCK) {
  r = await call("POST", "/pedidos", Object.assign({}, base, { method: "infinitepay", redirect_url: redirect, nome: "E2E Rejeita" }));
  ok("422 da InfinitePay por cliente → refaz sem customer", r.status === 201 && !!r.data.checkoutUrl, r.data.linkError);
  await call("POST", "/admin/login", { password: ADMIN });
}

// Pix
r = await call("POST", "/pedidos", Object.assign({ method: "pix", declared: true, total: p.price * 2 }, base));
ok("Pix registrado como declarado", r.status === 201 && r.data.paymentStatus === "declarado");
const pix = r.data;
r = await call("POST", "/webhook/infinitepay", Object.assign({}, fake, { order_nsu: pix.nsu }), { Origin: "" });
r = await call("GET", "/pedidos/" + pix.nsu + "/status");
ok("webhook não muda pedido Pix", r.data.paid === false);
r = await call("POST", "/pedidos", Object.assign({ method: "whatsapp" }, base), { "Idempotency-Key": "idem-teste-" + Date.now() });
const idemKey = "idem-fixo-" + Date.now();
const a = await call("POST", "/pedidos", Object.assign({ method: "whatsapp" }, base), { "Idempotency-Key": idemKey });
const b = await call("POST", "/pedidos", Object.assign({ method: "whatsapp" }, base), { "Idempotency-Key": idemKey });
ok("Idempotency-Key não duplica", a.data.nsu === b.data.nsu && b.data.duplicate === true);

// admin
r = await call("GET", "/admin/pedidos");
ok("admin sem login → 401", r.status === 401);
r = await call("GET", "/admin/pedidos", null, { Authorization: "Bearer adm.9999999999999.abc.def" });
ok("admin com token forjado → 401", r.status === 401);
r = await call("POST", "/admin/login", { password: "errada" });
ok("senha errada → 401", r.status === 401);
r = await call("POST", "/admin/login", { password: ADMIN });
ok("login correto", r.status === 200 && !!r.data.token);
const auth = { Authorization: "Bearer " + r.data.token };
r = await call("GET", "/admin/pedidos", null, auth);
ok("lista pedidos", r.status === 200 && r.data.orders.some((o) => o.id === ip.nsu));
r = await call("PATCH", "/admin/pedidos/" + pix.nsu, { status: "confirmado", paymentStatus: "pago", notes: "conferido", desiredDate: todaySP }, auth);
ok("edita pedido", r.status === 200 && r.data.order.status === "confirmado" && r.data.order.paymentStatus === "pago");
ok("painel pode gravar data de hoje", r.status === 200 && r.data.order.desiredDate === todaySP, r.data && r.data.order && r.data.order.desiredDate);
r = await call("PATCH", "/admin/pedidos/" + pix.nsu, { status: "hackeado" }, auth);
ok("status inválido → 400", r.status === 400);
r = await call("GET", "/admin/clientes", null, auth);
const cli = r.data.clients.find((c) => c.telefone === "61900000000");
ok("lista clientes", r.status === 200 && !!cli);
r = await call("PATCH", "/admin/clientes/" + cli.id, { nome: "Teste Editado" }, auth);
ok("edita cliente", r.status === 200 && r.data.client.nome === "Teste Editado");
// limpeza dos dados de teste
const all = (await call("GET", "/admin/pedidos", null, auth)).data.orders.filter((o) => o.notes === "TESTE — ignorar" || o.notes === "conferido" || o.clientName === "E2E Rejeita");
let deleted = 0;
for (const o of all) { const d = await call("DELETE", "/admin/pedidos/" + o.id, null, auth); if (d.status === 200) deleted++; }
ok("exclui pedidos de teste", deleted === all.length, deleted + " excluídos");
r = await call("DELETE", "/admin/clientes/" + cli.id, null, auth);
ok("exclui cliente de teste", r.status === 200);
r = await call("GET", "/pedidos/" + ip.nsu + "/status");
ok("pedido excluído some", r.status === 404);

console.log(fails ? fails + " FALHA(S)" : "TODOS OK");
process.exit(fails ? 1 : 0);
