import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
const categories = JSON.parse(readFileSync(join(root, "data/categories.json"), "utf8"));
const areas = JSON.parse(readFileSync(join(root, "data/areas.json"), "utf8"));
const carousel = JSON.parse(readFileSync(join(root, "data/carousel.json"), "utf8"));
const products = JSON.parse(readFileSync(join(root, "data/products.json"), "utf8"));
const home = readFileSync(join(root, "index.html"), "utf8");

const errors = [];

if (site.contato.whatsapp !== "5561981246112") {
  errors.push("WhatsApp must be 5561981246112");
}
if (site.contato.whatsappLabel !== "(61) 98124-6112") {
  errors.push("WhatsApp label must be (61) 98124-6112");
}
if (site.contato.instagram.handle !== "@janaabreuconfeitaria") {
  errors.push("Instagram handle mismatch");
}
if (site.contato.instagram.url !== "https://www.instagram.com/janaabreuconfeitaria/") {
  errors.push("Instagram URL mismatch");
}
if (!/A vida é mais doce quando compartilhada/.test(site.slogan || site.tagline || "")) {
  errors.push("Slogan must be «A vida é mais doce quando compartilhada»");
}
if (/feitos com carinho/i.test(JSON.stringify(site))) {
  errors.push("Remove «doces feitos com carinho» from site copy");
}
if (!Array.isArray(site.instagramGallery) || site.instagramGallery.length < 6) {
  errors.push("instagramGallery needs 6 placeholders");
}

const categoryIds = new Set(categories.map((item) => item.id));
const catalogIds = [
  "cestas-presentes",
  "personalizado-para-empresas",
  "combos-festa",
  "bolos",
  "festa-personalizada",
  "doces-festa",
  "sobremesas",
  "natal",
];
catalogIds.forEach((id) => {
  if (!categoryIds.has(id)) errors.push("Missing catalog category " + id);
});
const sobremesas = categories.find((item) => item.id === "sobremesas");
if (!sobremesas || sobremesas.hidden !== true) {
  errors.push("Sobremesas must remain in the catalog with hidden: true");
}
if (!site.natal || site.natal.enabled !== false) {
  errors.push("Natal must stay off by default in data/site.json");
}
if (site.copyright !== "© 2026 Jana Abreu") {
  errors.push("Copyright must be «© 2026 Jana Abreu»");
}

const expectedAreas = ["corporate", "bolos", "cestas", "doces-personalizados", "natal"];
const areaById = new Map(areas.map((item) => [item.id, item]));
expectedAreas.forEach((id) => {
  if (!areaById.has(id)) errors.push("Missing area " + id);
});
const natalArea = areaById.get("natal");
if (!natalArea || natalArea.seasonal !== true) {
  errors.push("Natal area must be marked seasonal");
}
const corporate = areaById.get("corporate");
if (!corporate || corporate.sourceCategoryIds.join(",") !== "personalizado-para-empresas") {
  errors.push("Corporativo must map from Personalizado para Empresas");
}
const doces = areaById.get("doces-personalizados");
if (
  !doces ||
  ["combos-festa", "doces-festa", "festa-personalizada"].some(
    (id) => !doces.sourceCategoryIds.includes(id)
  )
) {
  errors.push("Doces personalizados must join combos-festa, doces-festa and festa-personalizada");
}

areas.forEach((area) => {
  const slug = area.slug || area.id;
  if (!slug) {
    errors.push("Area missing slug: " + JSON.stringify(area));
    return;
  }
  if (/_/.test(slug)) {
    errors.push("Area slug has underscore: " + slug);
  }
  if (/[A-ZÀ-ÿ\s]/.test(slug)) {
    errors.push("Area slug must be lowercase hyphenated: " + slug);
  }
  const page = join(root, slug, "index.html");
  if (!existsSync(page)) {
    errors.push("Missing area page " + slug + "/index.html");
  } else {
    const html = readFileSync(page, "utf8");
    if (!html.includes('data-page="area"')) {
      errors.push(slug + "/index.html must set data-page=area");
    }
    if (!html.includes('data-area="' + slug + '"')) {
      errors.push(slug + "/index.html must set data-area=" + slug);
    }
    if (!html.includes('data-bind="products"')) {
      errors.push(slug + "/index.html must list products");
    }
    if (!html.includes("hero--compact")) {
      errors.push(slug + "/index.html must use the compact carousel");
    }
  }
});

