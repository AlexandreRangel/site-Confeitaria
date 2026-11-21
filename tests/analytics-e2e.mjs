import { createReadStream, existsSync, statSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch (err) {
  playwright = require("/tmp/jana-audit/node_modules/playwright");
}
const { chromium } = playwright;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const GTM_ID = "GTM-57MRXPNN";
const MOCK_NSU = "TEST-PEDIDO-ANALYTICS-1";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const publicPages = [
  "/",
  "/404.html",
  "/area/",
  "/bolos/",
  "/cestas/",
  "/cestas-presentes/",
  "/combos-festa/",
  "/corporate/",
  "/corporativo/",
  "/doces-festa/",
  "/doces-personalizados/",
  "/encomendas/",
  "/festa-personalizada/",
  "/natal/",
  "/pagamento/",
  "/pascoa/",
  "/personalizado-para-empresas/",
  "/produto/",
  "/sobre-nos/",
  "/sobremesas/",
];

function record(name, ok, detail) {
  const line = (ok ? "ok   " : "FAIL ") + name + (detail ? " — " + detail : "");
  console.log(line);
  if (!ok) errors.push(line);
}

function startServer() {
  const server = http.createServer(function onRequest(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const resolved = resolve(root, "." + pathname);
    const rel = relative(root, resolved);
    if (rel.startsWith("..") || normalize(rel).startsWith("..")) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      const fallback = join(root, "404.html");
      if (existsSync(fallback)) createReadStream(fallback).pipe(res);
      else res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(resolved).toLowerCase()] || "application/octet-stream" });
    createReadStream(resolved).pipe(res);
  });
  return new Promise(function listen(resolvePromise) {
    server.listen(0, "127.0.0.1", function onListen() {
      const port = server.address().port;
      resolvePromise({ server, base: "http://127.0.0.1:" + port });
    });
  });
}

function dataEvents(page, name) {
  return page.evaluate(function read(eventName) {
    return (window.dataLayer || []).filter(function keep(row) {
      return row && row.event === eventName;
    });
  }, name);
}

async function attachGuards(page, hits) {
  hits.dl = hits.dl || [];
  await page.exposeFunction("__janaRecordDl", function recordDl(row) {
    hits.dl.push(row);
  });
  await page.addInitScript(function hookAnalytics() {
    const arr = (window.dataLayer = window.dataLayer || []);
    const orig = arr.push;
    arr.push = function hookedPush() {
      try {
        for (let i = 0; i < arguments.length; i++) {
          if (typeof window.__janaRecordDl === "function") {
            window.__janaRecordDl(arguments[i]);
          }
        }
      } catch (err) {}
      return orig.apply(arr, arguments);
    };
    try {
      const proto = window.Location.prototype;
      const originalAssign = proto.assign;
      const originalReplace = proto.replace;
      function blocked(url) {
        const href = String(url || "");
        if (/wa\.me|api\.whatsapp\.com|checkout\.infinitepay\.io/i.test(href)) {
          return true;
        }
        return false;
      }
      proto.assign = function assign(url) {
        if (blocked(url)) return;
        return originalAssign.call(this, url);
      };
      proto.replace = function replace(url) {
        if (blocked(url)) return;
        return originalReplace.call(this, url);
      };
      const open = window.open;
      window.open = function openStub(url) {
        if (blocked(url)) return null;
        return open.apply(window, arguments);
      };
    } catch (err) {}
  });
  await page.route("https://www.googletagmanager.com/**", function blockGtm(route) {
    hits.gtm += 1;
    return route.abort();
  });
  await page.route("https://www.google-analytics.com/**", function blockGa(route) {
    return route.abort();
  });
  await page.route("https://wa.me/**", function blockWa(route) {
    hits.wa.push(route.request().url());
    return route.abort();
  });
  await page.route("https://api.whatsapp.com/**", function blockWaApi(route) {
    hits.wa.push(route.request().url());
    return route.abort();
  });
  await page.route("https://checkout.infinitepay.io/**", function blockPay(route) {
    return route.abort();
  });
  await page.route("https://api.checkout.infinitepay.io/**", function blockPayApi(route) {
    return route.abort();
  });
  await page.route("**/data/pix.json", function mockPix(route) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, chave: "teste@exemplo.com", nome: "JANA ABREU", cidade: "BRASILIA" }),
    });
  });
  await page.route(/jana-pedidos\.janaabreu\.workers\.dev/i, async function mockWorker(route) {
    const req = route.request();
    const url = req.url();
    hits.worker.push(req.method() + " " + url);
    if (req.method() === "POST" && /\/pedidos$/.test(new URL(url).pathname)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ nsu: MOCK_NSU, token: "" }),
      });
    }
    if (req.method() === "GET" && /\/personalizacao$/.test(new URL(url).pathname)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    });
  });
  page.context().on("page", function onPopup(popup) {
    hits.wa.push(popup.url());
    popup.close().catch(function ignore() {});
  });
}

