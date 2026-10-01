import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
const categories = JSON.parse(readFileSync(join(root, "data/categories.json"), "utf8"));
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
const expected = [
  "cestas-presentes",
  "personalizado-para-empresas",
  "combos-festa",
  "bolos",
  "festa-personalizada",
  "doces-festa",
  "sobremesas",
];
expected.forEach((id) => {
  if (!categoryIds.has(id)) errors.push("Missing category " + id);
});

categories.forEach((category) => {
  const slug = category.slug || category.id;
  if (!slug) {
    errors.push("Category missing slug: " + JSON.stringify(category));
    return;
  }
  if (/_/.test(slug)) {
    errors.push("Category slug has underscore: " + slug);
  }
  if (/[A-ZÀ-ÿ\s]/.test(slug)) {
    errors.push("Category slug must be lowercase hyphenated: " + slug);
  }
  const page = join(root, slug, "index.html");
  if (!existsSync(page)) {
    errors.push("Missing category page " + slug + "/index.html");
  } else {
    const html = readFileSync(page, "utf8");
    if (!html.includes('data-page="category"')) {
      errors.push(slug + "/index.html must set data-page=category");
    }
    if (!html.includes('data-category="' + slug + '"')) {
      errors.push(slug + "/index.html must set data-category=" + slug);
    }
    if (!html.includes('data-bind="products"')) {
      errors.push(slug + "/index.html must list products");
    }
  }
});

if (home.includes('id="catalogo"') || home.includes('data-bind="products"')) {
  errors.push("Home must not include the mixed product vitrine");
}
if (home.includes('data-action="filter-category"')) {
  errors.push("Home must link to category pages instead of filtering in place");
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
  if (!productPage.includes("Adquirir agora")) {
    errors.push("Product page needs «Adquirir agora»");
  }
}

const flavorsPath = join(root, "data/cake-flavors.json");
if (!existsSync(flavorsPath)) {
  errors.push("Missing data/cake-flavors.json");
} else {
  const flavors = JSON.parse(readFileSync(flavorsPath, "utf8"));
  if (!Array.isArray(flavors.flavors) || flavors.flavors.length < 8) {
    errors.push("cake-flavors.json needs the Vendizap bolo flavor list");
  }
  ["Chocolatudo", "Pistache", "Pink Lemonade"].forEach((name) => {
    if (!flavors.flavors.includes(name)) {
      errors.push("Missing cake flavor " + name);
    }
  });
}

const painel = readFileSync(join(root, "painel/index.html"), "utf8");
if (painel.includes("hydra")) {
  errors.push("Painel must not load Hydra");
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

console.log("data files ok");
console.log("whatsapp", site.contato.whatsapp);
console.log("instagram", site.contato.instagram.handle);
console.log("category pages", expected.join(", "));
