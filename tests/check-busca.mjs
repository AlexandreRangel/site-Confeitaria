import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = {};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.document = { body: { getAttribute: function getAttr(name) { return name === "data-root" ? "" : ""; } } };
vm.runInNewContext(readFileSync(join(root, "js/utils.js"), "utf8"), sandbox);
const Jana = sandbox.Jana;
const products = JSON.parse(readFileSync(join(root, "data/products.json"), "utf8"));
const areas = JSON.parse(readFileSync(join(root, "data/areas.json"), "utf8"));
const site = JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
const errors = [];

function names(query) {
  return Jana.searchProducts(query, products, areas, site).map(function name(row) {
    return row.product.name;
  });
}

function assert(ok, msg) {
  if (!ok) errors.push(msg);
}

assert(Jana.foldSearch("Tábua") === "tabua", "foldSearch must ignore accents and case");
assert(names("tábua").some(function has(n) { return /tábua signature/i.test(n); }), "accent-insensitive name search should find Tábua Signature");
assert(names("tabua").some(function has(n) { return /tábua signature/i.test(n); }), "unaccented query should find Tábua Signature");
assert(names("tabuaa").some(function has(n) { return /tábua signature/i.test(n); }), "light typo tabuaa should still find Tábua Signature");
assert(names("brigad").some(function has(n) { return /brigadeiro/i.test(n); }), "partial word brigad should find Brigadeiro");
assert(names("sem gluten").length >= 1, "multi-term search without accents should find gluten-free mentions");
assert(names("xyzzyinexistente").length === 0, "unknown terms should return no products");
assert(names("pascoa").length === 0, "disabled Páscoa category should not surface products for pascoa");
assert(Jana.productPageUrl("tabua-signature").indexOf("produto/tabua-signature/") !== -1, "productPageUrl must point to /produto/<slug>/");

if (errors.length) {
  errors.forEach(function each(err) { console.error(err); });
  process.exit(1);
}
console.log("busca checks ok");