const redirects = {
  "sobremesas": "../",
  "combos-festa": "../doces-personalizados/",
  "doces-festa": "../doces-personalizados/",
  "festa-personalizada": "../doces-personalizados/",
  "personalizado-para-empresas": "../corporate/",
  "corporativo": "../corporate/",
  "cestas-presentes": "../cestas/",
};
Object.keys(redirects).forEach((slug) => {
  const page = join(root, slug, "index.html");
  if (!existsSync(page)) {
    errors.push("Missing redirect page " + slug + "/index.html");
    return;
  }
  const html = readFileSync(page, "utf8");
  const target = redirects[slug];
  if (!html.includes('http-equiv="refresh"') || !html.includes(target) || !html.includes("location.replace")) {
    errors.push(slug + " must statically redirect to " + target);
  }
  if (html.includes('data-page="category"') || html.includes('data-bind="products"')) {
    errors.push(slug + " must not remain a live category page");
  }
});

if (home.includes('id="catalogo"') || home.includes('data-bind="products"')) {
  errors.push("Home must not include the mixed product vitrine");
}
if (home.includes('class="visita"') || /venha nos visitar/i.test(home)) {
  errors.push("Home must not include the visit/address block");
}
if (home.includes('id="destaques"') || home.includes("sobremesas-band") || home.includes('data-bind="categories"')) {
  errors.push("Home must not include GoldKo categories, destaques or Sobremesas");
}
if (!home.includes('data-bind="areas"') || !home.includes('toggle-categories')) {
  errors.push("Home must list area buttons and the Categorias dropdown");
}
if (/Natal/.test(home) && /href="natal\/"/.test(home)) {
  errors.push("Home HTML must not link Natal while it is off");
}
const storefrontPages = [
  "index.html",
  "produto/index.html",
  "sobre-nos/index.html",
  "encomendas/index.html",
  ...expectedAreas.map((id) => id + "/index.html"),
];
storefrontPages.forEach((rel) => {
  const html = readFileSync(join(root, rel), "utf8");
  if (/<h3>Endereço<\/h3>/.test(html) || /data-bind="address"/.test(html) || /data-bind="hours"/.test(html)) {
    errors.push(rel + " footer must not show Endereço / hours stubs");
  }
  if (!html.includes("viewport-fit=cover")) {
    errors.push(rel + " needs viewport-fit=cover for iOS safe areas");
  }
  if (!html.includes('role="dialog"') || !html.includes("checkout-status")) {
    errors.push(rel + " cart drawer needs dialog role and checkout status");
  }
  if (/hydra-synth@1\.4\.0/.test(html)) {
    errors.push(rel + " must not load Hydra as a blocking CDN script");
  }
  if (!html.includes("request-disclaimer") || !html.includes("Enviar solicitação no WhatsApp")) {
    errors.push(rel + " checkout must show solicitation disclaimer and CTA");
  }
  if (!html.includes("js/central.js")) {
    errors.push(rel + " must load central.js");
  }
  if (/cdn\.jsdelivr|unpkg\.com|qrcode@/.test(html)) {
    errors.push(rel + " must not load QR Code from a CDN");
  }
  if (!html.includes("js/pix.js") || !html.includes("js/vendor/qrcode-generator.js")) {
    errors.push(rel + " must load local pix.js and vendorized QR library");
  }
  if (!html.includes("js/pagamento.js") || !html.includes("js/pausa.js")) {
    errors.push(rel + " must load pagamento.js and pausa.js");
  }
  if (!html.includes('data-bind="pix-block"') || !html.includes("Copiar código Pix") || !html.includes("Pagar com Pix")) {
    errors.push(rel + " checkout must include the Pagar com Pix block");
  }
  const nav = html.split('id="menu-principal"')[1]?.split("</nav>")[0] || "";
  if (/data-action="open-cart">Encomendas</.test(nav) || />Encomendas<\/a>/.test(nav)) {
    errors.push(rel + " main menu must not include Encomendas");
  }
  if (!nav.includes("Início") || !nav.includes("Categorias") || !nav.includes("Sobre nós")) {
    errors.push(rel + " main menu must be Início, Categorias, Sobre nós");
  }
  if (!html.includes("cart-button") || !html.includes("cart-count")) {
    errors.push(rel + " must keep the cart icon with a counter");
  }
});
if (home.includes('data-action="filter-category"')) {
  errors.push("Home must link to category pages instead of filtering in place");
}
const appJs = readFileSync(join(root, "js/app.js"), "utf8");
const componentsCss = readFileSync(join(root, "css/components.css"), "utf8");
const painelJs = readFileSync(join(root, "js/painel.js"), "utf8");
if (appJs.includes("bolinha") || /class="bolinha/.test(home)) {
  errors.push("Category nav must use square cards, not circular bolinhas");
}
if (!appJs.includes("area-button") || !appJs.includes("toggle-categories") || !appJs.includes("visibleAreas")) {
  errors.push("Home menu must render area buttons and a Categorias dropdown from JSON");
}
const utilsJs = readFileSync(join(root, "js/utils.js"), "utf8");
if (!appJs.includes("data/areas.json") || !utilsJs.includes("isNatalEnabled") || !utilsJs.includes("visibleAreas")) {
  errors.push("app.js must load areas.json and honor natal.enabled");
}