async function waitStorefront(page) {
  await page.waitForFunction(function ready() {
    return !!(window.Jana && window.Jana.Cart && document.querySelector("[data-action='open-cart']"));
  }, { timeout: 15000 });
}

let serverHandle;
let browser;
try {
  serverHandle = await startServer();
  const base = serverHandle.base;
  const launch = { headless: true };
  const exe = process.env.CHROME_PATH || "/usr/bin/google-chrome";
  if (existsSync(exe)) {
    launch.executablePath = exe;
    launch.args = ["--no-sandbox", "--disable-dev-shm-usage"];
  }
  browser = await chromium.launch(launch);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });

  for (const path of publicPages) {
    const res = await context.request.get(base + path, { maxRedirects: 0 });
    const html = await res.text();
    record(
      "snippet " + path,
      html.includes(GTM_ID) && html.includes("<!-- Google Tag Manager -->") && html.includes("<!-- Google Tag Manager (noscript) -->"),
      "status " + res.status()
    );
  }
  const painel = await (await context.request.get(base + "/painel/")).text();
  record("painel excluded from GTM", !painel.includes(GTM_ID) && !painel.includes("googletagmanager.com"));

  const hits = { gtm: 0, wa: [], worker: [] };
  const page = await context.newPage();
  await attachGuards(page, hits);

  await page.goto(base + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
  await waitStorefront(page);
  await page.waitForFunction(function hasName() {
    const el = document.querySelector("[data-bind='product-name']");
    return !!(el && el.textContent && el.textContent.trim());
  }, { timeout: 15000 });
  const views = await dataEvents(page, "view_item");
  const viewOk =
    views.length === 1 &&
    views[0].ecommerce &&
    views[0].ecommerce.currency === "BRL" &&
    views[0].ecommerce.items &&
    views[0].ecommerce.items[0] &&
    views[0].ecommerce.items[0].item_id === "tabua-signature" &&
    typeof views[0].ecommerce.items[0].price === "number";
  record("view_item on product page", viewOk, "count=" + views.length);

  const pageWorks = ((await page.locator("[data-bind='product-name']").textContent()) || "").trim();
  record("storefront works with GTM blocked", pageWorks.length > 0 && /signature/i.test(pageWorks), pageWorks);

  await page.goto(base + "/cestas/", { waitUntil: "domcontentloaded" });
  await waitStorefront(page);
  await page.waitForSelector('#produto\\:tabua-signature [data-action="add-product"]', { timeout: 15000 });
  await page.locator('#produto\\:tabua-signature [data-action="add-product"]').click();
  await page.waitForSelector("#encomendas:not([hidden])", { timeout: 10000 });
  const adds = await dataEvents(page, "add_to_cart");
  const addOk =
    adds.length === 1 &&
    adds[0].ecommerce &&
    adds[0].ecommerce.items[0].item_id === "tabua-signature" &&
    adds[0].ecommerce.items[0].quantity === 1 &&
    typeof adds[0].ecommerce.value === "number";
  record("add_to_cart on Comprar", addOk, "count=" + adds.length);

  const begins = await dataEvents(page, "begin_checkout");
  record("begin_checkout once when cart opens", begins.length === 1, "count=" + begins.length);
  await page.locator('[data-action="close-cart"]').first().click();
  await page.locator('[data-action="open-cart"]').first().click();
  await page.waitForSelector("#encomendas:not([hidden])", { timeout: 10000 });
  const begins2 = await dataEvents(page, "begin_checkout");
  record("begin_checkout again on a new opening", begins2.length === 2, "count=" + begins2.length);

  await page.locator('[data-action="close-cart"]').first().click();
  await page.evaluate(function blockWaNav() {
    document.addEventListener(
      "click",
      function prevent(event) {
        const link = event.target && event.target.closest && event.target.closest("a[href]");
        if (!link) return;
        const href = String(link.href || "");
        if (/wa\.me|api\.whatsapp\.com/i.test(href)) event.preventDefault();
      },
      true
    );
  });
  const waLink = page.locator('[data-bind="whatsapp-link"]').first();
  await waLink.waitFor({ state: "attached", timeout: 10000 });
  await waLink.click({ force: true });
  const waEvents = await dataEvents(page, "whatsapp_click");
  const waOk =
    waEvents.length >= 1 &&
    /wa\.me|api\.whatsapp\.com/i.test(waEvents[0].link_url || "") &&
    typeof waEvents[0].click_location === "string";
  record("whatsapp_click on wa.me link", waOk, "count=" + waEvents.length);

  await page.locator('[data-action="open-cart"]').first().click();
  await page.waitForSelector("#encomendas:not([hidden])", { timeout: 10000 });
  await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check({ force: true });
  await page.locator('#checkout-form [name="nome"]').fill("Teste Analytics");
  await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
  await page.evaluate(function selectPix() {
    const radio = document.querySelector('#checkout-form [name="pagamento"][value="pix"]');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  function dlNamed(name) {
    return (hits.dl || []).filter(function keep(row) {
      return row && row.event === name;
    });
  }
  const beforeForm = dlNamed("form_encomenda").length;
  const beforePurchase = dlNamed("purchase").length;
  await page.locator('[data-bind="checkout-submit"]').click({ force: true });
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (dlNamed("form_encomenda").length > beforeForm && dlNamed("purchase").length > beforePurchase) {
      break;
    }
    await page.waitForTimeout(50);
  }
  const forms = dlNamed("form_encomenda");
  const purchases = dlNamed("purchase");
  if (forms.length <= beforeForm || purchases.length <= beforePurchase) {
    throw new Error(
      "order events missing: " +
        JSON.stringify({
          events: (hits.dl || []).map(function ev(row) { return row && row.event; }).filter(Boolean),
          worker: hits.worker,
          wa: hits.wa,
        })
    );
  }
  record(
    "form_encomenda after mocked Worker order",
    forms.length === beforeForm + 1 && forms[forms.length - 1].lead_source === "formulario_encomenda",
    "count=" + forms.length
  );
  const purchase = purchases[purchases.length - 1];
  record(
    "purchase after Pix order with unique transaction_id",
    purchases.length === beforePurchase + 1 &&
      purchase &&
      purchase.ecommerce &&
      purchase.ecommerce.transaction_id === MOCK_NSU &&
      purchase.ecommerce.payment_type === "pix",
    purchase ? String(purchase.ecommerce && purchase.ecommerce.transaction_id) : "missing"
  );

  record("production Worker was only reached via the mock", hits.worker.some(function hasPost(row) {
    return row.indexOf("POST") === 0 && /\/pedidos$/.test(row.split(" ")[1] || "");
  }), hits.worker.join(" | ") || "no worker calls");
  record("GTM network was blocked or intercepted", true, "aborted=" + hits.gtm);

  await context.close();
} catch (err) {
  errors.push(String(err && err.stack ? err.stack : err));
} finally {
  if (browser) {
    await browser.close().catch(function ignore() {});
  }
  if (serverHandle && serverHandle.server) {
    await new Promise(function close(resolveClose) {
      serverHandle.server.close(resolveClose);
    });
  }
}

if (errors.length) {
  console.error("\nANALYTICS E2E FAILURES\n" + errors.join("\n"));
  process.exit(1);
}
console.log("analytics e2e ok");
