import { mkdirSync } from "node:fs";
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
  if (engine !== "webkit") {
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    } catch (err) {
      /* some engines reject clipboard permissions */
    }
  }
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
    const squareBoxes = await areaLinks.evaluateAll(function measureSquares(nodes) {
      return nodes.map(function boxOf(el) {
        const rect = el.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      });
    });
    const twoByTwo =
      squareBoxes.length === 4 &&
      Math.abs(squareBoxes[0].y - squareBoxes[1].y) < 8 &&
      Math.abs(squareBoxes[2].y - squareBoxes[3].y) < 8 &&
      squareBoxes[2].y - squareBoxes[0].y > 40 &&
      Math.abs(squareBoxes[0].w - squareBoxes[0].h) / Math.max(squareBoxes[0].h, 1) < 0.25;
    record(engine, "home area squares 2x2", twoByTwo, JSON.stringify(squareBoxes));
    const slideHref = await page.locator(".hero__slide").first().getAttribute("href");
    record(engine, "home carousel slide links to product", /produto\/\?slug=/.test(slideHref || ""), slideHref);
    record(engine, "home has no Instagram strip", (await page.locator('[data-bind="instagram-grid"]').count()) === 0);
    record(engine, "footer has two lines", (await page.locator("#rodape p").count()) === 2);
    record(engine, "nav has Sobre nós", (await page.locator('#menu-principal a[href="sobre-nos/"]').count()) === 1);
    record(engine, "nav has no Encomendas item", (await page.locator("#menu-principal > a", { hasText: "Encomendas" }).count()) === 0);
    record(engine, "cart icon visible on mobile", await page.locator(".cart-button").first().isVisible());
    const navLabels = (await page.locator("#menu-principal > a, #menu-principal > .topo__categories > .topo__categories-btn").allTextContents()).map(function trim(text) {
      return text.replace(/\s+/g, " ").trim();
    });
    record(engine, "nav order Início Categorias Sobre nós", navLabels.join(" | ") === "Início | Categorias | Sobre nós", navLabels.join(" | "));

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
    const radioBox = await page.locator('#checkout-form [name="modalidade"][value="retirada"]').evaluate(function size(el) {
      return el.closest("label").getBoundingClientRect().height;
    });
    record(engine, "modalidade radio target ~44px", radioBox >= 40, String(radioBox));
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    record(engine, "retirada hides address", await page.locator('[data-bind="checkout-address"]').isHidden());
    await page.locator('#checkout-form [name="modalidade"][value="entrega"]').check();
    record(engine, "entrega shows address", await page.locator('[data-bind="checkout-address"]').isVisible());
    const feeText = ((await page.locator('[data-bind="checkout-fee"]').textContent()) || "").trim();
    record(engine, "entrega fee is R$ 40,00", /R\$\s*40,00/.test(feeText), feeText);
    const totalWithFee = ((await page.locator('[data-bind="cart-total"]').textContent()) || "").trim();
    record(engine, "entrega total includes fee", /R\$/.test(totalWithFee) && !/a confirmar/.test(totalWithFee), totalWithFee);
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    record(engine, "retirada hides address again", await page.locator('[data-bind="checkout-address"]').isHidden());
    record(engine, "Pix hidden while disabled", await page.locator('[data-bind="pix-block"]').isHidden());
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
    record(engine, "WhatsApp draft is retirada without address", /\*Modalidade:\* Retirada/.test(waText) && !/\*Endereço:\*/.test(waText), waText.slice(0, 180));
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

    await page.route("**/data/pix.json", function fulfillPix(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          enabled: true,
          chave: "teste@exemplo.com",
          nome: "Jana Abreu",
          cidade: "Brasilia",
        }),
      });
    });
    await page.goto(BASE + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    record(engine, "Pix visible with local test config", await page.locator('[data-bind="pix-block"]').isVisible());
    const pixAlt = (await page.locator('[data-bind="pix-qr"]').getAttribute("alt")) || "";
    record(engine, "Pix QR alt describes the code", /QR Code Pix/i.test(pixAlt), pixAlt);
    const pixSrc = (await page.locator('[data-bind="pix-qr"]').getAttribute("src")) || "";
    record(engine, "Pix QR is an inline image", /^data:image\//.test(pixSrc));
    const pixRetirada = ((await page.locator('[data-bind="pix-value"]').textContent()) || "").trim();
    await page.locator('#checkout-form [name="modalidade"][value="entrega"]').check();
    await page.locator('#checkout-form [name="endereco"]').fill("Asa Norte");
    const pixEntrega = ((await page.locator('[data-bind="pix-value"]').textContent()) || "").trim();
    record(engine, "Pix value includes delivery fee", pixEntrega !== pixRetirada && /R\$/.test(pixEntrega), pixRetirada + " -> " + pixEntrega);
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    await page.locator('[data-action="copy-pix"]').click();
    await page.waitForTimeout(300);
    const copyStatus = ((await page.locator('[data-bind="pix-copy-status"]').textContent()) || "").trim();
    record(engine, "Pix copy announces status", /copiado|não foi possível copiar/i.test(copyStatus), copyStatus);
    waHits.length = 0;
    await page.locator('#checkout-form [name="nome"]').fill("Pix Teste");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    await page.locator('#checkout-form button[type="submit"]').click({ noWaitAfter: true }).catch(function ignoreNav() {});
    await page.waitForTimeout(600);
    const pixWa = waHits.map(function decode(url) {
      try {
        return decodeURIComponent(url);
      } catch (err) {
        return url;
      }
    }).join(" ");
    record(engine, "WhatsApp says Pix after confirmation", /Pix após a confirmação/i.test(pixWa) && /Total:/.test(pixWa), pixWa.slice(0, 180));

    const linkBodies = [];
    await page.route("**/data/pagamento.json", function fulfillPay(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ infinitepay: { enabled: true, handle: "teste-jana" } }),
      });
    });
    await page.route("https://api.checkout.infinitepay.io/links", async function fulfillLink(route) {
      const body = route.request().postDataJSON();
      linkBodies.push(body);
      const headers = route.request().headers();
      if (headers["x-api-key"] || /inchk_/.test(JSON.stringify(headers))) {
        errors.push("[" + engineName + "] InfinitePay link sent an API key");
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          checkout_url:
            BASE +
            "/pagamento/?order_nsu=" +
            encodeURIComponent(body.order_nsu) +
            "&slug=testslug&transaction_nsu=txn-1&capture_method=pix&receipt_url=" +
            encodeURIComponent("https://comprovante.example/abc"),
          slug: "testslug",
        }),
      });
    });
    await page.route("https://api.checkout.infinitepay.io/payment_check", async function fulfillCheck(route) {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          success: true,
          paid: true,
          amount: 50700,
          paid_amount: 50700,
          installments: 1,
          capture_method: "pix",
        }),
      });
    });
    await page.goto(BASE + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await page.locator('#checkout-form [name="modalidade"][value="entrega"]').check();
    await page.locator('#checkout-form [name="endereco"]').fill("Asa Norte");
    await page.locator('#checkout-form [name="nome"]').fill("InfinitePay Teste");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    const payLabel = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(engine, "pay button when InfinitePay is on", payLabel === "Pagar e enviar pedido", payLabel);
    const paidDisclaimer = ((await page.locator('[data-bind="request-disclaimer"]').textContent()) || "").trim();
    record(engine, "paid-flow disclaimer", /Após o pagamento, seu pedido é enviado/.test(paidDisclaimer), paidDisclaimer.slice(0, 80));
    mkdirSync("tests/screenshots", { recursive: true });
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    await page.screenshot({ path: "tests/screenshots/carrinho-pagar-390.png", fullPage: false });
    await page.screenshot({ path: "/opt/cursor/artifacts/carrinho-pagar-390.png", fullPage: false });
    waHits.length = 0;
    await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(function ignoreNav() {});
    await page.waitForURL(/\/pagamento\//, { timeout: 8000 });
    await page.waitForSelector("text=Pagamento confirmado", { timeout: 8000 });
    record(engine, "payment page confirmed", true);
    const feeItem = linkBodies.some(function hasFee(body) {
      return (body.items || []).some(function item(row) {
        return row.description === "Taxa de entrega" && row.price === 4000;
      });
    });
    const tabuaItem = linkBodies.some(function hasTabua(body) {
      return (body.items || []).some(function item(row) {
        return row.price === 46700;
      });
    });
    record(engine, "InfinitePay link uses cents including delivery", feeItem && tabuaItem, JSON.stringify(linkBodies[0] && linkBodies[0].items));
    record(engine, "InfinitePay redirect_url is production pagamento page", !!(linkBodies[0] && /site-Confeitaria\/pagamento\//.test(linkBodies[0].redirect_url)), linkBodies[0] && linkBodies[0].redirect_url);
    await page.waitForSelector('[data-bind="pagamento-whatsapp"]:not([hidden])', { timeout: 5000 });
    const paidHref = (await page.locator('[data-bind="pagamento-whatsapp"]').getAttribute("href")) || "";
    let paidWa = paidHref;
    try {
      paidWa = decodeURIComponent(paidHref);
    } catch (err) {
      paidWa = paidHref;
    }
    await page.screenshot({ path: "tests/screenshots/pagamento-confirmado-390.png", fullPage: false });
    await page.screenshot({ path: "/opt/cursor/artifacts/pagamento-confirmado-390.png", fullPage: false });
    await page.waitForTimeout(1200);
    record(engine, "paid flow opened WhatsApp", waHits.length >= 1 || /wa\.me/.test(paidHref), String(waHits.length));
    record(engine, "WhatsApp says PAGO via InfinitePay", /PAGO via InfinitePay/.test(paidWa + waHits.join(" ")), paidWa.slice(0, 160));

    const linksBeforeUnpriced = linkBodies.length;
    await page.goto(BASE + "/corporate/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[id="produto:coffee-break-corporativo"]');
    await page.locator('[id="produto:coffee-break-corporativo"] [data-action="add-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    const unpricedLabel = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(engine, "unpriced product keeps WhatsApp CTA", unpricedLabel === "Enviar solicitação no WhatsApp", unpricedLabel);
    record(engine, "unpriced note visible", await page.locator('[data-bind="checkout-unpriced"]').isVisible());
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    await page.locator('#checkout-form [name="nome"]').fill("Sob consulta");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    waHits.length = 0;
    await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(function ignoreNav() {});
    await page.waitForTimeout(600);
    record(engine, "unpriced product does not create InfinitePay link", linkBodies.length === linksBeforeUnpriced, String(linkBodies.length));
    record(engine, "unpriced product still opens WhatsApp", waHits.length >= 1);

    await page.route("**/data/pausa.json", function fulfillPausa(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          ativo: true,
          inicio: "",
          fim: "",
          mensagem: "Voltamos em breve!",
          periodos: [],
          fimDeSemana: false,
          planilhaCsv: "",
        }),
      });
    });
    await page.goto(BASE + "/corporate/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-product"]');
    const countBefore = ((await page.locator('[data-bind="cart-count"]').first().textContent()) || "").trim();
    await page.locator('[data-action="add-product"]').first().click();
    await page.waitForSelector("#pausa-encomendas:not([hidden])", { timeout: 5000 });
    record(engine, "pause modal on Comprar", await page.locator("#pausa-encomendas").isVisible());
    record(engine, "pause does not add to cart", ((await page.locator('[data-bind="cart-count"]').first().textContent()) || "").trim() === countBefore);
    await page.screenshot({ path: "tests/screenshots/pausa-modal-390.png", fullPage: false });
    await page.screenshot({ path: "/opt/cursor/artifacts/pausa-modal-390.png", fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    record(engine, "Escape closes pause modal", await page.locator("#pausa-encomendas").isHidden());
    await page.locator(".cart-button").first().click();
    await page.waitForSelector("#pausa-encomendas:not([hidden])");
    record(engine, "pause modal on cart icon", await page.locator("#pausa-encomendas").isVisible());
    record(engine, "pause aria-modal", (await page.locator("#pausa-encomendas").getAttribute("aria-modal")) === "true");
    await page.locator('[data-action="close-pausa"]').click();
    record(engine, "close pause button", await page.locator("#pausa-encomendas").isHidden());

    await page.unroute("**/data/pausa.json");
    await page.goto(BASE + "/encomendas/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#encomendas:not([hidden])", { timeout: 8000 });
    record(engine, "/encomendas/ opens the cart", await page.locator("#encomendas").isVisible());

    await page.goto(BASE + "/doces-personalizados/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".product-grid .card");
    const cardMetrics = await page.locator(".product-grid .card").evaluateAll(function measure(nodes) {
      return nodes.slice(0, 8).map(function boxOf(el) {
        const media = el.querySelector(".card__media");
        const mr = media.getBoundingClientRect();
        const cr = el.getBoundingClientRect();
        return {
          mw: Math.round(mr.width),
          mh: Math.round(mr.height),
          cw: Math.round(cr.width),
          ch: Math.round(cr.height),
        };
      });
    });
    const squarePhotos = cardMetrics.length > 1 && cardMetrics.every(function sq(card) {
      return Math.abs(card.mw - card.mh) / Math.max(card.mw, 1) < 0.08;
    });
    const sameHeight = cardMetrics.length > 1 && cardMetrics.every(function eq(card) {
      return Math.abs(card.ch - cardMetrics[0].ch) <= 2;
    });
    const taller = cardMetrics.length > 1 && cardMetrics.every(function tall(card) {
      return card.ch > card.cw;
    });
    record(engine, "doces cards square photos 390", squarePhotos, JSON.stringify(cardMetrics.slice(0, 3)));
    record(engine, "doces cards equal height 390", sameHeight, JSON.stringify(cardMetrics.map(function h(card) { return card.ch; })));
    record(engine, "doces cards taller than wide 390", taller, JSON.stringify(cardMetrics[0]));
    await page.screenshot({ path: "tests/screenshots/doces-personalizados-390.png", fullPage: true });
    await page.screenshot({ path: "/opt/cursor/artifacts/doces-personalizados-390.png", fullPage: true });

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
    const areaSlideHref = await page.locator("#hero-carrossel .hero__slide").first().getAttribute("href");
    record(engine, "area carousel links to product", /produto\/\?slug=/.test(areaSlideHref || ""), areaSlideHref);
    const alfajores = page.locator('[id="produto:caixa-4-alfajores-logo"] .card__actions .btn');
    record(engine, "alfajores card present", (await alfajores.count()) === 2);
    if ((await alfajores.count()) === 2) {
      const firstBtn = await alfajores.nth(0).boundingBox();
      const secondBtn = await alfajores.nth(1).boundingBox();
      const aligned = firstBtn && secondBtn && Math.abs(firstBtn.y + firstBtn.height - (secondBtn.y + secondBtn.height)) <= 2;
      record(engine, "alfajores buttons share baseline", aligned, JSON.stringify({ firstBtn, secondBtn }));
    }

    await page.goto(BASE + "/sobre-nos/", { waitUntil: "domcontentloaded" });
    const sobreTitle = ((await page.locator("h1").textContent()) || "").trim();
    record(engine, "sobre-nos title", /Sobre nós/i.test(sobreTitle), sobreTitle);
    record(engine, "instagram lives on sobre-nos", (await page.locator('[data-bind="instagram-grid"] a').count()) >= 1);
    record(engine, "empty portrait stays hidden", await page.locator('[data-bind="sobre-portrait"]').isHidden());

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
    const desktopSquares = await page.locator('[data-bind="areas"] a').evaluateAll(function measure(nodes) {
      return nodes.map(function boxOf(el) {
        const rect = el.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y) };
      });
    });
    const fourAcross = desktopSquares.length === 4 && desktopSquares.every(function sameRow(box) {
      return Math.abs(box.y - desktopSquares[0].y) < 12;
    });
    record(engine, "desktop area squares 4 across", fourAcross, JSON.stringify(desktopSquares));
    await page.locator('[data-action="toggle-categories"]').click();
    record(engine, "desktop Categorias dropdown", await page.locator("#menu-categorias").isVisible());
    await page.keyboard.press("Escape");
    record(engine, "desktop Escape closes Categorias", await page.locator("#menu-categorias").isHidden());
    record(engine, "desktop cart icon visible", await page.locator(".cart-button").first().isVisible());
    record(engine, "desktop nav has no Encomendas", (await page.locator("#menu-principal > a", { hasText: "Encomendas" }).count()) === 0);
    await page.goto(BASE + "/doces-personalizados/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".product-grid .card");
    const desktopCards = await page.locator(".product-grid .card").evaluateAll(function measure(nodes) {
      return nodes.slice(0, 8).map(function boxOf(el) {
        const media = el.querySelector(".card__media");
        const mr = media.getBoundingClientRect();
        const cr = el.getBoundingClientRect();
        return {
          mw: Math.round(mr.width),
          mh: Math.round(mr.height),
          cw: Math.round(cr.width),
          ch: Math.round(cr.height),
        };
      });
    });
    record(
      engine,
      "doces cards square photos 1280",
      desktopCards.length > 1 && desktopCards.every(function sq(card) {
        return Math.abs(card.mw - card.mh) / Math.max(card.mw, 1) < 0.08;
      }),
      JSON.stringify(desktopCards.slice(0, 3))
    );
    record(
      engine,
      "doces cards equal height 1280",
      desktopCards.length > 1 && desktopCards.every(function eq(card) {
        return Math.abs(card.ch - desktopCards[0].ch) <= 2;
      }),
      JSON.stringify(desktopCards.map(function h(card) { return card.ch; }))
    );
    await page.screenshot({ path: "tests/screenshots/doces-personalizados-1280.png", fullPage: true });
    await page.screenshot({ path: "/opt/cursor/artifacts/doces-personalizados-1280.png", fullPage: true });
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
