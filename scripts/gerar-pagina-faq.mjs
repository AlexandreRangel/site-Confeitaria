#!/usr/bin/env node
/**
 * Atualiza perguntas-frequentes/index.html a partir de data/faq.json:
 * o bloco das perguntas, o JSON-LD FAQPage e os metadados permanecem
 * iguais ao arquivo de dados. O Worker usa a mesma lógica ao publicar.
 *
 *   node scripts/gerar-pagina-faq.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeFaq(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : [];
  const out = [];
  const seen = Object.create(null);
  list.forEach(function each(item, index) {
    if (!item) return;
    const question = String(item.question || item.pergunta || item.name || "").trim();
    const answer = String(item.answer || item.resposta || item.text || "").trim();
    let id = String(item.id || "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(id) || seen[id]) {
      let n = index + 1;
      id = "faq-" + n;
      while (seen[id]) {
        n += 1;
        id = "faq-" + n;
      }
    }
    seen[id] = true;
    out.push({ id: id, question: question, answer: answer });
  });
  return out.filter(function keep(item) {
    return item.question && item.answer;
  });
}

export function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: normalizeFaq(items).map(function question(item) {
      return {
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      };
    }),
  };
}

export function faqDetailsHtml(items, indent) {
  const pad = indent == null ? "      " : indent;
  return normalizeFaq(items)
    .map(function details(item) {
      return (
        pad +
        "<details>\n" +
        pad +
        "  <summary>" +
        escapeHtml(item.question) +
        "</summary>\n" +
        pad +
        "  <p>" +
        escapeHtml(item.answer) +
        "</p>\n" +
        pad +
        "</details>"
      );
    })
    .join("\n");
}

export function fillFaqPage(template, items) {
  const list = normalizeFaq(items);
  const details = faqDetailsHtml(list);
  const ld = JSON.stringify(faqJsonLd(list), null, 2);
  let html = String(template || "");
  if (html.includes('data-bind="faq-list"')) {
    html = html.replace(
      /(<div data-bind="faq-list">)([\s\S]*?)(<\/div>)/,
      "$1\n" + details + "\n      $3"
    );
  }
  if (html.includes('id="jsonld-faq"')) {
    html = html.replace(
      /<script type="application\/ld\+json" id="jsonld-faq">[\s\S]*?<\/script>/,
      '<script type="application/ld+json" id="jsonld-faq">\n  ' + ld.replace(/\n/g, "\n  ") + "\n  </script>"
    );
  } else {
    html = html.replace(
      "</head>",
      '  <script type="application/ld+json" id="jsonld-faq">\n  ' + ld.replace(/\n/g, "\n  ") + "\n  </script>\n</head>"
    );
  }
  return html;
}

function writeFaqPage() {
  const dest = join(root, "perguntas-frequentes/index.html");
  const template = readFileSync(dest, "utf8");
  const items = JSON.parse(readFileSync(join(root, "data/faq.json"), "utf8"));
  writeFileSync(dest, fillFaqPage(template, items));
  console.log("perguntas-frequentes/index.html atualizado com " + normalizeFaq(items).length + " perguntas");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFaqPage();
}
