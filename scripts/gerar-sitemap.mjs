#!/usr/bin/env node
/**
 * Gera /sitemap.xml a partir de data/areas.json, data/site.json e data/products.json.
 *
 * O painel da Jana cria e edita produtos, mas não atualiza o sitemap sozinho.
 * Depois de mudar o catálogo ou ligar/desligar uma área sazonal (Natal, Páscoa),
 * rode na raiz do repositório:
 *
 *   node scripts/gerar-sitemap.mjs
 *
 * e publique o sitemap.xml na branch preview (junto com os demais arquivos).
 *
 * Inclusos: a home, /sobre-nos/, /perguntas-frequentes/, /politica-de-cancelamento/, as áreas visíveis no site e todos os produtos
 * ativos no formato real /produto/?slug=...
 * Excluídos: redirecionamentos, /painel/, 404, /pagamento/, /encomendas/,
 * a página genérica /area/ e áreas sazonais desligadas (hoje a Páscoa).
 *
 * Existem também páginas estáticas em /produto/<slug>/, geradas por
 * scripts/gerar-paginas-produto.mjs. O canonical e este sitemap continuam em
 * /produto/?slug= até o Worker (já preparado no código, sem deploy) passar a
 * republicar essas páginas e o sitemap a cada salvamento no painel. Trocar
 * os links internos antes disso faria um produto novo cair em 404.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://janaabreuconfeitaria.com.br";

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function todayYmd(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now || new Date());
  const map = {};
  parts.forEach(function put(part) {
    map[part.type] = part.value;
  });
  return map.year + "-" + map.month + "-" + map.day;
}

function isSeasonalArea(area) {
  if (!area) return false;
  return area.id === "natal" || area.slug === "natal" || area.seasonal === true;
}

function isNatalEnabled(site) {
  return !!(site && site.natal && site.natal.enabled === true);
}

function isAreaActive(area, site, now) {
  if (!area || area.enabled === false) return false;
  if (!isSeasonalArea(area)) return true;
  const rule = area.ativacao;
  if (rule && typeof rule === "object") {
    if (rule.modo === "ligado") return true;
    if (rule.modo === "datas") {
      const today = todayYmd(now);
      return !!(rule.inicio && rule.fim) && today >= rule.inicio && today <= rule.fim;
    }
    return false;
  }
  if (area.id === "natal" || area.slug === "natal") return isNatalEnabled(site);
  return false;
}

function visibleAreas(areas, site, now) {
  return (areas || [])
    .filter(function keep(area) {
      return isAreaActive(area, site, now);
    })
    .slice()
    .sort(function byOrder(a, b) {
      return (a.order || 0) - (b.order || 0);
    });
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageUrl(path) {
  if (!path || path === "/") return ORIGIN + "/";
  return ORIGIN + "/" + String(path).replace(/^\//, "");
}

function productUrl(slug) {
  return ORIGIN + "/produto/?slug=" + encodeURIComponent(String(slug || ""));
}

export function buildSitemap(areas, site, products, now) {
  const urls = [pageUrl("/"), pageUrl("sobre-nos/"), pageUrl("perguntas-frequentes/"), pageUrl("politica-de-cancelamento/")];
  visibleAreas(areas, site, now).forEach(function addArea(area) {
    const slug = area.slug || area.id;
    if (slug) urls.push(pageUrl(slug + "/"));
  });
  (products || [])
    .filter(function active(product) {
      return product && product.active !== false && product.slug;
    })
    .slice()
    .sort(function bySlug(a, b) {
      return String(a.slug).localeCompare(String(b.slug), "pt-BR");
    })
    .forEach(function addProduct(product) {
      urls.push(productUrl(product.slug));
    });
  const unique = [];
  const seen = new Set();
  urls.forEach(function once(url) {
    if (seen.has(url)) return;
    seen.add(url);
    unique.push(url);
  });
  const body = unique
    .map(function toUrl(url) {
      return "  <url>\n    <loc>" + xmlEscape(url) + "</loc>\n  </url>";
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body +
    "\n</urlset>\n"
  );
}

function writeSitemap() {
  const xml = buildSitemap(
    loadJson("data/areas.json"),
    loadJson("data/site.json"),
    loadJson("data/products.json")
  );
  const dest = join(root, "sitemap.xml");
  writeFileSync(dest, xml, "utf8");
  const count = (xml.match(/<loc>/g) || []).length;
  console.log("sitemap.xml escrito com " + count + " URLs em " + dest);
  return xml;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeSitemap();
}
