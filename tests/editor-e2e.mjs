// E2E do editor do site (painel → Worker → GitHub simulado → site estático).
// Roda só localmente, por run-local.sh: o GitHub é o mock-github.mjs, que grava cada commit em SITE_DIR,
// e o site é servido de SITE_DIR. Nada real é publicado, enviado ou pago.
// Cobre, em celular (390 px) e computador (1280 px): criar/editar/excluir produto, várias categorias,
// banner com link e imagens de computador/celular, pausa liga/desliga, Natal e Páscoa (manual e por datas),
// textos, desfazer no Histórico e o estado «falta configurar».
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8771";
const W = process.env.W_LOCAL || "http://127.0.0.1:8787";
const ADMIN = process.env.ADMIN || "";
const SITE_DIR = process.env.SITE_DIR || "";
const ENDPOINT = "https://jana-pedidos.test";
if (!ADMIN || !SITE_DIR) {
  console.error("Defina ADMIN e SITE_DIR (use central/jana-pedidos/test/run-local.sh).");
  process.exit(2);
}

const errors = [];
let vpName = "";
const record = (name, ok, detail) => {
  const line = (ok ? "ok   " : "FAIL ") + "[" + vpName + "] " + name + (detail ? " — " + detail : "");
  console.log(line);
  if (!ok) errors.push(line);
};
const readData = (file) => JSON.parse(readFileSync(path.join(SITE_DIR, "data", file), "utf8"));
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const plusDays = (n) => ymd(new Date(Date.now() + n * 86400000));

async function newPage(browser, viewport, opts) {
  const o = opts || {};
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, locale: "pt-BR" });
  const page = await context.newPage();
  page.jsErrors = [];
  page.on("pageerror", (e) => page.jsErrors.push(e.message));
  await page.route(/wa\.me|api\.whatsapp\.com|checkout\.infinitepay\.io/, (route) => route.abort());
  await page.route(ENDPOINT + "/**", (route) => proxy(route, o).catch(() => {})); // ignora pedidos em voo ao fechar a página
  return page;
}

async function proxy(route, o) {
  {
    const req = route.request();
    const url = req.url().replace(ENDPOINT, W);
    if (o.semToken && /\/admin\/conteudo(\?|$)/.test(url) && req.method() === "GET") {
      const res = await route.fetch({ url, headers: Object.assign({}, req.headers(), { origin: BASE }) });
      const body = await res.json();
      body.configurado = false;
      body.motivo = "falta_token";
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": BASE, "access-control-allow-credentials": "true" }, body: JSON.stringify(body) });
    }
    const res = await route.fetch({ url, headers: Object.assign({}, req.headers(), { origin: BASE }) });
    return route.fulfill({ response: res });
  }
}

async function pngFile(page, w, h, color, name) {
  const dataUrl = await page.evaluate(
    ([w, h, color]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.fillRect(w / 4, h / 4, w / 2, h / 2);
      return c.toDataURL("image/png");
    },
    [w, h, color]
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

async function login(page, hash) {
  await page.goto(BASE + "/painel/#" + (hash || "produtos"));
  await page.fill('input[name="password"]', ADMIN);
  await page.click('[data-bind="central-login"] button[type="submit"]');
  await page.waitForSelector('#tab-produtos [data-ed-action="editar-produto"]', { timeout: 20000 });
}

async function tab(page, name) {
  await page.click('.painel-tabs [data-tab="' + name + '"]');
  await page.waitForSelector("#tab-" + name + ":not([hidden])");
}

async function clearStatus(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-ed="status"]');
    if (el) el.textContent = "";
  });
}