if (products.length < 6) errors.push("Need at least 6 products");
products.forEach((product) => {
  if (product.categoryId && !categoryIds.has(product.categoryId)) {
    errors.push("Unknown category on " + product.slug);
  }
  if (typeof product.price !== "number") {
    errors.push("Price must be a number: " + product.slug);
  }
  if (!Array.isArray(product.images) || product.images.length < 1) {
    errors.push("Need a gallery on " + product.slug);
  }
});

if (carousel.length < 3) errors.push("Carousel needs at least 3 slides");

if (home.includes("hydra-background") || home.includes("hero__brand-title")) {
  errors.push("Home must not use Hydra page background or a typed hero brand title");
}
if (/feitos com carinho/i.test(home)) {
  errors.push("Home still mentions «feitos com carinho»");
}
if (!existsSync(join(root, "assets/brand/logo-jana-abreu.png"))) {
  errors.push("Missing official logo assets/brand/logo-jana-abreu.png");
}
if (!existsSync(join(root, "assets/brand/padronagem.svg"))) {
  errors.push("Missing damask pattern assets/brand/padronagem.svg");
}
if (!existsSync(join(root, "produto/index.html"))) {
  errors.push("Missing product detail page produto/index.html");
} else {
  const productPage = readFileSync(join(root, "produto/index.html"), "utf8");
  if (!productPage.includes("Mais informações sobre este produto")) {
    errors.push("Product page needs «Mais informações sobre este produto»");
  }
  if (!productPage.includes("Comprar")) {
    errors.push("Product page needs «Comprar»");
  }
}

