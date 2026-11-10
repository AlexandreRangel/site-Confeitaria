// E2E do site com o Worker jana-pedidos.
// Modo local (padrão): Worker em wrangler dev (W_LOCAL) + mock da InfinitePay (MOCK). Nada real é pago ou enviado.
// Modo produção (PROD=1): usa o Worker publicado; a navegação para checkout.infinitepay.io é interceptada.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8770";
const PROD = process.env.PROD === "1";
const W = PROD ? "https://jana-pedidos.janaabreu.workers.dev" : process.env.W_LOCAL || "http://127.0.0.1:8787";
const ENDPOINT = PROD ? W : "https://jana-pedidos.test";
const MOCK = process.env.MOCK || "http://127.0.0.1:9911";
const ADMIN = process.env.ADMIN || "";
const errors = [];
const record = (vp, name, ok, detail) => {
  const line = (ok ? "ok   " : "FAIL ") + "[" + vp + "] " + name + (detail ? " — " + detail : "");
  console.log(line);
  if (!ok) errors.push(line);
};

async function setup(browser, viewport, opts) {
  const options = opts || {};
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const page = await context.newPage();
  const hits = { wa: [], checkout: [], worker: [] };
  await page.route(/wa\.me|api\.whatsapp\.com/, (route) => {
    hits.wa.push(route.request().url());
    return route.abort();
  });
  context.on("page", (p) => {
    if (/wa\.me|whatsapp/.test(p.url())) hits.wa.push(p.url());
    p.close().catch(() => {});
  });
  await page.route("**/data/site.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.central = { enabled: true, endpoint: ENDPOINT, note: "teste" };
    return route.fulfill({ response, body: JSON.stringify(data), headers: { "content-type": "application/json" } });
  });
  await page.route("**/data/pix.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, chave: "teste@exemplo.com", nome: "JANA ABREU", cidade: "BRASILIA" }) })
  );
  if (!PROD) {
    await page.route("**/data/pagamento.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ infinitepay: { enabled: true, handle: "handle-teste" } }) })
    );
    await page.route("https://jana-pedidos.test/**", async (route) => {
      const req = route.request();
      hits.worker.push(req.method() + " " + req.url());
      if (options.workerDown) return route.abort("connectionrefused");
      const url = req.url().replace("https://jana-pedidos.test", W);
      if (req.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": BASE, "access-control-allow-headers": "Content-Type, Authorization, Idempotency-Key", "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS" } });
      }
      const response = await route.fetch({ url, headers: Object.assign({}, req.headers(), { origin: BASE }) });
      return route.fulfill({ response });
    });
    // payment_check direto (fallback do navegador) também vai para o mock
    await page.route("https://api.checkout.infinitepay.io/**", async (route) => {
      const req = route.request();
      const url = req.url().replace("https://api.checkout.infinitepay.io", MOCK);
      const response = await route.fetch({ url });
      return route.fulfill({ response, headers: { "access-control-allow-origin": "*", "content-type": "application/json" } });
    });
  } else {
    page.on("request", (req) => {
      if (req.url().startsWith(W)) hits.worker.push(req.method() + " " + req.url());
      if (/api\.checkout\.infinitepay\.io\/links/.test(req.url())) hits.directApi = true;
    });
  }
  // "Checkout" da InfinitePay: interceptado. No modo local simula o pagamento no mock e volta ao site.
  await page.route("https://checkout.infinitepay.io/**", async (route) => {
    const url = route.request().url();
    hits.checkout.push(url);
    if (PROD || !options.simulatePay) return route.abort();
    const nsu = url.split("/").pop();
    const txn = "e2e-" + Date.now();
    await fetch(MOCK + "/__pay", { method: "POST", body: JSON.stringify({ order_nsu: nsu, transaction_nsu: txn, slug: "slug-e2e", amount: options.amount || 0 }) });
    hits.paid = { nsu, txn };
    // webhook falso antes do retorno: não pode marcar pago
    const fake = await fetch(W + "/webhook/infinitepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_nsu: nsu, transaction_nsu: "forjado", invoice_slug: "forjado", amount: 1, paid_amount: 1 }) });
    hits.fakeWebhookStatus = fake.status;
    const st = await (await fetch(W + "/pedidos/" + nsu + "/status")).json();
    hits.afterFake = st.paymentStatus;
    const back = BASE + "/pagamento/?order_nsu=" + nsu + "&slug=slug-e2e&transaction_nsu=" + txn + "&capture_method=credit_card&receipt_url=" + encodeURIComponent("https://comprovante.example/e2e");
    return route.fulfill({ status: 302, headers: { location: back } });
  });
  return { context, page, hits };
}