// espera o editor dizer «Salvo» e, se dado, a condição nos arquivos publicados (SITE_DIR)
async function waitSaved(page, label, cond) {
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-ed="status"]');
        return el && /Salvo ✓|No ar ✓/.test(el.textContent) && !document.body.classList.contains("ed-ocupado");
      },
      null,
      { timeout: 25000 }
    );
  } catch (e) {
    const txt = await page.locator('[data-ed="status"]').innerText().catch(() => "");
    record(label + ": publicou", false, "status: " + txt);
    return false;
  }
  if (cond) {
    for (let i = 0; i < 40; i++) {
      try {
        if (cond()) return true;
      } catch (e) {
        /* arquivo sendo gravado */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    record(label + ": arquivo publicado", false);
    return false;
  }
  return true;
}

async function confirmDialog(page) {
  await page.waitForSelector('[data-ed="dialog-confirmar"][open] button[value="sim"]');
  await page.click('[data-ed="dialog-confirmar"][open] button[value="sim"]');
}

async function saveTab(page, label, cond) {
  await clearStatus(page);
  await page.click('[data-ed="savebar"] [data-ed-action="salvar-aba"]');
  return waitSaved(page, label, cond);
}

async function publicPage(browser, viewport, url) {
  const page = await newPage(browser, viewport);
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  return page;
}

async function homeAreas(browser, viewport) {
  const p = await publicPage(browser, viewport, "/");
  const r = await p.evaluate(() => ({
    caixas: Array.from(document.querySelectorAll('[data-bind="areas"] a')).map((a) => a.getAttribute("href")),
    menu: Array.from(document.querySelectorAll("#menu-categorias a")).map((a) => a.textContent.trim()),
  }));
  await p.context().close();
  return r;
}

async function run(browser, viewport) {
  vpName = viewport.width + "px";
  const tag = "E2E " + viewport.width;
  const page = await newPage(browser, viewport);
  await login(page, "produtos");
  record("editor abre com 4 abas novas", (await page.locator('.painel-tabs [data-tab]').count()) >= 7);
  record("sem aviso de falta configurar", !(await page.locator('[data-ed="aviso"]').innerText().catch(() => "")).includes("Falta configurar"));
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  record("sem rolagem lateral", width <= viewport.width, "scrollWidth " + width);

  /* ---------- produto: criar com foto e duas categorias ---------- */
  const nome = "Bolo Teste " + tag;
  await page.click('[data-ed-action="novo-produto"]');
  await page.waitForSelector('[data-ed="dialog-produto"][open]');
  await page.fill('[data-ed="form-produto"] input[name="nome"]', nome);
  await page.setInputFiles('[data-ed-file="produto"]', await pngFile(page, 1600, 1200, "#b86e88", "foto.png"));
  await page.waitForSelector('[data-ed="dialog-produto"] .ed-foto img');
  await page.fill('[data-foto-alt="0"]', "Bolo rosa de teste");
  await page.fill('[data-ed="form-produto"] input[name="preco"]', "123,45");
  await page.fill('[data-ed="form-produto"] textarea[name="descricao"]', "Descrição de teste.");
  await page.check('[data-ed="form-produto"] input[name="area"][value="bolos"]');
  await page.check('[data-ed="form-produto"] input[name="area"][value="corporate"]');
  await clearStatus(page);
  await page.click('[data-ed="form-produto"] button[type="submit"]');
  await waitSaved(page, "criar produto", () => readData("products.json").some((p) => p.name === nome));
  let prod = readData("products.json").find((p) => p.name === nome);
  record("produto criado no products.json", !!prod);
  if (prod) {
    const img = prod.images && prod.images[0];
    record("foto convertida (webp/jpg) e gravada", !!img && /\.(webp|jpg)$/.test(img) && readFileSync(path.join(SITE_DIR, img)).length > 100, img);
    record("descrição da foto (alt) salva", (prod.imagesAlt || [])[0] === "Bolo rosa de teste");
    record("preço 123,45", prod.price === 123.45);
    const cats = readData("categories.json");
    const areas = readData("areas.json");
    const inArea = (id) => (areas.find((a) => a.id === id).sourceCategoryIds || []).some((c) => (prod.categoryIds || []).includes(c));
    record("produto em Bolos e Corporativo", inArea("bolos") && inArea("corporate"), JSON.stringify(prod.categoryIds));
    record("categorias existem", (prod.categoryIds || []).every((c) => cats.some((x) => x.id === c)));
    for (const slug of ["bolos", "corporate"]) {
      const p = await publicPage(browser, viewport, "/" + slug + "/");
      const txt = await p.locator("main").innerText();
      record("produto aparece em /" + slug + "/", txt.includes(nome));
      await p.context().close();
    }
    const pp = await publicPage(browser, viewport, "/produto/?slug=" + encodeURIComponent(prod.slug));
    const alt = await pp.evaluate(() => Array.from(document.querySelectorAll("main img")).map((i) => i.alt));
    record("página do produto usa o alt editado", alt.includes("Bolo rosa de teste"), JSON.stringify(alt.slice(0, 3)));
    await pp.context().close();
  }

  /* ---------- produto: editar preço e tirar uma categoria ---------- */
  await page.fill('[data-ed="busca"]', nome);
  await page.click('[data-ed-action="editar-produto"] >> nth=0');
  await page.waitForSelector('[data-ed="dialog-produto"][open]');
  await page.fill('[data-ed="form-produto"] input[name="preco"]', "150");
  await page.uncheck('[data-ed="form-produto"] input[name="area"][value="corporate"]');
  await clearStatus(page);
  await page.click('[data-ed="form-produto"] button[type="submit"]');
  await waitSaved(page, "editar produto", () => readData("products.json").find((p) => p.name === nome).price === 150);
  prod = readData("products.json").find((p) => p.name === nome);
  record("preço editado para 150", prod && prod.price === 150);
  {
    const p = await publicPage(browser, viewport, "/corporate/");
    record("saiu de Corporativo", !(await p.locator("main").innerText()).includes(nome));
    await p.context().close();
    const q = await publicPage(browser, viewport, "/produto/?slug=" + encodeURIComponent(prod.slug));
    record("site mostra R$ 150,00", (await q.locator("main").innerText()).includes("150,00"));
    await q.context().close();
  }

  /* ---------- validação ---------- */
  await page.click('[data-ed-action="novo-produto"]');
  await page.waitForSelector('[data-ed="dialog-produto"][open]');
  await page.click('[data-ed="form-produto"] button[type="submit"]');
  await page.waitForSelector('[data-ed="dialog-produto"] .ed-erros');
  record("validação pede nome", (await page.locator('[data-ed="dialog-produto"] .ed-erros').innerText()).toLowerCase().includes("nome"));
  await page.click('[data-ed="dialog-produto"] .ed-dialog__acoes [data-ed-action="fechar-produto"]');
  if (await page.locator('[data-ed="dialog-confirmar"][open]').count()) await confirmDialog(page);

  /* ---------- produto: excluir com confirmação ---------- */
  await page.fill('[data-ed="busca"]', nome);
  await page.click('[data-ed-action="editar-produto"] >> nth=0');
  await page.waitForSelector('[data-ed="dialog-produto"][open]');
  await page.click('[data-ed-action="excluir-produto"]');
  await page.waitForSelector('[data-ed="dialog-confirmar"][open]');
  record("pede confirmação antes de excluir", true);
  await clearStatus(page);
  await confirmDialog(page);
  await waitSaved(page, "excluir produto", () => !readData("products.json").some((p) => p.name === nome));
  record("produto excluído", !readData("products.json").some((p) => p.name === nome));
  await page.fill('[data-ed="busca"]', "");

  /* ---------- banner com link e imagens de computador e celular ---------- */
  await tab(page, "carrossel");
  await page.click('[data-ed-action="novo-banner"]');
  await page.waitForSelector('[data-ed="dialog-banner"][open]');
  await page.setInputFiles('[data-ed-file="banner-pc"]', await pngFile(page, 2400, 700, "#4c553a", "pc.png"));
  await page.waitForSelector('[data-ed="dialog-banner"] .ed-preview--pc img');
  await page.setInputFiles('[data-ed-file="banner-cel"]', await pngFile(page, 1200, 800, "#b86e88", "cel.png"));
  await page.waitForSelector('[data-ed="dialog-banner"] .ed-preview--cel img');
  const titulo = "Banner de teste " + tag;
  await page.fill('[data-ed="form-banner"] input[name="title"]', titulo);
  await page.check('[data-ed="form-banner"] input[name="linkTipo"][value="url"]');
  await page.waitForSelector('[data-ed="form-banner"] input[name="url"]');
  await page.fill('[data-ed="form-banner"] input[name="url"]', "https://www.instagram.com/janaabreuconfeitaria/");
  await page.click('[data-ed="form-banner"] button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-ed="dialog-banner"]').open);
  record("barra «Salvar e publicar» aparece", await page.locator('[data-ed="savebar"]').isVisible());
  await saveTab(page, "banner", () => readData("carousel.json").some((s) => s.title === titulo));
  const slide = readData("carousel.json").find((s) => s.title === titulo);
  record("banner salvo com link e duas imagens", !!slide && slide.linkTipo === "url" && !!slide.image && !!slide.imageMobile && slide.formato === "banner", JSON.stringify(slide));
  if (slide) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const p = await publicPage(browser, vp, "/");
      const info = await p.evaluate((t) => {
        const img = Array.from(document.querySelectorAll(".hero__slide img")).find((i) => i.alt === t);
        if (!img) return null;
        img.loading = "eager";
        const a = img.closest("a");
        const src = img.closest("picture") && img.closest("picture").querySelector("source");
        return { href: a && a.getAttribute("href"), target: a && a.target, media: src && src.media, srcset: src && src.getAttribute("srcset") };
      }, titulo);
      await p.waitForTimeout(300);
      const current = await p.evaluate((t) => {
        const img = Array.from(document.querySelectorAll(".hero__slide img")).find((i) => i.alt === t);
        return img ? img.currentSrc : "";
      }, titulo);
      const esperado = vp.width < 720 ? slide.imageMobile : slide.image;
      record(
        "banner no site (" + vp.width + "px): link, <picture> e imagem certa",
        !!info && info.href === "https://www.instagram.com/janaabreuconfeitaria/" && info.target === "_blank" && info.media === "(max-width: 719px)" && current.endsWith(esperado),
        JSON.stringify(info) + " currentSrc=" + current
      );
      await p.context().close();
    }
  }
  // remover o banner de teste (confirmação + publicar)
  const card = page.locator(".ed-banner", { hasText: titulo });
  await card.locator('[data-ed-action="remover-banner"]').click();
  await confirmDialog(page);
  await saveTab(page, "remover banner", () => !readData("carousel.json").some((s) => s.title === titulo));
  record("banner removido", !readData("carousel.json").some((s) => s.title === titulo));

  /* ---------- pausa: até uma data, depois desligar ---------- */
  await tab(page, "datas");
  await page.check('input[name="pausa-modo"][value="ate"]');
  await page.fill('input[name="pausa-fim"]', plusDays(5));
  await page.waitForSelector(".ed-previa");
  const previa = await page.locator(".ed-previa").innerText();
  record("prévia do aviso «até»", /Não estamos aceitando encomendas até/.test(previa), previa);
  await saveTab(page, "pausa ligada", () => readData("pausa.json").ativo === true);
  {
    const p = await publicPage(browser, viewport, "/");
    await p.click('[data-action="open-cart"] >> nth=0');
    const modal = p.locator(".pausa-modal [data-bind=\"pausa-mensagem\"]");
    await modal.waitFor({ timeout: 5000 }).catch(() => {});
    const msg = await modal.innerText().catch(() => "");
    record("site bloqueia encomenda com o aviso", /até/.test(msg), msg);
    await p.context().close();
  }
  await page.check('input[name="pausa-modo"][value="aberto"]');
  await saveTab(page, "pausa desligada", () => readData("pausa.json").ativo === false);
  {
    const p = await publicPage(browser, viewport, "/");
    await p.click('[data-action="open-cart"] >> nth=0');
    await p.waitForTimeout(600);
    const bloqueado = await p.locator(".pausa-modal").isVisible().catch(() => false);
    const aberto = await p.locator("#encomendas").isVisible().catch(() => false);
    record("pausa desligada: carrinho abre", !bloqueado && aberto);
    await p.context().close();
  }
  record("pausa.json sem pausa", readData("pausa.json").ativo === false);

  /* ---------- Natal e Páscoa ---------- */
  await page.check('input[name="saz-natal"][value="ligado"]');
  await saveTab(page, "natal ligado", () => readData("areas.json").find((a) => a.id === "natal").ativacao.modo === "ligado");
  let h = await homeAreas(browser, viewport);
  record("Natal ligado: caixinha na home e item no menu", h.caixas.some((x) => /natal\/$/.test(x)) && h.menu.includes("Natal"), JSON.stringify(h.menu));
  record("Páscoa desligada continua escondida", !h.menu.includes("Páscoa"));
  {
    const p = await publicPage(browser, viewport, "/natal/");
    const txt = await p.locator("main").innerText();
    record("página de Natal ativa", !txt.includes("não está disponível"));
    await p.context().close();
  }
  await page.check('input[name="saz-natal"][value="datas"]');
  await page.fill('[data-sazonal-data="natal"][data-campo="inicio"]', plusDays(10));
  await page.fill('[data-sazonal-data="natal"][data-campo="fim"]', plusDays(20));
  await page.check('input[name="saz-pascoa"][value="datas"]');
  await page.fill('[data-sazonal-data="pascoa"][data-campo="inicio"]', plusDays(0));
  await page.fill('[data-sazonal-data="pascoa"][data-campo="fim"]', plusDays(3));
  record("editor mostra Páscoa aparecendo e Natal escondido", (await page.locator('.ed-sazonal[data-area="pascoa"] .ed-estado--on').count()) === 1 && (await page.locator('.ed-sazonal[data-area="natal"] .ed-estado--off').count()) === 1);
  await saveTab(page, "datas comemorativas por data", () => readData("areas.json").find((a) => a.id === "pascoa").ativacao.modo === "datas");
  h = await homeAreas(browser, viewport);
  record("por datas: Páscoa (hoje) aparece, Natal (futuro) não", h.menu.includes("Páscoa") && !h.menu.includes("Natal") && h.caixas.some((x) => /pascoa\/$/.test(x)), JSON.stringify(h.menu));
  const areasNow = readData("areas.json");
  record("ativação gravada em areas.json", areasNow.find((a) => a.id === "pascoa").ativacao.modo === "datas" && areasNow.find((a) => a.id === "natal").ativacao.inicio === plusDays(10));
  await page.check('input[name="saz-natal"][value="desligado"]');
  await page.check('input[name="saz-pascoa"][value="desligado"]');
  await saveTab(page, "datas comemorativas desligadas", () => readData("areas.json").every((a) => !a.ativacao || a.ativacao.modo === "desligado"));
  h = await homeAreas(browser, viewport);
  record("desligadas: nenhuma aparece", !h.menu.includes("Páscoa") && !h.menu.includes("Natal"), JSON.stringify(h.menu));
  {
    const p = await publicPage(browser, viewport, "/pascoa/");
    record("página de Páscoa desligada avisa", (await p.locator("main").innerText()).includes("não está disponível"));
    await p.context().close();
  }

  /* ---------- textos ---------- */
  await tab(page, "textos");
  const sloganAntigo = readData("site.json").slogan;
  const sloganNovo = "Slogan de teste " + tag;
  await page.fill('[data-tx="site.slogan"]', sloganNovo);
  await saveTab(page, "slogan", () => readData("site.json").slogan === sloganNovo);
  {
    const p = await publicPage(browser, viewport, "/");
    const s = await p.locator('[data-bind="slogan"], [data-bind="tagline"]').first().innerText().catch(() => "");
    record("slogan novo no site", s.includes(sloganNovo), s);
    await p.context().close();
  }

  /* ---------- desfazer no Histórico ---------- */
  await tab(page, "historico");
  await page.waitForSelector('[data-ed-action="desfazer"]', { timeout: 10000 });
  await clearStatus(page);
  await page.click('[data-ed-action="desfazer"] >> nth=0');
  await clearStatus(page);
  await confirmDialog(page);
  await waitSaved(page, "desfazer", () => readData("site.json").slogan === sloganAntigo);
  record("desfazer volta o slogan", readData("site.json").slogan === sloganAntigo);

  record("sem erros de JavaScript no editor", page.jsErrors.length === 0, page.jsErrors.join(" | "));
  await page.context().close();
}

async function semToken(browser) {
  vpName = "390px";
  const page = await newPage(browser, { width: 390, height: 844 }, { semToken: true });
  await login(page, "produtos");
  const aviso = await page.locator('[data-ed="aviso"]').innerText().catch(() => "");
  record("sem chave do GitHub: avisa «Falta configurar»", aviso.includes("Falta configurar"), aviso.slice(0, 80));
  await page.click('[data-ed-action="editar-produto"] >> nth=0');
  await page.waitForSelector('[data-ed="dialog-produto"][open]');
  record("sem chave: botão salvar desativado", await page.locator('[data-ed="form-produto"] button[type="submit"]').isDisabled());
  await page.context().close();
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
try {
  await run(browser, { width: 390, height: 844 });
  await run(browser, { width: 1280, height: 900 });
  await semToken(browser);
} catch (e) {
  errors.push("erro: " + (e && e.stack ? e.stack : e));
  console.log("FAIL [" + vpName + "] " + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
}
console.log(errors.length ? "\n" + errors.length + " falha(s)" : "\nTodos os testes do editor passaram");
process.exit(errors.length ? 1 : 0);