const flavorsPath = join(root, "data/sabores-bolos.json");
const expectedFlavors = [
  { nome: "Chocolatudo", descricao: "Massa de chocolate e recheio chocolatudo" },
  { nome: "Pink lemonade", descricao: "Creme de limão & cerejas ao marrasquino" },
  { nome: "Cookies & Cream", descricao: "Creme com pedaços de cookie de baunilha com chocolate" },
  { nome: "Doce de leite com nozes", descricao: "" },
  { nome: "Doce de leite com nozes e chocolate", descricao: "" },
  { nome: "Doce de leite com chocolate", descricao: "" },
  { nome: "Torta de limão", descricao: "Creme de limão com pedaços de biscoito amanteigado" },
  { nome: "Maracujá", descricao: "" },
  { nome: "Prestígio", descricao: "Coco & chocolate" },
  { nome: "Creme de chocolate", descricao: "Massa baunilha, com recheio chocolatudo" },
  { nome: "2 Amores", descricao: "Chocolate branco & preto" },
  { nome: "Bombom de uva", descricao: "Uvas frescas, creme & ganache de chocolate" },
  { nome: "Morangos com creme (sazonal)", descricao: "" },
  { nome: "Geleia de morango", descricao: "Recheio de creme com geleia de morango" },
  { nome: "Capuccino", descricao: "Ganache de chocolate, doce de leite e café" },
  { nome: "Pistache", descricao: "Creme de pistache com pedaços" },
  { nome: "Ninho com Nutella", descricao: "" },
];
if (!existsSync(flavorsPath)) {
  errors.push("Missing data/sabores-bolos.json");
} else {
  const flavors = JSON.parse(readFileSync(flavorsPath, "utf8"));
  if (!Array.isArray(flavors.flavors) || flavors.flavors.length !== expectedFlavors.length) {
    errors.push("sabores-bolos.json must list the 17 official client bolo flavors");
  }
  expectedFlavors.forEach((expected, index) => {
    const actual = flavors.flavors && flavors.flavors[index];
    if (!actual || actual.nome !== expected.nome) {
      errors.push("sabor " + (index + 1) + " must be " + expected.nome);
    }
    if (actual && (actual.descricao || "") !== expected.descricao) {
      errors.push("sabor " + expected.nome + " description mismatch");
    }
  });
}
if (existsSync(join(root, "js/app.js"))) {
  const app = readFileSync(join(root, "js/app.js"), "utf8");
  if (!app.includes("data/sabores-bolos.json")) {
    errors.push("app.js must load data/sabores-bolos.json");
  }
  if (!app.includes("flavor-radios__desc") || !app.includes("flavorOptionLabel")) {
    errors.push("Flavor picker must show official name + description");
  }
}

const painel = readFileSync(join(root, "painel/index.html"), "utf8");
if (painel.includes("hydra")) {
  errors.push("Painel must not load Hydra");
}
if (!/Canal compartilhado desligado/.test(painel) || !/data-bind="central-login" hidden/.test(painel)) {
  errors.push("Painel must keep shared channel off by default");
}
const centralJs = readFileSync(join(root, "js/central.js"), "utf8");
if (/ADMIN_TOKEN|secret-admin|workers\.dev/.test(centralJs)) {
  errors.push("js/central.js must not contain admin secrets or a live endpoint");
}

const official = site.colors || {};
if (official.primary !== "#b86e88") {
  errors.push("site.json primary must be official dusty rose #b86e88");
}
if (official.secondary !== "#f5d5e0") {
  errors.push("site.json secondary must be official light pink #f5d5e0");
}
if (official.cream !== "#fdf6ec") {
  errors.push("site.json cream must be official #fdf6ec");
}
if (official.ink !== "#4c553a") {
  errors.push("site.json ink must be official olive #4c553a");
}

