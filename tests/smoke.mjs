import { mkdirSync, existsSync } from "node:fs";
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

function ensureDir(path) {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch (err) {
    return false;
  }
}

function parseBRL(text) {
  const m = String(text || "").replace(/\s/g, " ").match(/R\$\s*([0-9.]+,[0-9]{2})/);
  if (!m) {
    return null;
  }
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

function record(engine, name, ok, detail) {
  const line = (ok ? "ok" : "FAIL") + " [" + engine + "] " + name + (detail ? " — " + detail : "");
  console.log(line);
  if (!ok) errors.push(line);
}

function parsePixEmv(payload) {
  const fields = {};
  const source = String(payload || "");
  let i = 0;
  while (i + 4 <= source.length) {
    const id = source.slice(i, i + 2);
    const len = Number(source.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || len < 0) {
      break;
    }
    fields[id] = source.slice(i + 4, i + 4 + len);
    i += 4 + len;
    if (id === "63") {
      break;
    }
  }
  return fields;
}

function inspectPixPayload(payload, expectedAmount) {
  const fields = parsePixEmv(payload);
  const body = String(payload || "").slice(0, -4);
  let crc = 0xffff;
  for (let i = 0; i < body.length; i++) {
    crc ^= body.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  const hex = ("0000" + crc.toString(16).toUpperCase()).slice(-4);
  const amount = expectedAmount != null ? Number(expectedAmount).toFixed(2) : fields["54"];
  const ok =
    fields["00"] === "01" &&
    String(fields["26"] || "").startsWith("0014br.gov.bcb.pix") &&
    fields["52"] === "0000" &&
    fields["53"] === "986" &&
    fields["54"] === amount &&
    fields["58"] === "BR" &&
    fields["59"] === "JANA ABREU" &&
    fields["60"] === "BRASILIA" &&
    String(fields["62"] || "").includes("***") &&
    fields["63"] === hex;
  return {
    ok: ok,
    detail:
      "00=" +
      fields["00"] +
      " 52=" +
      fields["52"] +
      " 53=" +
      fields["53"] +
      " 54=" +
      fields["54"] +
      " 58=" +
      fields["58"] +
      " 59=" +
      fields["59"] +
      " 60=" +
      fields["60"] +
      " txid=" +
      (String(fields["62"] || "").includes("***") ? "***" : "missing") +
      " crc=" +
      (fields["63"] === hex ? "ok" : "bad") +
      " gui=" +
      (String(fields["26"] || "").startsWith("0014br.gov.bcb.pix") ? "ok" : "bad"),
  };
}

async function safeShot(page, path) {
  try {
    if (!ensureDir(path.split("/").slice(0, -1).join("/") || ".")) {
      return;
    }
    await page.screenshot({ path: path, fullPage: path.indexOf("doces-personalizados") !== -1 });
  } catch (err) {
    /* optional artifact path may be read-only */
  }
}

async function withPage(browserType, engine, viewport, fn) {
  const launch = { headless: true };
  if (engine === "chromium") {
    const exe = process.env.CHROME_PATH || "/usr/bin/google-chrome";
    if (existsSync(exe)) {
      launch.executablePath = exe;
      launch.args = ["--no-sandbox", "--disable-dev-shm-usage"];
    }
  }
  const browser = await browserType.launch(launch);
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
  await page.route("https://checkout.infinitepay.io/**", function abortCheckout(route) {
    return route.abort();
  });
  // Os testes de vitrine rodam com a lista compartilhada (Worker) desligada, para não gravar pedidos reais.
  // O fluxo com o Worker é testado em tests/central-e2e.mjs.
  await page.route("**/data/site.json", async function centralOff(route) {
    const response = await route.fetch();
    const data = await response.json();
    data.central = { enabled: false, endpoint: "", note: "desligado nos testes" };
    return route.fulfill({ response: response, body: JSON.stringify(data), headers: { "content-type": "application/json" } });
  });
  const consoleErrors = [];
  function keepConsole(text) {
    if (/wa\.me|whatsapp\.com|checkout\.infinitepay\.io|InfinitePay:|ERR_ABORTED|ERR_FAILED|net::ERR_CONNECTION|502 \(Bad Gateway\)|Failed to load resource: the server responded with a status of 502/i.test(text)) {
      return;
    }
    consoleErrors.push(text);
  }
  page.on("pageerror", function onPageError(err) {
    keepConsole(String(err && err.message ? err.message : err));
  });
  page.on("console", function onConsole(msg) {
    if (msg.type() === "error") {
      keepConsole(msg.text());
    }
  });
  page.context().on("page", function onPopup(popup) {
    rememberWa(popup.url());
    popup.close().catch(function ignore() {});
  });
  page.on("request", function onRequest(req) {
    if (/workers\.dev|\/v1\/solicitacoes/.test(req.url())) {
      centralHits.push(req.url());
    }
  });
  page.on("dialog", function onDialog(dialog) {
    errors.push("[" + engine + "] unexpected dialog: " + dialog.message());
    dialog.dismiss();
  });
  try {
    await fn(page, waHits, engine, centralHits);
    record(engine, "no console errors " + viewport.width, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  } finally {
    await context.close();
    await browser.close();
  }
}




async function checkSobreNos(page, engine, label) {
  await page.goto(BASE + "/sobre-nos/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-bind="instagram-grid"] img, [data-bind="sobre-work"] img', { timeout: 15000 });
  await page.waitForFunction(function loaded() {
    const imgs = Array.from(document.querySelectorAll('[data-bind="instagram-grid"] img, .sobre__work-track .sobre__work-item:not([aria-hidden="true"]) img'));
    return imgs.length >= 8 && imgs.every(function ok(img) { return img.complete && img.naturalWidth > 0; });
  }, null, { timeout: 20000 });
  const sobreTitle = ((await page.locator("h1").textContent()) || "").trim();
  record(engine, "sobre-nos title at " + label, /Sobre nós/i.test(sobreTitle), sobreTitle);

  const handle = page.locator(".instagram__handle").first();
  record(engine, "instagram handle is clickable at " + label, await handle.count() === 1);
  if (await handle.count()) {
    const href = (await handle.getAttribute("href")) || "";
    const text = ((await handle.textContent()) || "").trim();
    record(
      engine,
      "instagram handle is @janaabreuconfeitaria and links to the profile at " + label,
      text === "@janaabreuconfeitaria" && /instagram\.com\/janaabreuconfeitaria/.test(href),
      text + " " + href
    );
  }
  const cta = page.locator(".instagram__cta").first();
  const ctaText = ((await cta.textContent().catch(function none() { return ""; })) || "").trim();
  const ctaHref = (await cta.getAttribute("href").catch(function none() { return ""; })) || "";
  record(
    engine,
    "Siga no Instagram button at " + label,
    ctaText === "Siga no Instagram" && /instagram\.com\/janaabreuconfeitaria/.test(ctaHref),
    ctaText + " " + ctaHref
  );
  record(engine, "instagram lives on sobre-nos at " + label, (await page.locator('[data-bind="instagram-grid"] a').count()) >= 1);
  const ig = await page.evaluate(function measure() {
    const grid = document.querySelector(".instagram--highlight .instagram__grid");
    const tiles = grid ? Array.from(grid.querySelectorAll("a")) : [];
    if (!tiles.length) return { count: 0 };
    const widths = tiles.map(function w(el) { return Math.round(el.getBoundingClientRect().width); });
    const ys = tiles.map(function y(el) { return Math.round(el.getBoundingClientRect().y); });
    const firstRow = ys.filter(function same(y) { return Math.abs(y - ys[0]) < 8; }).length;
    return { count: tiles.length, width: widths[0], cols: firstRow, highlight: !!document.querySelector(".instagram--highlight") };
  });
  const expectCols = label === "1280" ? 3 : 2;
  const minWidth = label === "1280" ? 220 : 140;
  const maxWidth = label === "1280" ? 360 : 170;
  record(engine, "instagram posts are a bit smaller in " + expectCols + " columns at " + label, ig.highlight && ig.cols === expectCols && ig.width >= minWidth && ig.width <= maxWidth, JSON.stringify(ig));
  const igBand = await page.evaluate(function style() {
    const el = document.querySelector(".instagram--highlight");
    if (!el) return { ok: false };
    const s = getComputedStyle(el);
    const image = s.backgroundImage || "";
    const color = s.backgroundColor || "";
    const transparent = !image || image === "none";
    const noFill = !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
    return { ok: transparent && noFill, image: image, color: color };
  });
  record(engine, "instagram sits on the page background at " + label, igBand.ok === true, JSON.stringify(igBand));

  record(engine, "empty portrait stays hidden at " + label, await page.locator('[data-bind="sobre-portrait"]').isHidden());
  record(engine, "empty press stays hidden at " + label, await page.locator('[data-bind="sobre-press"]').evaluate(function hidden(el) {
    const wrap = el.closest("[data-optional]") || el;
    return wrap.hasAttribute("hidden") || wrap.hidden === true;
  }).catch(function none() { return true; }));

  const work = await page.evaluate(function measure() {
    const viewport = document.querySelector(".sobre__work-viewport");
    const track = document.querySelector(".sobre__work-track");
    const duration = track ? getComputedStyle(track).animationDuration : "";
    if (track) {
      track.style.animation = "none";
      track.style.transform = "translate3d(0, 0, 0)";
    }
    const items = track ? Array.from(track.querySelectorAll(".sobre__work-item")) : [];
    if (!viewport || !items.length) return { count: 0, duration: duration };
    const vr = viewport.getBoundingClientRect();
    const visible = items.filter(function onScreen(el) {
      const r = el.getBoundingClientRect();
      return r.left < vr.right - 4 && r.right > vr.left + 4 && r.width > 8;
    });
    const alts = items.filter(function original(el) { return el.getAttribute("aria-hidden") !== "true"; }).map(function alt(el) {
      const img = el.querySelector("img");
      return (img && img.getAttribute("alt")) || "";
    });
    const sizes = visible.map(function size(el) {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), ratio: r.width ? Math.round((r.height / r.width) * 100) / 100 : 0 };
    });
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const breakEl = document.querySelector(".sobre__trabalhos");
    const breakStyle = breakEl ? getComputedStyle(breakEl) : null;
    return {
      count: items.length,
      originals: alts.length,
      visible: visible.length,
      sameRow: visible.length >= 1 && visible.every(function row(el) {
        return Math.abs(el.getBoundingClientRect().y - visible[0].getBoundingClientRect().y) < 8;
      }),
      square: sizes.length > 0 && sizes.every(function near(s) { return Math.abs(s.ratio - 1) < 0.12; }),
      width: sizes[0] ? sizes[0].w : 0,
      height: sizes[0] ? sizes[0].h : 0,
      band: Math.round(vr.height),
      ratio: sizes.map(function r(s) { return s.ratio; }),
      duration: duration,
      overflow: overflow,
      break: breakStyle ? { borderTopColor: breakStyle.borderTopColor, paddingTop: breakStyle.paddingTop, marginTop: breakStyle.marginTop } : null,
      animated: track.classList.contains("is-animated") && items.length > alts.length,
      alts: alts,
    };
  });
  const expectVisible = label === "1280" ? 4 : 2;
  const minPhoto = label === "1280" ? 270 : 230;
  const maxPhoto = label === "1280" ? 330 : 290;
  record(engine, "trabalhos carousel has about 10 photos at " + label, work.originals >= 10, JSON.stringify({ originals: work.originals, count: work.count }));
  record(
    engine,
    "trabalhos shows " + expectVisible + " photos in one row at " + label,
    work.sameRow && work.visible === expectVisible,
    JSON.stringify({ visible: work.visible, sameRow: work.sameRow })
  );
  record(engine, "trabalhos photos are large and square at " + label, work.square === true && work.width >= minPhoto && work.width <= maxPhoto && work.band >= minPhoto, JSON.stringify({ width: work.width, height: work.height, band: work.band, ratio: work.ratio }));
  record(engine, "trabalhos photos have alt text at " + label, work.alts.length >= 10 && work.alts.every(Boolean), JSON.stringify(work.alts));
  record(engine, "trabalhos carousel is animated at " + label, work.animated === true, JSON.stringify({ animated: work.animated, count: work.count }));
  record(engine, "trabalhos carousel moves at half speed at " + label, work.duration === "144s" || work.duration === "144000ms", JSON.stringify({ duration: work.duration }));
  record(engine, "sobre-nos has no horizontal overflow at " + label, work.overflow === false, JSON.stringify({ overflow: work.overflow }));
  record(engine, "visual break before trabalhos at " + label, !!work.break && parseFloat(work.break.paddingTop) >= 24 && parseFloat(work.break.marginTop) >= 24, JSON.stringify(work.break));
  await page.screenshot({ path: "tests/screenshots/sobre-nos-" + label + ".png", fullPage: true });
  await safeShot(page, "/opt/cursor/artifacts/sobre-nos-" + label + ".png");
}

async function checkPhotoOpensProduct(page, engine, label) {
  const card = page.locator(".product-grid .card").first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  const info = await card.evaluate(function read(el) {
    const photo = el.querySelector(".card__media-link");
    const more = Array.from(el.querySelectorAll(".card__actions a")).find(function find(a) {
      return (a.textContent || "").trim() === "Ver mais";
    });
    const img = el.querySelector(".card__media img");
    const style = photo ? getComputedStyle(photo) : {};
    const imgStyle = img ? getComputedStyle(img) : {};
    return {
      photoHref: photo ? photo.getAttribute("href") : "",
      moreHref: more ? more.getAttribute("href") : "",
      tabindex: photo ? photo.getAttribute("tabindex") : "",
      ariaHidden: photo ? photo.getAttribute("aria-hidden") : "",
      alt: img ? img.getAttribute("alt") : null,
      cursor: style.cursor || "",
      imgCursor: imgStyle.cursor || "",
    };
  });
  const sameUrl = !!info.photoHref && info.photoHref === info.moreHref && /produto\/\?slug=/.test(info.photoHref);
  record(engine, "card photo links to the same URL as Ver mais at " + label, sameUrl, JSON.stringify(info));
  record(
    engine,
    "card photo link is not a tab stop and keeps alt at " + label,
    info.tabindex === "-1" && info.ariaHidden === "true" && info.alt !== null,
    JSON.stringify({ tabindex: info.tabindex, ariaHidden: info.ariaHidden, alt: info.alt })
  );
  record(
    engine,
    "card photo has pointer cursor at " + label,
    info.cursor === "pointer" && info.imgCursor === "pointer",
    JSON.stringify({ cursor: info.cursor, imgCursor: info.imgCursor })
  );
  if (!sameUrl) {
    return;
  }
  const expected = new URL(info.moreHref, page.url()).href;
  await card.locator(".card__media img").click();
  await page.waitForURL(function arrived(url) {
    return url.href === expected || url.pathname.indexOf("/produto/") !== -1;
  }, { timeout: 8000 });
  const landed = page.url();
  record(engine, "clicking the card photo opens the product page at " + label, landed === expected, landed + " vs " + expected);
}

async function checkDesiredDateRule(page, engine, waHits, label) {
  const origin = page.url();
  const info = await page.evaluate(function read() {
    const input = document.querySelector('#checkout-form [name="data"]');
    const hint = document.querySelector('[data-bind="checkout-date-min"]');
    const min = window.Jana && Jana.firstAvailableDesiredDate ? Jana.firstAvailableDesiredDate() : "";
    return {
      minAttr: input ? input.getAttribute("min") : "",
      required: !!(input && input.required),
      hint: (hint && hint.textContent) || "",
      min: min,
      today: window.Jana && Jana.todayYmd ? Jana.todayYmd() : "",
    };
  });
  record(engine, "date min is today+2 at " + label, !!info.min && info.minAttr === info.min, JSON.stringify(info));
  record(engine, "date field stays optional at " + label, info.required === false);
  record(
    engine,
    "date hint shows first available day at " + label,
    /A partir de .+, \d{2}\/\d{2}\./.test(info.hint),
    info.hint
  );

  const tz = await page.evaluate(function edge() {
    return {
      night: Jana.minLeadDateYmd(new Date("2026-11-12T02:30:00Z")),
      morning: Jana.minLeadDateYmd(new Date("2026-11-12T03:30:00Z")),
      todayNight: Jana.todayYmd(new Date("2026-11-12T02:30:00Z")),
    };
  });
  record(
    engine,
    "min date uses Brasília time at 23:30 at " + label,
    tz.todayNight === "2026-11-11" && tz.night === "2026-11-13" && tz.morning === "2026-11-14",
    JSON.stringify(tz)
  );

  await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
  await page.locator('#checkout-form [name="nome"]').fill("Data Teste");
  await page.locator('#checkout-form [name="telefone"]').fill("61900000000");

  await page.evaluate(function setDate(ymd) {
    const input = document.querySelector('#checkout-form [name="data"]');
    input.value = ymd;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, info.today);

  const waBefore = waHits.length;
  await page.locator('#checkout-form button[type="submit"]').click({ noWaitAfter: true }).catch(function ignore() {});
  await page.waitForTimeout(400);
  const blocked = await page.evaluate(function readMsg() {
    const input = document.querySelector('#checkout-form [name="data"]');
    const status = ((document.querySelector('[data-bind="checkout-status"]') || {}).textContent || "").trim();
    return {
      status: status,
      validation: (input && input.validationMessage) || "",
      valid: input ? input.validity.valid : true,
    };
  });
  const blockedMsg = blocked.status || blocked.validation;
  record(
    engine,
    "too-soon date is blocked at " + label,
    waHits.length === waBefore && /pelo menos 2 dias/.test(blockedMsg) && /a partir de/i.test(blockedMsg),
    JSON.stringify({ blocked: blocked, extraWa: waHits.length - waBefore })
  );

  await page.evaluate(function setDate(ymd) {
    const input = document.querySelector('#checkout-form [name="data"]');
    input.value = ymd;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, info.min);
  const ready = await page.evaluate(function check() {
    const form = document.querySelector("#checkout-form");
    const input = form && form.querySelector('[name="data"]');
    const button = document.querySelector('[data-bind="checkout-submit"]') || (form && form.querySelector('button[type="submit"]'));
    return {
      valid: !!(input && input.validity.valid),
      formValid: !!(form && form.checkValidity()),
      label: ((button && button.textContent) || "").trim(),
    };
  });
  const whatsappPath = /WhatsApp/i.test(ready.label);
  if (whatsappPath) {
    await page.locator('#checkout-form button[type="submit"]').click({ noWaitAfter: true }).catch(function ignore() {});
    await page.waitForTimeout(600);
    const waText = waHits.slice(waBefore).map(function decode(url) {
      try {
        return decodeURIComponent(url);
      } catch (err) {
        return url;
      }
    }).join(" ");
    const parts = String(info.min).split("-");
    const br = parts[2] + "/" + parts[1] + "/" + parts[0];
    record(
      engine,
      "valid date can be submitted at " + label,
      ready.valid && waHits.length > waBefore && waText.indexOf(br) !== -1,
      "wa=" + (waHits.length - waBefore) + " " + waText.slice(0, 180)
    );
  } else {
    record(
      engine,
      "valid date can be submitted at " + label,
      ready.valid && ready.formValid,
      JSON.stringify(ready)
    );
  }

  const formGone = (await page.locator("#checkout-form [name='nome']").count()) === 0;
  if (formGone) {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#checkout-form, [data-action='open-cart']", { timeout: 15000 });
    if (await page.locator("#encomendas").isHidden()) {
      await page.locator('[data-action="open-cart"]').first().click();
      await page.waitForSelector("#encomendas:not([hidden])");
    }
  } else {
    await page.evaluate(function clear() {
      const input = document.querySelector('#checkout-form [name="data"]');
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const status = document.querySelector('[data-bind="checkout-status"]');
      if (status) status.textContent = "";
    });
  }
}

async function runEngine(browserType, engine) {
  await withPage(browserType, engine, { width: 390, height: 844 }, async function mobile(page, waHits, engineName, centralHits) {
    await page.route("**/data/pix.json", function disablePix(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ enabled: false, chave: "", nome: "", cidade: "" }),
      });
    });
    await page.route("**/data/pagamento.json", function disablePay(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ infinitepay: { enabled: false, handle: "" } }),
      });
    });
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
    record(engine, "home order Corporativo Bolos Cestas Doces", areaLabels.join(" | ") === "Corporativo | Bolos | Cestas | Doces personalizados", areaLabels.join(" | "));
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
    const heroUi = await page.evaluate(function measureHero() {
      const hero = document.querySelector(".hero");
      const controls = document.querySelector(".hero__controls");
      const dots = document.querySelector(".hero__dots");
      const arrows = Array.from(document.querySelectorAll(".hero__arrow"));
      const slide = document.querySelector(".hero__slide");
      const img = document.querySelector(".hero__slide img");
      const dot = document.querySelector(".hero__dot");
      if (!hero || !controls || !arrows.length) {
        return { ok: false };
      }
      const hr = hero.getBoundingClientRect();
      const cr = controls.getBoundingClientRect();
      const mid = Math.abs((cr.left + cr.right) / 2 - (hr.left + hr.right) / 2);
      const bottom = hr.bottom - cr.bottom;
      const sizes = arrows.map(function size(el) {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      const cursors = {
        arrow: arrows[0] ? getComputedStyle(arrows[0]).cursor : "",
        slide: slide ? getComputedStyle(slide).cursor : "",
        img: img ? getComputedStyle(img).cursor : "",
        dot: dot ? getComputedStyle(dot).cursor : "",
      };
      return {
        ok: true,
        mid: mid,
        bottom: bottom,
        sizes: sizes,
        cursors: cursors,
        dotsInside: !!(dots && controls.contains(dots)),
        arrowsInside: arrows.every(function inside(el) { return controls.contains(el); }),
      };
    });
    record(
      engine,
      "carousel arrows 44px next to dots at bottom center",
      !!(
        heroUi.ok &&
        heroUi.dotsInside &&
        heroUi.arrowsInside &&
        heroUi.mid < 24 &&
        heroUi.bottom < 40 &&
        heroUi.sizes.every(function sz(s) { return s.w === 44 && s.h === 44; })
      ),
      JSON.stringify(heroUi)
    );
    record(
      engine,
      "carousel cursors are pointer",
      heroUi.cursors &&
        heroUi.cursors.arrow === "pointer" &&
        heroUi.cursors.slide === "pointer" &&
        heroUi.cursors.img === "pointer" &&
        heroUi.cursors.dot === "pointer",
      JSON.stringify(heroUi.cursors)
    );

    await page.goto(BASE + "/bolos/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".card, .empty", { timeout: 15000 });
    const comprar = page.locator(".btn--acquire").first();
    record(engine, "category has Comprar", (await comprar.count()) > 0);
    if (await comprar.count()) {
      const box = await comprar.boundingBox();
      record(engine, "Comprar min height ~44", box && box.height >= 40, box ? String(box.height) : "missing");
      const buyLook = await comprar.evaluate(function style(el) {
        const cs = getComputedStyle(el);
        function lum(ch) {
          const c = ch / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        function parse(rgb) {
          const m = String(rgb).match(/(\d+),\s*(\d+),\s*(\d+)/);
          return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
        }
        function contrast(a, b) {
          const la = 0.2126 * lum(a[0]) + 0.7152 * lum(a[1]) + 0.0722 * lum(a[2]);
          const lb = 0.2126 * lum(b[0]) + 0.7152 * lum(b[1]) + 0.0722 * lum(b[2]);
          const hi = Math.max(la, lb);
          const lo = Math.min(la, lb);
          return (hi + 0.05) / (lo + 0.05);
        }
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          contrast: contrast(parse(cs.backgroundColor), parse(cs.color)),
          canvases: el.querySelectorAll("canvas").length,
        };
      });
      record(engine, "Comprar has no Hydra canvas", buyLook.canvases === 0, String(buyLook.canvases));
      record(
        engine,
        "Comprar is always-lit wine with white text contrast >= 4.5",
        buyLook.color === "rgb(255, 255, 255)" && buyLook.bg === "rgb(154, 88, 112)" && buyLook.contrast >= 4.5,
        JSON.stringify(buyLook)
      );
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
    await page.waitForSelector('[name="sabor-bolo"]', { timeout: 15000 });
    await page.locator('[name="sabor-bolo"][value="Pistache"]').check();
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await page.keyboard.press("Escape");
    await page.locator('[name="sabor-bolo"][value="Maracujá"]').check();
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
    await checkDesiredDateRule(page, engine, waHits, "390");
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
    await page.evaluate(function clearCart() { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    record(engine, "pay method fieldset visible for priced cart", await page.locator('[data-bind="pay-method"]').isVisible());
    record(engine, "Pix option is available", await page.locator('[data-bind="pay-option-pix"]').isVisible());
    const choiceInCart = await page.evaluate(function place() {
      const cart = document.querySelector("#encomendas");
      const choice = document.querySelector('[data-bind="pay-method"]');
      const btn = document.querySelector('[data-bind="checkout-submit"]');
      if (!cart || !choice || !btn) {
        return { ok: false };
      }
      const cr = choice.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      return {
        ok: true,
        inCart: cart.contains(choice) && cart.contains(btn),
        above: cr.bottom <= br.top + 1,
      };
    });
    record(engine, "pay choice sits in the cart above the pay button", !!(choiceInCart.ok && choiceInCart.inCart && choiceInCart.above), JSON.stringify(choiceInCart));
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    await page.locator('[data-bind="pay-option-pix"]').click();
    await page.waitForSelector('[data-bind="pix-block"]:not([hidden])', { timeout: 5000 });
    record(engine, "Pix QR shown in the cart after selecting Pix", await page.locator('[data-bind="pix-block"]').isVisible());
    const jaPagueiLabel = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(engine, "pay button says Já paguei when Pix is selected", jaPagueiLabel === "Já paguei", jaPagueiLabel);
    await page.locator('#checkout-form [name="nome"]').fill("Pix Teste");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    const pixAlt = (await page.locator('[data-bind="pix-qr"]').getAttribute("alt")) || "";
    record(engine, "Pix QR alt describes the code", /QR Code Pix/i.test(pixAlt), pixAlt);
    const pixSrc = (await page.locator('[data-bind="pix-qr"]').getAttribute("src")) || "";
    record(engine, "Pix QR is an inline image", /^data:image\//.test(pixSrc));
    const pixRetirada = ((await page.locator('[data-bind="pix-value"]').textContent()) || "").trim();
    const payloadRetirada = await page.locator('[data-bind="pix-payload"]').inputValue();
    const pixRetiradaCheck = inspectPixPayload(payloadRetirada, parseBRL(pixRetirada));
    record(engine, "BR Code retirada CRC and EMV (key omitted)", pixRetiradaCheck.ok, pixRetiradaCheck.detail);
    await page.locator('#checkout-form [name="modalidade"][value="entrega"]').check();
    await page.locator('#checkout-form [name="endereco"]').fill("Asa Norte");
    await page.waitForTimeout(200);
    const pixEntrega = ((await page.locator('[data-bind="pix-value"]').textContent()) || "").trim();
    record(engine, "Pix value includes delivery fee", pixEntrega !== pixRetirada && /R\$/.test(pixEntrega), pixRetirada + " -> " + pixEntrega);
    const payloadEntrega = await page.locator('[data-bind="pix-payload"]').inputValue();
    const pixEntregaCheck = inspectPixPayload(payloadEntrega, parseBRL(pixEntrega));
    record(engine, "BR Code entrega amount includes delivery fee", pixEntregaCheck.ok && parseBRL(pixEntrega) === parseBRL(pixRetirada) + 40, pixEntregaCheck.detail);
    await page.locator('[data-action="copy-pix"]').click();
    await page.waitForTimeout(300);
    const copyStatus = ((await page.locator('[data-bind="pix-copy-status"]').textContent()) || "").trim();
    record(engine, "Pix copy announces status", /copiado|não foi possível copiar/i.test(copyStatus), copyStatus);
    const jaPaguei = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(engine, "pay button becomes Já paguei", jaPaguei === "Já paguei", jaPaguei);
    waHits.length = 0;
    await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(function ignoreNav() {});
    await page.waitForTimeout(600);
    const pixWa = waHits.map(function decode(url) {
      try {
        return decodeURIComponent(url);
      } catch (err) {
        return url;
      }
    }).join(" ");
    record(
      engine,
      "WhatsApp says Pix pending not PAGO",
      /Pagamento via Pix — aguardando conferência/.test(pixWa) && /comprovante/.test(pixWa) && !/\bPAGO\b/.test(pixWa) && /Total:/.test(pixWa),
      pixWa.slice(0, 220)
    );

    await page.route("**/data/pagamento.json", function fulfillPayFailCfg(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ infinitepay: { enabled: true, handle: "teste-jana" } }),
      });
    });
    await page.route("https://api.checkout.infinitepay.io/links", async function failLink(route) {
      await route.fulfill({
        status: 502,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ error: "unavailable" }),
      });
    });
    await page.goto(BASE + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
    await page.evaluate(function clearCart() { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    await page.locator('#checkout-form [name="nome"]').fill("Fallback Teste");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    await page.locator('[data-bind="pay-option-infinitepay"]').click();
    waHits.length = 0;
    await page.locator('[data-bind="checkout-submit"]').click();
    await page.waitForTimeout(800);
    const failStatus = ((await page.locator('[data-bind="checkout-status"]').textContent()) || "").trim();
    const failMethod = await page.evaluate(function method() {
      const checked = document.querySelector('#checkout-form [name="pagamento"]:checked');
      return (checked && checked.value) || "";
    });
    const failButton = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(
      engine,
      "card payment failure keeps the cart on Pagar com cartão",
      /cartão/.test(failStatus) && /Pix/.test(failStatus) && failMethod === "infinitepay" && failButton === "Pagar com cartão" && await page.locator('[data-bind="pix-block"]').isHidden() && waHits.length === 0,
      failStatus + " | method=" + failMethod + " | button=" + failButton
    );
    record(engine, "pay choice still in the cart after card payment failure", await page.locator('[data-bind="pay-method"]').isVisible());

    await page.locator('[data-bind="pay-option-pix"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-bind="pay-option-infinitepay"]').click();
    await page.waitForTimeout(200);
    let clickMethod = await page.evaluate(function method() {
      const checked = document.querySelector('#checkout-form [name="pagamento"]:checked');
      return {
        value: (checked && checked.value) || "",
        button: ((document.querySelector('[data-bind="checkout-submit"]') || {}).textContent || "").trim(),
      };
    });
    record(engine, "clicking the card box keeps Pagar com cartão at 390", clickMethod.value === "infinitepay" && clickMethod.button === "Pagar com cartão", JSON.stringify(clickMethod));
    await page.locator('[data-bind="pay-option-pix"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-bind="pay-option-infinitepay"] span').click();
    await page.waitForTimeout(200);
    if (await page.locator('[data-action="qty-plus"]').count()) {
      await page.locator('[data-action="qty-plus"]').first().click();
    }
    await page.locator('#checkout-form [name="modalidade"][value="entrega"]').check();
    await page.locator('#checkout-form [name="endereco"]').fill("Asa Norte");
    await page.waitForTimeout(150);
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    await page.waitForTimeout(150);
    clickMethod = await page.evaluate(function method() {
      const checked = document.querySelector('#checkout-form [name="pagamento"]:checked');
      return {
        value: (checked && checked.value) || "",
        button: ((document.querySelector('[data-bind="checkout-submit"]') || {}).textContent || "").trim(),
      };
    });
    record(engine, "card choice survives quantity and delivery changes at 390", clickMethod.value === "infinitepay" && clickMethod.button === "Pagar com cartão", JSON.stringify(clickMethod));

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
    await page.evaluate(function clearCart() { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await page.locator('#checkout-form [name="modalidade"][value="entrega"]').check();
    await page.locator('#checkout-form [name="endereco"]').fill("Asa Norte");
    await page.locator('#checkout-form [name="nome"]').fill("InfinitePay Teste");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    record(engine, "both pay options visible", await page.locator('[data-bind="pay-option-pix"]').isVisible() && await page.locator('[data-bind="pay-option-infinitepay"]').isVisible());
    const pixOpt = ((await page.locator('[data-bind="pay-option-pix"]').innerText()) || "").replace(/\s+/g, " ").trim();
    const cardOpt = ((await page.locator('[data-bind="pay-option-infinitepay"]').innerText()) || "").replace(/\s+/g, " ").trim();
    record(engine, "pay option labels are Pagar com Pix and Pagar com cartão", pixOpt === "Pagar com Pix" && cardOpt === "Pagar com cartão", JSON.stringify({ pixOpt, cardOpt }));
    record(engine, "pay options do not mention InfinitePay", !/InfinitePay/i.test(pixOpt + " " + cardOpt));
    await page.locator('[data-bind="pay-option-infinitepay"]').click();
    const payLabel = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(engine, "pay button when card is selected", payLabel === "Pagar com cartão", payLabel);
    record(engine, "pay button does not mention InfinitePay", !/InfinitePay/i.test(payLabel));
    record(engine, "Pix QR hidden on InfinitePay choice", await page.locator('[data-bind="pix-block"]').isHidden());
    const paidDisclaimer = ((await page.locator('[data-bind="request-disclaimer"]').textContent()) || "").trim();
    record(engine, "paid-flow disclaimer", /Após o pagamento, seu pedido é enviado/.test(paidDisclaimer), paidDisclaimer.slice(0, 80));
    ensureDir("tests/screenshots");
    ensureDir("/opt/cursor/artifacts");
    await page.screenshot({ path: "tests/screenshots/carrinho-pagar-390.png", fullPage: false });
    await safeShot(page, "/opt/cursor/artifacts/carrinho-pagar-390.png");
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
    const expectedRedirect = String(BASE).replace(/\/$/, "") + "/pagamento/";
    record(engine, "InfinitePay redirect_url uses origin and site base", !!(linkBodies[0] && linkBodies[0].redirect_url === expectedRedirect), linkBodies[0] && linkBodies[0].redirect_url);
    await page.waitForSelector('[data-bind="pagamento-whatsapp"]:not([hidden])', { timeout: 5000 });
    const paidHref = (await page.locator('[data-bind="pagamento-whatsapp"]').getAttribute("href")) || "";
    let paidWa = paidHref;
    try {
      paidWa = decodeURIComponent(paidHref);
    } catch (err) {
      paidWa = paidHref;
    }
    await page.screenshot({ path: "tests/screenshots/pagamento-confirmado-390.png", fullPage: false });
    await safeShot(page, "/opt/cursor/artifacts/pagamento-confirmado-390.png");
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
    record(engine, "unpriced hides pay method choice", await page.locator('[data-bind="pay-method"]').isHidden());
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
    await safeShot(page, "/opt/cursor/artifacts/pausa-modal-390.png");
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
    await safeShot(page, "/opt/cursor/artifacts/doces-personalizados-390.png");
    await checkPhotoOpensProduct(page, engine, "390");

    await page.goto(BASE + "/painel/", { waitUntil: "domcontentloaded" });
    const painelHydra = await page.locator("canvas.hydra-button-bg, [id*='hydra']").count();
    record(engine, "painel has no Hydra", painelHydra === 0);
    const modo = ((await page.locator('[data-bind="painel-modo"]').textContent()) || "").toLowerCase();
    record(engine, "painel stays local while shared list is off", modo.indexOf("neste navegador") !== -1, modo);
    const centralCopy = ((await page.locator('[data-bind="central-status"]').textContent()) || "").toLowerCase();
    record(engine, "painel says shared list is off", centralCopy.indexOf("desligada") !== -1, centralCopy.slice(0, 80));
    const loginHidden = await page.locator('[data-bind="central-login"]').evaluate(function isHidden(el) {
      return el.hasAttribute("hidden") || el.hidden === true;
    });
    record(engine, "central login stays hidden while disabled", loginHidden);
    record(engine, "central API not called while disabled", centralHits.length === 0, String(centralHits.length));

    const redirects = [
      { from: "/sobremesas/", ok: function ok(path) {
        const base = new URL(String(BASE).replace(/\/?$/, "/")).pathname;
        const normalized = path === "" ? "/" : (String(path).endsWith("/") ? path : path + "/");
        return normalized === base;
      } },
      { from: "/cestas-presentes/", ok: function ok(path) { return /\/cestas\/?$/.test(path); } },
      { from: "/personalizado-para-empresas/", ok: function ok(path) { return /\/corporate\/?$/.test(path); } },
      { from: "/corporativo/", ok: function ok(path) { return /\/corporate\/?$/.test(path); } },
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
    record(engine, "corporate title", /Corporativo/i.test(areaTitle), areaTitle);
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

    await checkSobreNos(page, engine, "390");

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

  await withPage(browserType, engine, { width: 1280, height: 800 }, async function desktop(page, waHits) {
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
    const menuLook = await page.evaluate(function measureMenu() {
      const nav = document.querySelector("#menu-principal");
      const items = Array.from(nav.querySelectorAll(":scope > a, :scope > .topo__categories > .topo__categories-btn"));
      const csNav = getComputedStyle(nav);
      const looks = items.map(function styleOf(el) {
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
          color: cs.color,
          border: cs.borderTopWidth + " " + cs.borderTopColor,
          radius: cs.borderRadius,
        };
      });
      const boxes = items.map(function boxOf(el) { return el.getBoundingClientRect(); });
      const gaps = [];
      for (let i = 1; i < boxes.length; i++) {
        gaps.push(Math.round(boxes[i].left - boxes[i - 1].right));
      }
      return { gap: csNav.gap, looks: looks, gaps: gaps };
    });
    await page.locator("body").click({ position: { x: 10, y: 10 } });
    const menuLookAfterBlur = await page.evaluate(function measureMenu() {
      const nav = document.querySelector("#menu-principal");
      const items = Array.from(nav.querySelectorAll(":scope > a, :scope > .topo__categories > .topo__categories-btn"));
      const csNav = getComputedStyle(nav);
      const looks = items.map(function styleOf(el) {
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
          color: cs.color,
          borderWidth: cs.borderTopWidth,
          radius: cs.borderRadius,
          fontSize: cs.fontSize,
          width: el.getBoundingClientRect().width,
        };
      });
      const boxes = items.map(function boxOf(el) { return el.getBoundingClientRect(); });
      const gaps = [];
      for (let i = 1; i < boxes.length; i++) {
        gaps.push(Math.round(boxes[i].left - boxes[i - 1].right));
      }
      return { gap: csNav.gap, looks: looks, gaps: gaps };
    });
    record(
      engine,
      "desktop menu spacing +50% and outline buttons at 90% text",
      menuLookAfterBlur.gap === "24px" &&
        menuLookAfterBlur.gaps.every(function g(v) { return v >= 20; }) &&
        menuLookAfterBlur.looks.length === 3 &&
        menuLookAfterBlur.looks.every(function pill(item) {
          return item.borderWidth === "1px" && item.radius === "999px" && item.color === "rgba(76, 85, 58, 0.9)";
        }) &&
        menuLookAfterBlur.looks.every(function sameSize(item) {
          return item.fontSize === menuLookAfterBlur.looks[0].fontSize;
        }) &&
        new Set(menuLookAfterBlur.looks.map(function w(item) { return Math.round(item.width); })).size === menuLookAfterBlur.looks.length,
      JSON.stringify(menuLookAfterBlur)
    );
    const heroUiDesk = await page.evaluate(function measureHero() {
      const hero = document.querySelector(".hero");
      const controls = document.querySelector(".hero__controls");
      const dots = document.querySelector(".hero__dots");
      const arrows = Array.from(document.querySelectorAll(".hero__arrow"));
      const slide = document.querySelector(".hero__slide");
      const img = document.querySelector(".hero__slide img");
      const dot = document.querySelector(".hero__dot");
      const hr = hero.getBoundingClientRect();
      const cr = controls.getBoundingClientRect();
      return {
        mid: Math.abs((cr.left + cr.right) / 2 - (hr.left + hr.right) / 2),
        bottom: hr.bottom - cr.bottom,
        sizes: arrows.map(function size(el) {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
        cursors: {
          arrow: arrows[0] ? getComputedStyle(arrows[0]).cursor : "",
          slide: slide ? getComputedStyle(slide).cursor : "",
          img: img ? getComputedStyle(img).cursor : "",
          dot: dot ? getComputedStyle(dot).cursor : "",
        },
        dotsInside: !!(dots && controls.contains(dots)),
      };
    });
    record(
      engine,
      "desktop carousel arrows 44px next to dots",
      heroUiDesk.dotsInside && heroUiDesk.mid < 24 && heroUiDesk.bottom < 40 && heroUiDesk.sizes.every(function sz(s) { return s.w === 44 && s.h === 44; }),
      JSON.stringify(heroUiDesk)
    );
    record(
      engine,
      "desktop carousel cursors are pointer",
      heroUiDesk.cursors.arrow === "pointer" &&
        heroUiDesk.cursors.slide === "pointer" &&
        heroUiDesk.cursors.img === "pointer" &&
        heroUiDesk.cursors.dot === "pointer",
      JSON.stringify(heroUiDesk.cursors)
    );
    await checkSobreNos(page, engine, "1280");
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
    await safeShot(page, "/opt/cursor/artifacts/doces-personalizados-1280.png");
    await checkPhotoOpensProduct(page, engine, "1280");

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
    await page.route("**/data/pagamento.json", function fulfillPay(route) {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ infinitepay: { enabled: true, handle: "teste-jana" } }),
      });
    });
    const deskLinks = [];
    await page.route("https://api.checkout.infinitepay.io/links", async function fulfillLink(route) {
      const body = route.request().postDataJSON();
      deskLinks.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          checkout_url: BASE + "/pagamento/?order_nsu=" + encodeURIComponent(body.order_nsu) + "&slug=testslug&transaction_nsu=txn-1&capture_method=credit",
          slug: "testslug",
        }),
      });
    });
    await page.route("https://api.checkout.infinitepay.io/payment_check", async function fulfillCheck(route) {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ success: true, paid: true, amount: 46700, paid_amount: 46700, installments: 1, capture_method: "credit" }),
      });
    });
    await page.goto(BASE + "/produto/?slug=tabua-signature", { waitUntil: "domcontentloaded" });
    await page.evaluate(function clearCart() { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-action="add-from-product"]', { timeout: 15000 });
    await page.locator('[data-action="add-from-product"]').click();
    await page.waitForSelector("#encomendas:not([hidden])");
    await checkDesiredDateRule(page, engine, waHits, "1280");
    record(engine, "desktop pay options visible", await page.locator('[data-bind="pay-method"]').isVisible());
    const deskPixOpt = ((await page.locator('[data-bind="pay-option-pix"]').innerText()) || "").replace(/\s+/g, " ").trim();
    const deskCardOpt = ((await page.locator('[data-bind="pay-option-infinitepay"]').innerText()) || "").replace(/\s+/g, " ").trim();
    record(engine, "desktop pay option labels are Pagar com Pix and Pagar com cartão", deskPixOpt === "Pagar com Pix" && deskCardOpt === "Pagar com cartão", JSON.stringify({ deskPixOpt, deskCardOpt }));
    await page.locator('#checkout-form [name="modalidade"][value="retirada"]').check();
    await page.locator('#checkout-form [name="nome"]').fill("Pix Desktop");
    await page.locator('#checkout-form [name="telefone"]').fill("61900000000");
    await page.locator('#checkout-form [name="pagamento"][value="pix"]').check();
    await page.waitForSelector('[data-bind="pix-block"]:not([hidden])', { timeout: 5000 });
    record(engine, "desktop pay button Já paguei", ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim() === "Já paguei");
    record(engine, "desktop Pix QR shown in the cart after selecting Pix", await page.locator('[data-bind="pix-block"]').isVisible());
    const deskChoice = await page.evaluate(function place() {
      const cart = document.querySelector("#encomendas");
      const choice = document.querySelector('[data-bind="pay-method"]');
      const btn = document.querySelector('[data-bind="checkout-submit"]');
      const cr = choice.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      return cart.contains(choice) && cr.bottom <= br.top + 1;
    });
    record(engine, "desktop pay choice sits above the pay button", deskChoice);
    const deskPixValue = ((await page.locator('[data-bind="pix-value"]').textContent()) || "").trim();
    const deskPix = inspectPixPayload(await page.locator('[data-bind="pix-payload"]').inputValue(), parseBRL(deskPixValue));
    record(engine, "desktop BR Code retirada CRC and EMV (key omitted)", deskPix.ok, deskPix.detail);
    await page.locator('[data-bind="pay-option-infinitepay"]').click();
    const deskPayLabel = ((await page.locator('[data-bind="checkout-submit"]').textContent()) || "").trim();
    record(engine, "desktop pay button Pagar com cartão", deskPayLabel === "Pagar com cartão", deskPayLabel);
    record(engine, "desktop pay button does not mention InfinitePay", !/InfinitePay/i.test(deskPayLabel));
    record(engine, "desktop Pix hidden after switching method", await page.locator('[data-bind="pix-block"]').isHidden());
    if (await page.locator('[data-action="qty-plus"]').count()) {
      await page.locator('[data-action="qty-plus"]').first().click();
    }
    const deskAfterQty = await page.evaluate(function method() {
      const checked = document.querySelector('#checkout-form [name="pagamento"]:checked');
      return (checked && checked.value) || "";
    });
    record(engine, "desktop card choice survives quantity change", deskAfterQty === "infinitepay", deskAfterQty);
    await page.locator('[data-bind="checkout-submit"]').click({ noWaitAfter: true }).catch(function ignoreNav() {});
    await page.waitForURL(/\/pagamento\//, { timeout: 8000 });
    record(engine, "desktop InfinitePay reaches payment page", deskLinks.length >= 1, String(deskLinks.length));
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