async function fillCart(page, nome) {
  await page.goto(BASE + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
  await page.locator('[data-action="add-from-product"]').click();
  await page.waitForSelector("#encomendas:not([hidden])");
  await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
  await page.locator('#checkout-form [name="nome"]').fill(nome);
  await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
  const obs = page.locator('#checkout-form [name="observacoes"]');
  if (await obs.count()) await obs.fill("TESTE E2E — ignorar");
}

async function adminToken() {
  const r = await fetch(W + "/admin/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://alexandrerangel.github.io" }, body: JSON.stringify({ password: ADMIN }) });
  return (await r.json()).token;
}

async function workerOrders() {
  const token = await adminToken();
  const r = await fetch(W + "/admin/pedidos", { headers: { Authorization: "Bearer " + token } });
  return { token, orders: (await r.json()).orders || [] };
}

async function cleanup() {
  const { token, orders } = await workerOrders();
  let n = 0;
  for (const o of orders.filter((x) => /^E2E /.test(x.clientName) || /TESTE E2E/.test(x.notes))) {
    await fetch(W + "/admin/pedidos/" + o.id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
    n++;
  }
  const cl = await (await fetch(W + "/admin/clientes", { headers: { Authorization: "Bearer " + token } })).json();
  for (const c of (cl.clients || []).filter((x) => /^E2E /.test(x.nome) || x.telefone === "61900000000")) {
    await fetch(W + "/admin/clientes/" + c.id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  }
  return n;
}

const exe = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch(existsSync(exe) ? { headless: true, executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : { headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const vp = String(viewport.width);
    // 1) Cartão: pedido criado no Worker antes de sair do site
    {
      const { context, page, hits } = await setup(browser, viewport, { simulatePay: true, amount: 46700 });
      await fillCart(page, "E2E Cartao " + vp);
      await page.locator('[data-bind="pay-option-infinitepay"]').click();
      const checked = await page.locator('#checkout-form input[name="pagamento"][value="infinitepay"], #checkout-form [data-bind="pay-option-infinitepay"] input').first().isChecked().catch(() => null);
      const label = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
      record(vp, "opção cartão continua marcada", label === "Pagar com cartão", label + " checked=" + checked);
      await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(() => {});
      if (PROD) {
        await page.waitForTimeout(6000);
        const post = hits.worker.find((h) => /^POST .*\/pedidos$/.test(h));
        record(vp, "carrinho criou o pedido no Worker", !!post, hits.worker.join(" | "));
        record(vp, "Worker devolveu link real da InfinitePay (navegação interceptada)", hits.checkout.length >= 1 && hits.checkout.every((u) => /^https:\/\/checkout\.infinitepay\.io\//.test(u)), hits.checkout.length + " navegação(ões)");
        const { orders } = await workerOrders();
        const o = orders.find((x) => x.clientName === "E2E Cartao " + vp);
        record(vp, "pedido pendente no Worker com preço oficial", !!o && o.paymentStatus === "pendente" && o.paymentMethod === "infinitepay" && o.priceVerified && o.total > 0, o && o.paymentStatus + " R$ " + o.total);
        record(vp, "link criado pelo Worker (sem chamada direta do navegador à API)", !hits.directApi, "");
      } else {
        await page.waitForURL(/\/pagamento\//, { timeout: 15000 });
        await page.waitForSelector("text=Pagamento confirmado", { timeout: 15000 }).catch(async (e) => {
          console.log("DEBUG worker hits:", hits.worker, "checkout:", hits.checkout, "title:", await page.locator("h1").first().textContent());
          throw e;
        });
        record(vp, "webhook falso recusado e pedido seguiu pendente", hits.fakeWebhookStatus === 400 && hits.afterFake === "pendente", hits.fakeWebhookStatus + "/" + hits.afterFake);
        record(vp, "checkout do Worker usado (com webhook_url)", hits.checkout.length === 1, hits.checkout[0]);
        const st = await (await fetch(W + "/pedidos/" + hits.paid.nsu + "/status")).json();
        record(vp, "retorno confirmou pelo Worker e gravou pago", st.paid === true && st.captureMethod === "credit_card");
        await page.waitForSelector('[data-bind="pagamento-whatsapp"]:not([hidden])', { timeout: 5000 });
        const href = decodeURIComponent((await page.locator('[data-bind="pagamento-whatsapp"]').getAttribute("href")) || "");
        await page.waitForTimeout(1500);
        record(vp, "WhatsApp aberto automaticamente (interceptado)", hits.wa.length >= 1, String(hits.wa.length));
        record(vp, "WhatsApp (interceptado) com PAGO e comprovante", /PAGO via InfinitePay/.test(href) && /comprovante\.example\/e2e/.test(href) && /E2E Cartao/.test(href), href.slice(0, 80));
        const links = await (await fetch(MOCK + "/__links")).json();
        const last = links.find((l) => l.order_nsu === hits.paid.nsu);
        record(vp, "link criado com webhook_url do Worker e preço oficial", !!last && /\/webhook\/infinitepay$/.test(last.webhook_url) && last.items[0].price === 46700, last && last.webhook_url);
      }
      await context.close();
    }
    if (PROD) continue;
    // 2) Worker fora do ar: carrinho ainda abre pagamento (link direto) e retorno usa payment_check direto
    {
      const { context, page, hits } = await setup(browser, viewport, { workerDown: true, simulatePay: true, amount: 46700 });
      await page.route("https://api.checkout.infinitepay.io/links", async (route) => {
        const body = route.request().postDataJSON();
        hits.directLink = body;
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ url: "https://checkout.infinitepay.io/mock/" + body.order_nsu }) });
      });
      await fillCart(page, "E2E Fallback " + vp);
      await page.locator('[data-bind="pay-option-infinitepay"]').click();
      await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(() => {});
      await page.waitForURL(/\/pagamento\//, { timeout: 20000 });
      await page.waitForSelector("text=Pagamento confirmado", { timeout: 15000 });
      record(vp, "Worker fora: link direto com webhook_url e retorno confirmado via payment_check", !!hits.directLink && /\/webhook\/infinitepay$/.test(hits.directLink.webhook_url || ""), hits.directLink && hits.directLink.webhook_url);
      await context.close();
    }
    // 3) Pix "Já paguei" registra declarado
    {
      const { context, page, hits } = await setup(browser, viewport);
      await fillCart(page, "E2E Pix " + vp);
      await page.locator('[data-bind="pay-option-pix"]').click();
      for (let i = 0; i < 2 && !hits.wa.length; i++) {
        await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(2500);
      }
      const { orders } = await workerOrders();
      const o = orders.find((x) => x.clientName === "E2E Pix " + vp);
      record(vp, "Pix registrado no Worker como declarado", !!o && o.paymentMethod === "pix" && o.paymentStatus === "declarado", o && o.paymentStatus);
      const wa = decodeURIComponent(hits.wa[0] || "");
      record(vp, "WhatsApp Pix (interceptado) traz o número do pedido", !!o && wa.indexOf(o.orderNsu) !== -1, wa.slice(0, 60));
      await context.close();
    }
    // 4) Painel: login, lista compartilhada, editar, excluir
    {
      const { context, page } = await setup(browser, viewport);
      page.on("dialog", (d) => d.accept());
      await page.goto(BASE + "/painel/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-bind="central-login"]:not([hidden])');
      await page.locator('[data-bind="central-login"] input[name="password"]').fill("senha-errada");
      await page.locator('[data-bind="central-login"] [type="submit"]').click();
      await page.waitForFunction(() => /incorreta/.test(document.querySelector('[data-bind="central-result"]').textContent));
      record(vp, "painel recusa senha errada", true);
      await page.locator('[data-bind="central-login"] input[name="password"]').fill(ADMIN);
      await page.locator('[data-bind="central-login"] [type="submit"]').click();
      await page.waitForSelector('[data-bind="central-session"]:not([hidden])', { timeout: 10000 });
      const modo = await page.locator('[data-bind="painel-modo"]').textContent();
      const rows = await page.locator('[data-bind="orders-body"] tr').count();
      record(vp, "painel carrega lista compartilhada", /compartilhada/.test(modo) && rows >= 2, modo + " rows=" + rows);
      const row = page.locator('[data-bind="orders-body"] tr', { hasText: "E2E Pix " + vp }).first();
      await row.click();
      await page.locator('[data-bind="detail-status"]').selectOption("confirmado");
      await page.waitForFunction(() => /salvo/.test(document.querySelector('[data-bind="central-result"]').textContent));
      let { orders } = await workerOrders();
      record(vp, "status editado no Worker", orders.some((x) => x.clientName === "E2E Pix " + vp && x.status === "confirmado"));
      await page.locator('[data-bind="order-detail"] [data-action="edit-order"]').click();
      await page.locator('[data-bind="edit-notes"]').fill("TESTE E2E — editado no painel");
      await page.locator('[data-bind="detail-edit-form"] [type="submit"]').click();
      await page.waitForTimeout(1500);
      ({ orders } = await workerOrders());
      record(vp, "edição salva no Worker", orders.some((x) => x.clientName === "E2E Pix " + vp && /editado no painel/.test(x.notes)));
      await page.locator('[data-bind="order-detail"] [data-action="delete-order"]').click();
      await page.waitForFunction(() => /excluído/.test(document.querySelector('[data-bind="central-result"]').textContent));
      ({ orders } = await workerOrders());
      record(vp, "exclusão no Worker", !orders.some((x) => x.clientName === "E2E Pix " + vp));
      await page.locator('[data-tab="clientes"]').click();
      const cliRows = await page.locator('[data-bind="clients-body"] tr [data-action="delete-client"]').count();
      record(vp, "clientes com editar/excluir", cliRows >= 1, String(cliRows));
      const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('[data-tab="pedidos"]').click().then(() => page.locator('[data-action="export-orders-csv"]').click())]);
      record(vp, "exporta CSV", /pedidos-jana-abreu\.csv/.test(dl.suggestedFilename()));
      await context.close();
    }
    // 5) Painel com Worker fora do ar: mensagem clara
    {
      const { context, page } = await setup(browser, viewport, { workerDown: true });
      await page.goto(BASE + "/painel/", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => localStorage.setItem("jana-abreu-admin-session-v2", JSON.stringify({ token: "adm.1.x.y", expiresAt: new Date(Date.now() + 3600e3).toISOString() })));
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => /fora do ar/.test(document.querySelector('[data-bind="central-result"]').textContent), null, { timeout: 10000 });
      const msg = await page.locator('[data-bind="central-result"]').textContent();
      record(vp, "Worker fora: painel avisa e mostra pedidos locais", /fora do ar/.test(msg) && /neste navegador/.test(msg), msg);
      await context.close();
    }
  }
} finally {
  await browser.close();
  const removed = await cleanup().catch((e) => "erro " + e.message);
  console.log("limpeza: " + removed + " pedido(s) de teste removidos");
}
console.log(errors.length ? errors.length + " FALHA(S)" : "E2E OK");
process.exit(errors.length ? 1 : 0);