const baseCss = readFileSync(join(root, "css/base.css"), "utf8");
if (!baseCss.includes("--primary: #b86e88")) {
  errors.push("base.css --primary must be #b86e88");
}
if (!baseCss.includes("--ink: #4c553a")) {
  errors.push("base.css --ink must be #4c553a");
}
if (!baseCss.includes("--cream: #fdf6ec")) {
  errors.push("base.css --cream must be #fdf6ec");
}
if (!baseCss.includes("--btn-solid: #9a5870")) {
  errors.push("filled buttons must use AA dusty-rose variant #9a5870");
}
if (!baseCss.includes("opacity: 0.08")) {
  errors.push("page damask must be 8% opacity (20% lighter than 0.10)");
}
const layoutCss = readFileSync(join(root, "css/layout.css"), "utf8");
if (!layoutCss.includes("font-size: 1.83rem")) {
  errors.push("Início, Categorias and Sobre nós must be 50% larger (1.83rem)");
}
if (!layoutCss.includes("min-height: 416px")) {
  errors.push("desktop home carousel must be 20% shorter (416px)");
}
if (!layoutCss.includes("hero--compact")) {
  errors.push("area pages need a compact carousel");
}
if (!layoutCss.includes("opacity: 0.05")) {
  errors.push("menu panel damask must be 5% opacity");
}
if (!home.includes("© 2026 Jana Abreu")) {
  errors.push("Home footer must show «© 2026 Jana Abreu»");
}
if (!home.includes("Brasília DF") && !home.includes("city-state")) {
  errors.push("Footer must show Brasília DF");
}
if (home.includes("Ver opções") || home.includes("hero-caption") || home.includes("hero__below")) {
  errors.push("Home carousel must be photos only, without caption or Ver opções");
}
if (home.includes('data-bind="instagram-grid"') || home.includes("instagram--strip")) {
  errors.push("Instagram preview must not appear on the home page");
}
if (!home.includes("sobre-nos/") || !home.includes("Sobre nós")) {
  errors.push("Home nav must include Sobre nós");
}
if (!existsSync(join(root, "sobre-nos/index.html"))) {
  errors.push("Missing sobre-nos/index.html");
} else {
  const sobrePage = readFileSync(join(root, "sobre-nos/index.html"), "utf8");
  if (!sobrePage.includes('data-bind="instagram-grid"')) {
    errors.push("Instagram preview must appear only on Sobre nós");
  }
}
if (!existsSync(join(root, "data/sobre.json"))) {
  errors.push("Missing data/sobre.json");
}
if (!baseCss.includes("--radius: 17.68px")) {
  errors.push("card/carousel radius must be 17.68px (15% less rounded than 20.8px)");
}
if (!utilsJs.includes("CAROUSEL_INTERVAL_MS = 6720") || !utilsJs.includes("CAROUSEL_TRANSITION_MS = 1200")) {
  errors.push("home and area carousels must share 6720ms interval and 1200ms transition");
}
if (!layoutCss.includes("min-height: 288px")) {
  errors.push("desktop area carousel must be 20% taller (288px)");
}
if (!home.includes('name="modalidade"') || !home.includes("Retirada") || !home.includes("Entrega")) {
  errors.push("Checkout must offer required Retirada / Entrega radios");
}
if (!site.entrega || site.entrega.taxa !== 40) {
  errors.push("entrega.taxa must be the confirmed fixed fee 40");
}
if (!appJs.includes("carouselSlidesFromProducts") || !utilsJs.includes("carouselSlidesFromProducts")) {
  errors.push("area carousels must be built from catalog products of that area");
}
if (!appJs.includes("data/pix.json") || !appJs.includes("pixIsReady") || !appJs.includes("buildPixPayload")) {
  errors.push("app.js must load data/pix.json and render Pix only when ready");
}
const pixPath = join(root, "data/pix.json");
if (!existsSync(pixPath)) {
  errors.push("Missing data/pix.json");
} else {
  const pix = JSON.parse(readFileSync(pixPath, "utf8"));
  if (pix.enabled !== false || pix.chave !== "" || pix.nome !== "" || pix.cidade !== "") {
    errors.push("data/pix.json must ship empty (enabled false, chave/nome/cidade blank) until Jana fills the real key");
  }
  if (/teste@exemplo\.com/i.test(JSON.stringify(pix))) {
    errors.push("data/pix.json must not contain test Pix keys");
  }
}
if (!existsSync(join(root, "js/pix.js")) || !existsSync(join(root, "js/vendor/qrcode-generator.js"))) {
  errors.push("Pix payload builder and MIT QR vendor file are required");
} else {
  const qrVendor = readFileSync(join(root, "js/vendor/qrcode-generator.js"), "utf8");
  if (!/MIT license/i.test(qrVendor)) {
    errors.push("QR vendor file must keep its MIT license header");
  }
}

