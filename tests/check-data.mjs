import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
const categories = JSON.parse(readFileSync(join(root, "data/categories.json"), "utf8"));
const carousel = JSON.parse(readFileSync(join(root, "data/carousel.json"), "utf8"));
const products = JSON.parse(readFileSync(join(root, "data/products.json"), "utf8"));

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
  "personalizado-empresas",
  "combos-festa",
  "bolos",
  "festa-personalizada",
  "doces-festa",
  "sobremesas",
];
expected.forEach((id) => {
  if (!categoryIds.has(id)) errors.push("Missing category " + id);
});

if (products.length < 6) errors.push("Need at least 6 example products");
products.forEach((product) => {
  if (!categoryIds.has(product.categoryId)) {
    errors.push("Unknown category on " + product.slug);
  }
  if (typeof product.price !== "number") {
    errors.push("Price must be a number: " + product.slug);
  }
  if (!Array.isArray(product.images) || product.images.length < 2) {
    errors.push("Need a gallery on " + product.slug);
  }
  if (!product.tags.includes("exemplo")) {
    errors.push("Example product must be tagged: " + product.slug);
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
