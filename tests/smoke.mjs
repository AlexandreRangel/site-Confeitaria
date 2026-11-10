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
    await page.waitForSelector('[data-bind="areas"] a', { timeout: 15000 });
    await page.waitForFunction(function layoutReady() {
      const img = document.querySelector(".hero__slide img");
      return !!(img && img.getBoundingClientRect().width <= document.documentElement.clientWidth + 1);
    }, null, { timeout: 10000 });
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

    const areaLinks = page.locator('[data-bind="areas"] a');
    const areaCount = await areaLinks.count();
    const areaLabels = (await areaLinks.allTextContents()).map(function trim(text) {
      return text.replace(/\s+/g, " ").trim();
    });
    record(engine, "home has 4 area buttons", areaCount === 4, String(areaCount) + " " + areaLabels.join(" | "));
    record(engine, "home order Corporate Bolos Cestas Doces", areaLabels.join(" | ") === "Corporate | Bolos | Cestas | Doces personalizados", areaLabels.join(" | "));
    record(engine, "Natal hidden while disabled", areaLabels.indexOf("Natal") === -1);
    const catHref = await areaLinks.first().getAttribute("href");
    record(engine, "area url is folder", /corporate\/$/.test(catHref || ""), catHref);
    const natalNav = await page.locator("#menu-categorias a", { hasText: "Natal" }).count();
    record(engine, "Natal not linked in Categorias", natalNav === 0);

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

    const redirects = [
      { from: "/sobremesas/", ok: function ok(path) { return path === "/" || path === ""; } },
      { from: "/cestas-presentes/", ok: function ok(path) { return /\/cestas\/?$/.test(path); } },
      { from: "/personalizado-para-empresas/", ok: function ok(path) { return /\/corporate\/?$/.test(path); } },
      { from: "/combos-festa/", ok: function ok(path) { return /\/doces-personalizados\/?$/.test(path); } },
      { from: "/doces-festa/", ok: function ok(path) { return /\/doces-personalizados\/?$/.test(path); } },
      { from: "/festa-personalizada/", ok: function ok(path) { return /\/doces-personalizados\/?$/.test(path); } },
    ];
    for (const item of redirects) {
      await page.goto(BASE + item.from, { waitUntil: "domcontentloaded" });
      await page.waitForURL(function waitRedirect(url) {
        return item.ok(url.pathname);
      }, { timeout: 5000 });
      record(engine, "redirect " + item.from, item.ok(new URL(page.url()).pathname), page.url());
    }

    await page.goto(BASE + "/corporate/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".card, .empty", { timeout: 15000 });
    const areaTitle = ((await page.locator("h1").textContent()) || "").trim();
    record(engine, "corporate title", /Corporate/i.test(areaTitle), areaTitle);
    record(engine, "corporate has products", (await page.locator(".card").count()) > 0);

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.locator('[data-action="toggle-menu"]').click();
    await page.waitForSelector('[data-action="toggle-categories"]');
    await page.locator('[data-action="toggle-categories"]').click();
    const menuOpen = await page.locator("#menu-categorias").isVisible();
    record(engine, "Categorias opens on mobile", menuOpen);
    const expanded = await page.locator('[data-action="toggle-categories"]').getAttribute("aria-expanded");
    record(engine, "aria-expanded true", expanded === "true", expanded);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    record(engine, "Escape closes Categorias", await page.locator("#menu-categorias").isHidden());
  });

  await withPage(browserType, engine, { width: 1280, height: 800 }, async function desktop(page) {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-bind="areas"] a');
    await page.waitForFunction(function layoutReady() {
      const img = document.querySelector(".hero__slide img");
      return !!(img && img.getBoundingClientRect().width <= document.documentElement.clientWidth + 1);
    }, null, { timeout: 10000 });
    const overflow = await page.evaluate(function measure() {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    record(engine, "desktop no horizontal overflow", !overflow);
    const mixed = await page.locator('#catalogo [data-bind="products"]').count();
    record(engine, "home is not mixed vitrine", mixed === 0);
    const natalDesktop = await page.locator('[data-bind="areas"] a', { hasText: "Natal" }).count();
    record(engine, "desktop Natal hidden", natalDesktop === 0);
    await page.locator('[data-action="toggle-categories"]').click();
    record(engine, "desktop Categorias dropdown", await page.locator("#menu-categorias").isVisible());
    await page.keyboard.press("Escape");
    record(engine, "desktop Escape closes Categorias", await page.locator("#menu-categorias").isHidden());
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