const pagamentoPath = join(root, "data/pagamento.json");
if (!existsSync(pagamentoPath)) {
  errors.push("Missing data/pagamento.json");
} else {
  const pagamento = JSON.parse(readFileSync(pagamentoPath, "utf8"));
  const handle = pagamento.infinitepay && typeof pagamento.infinitepay.handle === "string" ? pagamento.infinitepay.handle : "";
  if (!pagamento.infinitepay || pagamento.infinitepay.enabled !== true || !handle || /\s/.test(handle) || handle.startsWith("$")) {
    errors.push("data/pagamento.json must have infinitepay.enabled true and a handle without spaces or a leading $");
  }
}
const pausaPath = join(root, "data/pausa.json");
if (!existsSync(pausaPath)) {
  errors.push("Missing data/pausa.json");
} else {
  const pausa = JSON.parse(readFileSync(pausaPath, "utf8"));
  if (
    pausa.ativo !== false ||
    pausa.inicio !== "" ||
    pausa.fim !== "" ||
    pausa.mensagem !== "" ||
    !Array.isArray(pausa.periodos) ||
    pausa.periodos.length !== 0 ||
    pausa.fimDeSemana !== false ||
    pausa.planilhaCsv !== ""
  ) {
    errors.push("data/pausa.json must ship fully disabled and empty");
  }
}
if (!existsSync(join(root, "docs/pausa.md"))) {
  errors.push("Missing docs/pausa.md for Jana");
}
if (!existsSync(join(root, "pagamento/index.html"))) {
  errors.push("Missing pagamento/index.html");
} else {
  const payPage = readFileSync(join(root, "pagamento/index.html"), "utf8");
  if (/X-Api-Key|inchk_/.test(payPage)) {
    errors.push("pagamento page must never mention an API key");
  }
}
if (!existsSync(join(root, "encomendas/index.html"))) {
  errors.push("Missing encomendas/index.html cart URL");
}
["js/app.js", "js/pagamento.js", "js/pagamento-retorno.js", "js/pausa.js", "js/painel.js"].forEach((rel) => {
  const text = readFileSync(join(root, rel), "utf8");
  if (/inchk_|X-Api-Key/.test(text)) {
    errors.push(rel + " must never send or store an InfinitePay API key");
  }
});
if (!componentsCss.includes("aspect-ratio: 1 / 1") || !componentsCss.includes("-webkit-line-clamp: 2") || !componentsCss.includes("card__excerpt")) {
  errors.push("product cards must use square photos, 2-line names and clamped excerpts");
}
if (!appJs.includes("card__excerpt") || !appJs.includes("productCardExcerpt")) {
  errors.push("product cards must render a short description");
}
if (!appJs.includes("Pagar e enviar pedido") || !appJs.includes("PAID_DISCLAIMER")) {
  errors.push("checkout must switch to InfinitePay pay-and-send copy when enabled");
}
if (!painelJs.includes("status_pagamento") || !painelJs.includes("order_nsu") || !painelJs.includes("comprovante")) {
  errors.push("painel CSV must include payment columns");
}

const productBySlug = new Map(products.map((item) => [item.slug, item]));
carousel.forEach((slide) => {
  if (!slide.productSlug || !productBySlug.has(slide.productSlug)) {
    errors.push("home carousel slide missing catalog product: " + (slide.productSlug || slide.id));
  }
});
const unmatchedHome = carousel.filter((slide) => !productBySlug.has(slide.productSlug));
if (unmatchedHome.length) {
  errors.push("unmatched home carousel photos: " + unmatchedHome.map((slide) => slide.image).join(", "));
}

