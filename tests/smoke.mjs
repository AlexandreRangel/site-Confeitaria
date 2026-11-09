import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch (err) {
  playwright = require("/tmp/jana-audit/node_modules/playwright");
}
const { chromium, webkit } = playwright;

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const engines = (process.env.ENGINES || "chromium").split(",").filter(Boolean);
const errors = [];

function record(engine, name, ok, detail) {
  const line = (ok ? "ok" : "FAIL") + " [" + engine + "] " + name + (detail ? " — " + detail : "");
  console.log(line);
  if (!ok) errors.push(line);
}

async function withPage(browserType, engine, viewport, fn) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: viewport,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  const waHits = [];
  const centralHits = [];
  function rememberWa(url) {
    if (url && /wa\.me|whatsapp\.com/i.test(url)) {
      waHits.push(url);
    }
  }
  await page.route("https://wa.me/**", function abortWa(route) {
    rememberWa(route.request().url());
    return route.abort();
  });
  await page.route("https://api.whatsapp.com/**", function abortApi(route) {
    rememberWa(route.request().url());
    return route.abort();
  });
  page.context().on("page", function onPopup(popup) {
    rememberWa(popup.url());
    popup.close().catch(function ignore() {});
  });
  page.on("request", function onRequest(req) {
    if (/\/v1\/solicitacoes/.test(req.url())) {
      centralHits.push(req.url());
    }
  });
  page.on("dialog", function onDialog(dialog) {
    errors.push("[" + engine + "] unexpected dialog: " + dialog.message());
    dialog.dismiss();
  });
  try {
    await fn(page, waHits, engine, centralHits);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runEngine(browserType, engine) {
  await withPage(browserType, engine, { width: 390, height: 844 }, async function mobile(page, waHits, engineName, centralHits) {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-bind="categories"] a', { timeout: 15000 });
    const lang = await page.locator("html").getAttribute("lang");
    record(engine, "html lang", lang === "pt-BR", lang);
    const h1 = await page.locator("h1").count();
    record(engine, "home h1", h1 >= 1, String(h1));
    const overflow = await page.evaluate(function measure() {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    record(engine, "home no horizontal overflow 390", !overflow);
    const skip = await page.locator(".skip-link").count();
    record(engine, "skip link", skip >= 1);

    const catHref = await page.locator('[data-bind="categories"] a').first().getAttribute("href");
    record(engine, "category url is folder", /\/$/.test(catHref || "") && !String(catHref).includes("categoria.html"), catHref);

    await page.goto(BASE + "/bolos/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".card, .empty", { timeout: 15000 });
    const comprar = page.locator(".btn--acquire").first();
    record(engine, "category has Comprar", (await comprar.count()) > 0);
    if (await comprar.count()) {
      const box = await comprar.boundingBox();
      record(engine, "Comprar min height ~44", box && box.height >= 40, box ? String(box.height) : "missing");
    }

    await page.goto(BASE + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-bind="product-name"]', { timeout: 15000 });
    const name = (await page.locator('[data-bind="product-name"]').textContent()) || "";
    record(engine, "product name", /Tábua Signature/i.test(name), name.trim());
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])", { timeout: 5000 });
    const drawerOpen = await page.locator("#encomendas").isVisible();
    record(engine, "cart opens from product", drawerOpen);
    const qtyBtns = page.locator('.cart-row__qty button');
    const minusBox = await qtyBtns.first().boundingBox();
    record(engine, "qty target ~44px", minusBox && minusBox.width >= 40 && minusBox.height >= 40, JSON.stringify(minusBox));
    const fontSize = await page.locator('#checkout-form input[name="nome"]').evaluate(function size(el) {
      return parseFloat(getComputedStyle(el).fontSize);
    });
    record(engine, "checkout input >= 16px", fontSize >= 16, String(fontSize));
    const submitVisible = await page.locator(".btn--whatsapp").evaluate(function vis(el) {
      const rect = el.getBoundingClientRect();
      return rect.bottom <= (window.innerHeight || 0) + 8 && rect.height > 0;
    });
    if (!submitVisible) {
      await page.locator(".btn--whatsapp").scrollIntoViewIfNeeded();
    }
    record(engine, "whatsapp CTA reachable", await page.locator(".btn--whatsapp").isVisible());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    record(engine, "Escape closes cart", await page.locator("#encomendas").isHidden());

    await page.goto(BASE + "/produto/?slug=bolo-naked-g", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="set-flavor"]', { timeout: 15000 });
    await page.locator('[data-action="set-flavor"]').selectOption("Pistache");
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await page.keyboard.press("Escape");
    await page.locator('[data-action="set-flavor"]').selectOption("Maracujá");
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    const flavors = await page.locator(".cart-row__flavor").allTextContents();
    record(engine, "two filling lines in cart", flavors.length >= 2, flavors.join(" | "));

    const disclaimer = ((await page.locator('[data-bind="request-disclaimer"]').textContent()) || "").trim();
    record(
      engine,
      "solicitation disclaimer visible before submit",
      /Esta é uma solicitação de encomenda/.test(disclaimer),
      disclaimer.slice(0, 80)
    );
    await page.locator('#checkout-form [name="nome"]').fill("Auditoria Teste");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    await page.locator('#checkout-form [name="observacoes"]').fill("Teste automatizado — não enviar.");
    await page.locator('#checkout-form button[type="submit"]').click({ noWaitAfter: true }).catch(function ignoreNav() {});
    await page.waitForTimeout(600);
    record(engine, "checkout attempted wa.me without delivering a message", waHits.length >= 1, String(waHits.length));
    const waText = waHits.map(function decode(url) {
      try {
        return decodeURIComponent(url);
      } catch (err) {
        return url;
      }
    }).join(" ");
    record(
      engine,
      "WhatsApp draft includes solicitation disclaimer",
      /Esta é uma solicitação de encomenda/.test(waText),
      waText.slice(0, 120)
    );
    const status = await page
      .locator('[data-bind="checkout-status"]')
      .textContent({ timeout: 1500 })
      .then(function trim(text) {
        return (text || "").trim();
      })
      .catch(function afterNav() {
        return "";
      });
    if (status) {
      record(
        engine,
        "checkout status is solicitation not confirmation",
        /solicitação|não confirma|WhatsApp/i.test(status) && !/encomenda confirmada/i.test(status),
        status
      );
    } else {
      record(
        engine,
        "checkout left storefront toward WhatsApp (mobile assign)",
        waHits.length >= 1,
        "status not readable after navigation"
      );
    }

    await page.goto(BASE + "/painel/", { waitUntil: "domcontentloaded" });
    const painelHydra = await page.locator("canvas.hydra-button-bg, [id*='hydra']").count();
    record(engine, "painel has no Hydra", painelHydra === 0);
    const note = ((await page.locator(".painel-note").textContent()) || "").toLowerCase();
    record(engine, "painel stays local", note.indexOf("localstorage") !== -1 && /legado|centraliz/.test(note));
    const centralCopy = ((await page.locator('[data-bind="central-status"]').textContent()) || "").toLowerCase();
    record(engine, "painel says shared channel is off", centralCopy.indexOf("desligado") !== -1, centralCopy.slice(0, 80));
    const loginHidden = await page.locator('[data-bind="central-login"]').evaluate(function isHidden(el) {
      return el.hasAttribute("hidden") || el.hidden === true;
    });
    record(engine, "central login stays hidden while disabled", loginHidden);
    record(engine, "central API not called while disabled", centralHits.length === 0, String(centralHits.length));

    const paths = ["/cestas-presentes/", "/sobremesas/", "/combos-festa/", "/doces-festa/", "/festa-personalizada/", "/personalizado-para-empresas/"];
    for (const path of paths) {
      const response = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
      record(engine, "category " + path, response && response.ok(), String(response && response.status()));
    }
  });

  await withPage(browserType, engine, { width: 1280, height: 800 }, async function desktop(page) {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-bind="categories"] a');
    const overflow = await page.evaluate(function measure() {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    record(engine, "desktop no horizontal overflow", !overflow);
    const mixed = await page.locator('#catalogo [data-bind="products"]').count();
    record(engine, "home is not mixed vitrine", mixed === 0);
  });
}

const map = { chromium: chromium, webkit: webkit };
for (const engine of engines) {
  if (!map[engine]) {
    errors.push("unknown engine " + engine);
    continue;
  }
  try {
    await runEngine(map[engine], engine);
  } catch (err) {
    errors.push("[" + engine + "] " + err.stack);
  }
}

if (errors.length) {
  console.error("\nSMOKE FAILURES\n" + errors.join("\n"));
  process.exit(1);
}
console.log("smoke ok");
