#!/usr/bin/env node
/**
 * Gera /produto/<slug>/index.html a partir de data/products.json e do
 * modelo produto/index.html.
 *
 * O app.js continua renderizando o resto da página. /produto/?slug= segue
 * funcionando. O canonical destas páginas estáticas aponta para
 * /produto/?slug=... até o Worker passar a republicá-las a cada salvamento
 * no painel; só então é seguro trocar o canonical, o sitemap e os links
 * internos para /produto/<slug>/.
 *
 * Uso, na raiz do repositório:
 *
 *   node scripts/gerar-paginas-produto.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://janaabreuconfeitaria.com.br";
const BRAND = "Jana Abreu Confeitaria";
const DEFAULT_OG = ORIGIN + "/assets/products/tabua-signature/01.webp";

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasFixedPrice(product) {
  const price = product && product.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return false;
  const label = String(product.priceLabel || product.precoLabel || "");
  if (/\ba combinar\b|\bsob consulta\b/i.test(label)) return false;
  return true;
}

function formatBRL(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function queryUrl(slug) {
  return ORIGIN + "/produto/?slug=" + encodeURIComponent(String(slug || ""));
}

function areaForProduct(product, areas) {
  const ids = [];
  if (product && product.categoryId) ids.push(product.categoryId);
  if (product && Array.isArray(product.categoryIds)) ids.push.apply(ids, product.categoryIds);
  if (product && product.category) ids.push(product.category);
  return (areas || []).find(function match(area) {
    return area && (ids.indexOf(area.id) !== -1 || ids.indexOf(area.slug) !== -1);
  }) || null;
}

function productImageAlt(product) {
  const name = String((product && product.name) || "").trim();
  return name ? name + " da Jana Abreu Confeitaria" : "Produto da Jana Abreu Confeitaria";
}

function productJsonLd(product, brand) {
  const url = queryUrl(product.slug);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: String(product.name || ""),
    description: String(product.description || "").trim(),
    brand: { "@type": "Brand", name: brand },
    url: url,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      url: url,
    },
  };
  if (product.images && product.images[0]) {
    data.image = ORIGIN + "/" + String(product.images[0]).replace(/^\//, "");
  }
  if (hasFixedPrice(product)) {
    data.offers.price = Number(product.price);
  }
  return data;
}

function deeperRoot(html) {
  return html.replace(/(\s(?:href|src|content|data-root)=")\.\.\//g, "$1../../");
}

export function buildProductPage(template, product, areas, site) {
  const brand = (site && site.brandName) || BRAND;
  const name = String(product.name || "Produto");
  const desc = String(product.description || "").trim() || (name + " · " + brand);
  const title = name + " · " + brand;
  const url = queryUrl(product.slug);
  const imagePath = product.images && product.images[0] ? String(product.images[0]) : "";
  const imageAbs = imagePath ? ORIGIN + "/" + imagePath.replace(/^\//, "") : DEFAULT_OG;
  const area = areaForProduct(product, areas);
  const areaHref = area && (area.slug || area.id) ? "../../" + (area.slug || area.id) + "/" : "../../";
  const areaName = area && area.name ? area.name : "Categoria";
  const priceText = hasFixedPrice(product) ? formatBRL(product.price) : "";
  const alt = productImageAlt(product);
  const jsonLd = productJsonLd(product, brand);

  let html = deeperRoot(template);
  html = html.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + escapeHtml(desc) + '">');
  html = html.replace(/<title>[^<]*<\/title>/, "<title>" + escapeHtml(title) + "</title>");
  html = html.replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + escapeHtml(url) + '">');
  html = html.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + escapeHtml(title) + '">');
  html = html.replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + escapeHtml(desc) + '">');
  html = html.replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + escapeHtml(url) + '">');
  html = html.replace(/<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + escapeHtml(imageAbs) + '">');
  html = html.replace(/<body data-page="product" data-root="[^"]*">/, '<body data-page="product" data-root="../../" data-product-slug="' + escapeHtml(product.slug) + '">');
  html = html.replace(
    /<a data-bind="product-category-link" href="[^"]*"><span data-bind="product-category">[^<]*<\/span><\/a>/g,
    '<a data-bind="product-category-link" href="' + escapeHtml(areaHref) + '"><span data-bind="product-category">' + escapeHtml(areaName) + "</span></a>"
  );
  html = html.replace(
    /<a class="eyebrow" data-bind="product-category-link" href="[^"]*"><span data-bind="product-category"><\/span><\/a>/,
    '<a class="eyebrow" data-bind="product-category-link" href="' + escapeHtml(areaHref) + '"><span data-bind="product-category">' + escapeHtml(areaName) + "</span></a>"
  );
  html = html.replace(/<h1 data-bind="product-name">[^<]*<\/h1>/, '<h1 data-bind="product-name">' + escapeHtml(name) + "</h1>");
  if (priceText) {
    html = html.replace(/<p class="modal__price" data-bind="product-price"><\/p>/, '<p class="modal__price" data-bind="product-price">' + escapeHtml(priceText) + "</p>");
  }
  html = html.replace(/<p data-bind="product-description"><\/p>/, '<p data-bind="product-description">' + escapeHtml(desc) + "</p>");
  if (imagePath) {
    html = html.replace(
      /<img data-bind="product-image" alt="[^"]*" width="800" height="800" draggable="false">/,
      '<img data-bind="product-image" src="../../' +
        escapeHtml(imagePath) +
        '" alt="' +
        escapeHtml(alt) +
        '" width="800" height="800" draggable="false">'
    );
  }
  if (!html.includes('id="jsonld-product"')) {
    html = html.replace(
      "</head>",
      '  <script type="application/ld+json" id="jsonld-product">' + JSON.stringify(jsonLd) + "</script>\n</head>"
    );
  }
  return html;
}

export function listActiveProducts(products) {
  return (products || []).filter(function active(product) {
    return product && product.active !== false && product.slug && /^[a-z0-9][a-z0-9-]{0,119}$/.test(String(product.slug));
  });
}

export function writeProductPages(repoRoot, products, areas, site) {
  const templatePath = join(repoRoot, "produto/index.html");
  const template = readFileSync(templatePath, "utf8");
  const dir = join(repoRoot, "produto");
  const keep = new Set(["index.html"]);
  const written = [];
  listActiveProducts(products).forEach(function writeOne(product) {
    const destDir = join(dir, product.slug);
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, "index.html");
    writeFileSync(dest, buildProductPage(template, product, areas, site));
    keep.add(product.slug);
    written.push("produto/" + product.slug + "/index.html");
  });
  if (existsSync(dir)) {
    readdirSync(dir, { withFileTypes: true }).forEach(function maybeRemove(entry) {
      if (!entry.isDirectory()) return;
      if (keep.has(entry.name)) return;
      rmSync(join(dir, entry.name), { recursive: true, force: true });
    });
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const products = loadJson("data/products.json");
  const areas = loadJson("data/areas.json");
  const site = loadJson("data/site.json");
  const written = writeProductPages(root, products, areas, site);
  console.log("páginas de produto geradas: " + written.length);
}