if (/TODO/i.test(JSON.stringify(site))) {
  errors.push("site.json still contains TODO placeholders");
}
if (/exemplo/i.test(JSON.stringify(site.contato || {}))) {
  errors.push("site.json still contains placeholder email");
}
if (!/solicitação de encomenda/i.test(site.requestDisclaimer || "")) {
  errors.push("site.json must include the solicitation disclaimer");
}
if (!site.central || site.central.enabled !== false) {
  errors.push("central must stay disabled until a real backend is provisioned");
}
if (site.central && site.central.endpoint) {
  errors.push("central.endpoint must stay empty until provisioned");
}
const tabua = products.find((item) => item.slug === "tabua-signature");
if (!tabua || /incluindoCharcutaria/.test(tabua.description) || !/incluindo charcutaria/.test(tabua.description)) {
  errors.push("tabua-signature description must fix incluindoCharcutaria");
}
if (!readFileSync(join(root, "js/app.js"), "utf8").includes("requestDisclaimer")) {
  errors.push("WhatsApp message must include requestDisclaimer");
}

const coralSources = [
  "css/base.css",
  "css/layout.css",
  "css/components.css",
  "css/painel.css",
  "data/site.json",
  "js/app.js",
  "scripts/sample-hydra-colors.html",
  "assets/brand/padronagem.svg",
  "assets/favicon.svg",
];
coralSources.forEach((rel) => {
  const text = readFileSync(join(root, rel), "utf8");
  if (/#fc7e8e/i.test(text)) {
    errors.push(rel + " still contains coral #FC7E8E");
  }
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

function categoryIdsOf(product) {
  if (product.categoryIds && product.categoryIds.length) {
    return product.categoryIds;
  }
  return product.categoryId ? [product.categoryId] : [];
}
function productsForArea(area) {
  const ids = area.sourceCategoryIds || [];
  return products.filter((product) => {
    if (product.active === false) return false;
    return categoryIdsOf(product).some((id) => ids.includes(id));
  });
}

console.log("data files ok");
console.log("whatsapp", site.contato.whatsapp);
console.log("instagram", site.contato.instagram.handle);
console.log("areas", expectedAreas.join(", "));
console.log("natal.enabled", site.natal.enabled);
console.log("entrega.taxa", site.entrega.taxa);
console.log("home carousel:");
carousel
  .slice()
  .sort((a, b) => (a.order || 0) - (b.order || 0))
  .forEach((slide) => {
    const product = productBySlug.get(slide.productSlug);
    console.log("  " + slide.image + " -> " + slide.productSlug + (product ? " (" + product.name.trim() + ")" : " UNMATCHED"));
  });
areas
  .slice()
  .sort((a, b) => (a.order || 0) - (b.order || 0))
  .forEach((area) => {
    const list = productsForArea(area).filter((product) => product.images && product.images[0]);
    console.log("area carousel " + area.id + " (" + list.length + "):");
    list.forEach((product) => {
      console.log("  " + product.slug + " — " + String(product.name || "").trim());
    });
  });
const sobre = JSON.parse(readFileSync(join(root, "data/sobre.json"), "utf8"));
const emptySobre = ["headline", "lead", "story", "press"].filter((key) => {
  const value = sobre[key];
  return !value || (Array.isArray(value) && value.length === 0);
});
console.log("sobre.json empty fields (hidden until filled):", emptySobre.concat(sobre.portrait && !sobre.portrait.src ? ["portrait.src"] : []).join(", "));
const unpriced = products.filter((product) => product.active !== false && (!(typeof product.price === "number") || product.price <= 0));
console.log("produtos sem preço fixo (" + unpriced.length + "):");
unpriced.forEach((product) => {
  console.log("  " + product.slug + " — " + String(product.name || "").trim());
});
