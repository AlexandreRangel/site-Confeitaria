// Verificações estáticas do Worker jana-pedidos (sem rede). Uso: node tests/check-central.mjs
import { readFileSync } from "node:fs";
import worker, { _test } from "../central/jana-pedidos/src/index.js";

const errors = [];
const check = (ok, name) => {
  if (!ok) errors.push(name);
};
const src = readFileSync(new URL("../central/jana-pedidos/src/index.js", import.meta.url), "utf8");
check(!/ADMIN_PASSWORD\s*=\s*["']|INFINITE_HANDLE\s*=\s*["']/.test(src), "sem segredos no código");
check(_test.NSU_RE.test(_test.generateNsu()), "NSU no formato JA-AAAAMMDD-XXXXXX");
check(_test.resolveTaxa({ entrega: { taxa: 40 } }, "entrega", "").taxa === 40, "taxa fixa");
check(_test.resolveTaxa({ entrega: { taxa: null } }, "entrega", "").pendente === true, "taxa a confirmar");
check(_test.resolveTaxa({ entrega: { taxa: 40 } }, "retirada", "").taxa === 0, "retirada sem taxa");
check(_test.fixedPrice({ price: 10 }) === 10 && _test.fixedPrice({ price: 0 }) === null, "preço fixo");
let threw = false;
try {
  _test.cleanItems([{ id: "x", quantity: 0 }]);
} catch (e) {
  threw = true;
}
check(threw, "quantidade 0 recusada");
const env = { ALLOWED_ORIGINS: "https://alexandrerangel.github.io", ALLOW_LOCALHOST: "0" };
check(_test.validRedirect(env, "https://alexandrerangel.github.io/site-Confeitaria/pagamento/"), "redirect do site aceito");
check(!_test.validRedirect(env, "https://evil.example/pagamento/"), "redirect de fora recusado");
const res = await worker.fetch(new Request("https://x.test/admin/pedidos"), Object.assign({ DB: null }, env), {});
check(res.status === 401, "admin sem login → 401");
const hook = await worker.fetch(
  new Request("https://x.test/webhook/infinitepay", { method: "POST", body: "{}" }),
  Object.assign({ DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) } }, env),
  {}
);
check(hook.status === 400, "webhook sem campos → 400");
if (errors.length) {
  console.error("central checks FAIL:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("central checks ok");
