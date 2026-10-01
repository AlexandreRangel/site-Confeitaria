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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("data files ok");
console.log("whatsapp", site.contato.whatsapp);
console.log("instagram", site.contato.instagram.handle);
console.log("category pages", expected.join(", "));
