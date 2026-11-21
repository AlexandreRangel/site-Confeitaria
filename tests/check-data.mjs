import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSitemap } from "../scripts/gerar-sitemap.mjs";
import { buildProductPage } from "../scripts/gerar-paginas-produto.mjs";

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
  "pascoa",
];
catalogIds.forEach((id) => {
  if (!categoryIds.has(id)) errors.push("Missing catalog category " + id);
});
const sobremesas = categories.find((item) => item.id === "sobremesas");
if (!sobremesas || sobremesas.hidden !== true) {
  errors.push("Sobremesas must remain in the catalog with hidden: true");
}
if (site.natal && site.natal.enabled !== false) {
  errors.push("Natal must stay off by default (site.natal.enabled, legado)");
}
if (!/^© 2026 Jana Abreu/.test(String(site.copyright || ""))) {
  errors.push("Copyright must start with «© 2026 Jana Abreu» (aceita o texto atual do site.json)");
}

const expectedAreas = ["corporate", "bolos", "cestas", "doces-personalizados", "natal", "pascoa"];
const areaById = new Map(areas.map((item) => [item.id, item]));
expectedAreas.forEach((id) => {
  if (!areaById.has(id)) errors.push("Missing area " + id);
});
const natalArea = areaById.get("natal");
if (!natalArea || natalArea.seasonal !== true) {
  errors.push("Natal area must be marked seasonal");
}
["natal", "pascoa"].forEach((id) => {
  const a = areaById.get(id);
  if (!a || a.seasonal !== true) errors.push(id + " area must be marked seasonal");
  if (a && (!a.ativacao || ["desligado", "ligado", "datas"].indexOf(a.ativacao.modo) === -1)) {
    errors.push(id + " must have ativacao.modo desligado, ligado or datas");
  }
});
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
  "perguntas-frequentes/index.html",
  "encomendas/index.html",
  ...expectedAreas.map((id) => id + "/index.html"),
  "area/index.html",
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
  if (!/name="data"[^>]*type="date"/.test(html) && !/type="date"[^>]*name="data"/.test(html)) {
    errors.push(rel + " checkout must include the desired date field");
  }
  if (/name="data"[^>]*required/.test(html) || /required[^>]*name="data"/.test(html)) {
    errors.push(rel + " desired date must stay optional");
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
if (!appJs.includes("layoutHomeAreas") || !appJs.includes("areas--scroll") || !home.includes('data-action="areas-prev"') || !home.includes('data-action="areas-next"')) {
  errors.push("home category boxes must shrink to fit on desktop and scroll with arrows when they overflow");
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

if (!Array.isArray(carousel) || !carousel.length) errors.push("Carousel must have at least one slide (valor atual do carousel.json)");

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
if (!/data-bind="central-login" hidden/.test(painel) || !/name="password"/.test(painel)) {
  errors.push("Painel must have the (initially hidden) password login for the shared list");
}
const centralJs = readFileSync(join(root, "js/central.js"), "utf8");
if (/ADMIN_PASSWORD|SESSION_SECRET|INFINITE_HANDLE|secret-admin/.test(centralJs)) {
  errors.push("js/central.js must not contain admin secrets");
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
if (!layoutCss.includes("min-width: 900px") || !layoutCss.includes("areas--scroll") || !layoutCss.includes("--area-min")) {
  errors.push("home areas CSS must fit all cards from 900px and fall back to a peeking scroll row");
}
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
if (!home.includes('data-bind="footer-map"') || !home.includes("Ver no Google Maps") || !home.includes('data-bind="footer-map-embed"')) {
  errors.push("Home footer must include the address/map block");
}
if (home.search('data-bind="footer-map-embed"') > home.search("Ver no Google Maps")) {
  errors.push("Ver no Google Maps must sit just below the footer map");
}
if (!home.includes('loading="lazy"') || !home.includes('referrerpolicy="no-referrer-when-downgrade"')) {
  errors.push("footer map iframe must be lazy-loaded and set referrerpolicy");
}
if (!home.includes("Brasília DF") && !home.includes("city-state")) {
  errors.push("Footer must show Brasília DF");
}
if (!home.includes('class="selos"') || !home.includes('id="selo-tip-pix"') || !home.includes('id="selo-tip-infinitepay"') || !home.includes('id="selo-tip-https"') || !home.includes('id="selo-tip-pedido"')) {
  errors.push("Home footer must include the four payment/security seals");
}
if (!home.includes("Pagamento instantâneo pelo QR Code ou código copia e cola, direto para a conta da Jana Abreu.") || !home.includes("Cartão de crédito e Pix pelo checkout seguro da InfinitePay. Os dados do cartão são digitados no site da InfinitePay e não passam pelo nosso site.") || !home.includes("Conexão criptografada com certificado SSL/TLS.") || !home.includes("Cada pedido recebe um código e é confirmado pela confeitaria.")) {
  errors.push("Payment seal tooltips must use the confirmed copy");
}
if (!home.includes("whatsapp-fab") || !home.includes('aria-label="Converse com a gente pelo WhatsApp"') || !home.includes("https://wa.me/5561981246112")) {
  errors.push("Home must include the floating WhatsApp button");
}
const forbiddenSeals = ["PagSeguro", "Reclame Aqui", "Safe Browsing", "site blindado", "selo google"];
if (forbiddenSeals.some(function has(word) { return home.includes(word); })) {
  errors.push("Footer must not include unconfirmed third-party certification seals");
}
const painelPage = existsSync(join(root, "painel/index.html")) ? readFileSync(join(root, "painel/index.html"), "utf8") : "";
if (painelPage.includes("whatsapp-fab") || painelPage.includes('class="selos"')) {
  errors.push("Painel must not include storefront payment seals or the WhatsApp floating button");
}
const publicWithSeals = ["404.html", "area/index.html", "bolos/index.html", "cestas/index.html", "corporate/index.html", "doces-personalizados/index.html", "encomendas/index.html", "natal/index.html", "pagamento/index.html", "pascoa/index.html", "produto/index.html", "sobre-nos/index.html", "perguntas-frequentes/index.html"];
publicWithSeals.forEach(function checkPage(rel) {
  const page = readFileSync(join(root, rel), "utf8");
  if (!page.includes('class="selos"') || !page.includes("whatsapp-fab") || !page.includes("js/selos.js")) {
    errors.push(rel + " must include payment seals, the WhatsApp button and selos.js");
  }
});
if (!layoutCss.includes(".whatsapp-fab") || !layoutCss.includes("env(safe-area-inset-bottom") || !layoutCss.includes("prefers-reduced-motion") || !layoutCss.includes("body.is-locked .whatsapp-fab")) {
  errors.push("WhatsApp floating button must use safe-area, hide when the cart is locked, and respect reduced motion");
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
  if (sobrePage.includes("sobre__place") || sobrePage.includes("sobre__areas") || sobrePage.includes('data-bind="sobre-areas"')) {
    errors.push("Sobre nós must not show the Brasília DF line or the category list");
  }
  if (!sobrePage.includes("instagram--highlight") || !sobrePage.includes("instagram__title") || !sobrePage.includes("instagram__handle") || !sobrePage.includes("instagram__box") || sobrePage.includes("Siga no Instagram") || sobrePage.includes("instagram__cta")) {
    errors.push("Sobre nós Instagram must have a clickable Instagram title, the handle, a soft outline, and no Siga no Instagram button");
  }
  if (!sobrePage.includes("sobre__imprensa")) {
    errors.push("Sobre nós must mark the Na imprensa section");
  }
  if (!sobrePage.includes('class="sobre__trabalhos"')) {
    errors.push("Sobre nós must mark the Trabalhos section for the visual break");
  }
}
if (!existsSync(join(root, "data/sobre.json"))) {
  errors.push("Missing data/sobre.json");
} else {
  const sobreData = JSON.parse(readFileSync(join(root, "data/sobre.json"), "utf8"));
  const firstPress = (sobreData.press || [])[0];
  if (!firstPress || firstPress.title !== "Empreendedores do DF" || !firstPress.image || !firstPress.image.endsWith(".webp")) {
    errors.push("Na imprensa must keep the Empreendedores do DF item with a WebP thumbnail");
  } else if (!existsSync(join(root, firstPress.image))) {
    errors.push("Missing press thumbnail " + firstPress.image);
  }
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
if (!appJs.includes('txid: "***"') || !appJs.includes("Já paguei") || !appJs.includes("buildPixPendingWhatsAppMessage") || appJs.includes("Gerar Pix")) {
  errors.push("checkout must show the Pix QR in the cart (txid ***) and confirm with Já paguei, without a separate Gerar Pix step");
}
if (!home.includes('data-bind="pay-method"') || !home.includes("Como prefere pagar?") || !home.includes('value="infinitepay"')) {
  errors.push("Checkout must offer Pix and InfinitePay radios in a fieldset");
}
const pixPath = join(root, "data/pix.json");
if (!existsSync(pixPath)) {
  errors.push("Missing data/pix.json");
} else {
  const pix = JSON.parse(readFileSync(pixPath, "utf8"));
  const chave = typeof pix.chave === "string" ? pix.chave.trim() : "";
  if (pix.enabled !== true || !chave || pix.nome !== "JANA ABREU" || pix.cidade !== "BRASILIA") {
    errors.push("data/pix.json must have enabled true, nome JANA ABREU, cidade BRASILIA and a non-empty chave");
  }
  if (/\s/.test(chave) || chave.startsWith("$")) {
    errors.push("data/pix.json chave must not contain spaces or a leading $");
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
if (!/card__media-link"[^>]*tabindex="-1"[^>]*aria-hidden="true"/.test(appJs)) {
  errors.push("product card photo must link to the product without an extra tab stop");
}
if (!componentsCss.includes("card__media-link") || !componentsCss.includes("cursor: pointer")) {
  errors.push("product card photo link must show a pointer cursor");
}
if (!appJs.includes("Pagar com cartão") || !appJs.includes("PAID_DISCLAIMER")) {
  errors.push("checkout must switch to InfinitePay button copy when that method is selected");
}
if (!site.pixDisclaimer || !site.pixNote || !site.paidDisclaimer) {
  errors.push("site.json must include the current Pix and card disclaimer texts");
}
if (!appJs.includes("paymentsNote") || appJs.includes("payments = \"\"")) {
  errors.push("cart must keep paymentsNote visible for every payment method");
}
if (!utilsJs.includes("siteText") || !home.includes('data-bind="pix-note"')) {
  errors.push("Pix QR box must bind pixNote from site.json via siteText");
}
if (!painelJs.includes("status_pagamento") || !painelJs.includes("order_nsu") || !painelJs.includes("comprovante")) {
  errors.push("painel CSV must include payment columns");
}

const productBySlug = new Map(products.map((item) => [item.slug, item]));
carousel.forEach((slide) => {
  if (slide.tipo && slide.tipo !== "produto" && slide.tipo !== "imagem") {
    errors.push("carousel slide has invalid tipo: " + slide.id);
  }
  if (slide.tipo === "produto") {
    if (!slide.productSlug || !productBySlug.has(slide.productSlug)) {
      errors.push("product banner missing catalog product: " + (slide.productSlug || slide.id));
    }
  } else if (slide.productSlug && !productBySlug.has(slide.productSlug)) {
    errors.push("home carousel slide missing catalog product: " + slide.productSlug);
  }
});
const unmatchedHome = carousel.filter((slide) => slide.tipo !== "produto" && slide.productSlug && !productBySlug.has(slide.productSlug));
if (unmatchedHome.length) {
  errors.push("unmatched home carousel photos: " + unmatchedHome.map((slide) => slide.image).join(", "));
}
if (!utilsJs.includes("productBannerHtml") || !utilsJs.includes("resolveProductBanner") || !appJs.includes("productBannerHtml")) {
  errors.push("product banners must resolve from the catalog and render as HTML");
}
if (!utilsJs.includes("normalizeFoto") || !utilsJs.includes("fotoPanFromDrag") || !utilsJs.includes("feComponentTransfer") || !appJs.includes("imageBannerHtml")) {
  errors.push("banner photo framing helpers must exist on the public site");
}
const editorJs = readFileSync(join(root, "js/editor.js"), "utf8");
const bannerCss = readFileSync(join(root, "css/banner-produto.css"), "utf8");
if (!editorJs.includes("bannerTipo") || !editorJs.includes("Usar o do produto") || !editorJs.includes('tipo: "produto"')) {
  errors.push("editor must default new banners to product mode with per-field revert");
}
if (editorJs.includes("slice(0, 40)") || /active !== false && p.slug && p.images/.test(editorJs)) {
  errors.push("product banner picker must not cap or hide catalog products");
}
if (!editorJs.includes("Todos (A–Z)") || !editorJs.includes("ed-pick-grupo") || !editorJs.includes("listaProdutosBannerHtml") || !editorJs.includes('ed-chip">oculto')) {
  errors.push("product banner picker must group by category, offer A–Z view and mark hidden products");
}
if (!utilsJs.includes("catalogProductsForPicker") || !utilsJs.includes("productPickerGroups")) {
  errors.push("product picker helpers and group styles must exist");
}
if (!bannerCss.includes("hero__slide--produto") || !bannerCss.includes("1300px") || !layoutCss.includes("banner-produto.css")) {
  errors.push("product banner CSS must use the 1300px center band and be loaded on the site");
}

const workerJs = readFileSync(join(root, "central/jana-pedidos/src/index.js"), "utf8");
const editorCss = readFileSync(join(root, "css/editor.css"), "utf8");
if (!editorJs.includes("Restaurar enquadramento") || !editorJs.includes("Restaurar ajustes") || !editorJs.includes("Vibrância") || !editorCss.includes("ed-foto__setas")) {
  errors.push("banner photo editor must offer framing, zoom and color adjustments");
}
if (!workerJs.includes("normalizeCarouselFoto") || !workerJs.includes("vibrancia") || !workerJs.includes("gamma") || !workerJs.includes("max: 4")) {
  errors.push("Worker validateCarousel must accept and clamp foto fields");
}
if (!bannerCss.includes("--foto-zoom") || !bannerCss.includes("hero__foto--ajustada")) {
  errors.push("public banner CSS must apply non-destructive photo framing");
}
if (!bannerCss.includes("hero__produto-foto--ajustada")) {
  errors.push("photo overflow must apply only on adjusted product frames");
}
const unconditionalFotoOverflow = /\.hero__produto-foto,\s*\.ed-banner-preview \.hero__produto-foto \{\s*overflow:\s*hidden/.test(bannerCss.replace(/\n/g, " "));
if (unconditionalFotoOverflow) {
  errors.push("unadjusted product photo frames must not force overflow:hidden");
}
if (!layoutCss.includes("rodape__mapa") || !layoutCss.includes("rodape__mapa-frame")) {
  errors.push("footer map styles must exist");
}
if (!editorJs.includes("Aviso ao escolher Pix") || !editorJs.includes("Instrução na caixa do QR Pix") || !editorJs.includes("Aviso ao escolher cartão")) {
  errors.push("editor must expose pixDisclaimer, pixNote and paidDisclaimer with clear labels");
}
if (!workerJs.includes("pixDisclaimer") || !workerJs.includes("pixNote") || !workerJs.includes("paidDisclaimer")) {
  errors.push("Worker validateSite must accept pixDisclaimer, pixNote and paidDisclaimer");
}
if (!editorJs.includes("Endereço no rodapé") || !editorJs.includes("Busca do mapa") || !editorJs.includes("site.footerAddress") || !editorJs.includes("site.footerMapQuery")) {
  errors.push("editor Textos > Rodapé must expose footerAddress and footerMapQuery");
}
if (!workerJs.includes("footerAddress") || !workerJs.includes("footerMapQuery")) {
  errors.push("Worker validateSite must accept footerAddress and footerMapQuery");
}
if (!utilsJs.includes("Jana.footerMap") || !appJs.includes("footer-map-embed")) {
  errors.push("footer map must be filled from site.json and hidden when the address is empty");
}

if (!editorJs.includes("renderCategorias") || !editorJs.includes("area-criar") || !editorJs.includes("renderSobreTab") || !editorJs.includes("introPhotos")) {
  errors.push("editor must have Categorias and Sobre nós tabs, including the block above Trabalhos");
}
if (!editorJs.includes("productSort") || !editorJs.includes("productOrder") || !editorJs.includes("Ordem alfabética") || !editorJs.includes("area-prod-mover") || !editorJs.includes("data-ed-drag=\"area-prod\"")) {
  errors.push("Categorias tab must let Jana choose product order, including manual drag and up/down buttons");
}
if (!utilsJs.includes("sortProductsForArea") || !utilsJs.includes("productSort") || !utilsJs.includes("preco-desc")) {
  errors.push("productsForArea must apply per-category productSort");
}
if (!workerJs.includes("productSort") || !workerJs.includes("productOrder") || !workerJs.includes("preco-asc")) {
  errors.push("Worker validateAreas must accept productSort and productOrder");
}
if (!painel.includes('data-tab="categorias"') || !painel.includes('data-tab="sobre"') || !painel.includes('id="tab-categorias"') || !painel.includes('id="tab-sobre"')) {
  errors.push("painel must expose the Categorias and Sobre nós tabs");
}
if (!utilsJs.includes("slugifyArea") || !utilsJs.includes("RESERVED_AREA_SLUGS") || !utilsJs.includes("areaPageSlug")) {
  errors.push("area slug helpers must exist");
}
if (!workerJs.includes("areaPageHtml") || !workerJs.includes("introPhotos") || !workerJs.includes("RESERVED_AREA_SLUGS")) {
  errors.push("Worker must validate new category fields and generate category pages");
}
if (!existsSync(join(root, "area/index.html"))) {
  errors.push("generic area/index.html page is missing");
} else {
  const areaPage = readFileSync(join(root, "area/index.html"), "utf8");
  if (!areaPage.includes('data-page="area"') || !areaPage.includes("setAreaFromUrl") || !areaPage.includes("js/app.js")) {
    errors.push("generic area page must boot as a category page from the URL");
  }
}
const notFound = readFileSync(join(root, "404.html"), "utf8");
if (!notFound.includes("maybeAreaPage") || !notFound.includes("area/?c=")) {
  errors.push("404.html must route unknown category slugs to the generic area page");
}
const sobreHtml = readFileSync(join(root, "sobre-nos/index.html"), "utf8");
if (!sobreHtml.includes('data-bind="sobre-intro"') || !sobreHtml.includes("sobre__trabalhos") || sobreHtml.indexOf("sobre-intro") > sobreHtml.indexOf("sobre__trabalhos")) {
  errors.push("Sobre nós must have the intro photo block above Trabalhos");
}
if (!appJs.includes("renderSobreIntro") || !layoutCss.includes("sobre__intro-grid")) {
  errors.push("Sobre nós intro block must render and hide when empty");
}
if (!editorJs.includes("Aceita imagem para personalização") || !editorJs.includes("aceitaImagemPersonalizacao")) {
  errors.push("product editor must have the personalization image checkbox");
}
if (!appJs.includes("personalizacao-arquivo") || !utilsJs.includes("compressPersonalizationImage") || !utilsJs.includes("productAceitaImagem")) {
  errors.push("cart must compress personalization images and show the upload only for flagged products");
}
if (!centralJs.includes("/personalizacao") || !centralJs.includes("uploadOrderImage")) {
  errors.push("Central must probe /personalizacao and upload order images");
}
if (!workerJs.includes("order_images") || !workerJs.includes("sniffImageMime") || !existsSync(join(root, "central/jana-pedidos/migrations/0002_order_images.sql"))) {
  errors.push("Worker must validate and store personalization images (R2 or D1 migration 0002)");
}

if (!editorJs.includes("Pedido mínimo") || !editorJs.includes("Quantidade mínima") || !editorJs.includes("pedidoMinimo") || !editorJs.includes("minQty")) {
  errors.push("product editor must have the Pedido mínimo toggle and minQty field");
}
if (!utilsJs.includes("productMinQty") || !appJs.includes("Pedido mínimo:") || !appJs.includes("Escolher arquivo") || !appJs.includes("Nenhum arquivo escolhido")) {
  errors.push("storefront must show minQty notes and a Portuguese file picker");
}
const productPageMin = readFileSync(join(root, "produto/index.html"), "utf8");
if (!componentsCss.includes("arquivo-escolha__botao") || !home.includes("cart-min-qty") || !productPageMin.includes("product-min-qty")) {
  errors.push("file picker must hide the native control and product/cart must expose minQty messages");
}
if (!workerJs.includes("minQty") || !workerJs.includes("pedido mínimo de")) {
  errors.push("Worker must validate minQty and reject orders below the minimum");
}

const pausaJs = readFileSync(join(root, "js/pausa.js"), "utf8");
if (!pausaJs.includes("datasBloqueadas") || !pausaJs.includes("mountDesiredDateCalendar") || !pausaJs.includes("formatDateExtensoBR")) {
  errors.push("cart calendar must show blocked dates and be keyboard accessible");
}
if (!editorJs.includes("Datas específicas bloqueadas") || !editorJs.includes("bloqueio-novo")) {
  errors.push("editor Datas tab must allow a list of specific blocked dates");
}
if (!appJs.includes("mountDesiredDateCalendar") || !componentsCss.includes("cal-encomenda")) {
  errors.push("checkout must mount the custom calendar with brand styles");
}
if (!workerJs.includes("datasBloqueadas") || !workerJs.includes("loadPausa")) {
  errors.push("Worker must reject orders on blocked dates using pausa.json");
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
if (site.central && site.central.enabled === true && !/^https:\/\/[a-z0-9.-]+\.workers\.dev$|^https:\/\/api\.janaabreuconfeitaria\.com\.br$/.test(site.central.endpoint || "")) {
  errors.push("central.endpoint must be the jana-pedidos Worker (https, sem barra final)");
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


const gtmHead = "<!-- Google Tag Manager -->";
const gtmBody = "<!-- Google Tag Manager (noscript) -->";
const gtmId = "GTM-57MRXPNN";
function listHtmlFiles(dir, acc) {
  readdirSync(dir).forEach((name) => {
    if (name === ".git" || name === "tests" || name === "screenshots" || name === "central" || name === "node_modules" || name === "scripts") {
      return;
    }
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listHtmlFiles(full, acc);
    } else if (name.endsWith(".html")) {
      acc.push(full);
    }
  });
  return acc;
}
const htmlFiles = listHtmlFiles(root, []);
htmlFiles.forEach((full) => {
  const rel = full.slice(root.length + 1);
  const html = readFileSync(full, "utf8");
  if (rel === "painel/index.html") {
    if (html.includes(gtmId) || html.includes("googletagmanager.com") || html.includes("js/analytics.js")) {
      errors.push("painel/index.html must not load GTM or storefront analytics");
    }
    return;
  }
  if (!html.includes(gtmId) || !html.includes(gtmHead) || !html.includes(gtmBody)) {
    errors.push(rel + " must include the exact GTM-57MRXPNN snippets");
    return;
  }
  const headStart = html.search(/<head>/i);
  const headEnd = html.search(/<\/head>/i);
  const head = headStart >= 0 && headEnd > headStart ? html.slice(headStart, headEnd) : "";
  const charsetAt = head.search(/<meta charset=/i);
  const gtmAt = head.indexOf(gtmHead);
  if (charsetAt < 0 || gtmAt < 0 || charsetAt > gtmAt) {
    errors.push(rel + " must keep charset before the GTM snippet in <head>");
  }
  const bodyMatch = html.match(/<body[^>]*>\s*/i);
  if (!bodyMatch || html.slice(html.indexOf(bodyMatch[0]) + bodyMatch[0].length, html.indexOf(bodyMatch[0]) + bodyMatch[0].length + gtmBody.length + 10).indexOf(gtmBody) === -1) {
    errors.push(rel + " must place the GTM noscript immediately after <body>");
  }
  if (html.includes("js/app.js") && !html.includes("js/analytics.js")) {
    errors.push(rel + " must load js/analytics.js on the storefront");
  }
  if (/meta[^>]+http-equiv=["']Content-Security-Policy/i.test(html)) {
    errors.push(rel + " has a Content-Security-Policy meta; confirm googletagmanager.com is allowed");
  }
});
if (home.includes("Content-Security-Policy") && !home.includes("googletagmanager.com")) {
  /* covered per-page above */
}


const robotsExpected = `User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: OAI-SearchBot
Allow: /

Sitemap: https://janaabreuconfeitaria.com.br/sitemap.xml
`;
const robotsPath = join(root, "robots.txt");
if (!existsSync(robotsPath) || readFileSync(robotsPath, "utf8") !== robotsExpected) {
  errors.push("robots.txt must match the exact public allow-list and sitemap URL");
}
const llmsPath = join(root, "llms.txt");
if (!existsSync(llmsPath) || !readFileSync(llmsPath, "utf8").includes("# Jana Abreu Confeitaria")) {
  errors.push("llms.txt is missing or does not start with the Jana Abreu Confeitaria brief");
} else {
  const llms = readFileSync(llmsPath, "utf8");
  if (!llms.includes("Guará II QE 15 Cj I, 24") || !llms.includes("https://janaabreuconfeitaria.com.br/bolos/")) {
    errors.push("llms.txt must include the official address and category URLs");
  }
}
const sitemapPath = join(root, "sitemap.xml");
if (!existsSync(sitemapPath)) {
  errors.push("sitemap.xml is missing; run node scripts/gerar-sitemap.mjs");
} else {
  const sitemap = readFileSync(sitemapPath, "utf8");
  if (!sitemap.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")) {
    errors.push("sitemap.xml must be XML UTF-8");
  }
  const expectedSitemap = buildSitemap(areas, site, products);
  if (sitemap !== expectedSitemap) {
    errors.push("sitemap.xml is out of date; run node scripts/gerar-sitemap.mjs");
  }
  const locs = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g)).map((m) => m[1]);
  ["https://janaabreuconfeitaria.com.br/", "https://janaabreuconfeitaria.com.br/natal/", "https://janaabreuconfeitaria.com.br/corporate/", "https://janaabreuconfeitaria.com.br/bolos/", "https://janaabreuconfeitaria.com.br/cestas/", "https://janaabreuconfeitaria.com.br/doces-personalizados/", "https://janaabreuconfeitaria.com.br/sobre-nos/", "https://janaabreuconfeitaria.com.br/perguntas-frequentes/"].forEach((url) => {
    if (!locs.includes(url)) errors.push("sitemap.xml missing " + url);
  });
  products.filter((p) => p && p.active !== false && p.slug).forEach((p) => {
    const url = "https://janaabreuconfeitaria.com.br/produto/?slug=" + encodeURIComponent(p.slug);
    if (!locs.includes(url)) errors.push("sitemap.xml missing product " + p.slug);
  });
  ["painel", "pagamento", "encomendas", "cestas-presentes", "404"].forEach((bad) => {
    if (locs.some((url) => url.includes("/" + bad))) errors.push("sitemap.xml should not list " + bad);
  });
}


if (!existsSync(join(root, "scripts/gerar-paginas-produto.mjs"))) {
  errors.push("missing scripts/gerar-paginas-produto.mjs");
} else {
  const sample = products.find((p) => p && p.active !== false && p.slug === "tabua-signature") || products.find((p) => p && p.active !== false && p.slug);
  if (sample) {
    const template = readFileSync(join(root, "produto/index.html"), "utf8");
    const html = buildProductPage(template, sample, areas, site);
    const expectedUrl = "https://janaabreuconfeitaria.com.br/produto/?slug=" + encodeURIComponent(sample.slug);
    if (!html.includes("<title>" + sample.name + " · ")) errors.push("static product page is missing the product title");
    if (!html.includes('rel="canonical" href="' + expectedUrl + '"')) errors.push("static product page canonical must stay on /produto/?slug=");
    if (!html.includes('id="jsonld-product"') || !html.includes('"@type":"Product"')) errors.push("static product page needs Product JSON-LD");
    if (!html.includes('<h1 data-bind="product-name">' + sample.name + "</h1>")) errors.push("static product page needs the product <h1> in the initial HTML");
    if (!html.includes('data-product-slug="' + sample.slug + '"')) errors.push("static product page needs data-product-slug");
    if (!html.includes('data-root="../../"')) errors.push("static product page must use data-root=../../");
    const onDisk = join(root, "produto", sample.slug, "index.html");
    if (!existsSync(onDisk)) errors.push("missing generated page produto/" + sample.slug + "/index.html; run node scripts/gerar-paginas-produto.mjs");
  }
}

const pixQr = home.match(/<img[^>]*data-bind="pix-qr"[^>]*>/);
if (!pixQr || !/src="data:image\/svg\+xml/.test(pixQr[0])) {
  errors.push("home Pix QR must not have an empty src");
}
if (!home.includes('alt="Instagram"') || !home.includes('alt="Encomendas"')) {
  errors.push("home icon images need descriptive alt text");
}
if (!layoutCss.includes("min-height: min(62vw, 360px)")) {
  errors.push("home hero media must reserve height before the carousel is filled");
}
if (!layoutCss.includes(".areas__list:empty")) {
  errors.push("category list must reserve space while empty");
}

function jsonLdBlocks(html) {
  return Array.from(html.matchAll(/<script type="application\/ld\+json"(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)).map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch (err) {
      errors.push("invalid JSON-LD: " + err.message);
      return null;
    }
  }).filter(Boolean);
}
const homeLd = jsonLdBlocks(home);
if (!homeLd.some((row) => row["@type"] === "Bakery" && row.image && row.name === "Jana Abreu Confeitaria")) {
  errors.push("home must include a parseable Bakery JSON-LD with an absolute image");
}
if (home.includes("FAQPage") || home.includes('id="perguntas-frequentes"') || (home.match(/<details>/g) || []).length) {
  errors.push("home must not include the FAQ section or FAQPage JSON-LD");
}
if (!home.includes('class="faq-home-link"') || !home.includes('href="perguntas-frequentes/">Perguntas frequentes</a>')) {
  errors.push("home must include a discreet link to /perguntas-frequentes/ before the footer");
}
const sobreLd = jsonLdBlocks(readFileSync(join(root, "sobre-nos/index.html"), "utf8"));
if (!sobreLd.some((row) => row["@type"] === "Bakery" && row.image)) {
  errors.push("sobre-nos must include a parseable Bakery JSON-LD with an absolute image");
}
if (!home.includes('class="home-lead"') || !home.includes("Confeitaria artesanal em Brasília (Guará II) especializada em bolos decorados")) {
  errors.push("home must show the official subtitle under the hero");
}
if (!home.includes("<h1") || !/class="sr-only"/.test(home.split("<h1")[1].slice(0, 80))) {
  errors.push("home should keep the visually hidden H1 and place the visible lead after the hero");
}
const faqPage = readFileSync(join(root, "perguntas-frequentes/index.html"), "utf8");
const faqLd = jsonLdBlocks(faqPage).find((row) => row["@type"] === "FAQPage");
const faqData = JSON.parse(readFileSync(join(root, "data/faq.json"), "utf8"));
if (!faqLd || !Array.isArray(faqLd.mainEntity) || faqLd.mainEntity.length !== faqData.length) {
  errors.push("perguntas-frequentes must include a parseable FAQPage JSON-LD in sync with data/faq.json");
} else {
  faqData.forEach(function checkQ(item, i) {
    const entity = faqLd.mainEntity[i];
    if (!entity || entity.name !== item.question || (entity.acceptedAnswer && entity.acceptedAnswer.text) !== item.answer) {
      errors.push("FAQPage JSON-LD item " + (i + 1) + " must match data/faq.json");
    }
  });
}
if (!faqPage.includes("<h1") || !faqPage.includes("Perguntas frequentes") || !faqPage.includes('data-page="faq"') || !faqPage.includes('data-bind="faq-list"')) {
  errors.push("perguntas-frequentes needs h1 «Perguntas frequentes», data-page=faq and the FAQ list hook");
}
if ((faqPage.match(/<details>/g) || []).length !== faqData.length || !faqPage.includes("<summary>")) {
  errors.push("perguntas-frequentes must ship the questions as details/summary in the initial HTML");
}
if (faqPage.includes("FAQPage") && !faqPage.includes('id="jsonld-faq"')) {
  errors.push("perguntas-frequentes FAQPage JSON-LD must use id=jsonld-faq");
}

const seoPages = [
  "index.html",
  "404.html",
  "produto/index.html",
  "sobre-nos/index.html",
  "perguntas-frequentes/index.html",
  "encomendas/index.html",
  "pagamento/index.html",
  "area/index.html",
  "bolos/index.html",
  "cestas/index.html",
  "corporate/index.html",
  "doces-personalizados/index.html",
  "natal/index.html",
  "pascoa/index.html",
];
["index.html", "404.html", "produto/index.html", "sobre-nos/index.html", "perguntas-frequentes/index.html", "encomendas/index.html", "pagamento/index.html", "area/index.html", "bolos/index.html", "cestas/index.html", "corporate/index.html", "doces-personalizados/index.html", "natal/index.html", "pascoa/index.html"].forEach((rel) => {
  const html = readFileSync(join(root, rel), "utf8");
  if (!html.includes('class="rodape__faq"') || !html.includes(">Perguntas frequentes</a>")) {
    errors.push(rel + " footer must include a visible Perguntas frequentes link");
  }
});

seoPages.forEach((rel) => {
  const html = readFileSync(join(root, rel), "utf8");
  ["rel=\"canonical\"", "og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image", "twitter:card"].forEach((token) => {
    if (!html.includes(token)) errors.push(rel + " missing " + token);
  });
  if (!html.includes("https://janaabreuconfeitaria.com.br/assets/products/tabua-signature/01.webp")) {
    errors.push(rel + " og:image must use the Tábua Signature photo");
  }
  if (html.includes('og:type" content="website"') === false && !html.includes('og:type" content="website"')) {
    /* handled above */
  }
});
const painelHtml = readFileSync(join(root, "painel/index.html"), "utf8");
if (painelHtml.includes("og:title") || painelHtml.includes("application/ld+json")) {
  errors.push("painel must not receive storefront SEO tags");
}

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
console.log("natal/pascoa", ["natal", "pascoa"].map((id) => id + ":" + (areaById.get(id).ativacao || {}).modo).join(" "));
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
if (!Array.isArray(sobre.workGallery) || sobre.workGallery.length < 10) {
  errors.push("workGallery must have about 10 real photos for the carousel");
} else {
  sobre.workGallery.forEach((item, i) => {
    if (!item || !item.src || !existsSync(join(root, item.src))) {
      errors.push("workGallery[" + i + "] must point to an existing photo");
    }
    if (!item || !String(item.alt || "").trim()) {
      errors.push("workGallery[" + i + "] needs alt text");
    }
  });
}
if (!appJs.includes("workGalleryHtml") || !appJs.includes("prefers-reduced-motion") || !layoutCss.includes("sobre-work-marquee")) {
  errors.push("Trabalhos must be a CSS carousel that respects prefers-reduced-motion");
}
if (!layoutCss.includes("sobre-work-marquee 144s") || !layoutCss.includes("--work-visible: 1.333333") || !layoutCss.includes("--work-visible: 4")) {
  errors.push("Sobre nós work carousel must show 4 tiles on desktop and move at 144s");
}
if (/instagram--highlight\s*\{[^}]*linear-gradient/.test(layoutCss)) {
  errors.push("Sobre nós Instagram section must sit on the page background, without a coloured band");
}
if (!layoutCss.includes(".sobre__trabalhos")) {
  errors.push("Sobre nós must include a visual break before Trabalhos");
}
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

const cspHits = [home, readFileSync(join(root, "css/layout.css"), "utf8")];
if (existsSync(join(root, "_headers"))) {
  errors.push("unexpected _headers file may set CSP; review before blocking Google Maps iframe");
}
