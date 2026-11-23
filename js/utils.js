(function createUtils(global) {
  const Jana = global.Jana || {};

  Jana.formatBRL = function formatBRL(value) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  /* Número do pedido: um só, curto e sequencial (1001, 1002…), vindo do Worker.
     O NSU (JA-AAAAMMDD-XXXXXX) é interno (InfinitePay) e nunca aparece como número do pedido. */
  Jana.orderNumber = function orderNumber(value) {
    const raw = value && typeof value === "object" ? value.number || value.orderNumber : value;
    const text = String(raw == null ? "" : raw).trim();
    return /^\d{1,9}$/.test(text) ? text : "";
  };

  /* «Pedido nº 1001»; sem número, devolve o fallback (padrão «Pedido sem número»). */
  Jana.orderLabel = function orderLabel(value, fallback) {
    const n = Jana.orderNumber(value);
    return n ? "Pedido nº " + n : fallback == null ? "Pedido sem número" : fallback;
  };

  /* Linha do número do pedido nas mensagens de WhatsApp montadas pelo site.
     Sem número (Worker fora do ar), não inventa número: avisa que o pedido ainda está sem número. */
  Jana.orderWhatsAppLine = function orderWhatsAppLine(order) {
    const n = Jana.orderNumber(order);
    if (n) return "*Pedido nº " + n + "*";
    return order && order.orderSemNumero ? "*Pedido ainda sem número* (o site não conseguiu registrar)" : "";
  };

  Jana.escapeHtml = function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  Jana.qs = function qs(selector, root) {
    return (root || document).querySelector(selector);
  };

  Jana.qsa = function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  };

  Jana.AREA_REDIRECTS = {
    "personalizado-para-empresas": "corporate",
    "cestas-presentes": "cestas",
    "combos-festa": "doces-personalizados",
    "doces-festa": "doces-personalizados",
    "festa-personalizada": "doces-personalizados",
    "sobremesas": "",
  };

  Jana.assetRoot = function assetRoot() {
    const raw = document.body.getAttribute("data-root");
    if (raw === null || raw === "") {
      const page = document.body.getAttribute("data-page");
      return page === "category" || page === "area" || page === "product" || page === "about" || page === "pagamento" || page === "encomendas" ? "../" : "";
    }
    return raw.charAt(raw.length - 1) === "/" ? raw : raw + "/";
  };

  Jana.assetUrl = function assetUrl(path) {
    const value = String(path || "");
    if (!value) {
      return "";
    }
    if (/^(https?:|data:|mailto:|tel:|#)/i.test(value)) {
      return value;
    }
    const root = Jana.assetRoot();
    return root + value.replace(/^\.\//, "");
  };

  Jana.homeUrl = function homeUrl() {
    return Jana.assetRoot() || "./";
  };

  Jana.siteBaseUrl = function siteBaseUrl() {
    const loc = global.location || {};
    const href = loc.href || (loc.origin ? loc.origin + (loc.pathname || "/") : "");
    const root = Jana.assetRoot() || "./";
    if (href && typeof URL === "function") {
      try {
        const resolved = new URL(root, href);
        let base = resolved.href;
        if (!base.endsWith("/")) {
          base = base.replace(/[^/]*$/, "");
        }
        return base;
      } catch (err) {
        /* fall through */
      }
    }
    const origin = loc.origin || "";
    return origin + "/";
  };

  Jana.siteUrl = function siteUrl(path) {
    const rel = String(path || "").replace(/^\//, "");
    if (typeof URL === "function") {
      try {
        return new URL(rel, Jana.siteBaseUrl()).href;
      } catch (err) {
        /* fall through */
      }
    }
    return Jana.siteBaseUrl() + rel;
  };

  Jana.areaUrl = function areaUrl(slug) {
    const key = String(slug || "");
    const mapped = Object.prototype.hasOwnProperty.call(Jana.AREA_REDIRECTS, key)
      ? Jana.AREA_REDIRECTS[key]
      : key;
    if (!mapped) {
      return Jana.homeUrl();
    }
    return Jana.assetUrl(mapped + "/");
  };

  Jana.categoryUrl = function categoryUrl(slug) {
    return Jana.areaUrl(slug);
  };

  Jana.PUBLIC_SITE = "https://janaabreuconfeitaria.com.br";
  Jana.DEFAULT_OG_IMAGE = Jana.PUBLIC_SITE + "/assets/products/tabua-signature/01.webp";
  Jana.DEFAULT_LOGO_IMAGE = Jana.PUBLIC_SITE + "/assets/brand/logo-jana-abreu.png";

  Jana.publicUrl = function publicUrl(path) {
    const value = String(path || "").trim();
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    if (!value || value === "/") {
      return Jana.PUBLIC_SITE + "/";
    }
    return Jana.PUBLIC_SITE + "/" + value.replace(/^\//, "");
  };

  Jana.setMetaContent = function setMetaContent(selector, attr, value) {
    if (!document || !document.head) {
      return null;
    }
    let node = document.head.querySelector(selector);
    if (!node) {
      if (selector.indexOf("link") === 0 || attr === "href" && /rel=['\"]canonical['\"]/.test(selector)) {
        node = document.createElement("link");
        node.setAttribute("rel", "canonical");
      } else {
        node = document.createElement("meta");
        const prop = selector.match(/\[(property|name)=['\"]([^'\"]+)['\"]\]/);
        if (prop) {
          node.setAttribute(prop[1], prop[2]);
        }
      }
      document.head.appendChild(node);
    }
    node.setAttribute(attr, value);
    return node;
  };

  Jana.setSeoTags = function setSeoTags(opts) {
    const options = opts || {};
    const title = options.title != null ? String(options.title) : "";
    const description = options.description != null ? String(options.description) : "";
    const url = options.url || "";
    const image = options.image || Jana.DEFAULT_OG_IMAGE;
    if (title) {
      document.title = title;
      Jana.setMetaContent('meta[property="og:title"]', "content", title);
    }
    if (description) {
      Jana.setMetaContent('meta[name="description"]', "content", description);
      Jana.setMetaContent('meta[property="og:description"]', "content", description);
    }
    if (url) {
      Jana.setMetaContent('link[rel="canonical"]', "href", url);
      Jana.setMetaContent('meta[property="og:url"]', "content", url);
    }
    if (image) {
      Jana.setMetaContent('meta[property="og:image"]', "content", image);
    }
  };

  Jana.upsertJsonLd = function upsertJsonLd(id, data) {
    if (!document || !document.head || !data) {
      return null;
    }
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return el;
  };

  Jana.productJsonLd = function productJsonLd(product, brandName, pageUrl) {
    if (!product) {
      return null;
    }
    const brand = brandName || "Jana Abreu Confeitaria";
    const slug = String(product.slug || "");
    const url = pageUrl || (slug ? Jana.publicUrl("produto/?slug=" + encodeURIComponent(slug)) : Jana.publicUrl("produto/"));
    const imagePath = product.images && product.images[0] ? product.images[0] : "";
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
    if (imagePath) {
      data.image = Jana.publicUrl(imagePath);
    }
    const priced = Jana.productHasFixedPrice
      ? Jana.productHasFixedPrice(product)
      : typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0;
    if (priced) {
      data.offers.price = Number(product.price);
    }
    return data;
  };


  Jana.FAQ_QUESTION_MAX = 200;
  Jana.FAQ_ANSWER_MAX = 1200;
  Jana.FAQ_MAX_ITEMS = 30;

  Jana.normalizeFaq = function normalizeFaq(data) {
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
    const out = [];
    const seen = Object.create(null);
    list.forEach(function each(item, index) {
      if (!item) return;
      const question = String(item.question || item.pergunta || item.name || "").trim();
      const answer = String(item.answer || item.resposta || item.text || "").trim();
      let id = String(item.id || "").trim();
      if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(id) || seen[id]) {
        id = "faq-" + (index + 1);
        let n = index + 1;
        while (seen[id]) {
          n += 1;
          id = "faq-" + n;
        }
      }
      seen[id] = true;
      out.push({ id: id, question: question, answer: answer });
    });
    return out;
  };

  Jana.faqJsonLd = function faqJsonLd(items) {
    const list = Jana.normalizeFaq(items).filter(function keep(item) {
      return item.question && item.answer;
    });
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: list.map(function question(item) {
        return {
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        };
      }),
    };
  };

  Jana.faqDetailsHtml = function faqDetailsHtml(items) {
    return Jana.normalizeFaq(items)
      .filter(function keep(item) {
        return item.question && item.answer;
      })
      .map(function details(item) {
        return (
          "<details>" +
          "<summary>" +
          Jana.escapeHtml(item.question) +
          "</summary>" +
          "<p>" +
          Jana.escapeHtml(item.answer) +
          "</p>" +
          "</details>"
        );
      })
      .join("");
  };

  /* Pastas e rotas que uma categoria nova não pode usar como endereço. */
  Jana.RESERVED_AREA_SLUGS = [
    "painel", "produto", "produtos", "encomendas", "pagamento", "sobre-nos", "sobre",
    "assets", "css", "js", "data", "tests", "test", "central", "docs", "screenshots",
    "scripts", "area", "areas", "catalogo", "index", "404", "admin", "login", "api",
    "corporativo", "personalizado-para-empresas", "cestas-presentes", "combos-festa",
    "doces-festa", "festa-personalizada", "sobremesas", "favicon", "robots", "sitemap",
    "perguntas-frequentes",
    "busca",
    "politica-de-cancelamento",
  ];

  Jana.isReservedAreaSlug = function isReservedAreaSlug(slug) {
    const key = String(slug || "");
    if (!key) return true;
    if (Jana.RESERVED_AREA_SLUGS.indexOf(key) !== -1) return true;
    if (Object.prototype.hasOwnProperty.call(Jana.AREA_REDIRECTS, key)) return true;
    return false;
  };

  Jana.slugifyArea = function slugifyArea(name, taken) {
    const used = {};
    (taken || []).forEach(function mark(s) {
      if (s) used[String(s)] = true;
    });
    Jana.RESERVED_AREA_SLUGS.forEach(function mark(s) {
      used[s] = true;
    });
    Object.keys(Jana.AREA_REDIRECTS).forEach(function mark(s) {
      used[s] = true;
    });
    let base = String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "");
    if (!base || !/^[a-z0-9]/.test(base)) base = "categoria";
    let slug = base;
    let n = 2;
    while (used[slug] || Jana.isReservedAreaSlug(slug)) {
      slug = (base + "-" + n).slice(0, 80);
      n += 1;
      if (n > 99) break;
    }
    return slug;
  };

  /* Slug da página de categoria: data-area, ?c=, ou o último segmento do caminho. */
  Jana.areaPageSlug = function areaPageSlug() {
    if (typeof document === "undefined") return "";
    const attr = document.body && document.body.getAttribute("data-area");
    if (attr) return attr;
    try {
      const params = new URLSearchParams(location.search);
      const q = String(params.get("c") || params.get("area") || "").replace(/^\/+|\/+$/g, "");
      if (q) return q;
    } catch (err) {}
    const parts = String(location.pathname || "").split("/").filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : "";
    if (last && last !== "area" && last !== "index.html") return last;
    return "";
  };

  Jana.isNatalEnabled = function isNatalEnabled(site) {
    return !!(site && site.natal && site.natal.enabled === true);
  };

  Jana.isNatalArea = function isNatalArea(area) {
    if (!area) {
      return false;
    }
    return area.id === "natal" || area.slug === "natal" || area.seasonal === true;
  };

  /* Data de hoje (AAAA-MM-DD) no fuso de Brasília. */
  Jana.todayYmd = function todayYmd(now) {
    try {
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
    } catch (err) {
      return new Date(now || Date.now()).toISOString().slice(0, 10);
    }
  };

  /* Antecedência mínima fixa: a cliente só pode pedir para daqui a 2 dias (horário de Brasília). */
  Jana.ANTECEDENCIA_MINIMA_DIAS = 2;

  Jana.addDaysYmd = function addDaysYmd(ymd, days) {
    const match = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return "";
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0)));
    const y = date.getUTCFullYear();
    const m = ("0" + (date.getUTCMonth() + 1)).slice(-2);
    const d = ("0" + date.getUTCDate()).slice(-2);
    return y + "-" + m + "-" + d;
  };

  /* «sexta-feira, 13/11» — dia da semana e dd/mm, para recados à cliente. */
  Jana.formatDateLongBR = function formatDateLongBR(ymd) {
    const match = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return "";
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(date);
    return weekday + ", " + match[3] + "/" + match[2];
  };

  Jana.minLeadDateYmd = function minLeadDateYmd(now, days) {
    const raw = days == null ? Jana.ANTECEDENCIA_MINIMA_DIAS : Number(days);
    const lead = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : Jana.ANTECEDENCIA_MINIMA_DIAS;
    return Jana.addDaysYmd(Jana.todayYmd(now), lead);
  };

  Jana.isSeasonalArea = function isSeasonalArea(area) {
    return Jana.isNatalArea(area);
  };

  /* Áreas sazonais (Natal, Páscoa): area.ativacao = { modo: "desligado" | "ligado" | "datas", inicio, fim }.
     Sem ativacao, o Natal segue o antigo site.natal.enabled. */
  Jana.seasonalStatus = function seasonalStatus(area, site, now) {
    if (!area || area.enabled === false) {
      return false;
    }
    if (!Jana.isSeasonalArea(area)) {
      return true;
    }
    const rule = area.ativacao;
    if (rule && typeof rule === "object") {
      if (rule.modo === "ligado") {
        return true;
      }
      if (rule.modo === "datas") {
        const today = Jana.todayYmd(now);
        return !!(rule.inicio && rule.fim) && today >= rule.inicio && today <= rule.fim;
      }
      return false;
    }
    if (area.id === "natal" || area.slug === "natal") {
      return Jana.isNatalEnabled(site);
    }
    return false;
  };

  Jana.isAreaActive = function isAreaActive(area, site, now) {
    return Jana.seasonalStatus(area, site, now);
  };

  Jana.visibleAreas = function visibleAreas(areas, site, now) {
    return (areas || [])
      .filter(function keepArea(area) {
        return Jana.isAreaActive(area, site, now);
      })
      .slice()
      .sort(function byOrder(a, b) {
        return (a.order || 0) - (b.order || 0);
      });
  };

  Jana.productCategoryIds = function productCategoryIds(product) {
    if (!product) {
      return [];
    }
    if (product.categoryIds && product.categoryIds.length) {
      return product.categoryIds;
    }
    return product.categoryId ? [product.categoryId] : [];
  };

  Jana.foldText = function foldText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };

  Jana.sortProductsByName = function sortProductsByName(products) {
    return (products || []).slice().sort(function byName(x, y) {
      return String((x && x.name) || "").localeCompare(String((y && y.name) || ""), "pt-BR");
    });
  };

  /* Todos os produtos do catálogo (com ou sem preço, ocultos inclusive). */
  Jana.catalogProductsForPicker = function catalogProductsForPicker(products, query) {
    const q = Jana.foldText(query);
    return Jana.sortProductsByName(
      (products || []).filter(function keep(p) {
        if (!p || !p.slug) return false;
        if (!q) return true;
        return Jana.foldText(String(p.name || "") + " " + String(p.slug || "")).indexOf(q) !== -1;
      })
    );
  };

  Jana.productBelongsToArea = function productBelongsToArea(product, area) {
    const cats = Jana.productCategoryIds(product);
    return ((area && area.sourceCategoryIds) || []).some(function hasId(id) {
      return cats.indexOf(id) !== -1;
    });
  };

  /* Grupos por categoria (área do site). Um produto pode aparecer em mais de um grupo.
     Produtos sem área entram no grupo da categoria residual ou em «Sem categoria». */
  Jana.productPickerGroups = function productPickerGroups(products, areas, options) {
    const opts = options || {};
    const list = Jana.catalogProductsForPicker(products, opts.query);
    const names = opts.categoryNames || {};
    const groups = [];
    const inArea = new Set();
    (areas || []).forEach(function eachArea(area) {
      if (!area || !area.id) return;
      const items = list.filter(function inThis(p) {
        return Jana.productBelongsToArea(p, area);
      });
      if (!items.length) return;
      groups.push({ id: "area:" + area.id, name: area.name || area.id, products: items });
      items.forEach(function mark(p) {
        inArea.add(p.slug);
      });
    });
    const leftover = Object.create(null);
    list.forEach(function rest(p) {
      if (inArea.has(p.slug)) return;
      const cats = Jana.productCategoryIds(p);
      if (!cats.length) {
        if (!leftover[""]) leftover[""] = { id: "sem-categoria", name: "Sem categoria", products: [] };
        leftover[""].products.push(p);
        return;
      }
      cats.forEach(function eachCat(cid) {
        const key = String(cid || "");
        const label = names[key] || p.category || key || "Sem categoria";
        if (!leftover[key]) leftover[key] = { id: "cat:" + key, name: label, products: [] };
        leftover[key].products.push(p);
      });
    });
    Object.keys(leftover)
      .map(function key(k) {
        return leftover[k];
      })
      .sort(function byGroup(a, b) {
        if (a.id === "sem-categoria") return 1;
        if (b.id === "sem-categoria") return -1;
        return String(a.name).localeCompare(String(b.name), "pt-BR");
      })
      .forEach(function push(g) {
        g.products = Jana.sortProductsByName(g.products);
        groups.push(g);
      });
    return groups;
  };


  Jana.PRODUCT_SORTS = ["manual", "alfa", "preco-asc", "preco-desc"];

  Jana.isProductSort = function isProductSort(value) {
    return Jana.PRODUCT_SORTS.indexOf(value) !== -1;
  };

  /* Preço numérico para ordenação; sem preço ou «Sob consulta» devolve null. */
  Jana.productSortPrice = function productSortPrice(product) {
    if (!product) {
      return null;
    }
    if (typeof Jana.productHasFixedPrice === "function") {
      return Jana.productHasFixedPrice(product) && typeof product.price === "number" ? product.price : null;
    }
    if (typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0) {
      const label = String(product.priceLabel || product.precoLabel || "");
      if (/\ba combinar\b|\bsob consulta\b/i.test(label)) {
        return null;
      }
      return product.price;
    }
    return null;
  };

  Jana.sortProductsForArea = function sortProductsForArea(products, area) {
    const list = (products || []).slice();
    const mode = area && area.productSort;
    if (mode === "alfa") {
      return list.sort(function byName(x, y) {
        return String((x && x.name) || "").localeCompare(String((y && y.name) || ""), "pt-BR");
      });
    }
    if (mode === "preco-asc" || mode === "preco-desc") {
      const dir = mode === "preco-asc" ? 1 : -1;
      return list.sort(function byPrice(x, y) {
        const px = Jana.productSortPrice(x);
        const py = Jana.productSortPrice(y);
        const xOk = px != null;
        const yOk = py != null;
        if (xOk && yOk) {
          if (px !== py) return (px - py) * dir;
          return String((x && x.name) || "").localeCompare(String((y && y.name) || ""), "pt-BR");
        }
        if (xOk) return -1;
        if (yOk) return 1;
        return String((x && x.name) || "").localeCompare(String((y && y.name) || ""), "pt-BR");
      });
    }
    if (mode === "manual") {
      const index = Object.create(null);
      ((area && area.productOrder) || []).forEach(function mark(slug, i) {
        const key = String(slug || "");
        if (key && index[key] == null) index[key] = i;
      });
      return list.sort(function byManual(x, y) {
        const ix = index[(x && x.slug) || ""];
        const iy = index[(y && y.slug) || ""];
        const xOk = ix != null;
        const yOk = iy != null;
        if (xOk && yOk) return ix - iy;
        if (xOk) return -1;
        if (yOk) return 1;
        return 0;
      });
    }
    return list;
  };

  Jana.productsForArea = function productsForArea(products, area) {
    const ids = (area && area.sourceCategoryIds) || [];
    const list = (products || []).filter(function inArea(product) {
      if (product.active === false) {
        return false;
      }
      const cats = Jana.productCategoryIds(product);
      return cats.some(function hasId(id) {
        return ids.indexOf(id) !== -1;
      });
    });
    return Jana.sortProductsForArea(list, area);
  };

  Jana.areaForProduct = function areaForProduct(product, areas) {
    const cats = Jana.productCategoryIds(product);
    return (areas || []).find(function matchArea(area) {
      const ids = area.sourceCategoryIds || [];
      return cats.some(function hasId(id) {
        return ids.indexOf(id) !== -1;
      });
    }) || null;
  };

  Jana.productImageAlt = function productImageAlt(product, index) {
    if (!product) {
      return "";
    }
    const alts = Array.isArray(product.imagesAlt) ? product.imagesAlt : [];
    const alt = String(alts[index || 0] || "").trim();
    return alt || product.name || "";
  };

  Jana.categorySlug = function categorySlug(category) {
    if (!category) {
      return "";
    }
    if (typeof category === "string") {
      return category;
    }
    return category.slug || category.id || "";
  };

  Jana.productUrl = function productUrl(slug) {
    return Jana.assetUrl("produto/?slug=" + encodeURIComponent(String(slug || "")));
  };

  /* Página estática do produto; a busca leva para cá. O canônico da ficha continua em produto/?slug=. */
  Jana.productPageUrl = function productPageUrl(slug) {
    const s = String(slug || "").replace(/^\/+|\/+$/g, "");
    if (!s) return Jana.assetUrl("produto/");
    return Jana.assetUrl("produto/" + s + "/");
  };


  Jana.foldSearch = function foldSearch(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  };

  Jana.searchTerms = function searchTerms(query) {
    const folded = Jana.foldSearch(query);
    if (!folded) return [];
    const seen = Object.create(null);
    const out = [];
    folded.split(" ").forEach(function each(term) {
      if (!term || seen[term]) return;
      seen[term] = true;
      out.push(term);
    });
    return out;
  };

  function searchEditDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    if (Math.abs(a.length - b.length) > 2) return 99;
    const rows = [];
    for (let i = 0; i <= a.length; i++) rows[i] = [i];
    for (let j = 1; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      }
    }
    return rows[a.length][b.length];
  }

  Jana.searchTermScore = function searchTermScore(term, text, allowTypo) {
    const needle = String(term || "");
    const hay = Jana.foldSearch(text);
    if (!needle || !hay) return 0;
    if (hay === needle) return 100;
    if ((" " + hay + " ").indexOf(" " + needle + " ") !== -1) return 90;
    if (needle.length < 4) return 0;
    if (hay.indexOf(needle) === 0 || (" " + hay).indexOf(" " + needle) !== -1) return 78;
    if (hay.indexOf(needle) !== -1) return 64;
    if (allowTypo === false) return 0;
    const words = hay.split(" ");
    let best = 0;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word || Math.abs(word.length - needle.length) > 1) continue;
      const d = searchEditDistance(needle, word);
      if (d === 1) best = Math.max(best, 42);
    }
    return best;
  };

  Jana.searchCategoryText = function searchCategoryText(product, areas, site, now) {
    const visible = Jana.visibleAreas(areas || [], site, now);
    const ids = Jana.productCategoryIds ? Jana.productCategoryIds(product) : [];
    const names = [];
    const seen = Object.create(null);
    function add(name) {
      const text = String(name || "").trim();
      if (!text || seen[text]) return;
      seen[text] = true;
      names.push(text);
    }
    if (product && product.category) add(product.category);
    visible.forEach(function each(area) {
      const sources = (area.sourceCategoryIds || []).concat(area.id, area.slug);
      const hit = ids.some(function has(id) {
        return sources.indexOf(id) !== -1;
      });
      if (hit) {
        add(area.name);
        add(area.slug);
      }
    });
    return names.join(" ");
  };

  Jana.isSearchableProduct = function isSearchableProduct(product, areas, site, now) {
    if (!product || product.active === false || !product.slug) return false;
    const visible = Jana.visibleAreas(areas || [], site, now);
    const ids = Jana.productCategoryIds ? Jana.productCategoryIds(product) : [];
    if (!ids.length) return true;
    return visible.some(function area(area) {
      const sources = (area.sourceCategoryIds || []).concat(area.id, area.slug);
      return ids.some(function has(id) {
        return sources.indexOf(id) !== -1;
      });
    });
  };

  Jana.searchProducts = function searchProducts(query, products, areas, site, now) {
    const terms = Jana.searchTerms(query);
    if (!terms.length) return [];
    const out = [];
    (products || []).forEach(function each(product) {
      if (!Jana.isSearchableProduct(product, areas, site, now)) return;
      const name = product.name || "";
      const category = Jana.searchCategoryText(product, areas, site, now);
      const description = product.description || product.descricao || "";
      let total = 0;
      for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        const nameScore = Jana.searchTermScore(term, name, true);
        const catScore = Jana.searchTermScore(term, category, true);
        const descScore = Jana.searchTermScore(term, description, false);
        const best = Math.max(nameScore * 4, catScore * 1.6, descScore);
        if (!best) return;
        total += best;
      }
      out.push({ product: product, score: total });
    });
    out.sort(function byScore(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.product.name || "").localeCompare(String(b.product.name || ""), "pt-BR");
    });
    return out;
  };

  Jana.isCakeProduct = function isCakeProduct(product) {
    if (!product) {
      return false;
    }
    if (product.categoryId === "bolos") {
      return true;
    }
    return !!(product.categoryIds && product.categoryIds.indexOf("bolos") !== -1);
  };

  Jana.loadJSON = async function loadJSON(path) {
    const response = await fetch(Jana.assetUrl(path), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Não foi possível carregar " + path);
    }
    return response.json();
  };

  /* Texto editável do site.json: se a chave não existir, usa o fallback;
     se existir e estiver vazia, devolve vazio (não mostra). */
  Jana.siteText = function siteText(site, key, fallback) {
    if (!site || !Object.prototype.hasOwnProperty.call(site, key) || site[key] == null) {
      return fallback == null ? "" : String(fallback);
    }
    return String(site[key]).trim();
  };

  Jana.bindText = function bindText(key, value) {
    Jana.qsa('[data-bind="' + key + '"]').forEach(function setText(node) {
      node.textContent = value || "";
    });
  };

  Jana.bindHref = function bindHref(key, href) {
    Jana.qsa('[data-bind="' + key + '"]').forEach(function setHref(node) {
      node.setAttribute("href", href);
    });
  };

  Jana.instagramUrl = function instagramUrl(instagram) {
    if (!instagram) {
      return "https://www.instagram.com/janaabreuconfeitaria/";
    }
    if (typeof instagram === "string") {
      if (instagram.indexOf("http") === 0) {
        return instagram;
      }
      return "https://www.instagram.com/" + instagram.replace(/^@/, "") + "/";
    }
    return instagram.url || "https://www.instagram.com/janaabreuconfeitaria/";
  };

  Jana.instagramHandle = function instagramHandle(instagram) {
    if (!instagram) {
      return "@janaabreuconfeitaria";
    }
    if (typeof instagram === "string") {
      return instagram.indexOf("http") === 0 ? "@janaabreuconfeitaria" : instagram;
    }
    return instagram.handle || "@janaabreuconfeitaria";
  };

  // Shared by home and area carousels: +20% display, 2× slower transition.
  Jana.CAROUSEL_INTERVAL_MS = 6720;
  Jana.CAROUSEL_TRANSITION_MS = 1200;
  Jana.CAROUSEL_MAX_DOTS = 12;

  Jana.productCardExcerpt = function productCardExcerpt(product) {
    return String((product && (product.shortDescription || product.description)) || "")
      .replace(/\s+/g, " ")
      .trim();
  };

  Jana.productBySlug = function productBySlug(products, slug) {
    if (!slug) {
      return null;
    }
    return (products || []).find(function match(product) {
      return product.slug === slug;
    }) || null;
  };

  Jana.carouselSlidesFromProducts = function carouselSlidesFromProducts(products) {
    return (products || [])
      .filter(function hasPhoto(product) {
        return product && product.slug && product.images && product.images[0];
      })
      .map(function toSlide(product) {
        return {
          image: product.images[0],
          productSlug: product.slug,
          title: product.name || "",
        };
      });
  };

  Jana.entregaConfig = function entregaConfig(site) {
    const raw = (site && site.entrega) || {};
    const table = raw.porRegiao && typeof raw.porRegiao === "object" ? raw.porRegiao : {};
    const regions = Object.keys(table)
      .map(function toRegion(id) {
        const value = table[id];
        if (value && typeof value === "object") {
          const taxa = Number(value.taxa != null ? value.taxa : value.valor);
          return {
            id: id,
            label: value.label || value.nome || id,
            taxa: taxa,
          };
        }
        return { id: id, label: id, taxa: Number(value) };
      })
      .filter(function hasTaxa(region) {
        return Number.isFinite(region.taxa);
      });
    const taxa = raw.taxa == null || raw.taxa === "" ? null : Number(raw.taxa);
    return {
      taxa: Number.isFinite(taxa) ? taxa : null,
      regions: regions,
    };
  };

  Jana.resolveEntrega = function resolveEntrega(site, modalidade, regiaoId) {
    if (modalidade !== "entrega") {
      return {
        modalidade: "retirada",
        taxa: 0,
        taxaDefinida: true,
        taxaPendente: false,
        regiao: "",
        regiaoLabel: "",
      };
    }
    const config = Jana.entregaConfig(site);
    if (config.regions.length) {
      const match = config.regions.find(function find(region) {
        return region.id === regiaoId;
      });
      if (match) {
        return {
          modalidade: "entrega",
          taxa: match.taxa,
          taxaDefinida: true,
          taxaPendente: false,
          regiao: match.id,
          regiaoLabel: match.label,
        };
      }
      return {
        modalidade: "entrega",
        taxa: 0,
        taxaDefinida: false,
        taxaPendente: true,
        regiao: regiaoId || "",
        regiaoLabel: "",
      };
    }
    if (config.taxa == null) {
      return {
        modalidade: "entrega",
        taxa: 0,
        taxaDefinida: false,
        taxaPendente: true,
        regiao: "",
        regiaoLabel: "",
      };
    }
    return {
      modalidade: "entrega",
      taxa: config.taxa,
      taxaDefinida: true,
      taxaPendente: false,
      regiao: "",
      regiaoLabel: "",
    };
  };

  Jana.checkoutTotals = function checkoutTotals(subtotal, resolved) {
    const base = Number(subtotal) || 0;
    if (!resolved || resolved.modalidade !== "entrega") {
      return {
        subtotal: base,
        taxa: 0,
        taxaPendente: false,
        taxaLabel: "",
        total: base,
        totalLabel: Jana.formatBRL(base),
      };
    }
    if (resolved.taxaPendente) {
      return {
        subtotal: base,
        taxa: 0,
        taxaPendente: true,
        taxaLabel: "a confirmar pela Jana",
        total: base,
        totalLabel: Jana.formatBRL(base) + " + taxa a confirmar",
      };
    }
    return {
      subtotal: base,
      taxa: resolved.taxa,
      taxaPendente: false,
      taxaLabel: Jana.formatBRL(resolved.taxa),
      total: base + resolved.taxa,
      totalLabel: Jana.formatBRL(base + resolved.taxa),
    };
  };

  Jana.isProductBanner = function isProductBanner(slide) {
    return !!(slide && slide.tipo === "produto");
  };

  Jana.productBannerAvailable = function productBannerAvailable(product) {
    return !!(product && product.active !== false && product.slug && product.images && product.images[0]);
  };

  Jana.productBannerDefaults = function productBannerDefaults(product) {
    if (!product) {
      return { title: "", description: "", image: "", price: null, href: "", alt: "" };
    }
    return {
      title: String(product.name || "").trim(),
      description: String(product.description || product.shortDescription || "").replace(/\s+/g, " ").trim(),
      image: (product.images && product.images[0]) || "",
      price: typeof product.price === "number" && Number.isFinite(product.price) ? product.price : null,
      href: Jana.productUrl(product.slug),
      alt: String(product.name || "").trim(),
    };
  };

  Jana.resolveProductBanner = function resolveProductBanner(slide, product) {
    const base = Jana.productBannerDefaults(product);
    const o = slide && slide.overrides && typeof slide.overrides === "object" ? slide.overrides : {};
    const hasKey = function hasKey(key) {
      return Object.prototype.hasOwnProperty.call(o, key);
    };
    const hasValue = function hasValue(key) {
      return hasKey(key) && o[key] != null && o[key] !== "";
    };
    const title = hasValue("title") ? String(o.title).trim() : base.title;
    const description = hasKey("description") ? String(o.description || "").trim() : base.description;
    const image = hasValue("image") ? String(o.image) : base.image;
    const price = hasKey("price") ? o.price : base.price;
    const priced = typeof price === "number" && Number.isFinite(price) && price > 0;
    let href = base.href;
    let external = false;
    if (hasValue("url")) {
      const link = Jana.slideLink({ linkTipo: "url", url: o.url }, product);
      href = link.href;
      external = link.external;
    }
    return {
      tipo: "produto",
      banner: true,
      id: (slide && slide.id) || "",
      productSlug: (product && product.slug) || (slide && slide.productSlug) || "",
      title: title,
      description: description,
      image: image,
      price: priced ? price : price,
      priceLabel: priced ? Jana.formatBRL(price) : "Sob consulta",
      href: href,
      external: external,
      alt: title || base.alt,
      matched: !!product,
      foto: Jana.fotoForSave ? Jana.fotoForSave(slide && slide.foto) : null,
    };
  };

  /* IMAGE_SIZES_START */
  Jana.IMAGE_SIZES = {"assets/areas/bolos-mwjkwwez0sqep.webp":[471, 471],"assets/areas/corporate-mwjk58nd5316s.webp":[560, 840],"assets/areas/natal-mwjk6kqx5va9h.webp":[560, 840],"assets/brand/logo-jana-abreu.png":[805, 247],"assets/brand/logo.webp":[300, 251],"assets/brand/padronagem.png":[940, 788],"assets/brand/padronagem.webp":[940, 788],"assets/brand/palette.png":[1314, 1060],"assets/carousel/banner-cel-mwl3087retvx3-w900.webp":[900, 600],"assets/carousel/banner-cel-mwl3087retvx3.webp":[1200, 800],"assets/carousel/banner-cel-mwl3l7ft6vdo0-w900.webp":[900, 645],"assets/carousel/banner-cel-mwl3l7ft6vdo0.webp":[1200, 860],"assets/carousel/banner-cel-mwl40304thj58-w900.webp":[900, 645],"assets/carousel/banner-cel-mwl40304thj58.webp":[1200, 860],"assets/carousel/banner-cel-mwl5qgwuewy8w-w900.webp":[900, 645],"assets/carousel/banner-cel-mwl5qgwuewy8w.webp":[1200, 860],"assets/carousel/banner-mwjltdguji9lj-cel-mwjly5836k9gc-w900.webp":[900, 600],"assets/carousel/banner-mwjltdguji9lj-cel-mwjly5836k9gc.webp":[1200, 800],"assets/carousel/banner-mwjltdguji9lj-pc-mwjm0m82q3own-w900.webp":[900, 262],"assets/carousel/banner-mwjltdguji9lj-pc-mwjm0m82q3own.webp":[2400, 700],"assets/carousel/banner-pc-mwjhm25l2qw90.webp":[800, 1200],"assets/carousel/banner-pc-mwjlsmyw3vncz-w900.webp":[900, 262],"assets/carousel/banner-pc-mwjlsmyw3vncz.webp":[2400, 700],"assets/carousel/banner-pc-mwl2vz8wv0u7m-w900.webp":[900, 600],"assets/carousel/banner-pc-mwl2vz8wv0u7m.webp":[1800, 1200],"assets/carousel/banner-pc-mwl302avhw2x1-w900.webp":[900, 262],"assets/carousel/banner-pc-mwl302avhw2x1.webp":[2400, 700],"assets/carousel/banner-pc-mwl3hdkr4vxm1-w900.webp":[900, 300],"assets/carousel/banner-pc-mwl3hdkr4vxm1.webp":[2400, 800],"assets/carousel/banner-pc-mwl436kw08qvd-w900.webp":[900, 300],"assets/carousel/banner-pc-mwl436kw08qvd.webp":[2400, 800],"assets/carousel/banner-pc-mwl5h5tnt6zd6-w900.webp":[900, 300],"assets/carousel/banner-pc-mwl5h5tnt6zd6.webp":[2400, 800],"assets/carousel/slide-doces.webp":[675, 1200],"assets/carousel/slide-encomendas.webp":[800, 1067],"assets/carousel/slide-kits.webp":[640, 480],"assets/carousel/slide-vitrine.webp":[648, 592],"assets/categories/bolos.webp":[840, 840],"assets/categories/cestas-presentes.webp":[840, 840],"assets/categories/combos-festa.webp":[840, 840],"assets/categories/doces-festa.webp":[840, 840],"assets/categories/festa-personalizada.webp":[840, 840],"assets/categories/personalizado-empresas.webp":[840, 840],"assets/categories/personalizado-para-empresas.webp":[840, 840],"assets/categories/sobremesas.webp":[840, 840],"assets/instagram/ig-1.webp":[768, 1024],"assets/instagram/ig-2.webp":[640, 480],"assets/instagram/ig-3.webp":[800, 1200],"assets/instagram/ig-4.webp":[800, 1000],"assets/instagram/ig-5.webp":[675, 1200],"assets/instagram/ig-6.webp":[800, 533],"assets/products/adicione-esculturas-de-ninho/01.webp":[800, 1067],"assets/products/adicione-esculturas-de-ninho/02.webp":[800, 1067],"assets/products/adicione-esculturas-de-ninho/03.webp":[675, 1200],"assets/products/adicione-esculturas-de-ninho/04.webp":[675, 1200],"assets/products/alfajor-3d/01.webp":[800, 533],"assets/products/alfajor-3d/02.webp":[419, 371],"assets/products/alfajor-natalino-und/foto-mwjgru653yayq.webp":[471, 471],"assets/products/alfajor-natalino-und/foto-mwjjqjby5felm.webp":[933, 1400],"assets/products/alfajor-natalino-und/foto-mwjjqjlw1rct4.webp":[1400, 933],"assets/products/alfajor-no-palito/01.webp":[800, 1114],"assets/products/alfajor-no-palito/02.webp":[800, 1067],"assets/products/alfajor-no-palito/03.webp":[688, 968],"assets/products/alfajor-personalizado-logo/01.webp":[800, 1067],"assets/products/alfajor-personalizado-logo/02.webp":[800, 1067],"assets/products/alfajor-personalizado-logo/03.webp":[458, 445],"assets/products/alfajor-personalizado-logo-tag/01.webp":[800, 1067],"assets/products/alfajor-personalizado-logo-tag/02.webp":[800, 1067],"assets/products/alfajor-personalizado-logo-tag/03.webp":[675, 1200],"assets/products/alfajor-personalizado-logo-tag/04.webp":[471, 706],"assets/products/alfajores-doce-deleite-550g/01.webp":[800, 1067],"assets/products/amanteigado-decorado-com-glace/01.webp":[800, 1067],"assets/products/amanteigado-decorado-com-glace/02.webp":[800, 988],"assets/products/amanteigado-decorado-com-glace/03.webp":[511, 718],"assets/products/amanteigado-decorado-com-glace/04.webp":[465, 482],"assets/products/amanteigado-decorado-com-glace/05.webp":[460, 468],"assets/products/amanteigado-decorado-corte-personalizado-tag/01.webp":[800, 1067],"assets/products/amanteigado-decorado-corte-personalizado-tag/02.webp":[800, 1067],"assets/products/amanteigado-decorado-ninho/01.webp":[675, 1200],"assets/products/amanteigado-decorado-obrigado/01.webp":[675, 1200],"assets/products/amanteigado-flocos-de-neve/foto-mwjii4m60crri.webp":[1050, 1400],"assets/products/amanteigado-ninho-personalizado/01.webp":[800, 1067],"assets/products/amanteigado-personalizado-6cm/01.webp":[800, 1067],"assets/products/amanteigado-personalizado-6cm/02.webp":[800, 1067],"assets/products/amanteigado-personalizado-caixinha/01.webp":[800, 1067],"assets/products/amanteigados-carimbado-logo-400g/01.webp":[675, 1200],"assets/products/amanteigados-carimbado-logo-400g/02.webp":[800, 893],"assets/products/amanteigados-carimbados/01.webp":[800, 932],"assets/products/amanteigados-emoji/01.webp":[675, 1200],"assets/products/amanteigados-emoji/02.webp":[675, 1200],"assets/products/amanteigados-tema-9cm-glace/01.webp":[675, 1200],"assets/products/aniversariantes-do-mes-bento-cake/01.webp":[675, 1200],"assets/products/aniversariantes-do-mes-cupcake/01.webp":[800, 1067],"assets/products/aniversariantes-do-mes-cupcake/02.webp":[675, 1200],"assets/products/aniversariantes-do-mes-cupcake/03.webp":[540, 541],"assets/products/beijinho/01.webp":[736, 726],"assets/products/bem-casado-personalizado-logo-com-tag/01.webp":[800, 1067],"assets/products/bem-casado-personalizado-tag/01.webp":[675, 1200],"assets/products/bem-casado-tag/01.webp":[800, 764],"assets/products/bento-cake/01.webp":[675, 1200],"assets/products/biscoito-agradecimento/01.webp":[675, 1200],"assets/products/biscoito-decorado-logo/01.webp":[725, 1200],"assets/products/biscoito-decorado-logo/02.webp":[800, 1067],"assets/products/biscoito-logo-carimbado-ninho/01.webp":[675, 1200],"assets/products/bolo-2-andares-g-p/01.webp":[675, 1200],"assets/products/bolo-2-andares-g-p/02.webp":[800, 1000],"assets/products/bolo-2-andares-g-p.webp":[800, 1000],"assets/products/bolo-2-andares-m-pp/01.webp":[800, 1067],"assets/products/bolo-2-andares-m-pp/02.webp":[640, 433],"assets/products/bolo-2-andares-m-pp.webp":[640, 433],"assets/products/bolo-buttercream-g/01.webp":[800, 1067],"assets/products/bolo-buttercream-g/02.webp":[675, 1200],"assets/products/bolo-buttercream-g/03.webp":[554, 1200],"assets/products/bolo-buttercream-g/04.webp":[454, 464],"assets/products/bolo-buttercream-g.webp":[675, 1200],"assets/products/bolo-buttercream-m/01.webp":[800, 1067],"assets/products/bolo-buttercream-m/02.webp":[675, 1200],"assets/products/bolo-buttercream-m/03.webp":[675, 1200],"assets/products/bolo-buttercream-m/04.webp":[675, 1200],"assets/products/bolo-buttercream-m/05.webp":[675, 1200],"assets/products/bolo-buttercream-m/06.webp":[675, 1200],"assets/products/bolo-buttercream-m.webp":[675, 1200],"assets/products/bolo-buttercream-p/01.webp":[800, 1067],"assets/products/bolo-buttercream-p/02.webp":[800, 1067],"assets/products/bolo-buttercream-p/03.webp":[675, 1200],"assets/products/bolo-buttercream-p/04.webp":[675, 1200],"assets/products/bolo-buttercream-p/05.webp":[675, 1200],"assets/products/bolo-buttercream-p/06.webp":[525, 634],"assets/products/bolo-buttercream-pp/01.webp":[800, 1067],"assets/products/bolo-buttercream-pp/02.webp":[530, 533],"assets/products/bolo-naked-g/01.webp":[768, 1024],"assets/products/bolo-naked-g.webp":[768, 1024],"assets/products/bolo-naked-m/01.webp":[800, 800],"assets/products/bolo-naked-m/02.webp":[578, 572],"assets/products/bolo-naked-p/01.webp":[800, 1067],"assets/products/bolo-naked-p/02.webp":[800, 1067],"assets/products/bolo-naked-p/03.webp":[800, 1067],"assets/products/bolo-naked-pp/01.webp":[800, 1067],"assets/products/bolo-naked-pp/02.webp":[800, 1067],"assets/products/bolo-p-15-mini-alfajor-lembranca/01.webp":[800, 1000],"assets/products/bolo-p-50-brigadeiros-personalizados.webp":[800, 1067],"assets/products/bolo-p-50-brigs-personalizados/01.webp":[800, 1067],"assets/products/bolo-parabens-para-presente/01.webp":[800, 1067],"assets/products/bolo-parabens-para-presente/02.webp":[800, 1067],"assets/products/bolo-retangular-gg/01.webp":[800, 1198],"assets/products/bolo-retangular-gg/02.webp":[800, 600],"assets/products/bolo-retangular-gg.webp":[800, 600],"assets/products/bolos-3d/01.webp":[685, 1200],"assets/products/bolos-3d/02.webp":[675, 1200],"assets/products/bolos-personalizados/01.webp":[800, 1067],"assets/products/bombom-de-morango/01.webp":[675, 1200],"assets/products/bombom-de-uva/01.webp":[728, 576],"assets/products/box-gratidao/foto-mwdqhk8n0zb10.webp":[933, 1400],"assets/products/box-gratidao/foto-mwdqhkj0cppig.webp":[933, 1400],"assets/products/brigadeiro/01.webp":[675, 1200],"assets/products/brigadeiro/02.webp":[800, 728],"assets/products/brigadeiro-brulee/01.webp":[532, 380],"assets/products/brigadeiro-chocolate-banco/01.webp":[598, 502],"assets/products/brigadeiro-churros/01.webp":[522, 380],"assets/products/brigadeiro-nesquik/01.webp":[454, 384],"assets/products/brigadeiro-ninho-nutella/01.webp":[344, 368],"assets/products/brownie-personalizado-caixinha/01.webp":[800, 1067],"assets/products/brownie-personalizado-caixinha/02.webp":[800, 1067],"assets/products/brownie-personalizado-caixinha/03.webp":[800, 1067],"assets/products/brownie-personalizado-caixinha/04.webp":[800, 533],"assets/products/brownie-personalizado-caixinha/05.webp":[800, 533],"assets/products/brownie-tag/01.webp":[728, 932],"assets/products/buque-de-flores/01.webp":[800, 1200],"assets/products/buque-de-flores/02.webp":[800, 1200],"assets/products/cafe-parabens-fit/01.webp":[800, 1067],"assets/products/cafe-parabens-fit.webp":[800, 1067],"assets/products/cafe-paris/01.webp":[518, 425],"assets/products/caixa-12-cupcakes-personalizados/01.webp":[800, 1067],"assets/products/caixa-12-cupcakes-personalizados/02.webp":[800, 1067],"assets/products/caixa-12-cupcakes-personalizados/03.webp":[675, 1200],"assets/products/caixa-12-cupcakes-personalizados/04.webp":[675, 840],"assets/products/caixa-15-brigadeiros/01.webp":[800, 728],"assets/products/caixa-2-alfajores-logo/01.webp":[800, 1067],"assets/products/caixa-2-alfajores-logo/02.webp":[800, 1067],"assets/products/caixa-2-alfajores-natal/foto-mwjhdyllc7rsz.webp":[471, 471],"assets/products/caixa-2-alfajores-natal/foto-mwjhf5w2vz6k8.webp":[1400, 933],"assets/products/caixa-2-alfajores-natal/foto-mwjhf66cgvlhg.webp":[933, 1400],"assets/products/caixa-2-alfajores-natal/foto-mwjhf6f03umpt.webp":[933, 1400],"assets/products/caixa-20-brownies-com-doce-deleite/01.webp":[675, 1200],"assets/products/caixa-20-mini-brownies/01.webp":[675, 1200],"assets/products/caixa-4-alfajores-logo/01.webp":[505, 591],"assets/products/caixa-4-brownies-personalizados-tag/01.webp":[800, 1067],"assets/products/caixa-4-brownies-personalizados-tag/02.webp":[800, 533],"assets/products/caixa-4-brownies-personalizados-tag/03.webp":[800, 533],"assets/products/caixa-4-cupcakes/01.webp":[800, 1067],"assets/products/caixa-4-cupcakes/02.webp":[800, 1067],"assets/products/caixa-biscoitos-personalizados-presente/01.webp":[800, 1067],"assets/products/caixa-biscoitos-personalizados-presente/02.webp":[800, 800],"assets/products/caixa-com-50-brigadeiros-personalizados/01.webp":[675, 1200],"assets/products/caixa-com-50-brigadeiros-personalizados/02.webp":[555, 1200],"assets/products/caixa-de-brownie-flores/01.webp":[714, 1068],"assets/products/caixa-parabens-individual-kit-10.webp":[800, 1067],"assets/products/caixa-parabens-individual-kit-com-10-und/01.webp":[800, 1067],"assets/products/caixa-parabens-individual-kit-com-10-und/02.webp":[800, 1067],"assets/products/camafeu-de-nozes/01.webp":[800, 508],"assets/products/cesta-dengo/01.webp":[800, 1200],"assets/products/cesta-dengo/02.webp":[800, 1200],"assets/products/cesta-encanto-de-natal/foto-mwjjmu4skn1q8.webp":[1050, 1400],"assets/products/cesta-manha-dos-sonhos/01.webp":[800, 1067],"assets/products/cesta-manha-dos-sonhos/02.webp":[675, 1200],"assets/products/cesta-manha-dos-sonhos/03.webp":[640, 480],"assets/products/cesta-manha-dos-sonhos.webp":[640, 480],"assets/products/cesta-parabens-pra-voce/01.webp":[800, 1200],"assets/products/cesta-parabens-pra-voce/02.webp":[800, 1200],"assets/products/cesta-parabens-pra-voce/03.webp":[800, 1200],"assets/products/cesta-parabens-pra-voce/04.webp":[800, 1200],"assets/products/cesta-parabens-pra-voce/05.webp":[800, 1200],"assets/products/cesta-parabens-pra-voce/06.webp":[800, 1200],"assets/products/cesta-parabens-pra-voce.webp":[800, 1200],"assets/products/cesta-primavera/01.webp":[800, 755],"assets/products/cesta-rubi/01.webp":[648, 592],"assets/products/cesta-rubi.webp":[648, 592],"assets/products/cheesecake-frutas-vermelhas-g/01.webp":[800, 1067],"assets/products/cheesecake-frutas-vermelhas-m/01.webp":[800, 1067],"assets/products/cheesecake-frutas-vermelhas-p/01.webp":[800, 1067],"assets/products/coffee-break-corporativo/01.webp":[675, 1200],"assets/products/coffee-break-corporativo/02.webp":[675, 1200],"assets/products/coffee-break-corporativo/03.webp":[675, 1200],"assets/products/coffee-break-corporativo/04.webp":[675, 1200],"assets/products/coffee-break-corporativo/05.webp":[675, 1200],"assets/products/combo-celebracao-bolo-pp-e-15-brigs/01.webp":[800, 1000],"assets/products/combo-cha-revelacao-bolo-mini-e-6-cupcakes/01.webp":[800, 1067],"assets/products/combo-encanto/01.webp":[675, 1200],"assets/products/combo-encanto.webp":[675, 1200],"assets/products/combo-prata/01.webp":[800, 1067],"assets/products/combo-prata.webp":[800, 1067],"assets/products/cone-trufado/01.webp":[800, 1067],"assets/products/cone-trufado/02.webp":[675, 1200],"assets/products/desenvolvemos-projetos-personalizados/01.webp":[675, 1200],"assets/products/eclair-experience/01.webp":[800, 1067],"assets/products/festinha-na-escola/01.webp":[675, 1200],"assets/products/festinha-na-escola/foto-mwl5b8ngh83e7.webp":[471, 471],"assets/products/grazing-para-presente/foto-mwdqp9kkabekl.webp":[933, 1400],"assets/products/grazing-para-presente/foto-mwdqp9u6irmcv.webp":[933, 1400],"assets/products/grazing-para-presente/foto-mwdqpa4kp142i.webp":[933, 1400],"assets/products/grazing-para-presente/foto-mwdqpaf1k3wgr.webp":[933, 1400],"assets/products/grazing-para-presente/foto-mwdqpata1islt.webp":[933, 1400],"assets/products/kit-5-biscoitos-personalizados/01.webp":[800, 1067],"assets/products/kit-5-biscoitos-personalizados/02.webp":[800, 1067],"assets/products/kit-5-biscoitos-personalizados/03.webp":[675, 1200],"assets/products/kit-5-biscoitos-personalizados/04.webp":[675, 1200],"assets/products/kit-5-biscoitos-personalizados/05.webp":[797, 793],"assets/products/kit-biscoito-aquarela-bob-goods/01.webp":[800, 1067],"assets/products/kit-biscoito-aquarela-bob-goods/02.webp":[467, 480],"assets/products/kit-festa-brownies-10-pessoas-bolo-p-e-12-brownies/01.webp":[800, 1067],"assets/products/kit-festa-pequeno-artista/01.webp":[726, 1200],"assets/products/kit-festa-pequeno-artista/02.webp":[675, 1200],"assets/products/kit-festa-pequeno-artista/03.webp":[800, 849],"assets/products/kit-festa-pequeno-artista/04.webp":[640, 853],"assets/products/lata-amanteigados-personalizados/01.webp":[800, 1067],"assets/products/lata-brownie-bites/01.webp":[800, 1067],"assets/products/lata-brownie-bites/02.webp":[540, 697],"assets/products/mini-alfajor-impresso-lembranca/01.webp":[675, 1200],"assets/products/mini-alfajor-personalizado-foto-tag/01.webp":[800, 860],"assets/products/mini-alfajor-personalizado-lembranca/01.webp":[800, 1067],"assets/products/mini-alfajor-personalizado-lembranca/02.webp":[800, 1067],"assets/products/mini-alfajor-personalizado-lembranca/03.webp":[675, 1200],"assets/products/mini-alfajor-personalizado-lembranca/04.webp":[675, 1200],"assets/products/mini-alfajor-personalizado-lembranca/05.webp":[800, 800],"assets/products/mini-alfajor-personalizado-tag/01.webp":[800, 1067],"assets/products/mini-alfajor-personalizado-tag/02.webp":[675, 1200],"assets/products/mini-amanteigado/foto-mwjfi2tuvqsli.webp":[933, 1400],"assets/products/mini-amanteigado/foto-mwjfoatat1yul.webp":[471, 471],"assets/products/mini-bolo-cha-revelacao/01.webp":[535, 539],"assets/products/mini-brownies-decorados/01.webp":[800, 1067],"assets/products/mini-brownies-decorados/02.webp":[800, 1067],"assets/products/mini-brownies-decorados/03.webp":[800, 1067],"assets/products/mini-brownies-decorados/04.webp":[675, 1200],"assets/products/mini-cupcake-caixa/01.webp":[675, 1200],"assets/products/novo-produto/foto-mwdpdkmpha5ku.webp":[1050, 1400],"assets/products/novo-produto/foto-mwdpdm4ce24e2.webp":[1050, 1400],"assets/products/novo-produto/foto-mwdqq91hjjb0s.webp":[1050, 1400],"assets/products/novo-produto/foto-mwdqrqlp2c0ha.webp":[1050, 1400],"assets/products/obrigadinho-biscoito-personalizado-mini/01.webp":[800, 1067],"assets/products/obrigadinho-biscoito-personalizado-mini/02.webp":[675, 1200],"assets/products/obrigadinho-biscoito-personalizado-mini/03.webp":[675, 1200],"assets/products/palha-italiana-pistache-e-limao/01.webp":[800, 1067],"assets/products/pao-de-mel-3d/01.webp":[800, 1067],"assets/products/pao-de-mel-3d/02.webp":[800, 1067],"assets/products/pao-de-mel-caixa-individual-com-laco-e-tag/01.webp":[800, 1067],"assets/products/pao-de-mel-caixa-individual-com-laco-e-tag/02.webp":[675, 1200],"assets/products/pao-de-mel-no-palito/01.webp":[675, 1200],"assets/products/petit-parmesan/01.webp":[800, 1200],"assets/products/petit-parmesan/02.webp":[500, 420],"assets/products/picoles-de-brownie/01.webp":[675, 1200],"assets/products/picoles-de-brownie/02.webp":[800, 800],"assets/products/picoles-de-brownie/03.webp":[524, 587],"assets/products/pirulito-biscoito/01.webp":[800, 1067],"assets/products/pirulito-biscoito/02.webp":[675, 1200],"assets/products/platter-amor-no-ar/01.webp":[640, 480],"assets/products/platter-amor-no-ar.webp":[640, 480],"assets/products/presente-4-alfajores/foto-mwdp2sqr0bm48.webp":[1050, 1400],"assets/products/presente-4-alfajores/foto-mwdp3lps8pozd.webp":[1050, 1400],"assets/products/tabua-signature/01.webp":[800, 533],"assets/products/tabua-signature.webp":[800, 533],"assets/products/torre-de-macarons/01.webp":[708, 890],"assets/products/um-carinho-de-bom-dia/01.webp":[800, 1067],"assets/products/um-carinho-de-bom-dia/02.webp":[800, 1067],"assets/products/um-carinho-de-bom-dia/03.webp":[612, 550],"assets/sobre/imprensa-empreendedores-df.webp":[800, 450],"assets/sobre/trabalho-mwjkskvfw2i8l.webp":[788, 1400],"assets/sobre/trabalho-mwjnom7d7w2qo.webp":[1050, 1400],"assets/sobre/trabalho-mwjojrhhv58dv.webp":[471, 471]};
  Jana.IMAGE_W900 = {"assets/carousel/banner-cel-mwl3087retvx3.webp":"assets/carousel/banner-cel-mwl3087retvx3-w900.webp","assets/carousel/banner-cel-mwl3l7ft6vdo0.webp":"assets/carousel/banner-cel-mwl3l7ft6vdo0-w900.webp","assets/carousel/banner-cel-mwl40304thj58.webp":"assets/carousel/banner-cel-mwl40304thj58-w900.webp","assets/carousel/banner-cel-mwl5qgwuewy8w.webp":"assets/carousel/banner-cel-mwl5qgwuewy8w-w900.webp","assets/carousel/banner-mwjltdguji9lj-cel-mwjly5836k9gc.webp":"assets/carousel/banner-mwjltdguji9lj-cel-mwjly5836k9gc-w900.webp","assets/carousel/banner-mwjltdguji9lj-pc-mwjm0m82q3own.webp":"assets/carousel/banner-mwjltdguji9lj-pc-mwjm0m82q3own-w900.webp","assets/carousel/banner-pc-mwjlsmyw3vncz.webp":"assets/carousel/banner-pc-mwjlsmyw3vncz-w900.webp","assets/carousel/banner-pc-mwl2vz8wv0u7m.webp":"assets/carousel/banner-pc-mwl2vz8wv0u7m-w900.webp","assets/carousel/banner-pc-mwl302avhw2x1.webp":"assets/carousel/banner-pc-mwl302avhw2x1-w900.webp","assets/carousel/banner-pc-mwl3hdkr4vxm1.webp":"assets/carousel/banner-pc-mwl3hdkr4vxm1-w900.webp","assets/carousel/banner-pc-mwl436kw08qvd.webp":"assets/carousel/banner-pc-mwl436kw08qvd-w900.webp","assets/carousel/banner-pc-mwl5h5tnt6zd6.webp":"assets/carousel/banner-pc-mwl5h5tnt6zd6-w900.webp"};
  Jana.imageIntrinsicSize = function imageIntrinsicSize(path, fallbackW, fallbackH) {
    const raw = String(path || "");
    const found = Jana.IMAGE_SIZES && Jana.IMAGE_SIZES[raw];
    if (found && found[0] && found[1]) {
      return { width: found[0], height: found[1] };
    }
    return { width: fallbackW || 1600, height: fallbackH || 900 };
  };
  Jana.wideImageCompanion = function wideImageCompanion(path) {
    const raw = String(path || "");
    if (!raw) return "";
    if (Jana.IMAGE_W900 && Jana.IMAGE_W900[raw]) return Jana.IMAGE_W900[raw];
    return "";
  };
  /* IMAGE_SIZES_END */

  Jana.productBannerHtml = function productBannerHtml(data, options) {
    const opt = options || {};
    if (!data || !data.image) {
      return "";
    }
    const eager = !!opt.eager;
    const toUrl = opt.assetUrl || Jana.assetUrl;
    const fotoId = opt.filterId || Jana.fotoFilterId((data.id || "produto") + (opt.preview ? "-prev" : ""));
    const decorated = Jana.decorateBannerFoto(
      '<img src="' +
        Jana.escapeHtml(toUrl(data.image)) +
        '" alt="' +
        Jana.escapeHtml(data.alt || data.title || "") +
        '" width="' +
        Jana.imageIntrinsicSize(data.image, 900, 900).width +
        '" height="' +
        Jana.imageIntrinsicSize(data.image, 900, 900).height +
        '"' +
        (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
        (opt.editor ? " data-ed-foto" : "") +
        ' decoding="async">',
      data.foto,
      fotoId
    );
    const img = decorated.html;
    const desc = data.description
      ? '<p class="hero__produto-desc">' + Jana.escapeHtml(data.description) + "</p>"
      : "";
    const fotoAjustada = Jana.fotoIsDefault ? !Jana.fotoIsDefault(data.foto) : false;
    const frameAttrs = opt.editor
      ? ' data-ed-foto-frame="produto" tabindex="0" role="group" aria-label="Enquadramento da foto do produto"'
      : "";
    const inner =
      (opt.skipSvg ? "" : decorated.svg) +
      '<div class="hero__produto">' +
      '<div class="hero__produto-inner">' +
      '<div class="hero__produto-foto' +
      (fotoAjustada ? ' hero__produto-foto--ajustada' : '') +
      '"' +
      frameAttrs +
      ">" +
      img +
      "</div>" +
      '<div class="hero__produto-copy">' +
      '<p class="hero__produto-nome">' +
      Jana.escapeHtml(data.title || "") +
      "</p>" +
      desc +
      '<p class="hero__produto-preco">' +
      Jana.escapeHtml(data.priceLabel || "") +
      "</p>" +
      '<span class="btn btn--solid btn--acquire" aria-hidden="true">Comprar</span>' +
      "</div></div></div>";
    if (opt.preview) {
      return inner;
    }
    if (data.href) {
      return (
        '<a class="hero__slide hero__slide--produto" href="' +
        Jana.escapeHtml(data.href) +
        '"' +
        (data.external ? ' target="_blank" rel="noopener noreferrer"' : "") +
        ">" +
        inner +
        "</a>"
      );
    }
    return '<article class="hero__slide hero__slide--produto">' + inner + "</article>";
  };

  Jana.imageBannerHtml = function imageBannerHtml(slide, options) {
    const opt = options || {};
    const item = slide || {};
    if (!item.image) return "";
    const eager = !!opt.eager;
    const toUrl = opt.assetUrl || Jana.assetUrl;
    const fotoId = Jana.fotoFilterId(opt.filterId || item.id || "imagem");
    const size = Jana.imageIntrinsicSize(item.image, 1600, 900);
    const desktopWide = item.imageW900 || Jana.wideImageCompanion(item.image);
    let srcsetAttr = "";
    if (desktopWide) {
      srcsetAttr =
        ' srcset="' +
        Jana.escapeHtml(toUrl(desktopWide)) +
        ' 900w, ' +
        Jana.escapeHtml(toUrl(item.image)) +
        " " +
        size.width +
        'w" sizes="100vw"';
    }
    const decorated = Jana.decorateBannerFoto(
      '<img src="' +
        Jana.escapeHtml(toUrl(item.image)) +
        '" alt="' +
        Jana.escapeHtml(item.title || "") +
        '" width="' +
        size.width +
        '" height="' +
        size.height +
        '"' +
        srcsetAttr +
        (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
        (opt.editor ? " data-ed-foto" : "") +
        ' decoding="async">',
      item.foto,
      fotoId
    );
    let img = decorated.html;
    const mobilePath = item.imageMobile || "";
    const mobileSrc = mobilePath ? toUrl(mobilePath) : "";
    const mobileWide = mobilePath ? (item.imageMobileW900 || Jana.wideImageCompanion(mobilePath)) : "";
    if (mobileSrc && !opt.forceImage) {
      const mobileSrcset = mobileWide
        ? Jana.escapeHtml(toUrl(mobileWide)) + " 900w, " + Jana.escapeHtml(mobileSrc) + " 1200w"
        : Jana.escapeHtml(mobileSrc);
      img =
        '<picture><source media="(max-width: 719px)" srcset="' +
        mobileSrcset +
        '" sizes="100vw">' +
        img +
        "</picture>";
    } else if (desktopWide && !opt.forceImage) {
      img =
        '<picture><source media="(max-width: 719px)" srcset="' +
        Jana.escapeHtml(toUrl(desktopWide)) +
        '">' +
        img +
        "</picture>";
    }
    const inner = decorated.svg + img;
    if (opt.preview) return inner;
    const href = item.href != null && item.href !== ""
      ? item.href
      : item.productSlug
        ? Jana.productUrl(item.productSlug)
        : "";
    if (href) {
      return (
        '<a class="hero__slide" href="' +
        Jana.escapeHtml(href) +
        '"' +
        (item.external ? ' target="_blank" rel="noopener noreferrer"' : "") +
        ">" +
        inner +
        "</a>"
      );
    }
    return '<article class="hero__slide">' + inner + "</article>";
  };

  /* Link de um banner do carrossel. linkTipo: produto | categoria | url | nenhum.
     Banners antigos (sem linkTipo) abrem o produto de productSlug, como antes. */
  Jana.slideLink = function slideLink(slide, product) {
    const item = slide || {};
    const tipo = item.linkTipo || (item.productSlug ? "produto" : "nenhum");
    if (tipo === "produto") {
      const slug = (product && product.slug) || item.productSlug || "";
      return slug ? { href: Jana.productUrl(slug), external: false } : { href: "", external: false };
    }
    if (tipo === "categoria" && item.linkCategory) {
      return { href: Jana.areaUrl(item.linkCategory), external: false };
    }
    if (tipo === "url") {
      const url = String(item.url || "").trim();
      if (/^https:\/\//i.test(url)) {
        let external = true;
        try {
          const host = new URL(url).hostname.replace(/^www\./, "");
          external = host !== "janaabreuconfeitaria.com.br";
        } catch (err) {
          external = true;
        }
        return { href: url, external: external };
      }
      if (/^\/?[a-z0-9][a-z0-9\/?=&#._%-]*$/i.test(url)) {
        return { href: Jana.assetUrl(url.replace(/^\//, "")), external: false };
      }
    }
    return { href: "", external: false };
  };

  /* Tamanho real [largura, altura] de uma imagem de banner: o gravado no banner (imageSize)
     ou o da tabela IMAGE_SIZES. null quando não se sabe (o site mede ao carregar). */
  Jana.bannerImageSize = function bannerImageSize(path, stored) {
    if (Array.isArray(stored) && stored.length === 2) {
      const w = Number(stored[0]);
      const h = Number(stored[1]);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [Math.round(w), Math.round(h)];
    }
    const found = Jana.IMAGE_SIZES && Jana.IMAGE_SIZES[String(path || "")];
    if (found && found[0] > 0 && found[1] > 0) return [found[0], found[1]];
    return null;
  };

  /* Proporção do carrossel de banners: a mais comum entre as imagens (tolerância de 1,5%).
     sizes: lista de [w, h] ou null. Devolve [w, h] ou null. */
  Jana.BANNER_RATIO_TOLERANCE = 0.015;
  Jana.bannerFrameSize = function bannerFrameSize(sizes) {
    const groups = [];
    (sizes || []).forEach(function add(size) {
      if (!size || !(size[0] > 0) || !(size[1] > 0)) return;
      const r = size[0] / size[1];
      const g = groups.find(function near(x) {
        return Math.abs(x.r / r - 1) <= Jana.BANNER_RATIO_TOLERANCE;
      });
      if (g) g.n += 1;
      else groups.push({ r: r, n: 1, size: size });
    });
    if (!groups.length) return null;
    let best = groups[0];
    groups.forEach(function pick(g) {
      if (g.n > best.n) best = g;
    });
    return best.size;
  };

  Jana.bannerFitsFrame = function bannerFitsFrame(size, frame) {
    if (!size || !frame) return true;
    return Math.abs(size[0] / size[1] / (frame[0] / frame[1]) - 1) <= Jana.BANNER_RATIO_TOLERANCE;
  };

  /* Banners de uma página: "home" (padrão) ou o id de uma área. */
  Jana.pageCarouselSlides = function pageCarouselSlides(carousel, products, pagina) {
    const target = pagina || "home";
    return (carousel || [])
      .filter(function keepSlide(slide) {
        if (!slide || (slide.pagina || "home") !== target) {
          return false;
        }
        if (Jana.isProductBanner(slide)) {
          return Jana.productBannerAvailable(Jana.productBySlug(products, slide.productSlug));
        }
        return !!slide.image;
      })
      .slice()
      .sort(function byOrder(a, b) {
        return (a.order || 0) - (b.order || 0);
      })
      .map(function toSlide(slide) {
        if (Jana.isProductBanner(slide)) {
          return Jana.resolveProductBanner(slide, Jana.productBySlug(products, slide.productSlug));
        }
        const product = Jana.productBySlug(products, slide.productSlug);
        const tipo = slide.linkTipo || (slide.productSlug ? "produto" : "nenhum");
        const link = Jana.slideLink(slide, product);
        return {
          id: slide.id || "",
          image: slide.image,
          imageMobile: slide.imageMobile || "",
          productSlug: tipo === "produto" ? (product && product.slug) || slide.productSlug || "" : "",
          href: link.href,
          external: link.external,
          title: (tipo === "produto" && !slide.linkTipo && product && product.name) || slide.title || (product && product.name) || "",
          banner: slide.formato === "banner",
          imageSize: Jana.bannerImageSize(slide.image, slide.imageSize),
          imageMobileSize: slide.imageMobile ? Jana.bannerImageSize(slide.imageMobile, slide.imageMobileSize) : null,
          matched: !!product,
          foto: Jana.fotoForSave ? Jana.fotoForSave(slide.foto) : null,
        };
      });
  };

  Jana.homeCarouselSlides = function homeCarouselSlides(carousel, products) {
    return Jana.pageCarouselSlides(carousel, products, "home");
  };


  Jana.productAceitaImagem = function productAceitaImagem(product) {
    return !!(product && product.aceitaImagemPersonalizacao === true);
  };

  Jana.MIN_QTY_LIMIT = 1000;

  Jana.productMinQty = function productMinQty(product) {
    const n = product && product.minQty;
    if (typeof n !== "number" || !Number.isFinite(n)) {
      return 1;
    }
    const qty = Math.floor(n);
    if (qty !== n || qty < 2 || qty > Jana.MIN_QTY_LIMIT) {
      return 1;
    }
    return qty;
  };

  Jana.productHasMinQty = function productHasMinQty(product) {
    return Jana.productMinQty(product) >= 2;
  };

  Jana.personalizacaoWhatsAppLinha = function personalizacaoWhatsAppLinha(info) {
    const data = info || {};
    if (data.enviadas > 0) {
      return "Este pedido inclui imagem anexada para personalização.";
    }
    if (data.pendentes > 0) {
      return "Vou enviar a imagem da personalização nesta conversa.";
    }
    return "";
  };

  function loadImageForCompress(file) {
    return new Promise(function load(resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function onLoad() {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function onError() {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível ler a imagem."));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function toBlob(resolve, reject) {
      if (!canvas.toBlob) {
        reject(new Error("Este navegador não consegue compactar a imagem."));
        return;
      }
      canvas.toBlob(function done(blob) {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível compactar a imagem."));
      }, type, quality);
    });
  }

  /* Reduz a imagem no navegador: lado longo ~2000 px, alvo de até ~1 MB. Aceita JPG e PNG. */
  Jana.compressPersonalizationImage = function compressPersonalizationImage(file, options) {
    const opt = options || {};
    const maxSide = opt.maxSide || 2000;
    const maxBytes = opt.maxBytes || 1000000;
    const name = String((file && file.name) || "personalizacao");
    const type = String((file && file.type) || "").toLowerCase();
    const isPng = type === "image/png" || /\.png$/i.test(name);
    const isJpg = type === "image/jpeg" || type === "image/jpg" || /\.jpe?g$/i.test(name);
    if (!isPng && !isJpg) {
      return Promise.reject(new Error("Envie uma imagem JPG ou PNG."));
    }
    if (file && file.size > 25 * 1024 * 1024) {
      return Promise.reject(new Error("Essa imagem é grande demais. Escolha outra, por favor."));
    }
    return loadImageForCompress(file).then(function resize(img) {
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) return Promise.reject(new Error("Não foi possível ler a imagem."));
      let w = w0;
      let h = h0;
      const long = Math.max(w, h);
      if (long > maxSide) {
        const scale = maxSide / long;
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: isPng });
      if (!ctx) return Promise.reject(new Error("Não foi possível compactar a imagem."));
      if (!isPng) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      function asJpeg(quality, ww, hh) {
        if (ww !== canvas.width || hh !== canvas.height) {
          canvas.width = ww;
          canvas.height = hh;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, ww, hh);
          ctx.drawImage(img, 0, 0, ww, hh);
        }
        return canvasToBlob(canvas, "image/jpeg", quality);
      }
      const tryPng = isPng
        ? canvasToBlob(canvas, "image/png").then(function maybePng(blob) {
            if (blob.size <= maxBytes) {
              return { blob: blob, mime: "image/png", name: name.replace(/\.[^.]+$/, "") + ".png", width: w, height: h };
            }
            return null;
          })
        : Promise.resolve(null);
      return tryPng.then(function next(png) {
        if (png) return png;
        let quality = 0.86;
        let ww = w;
        let hh = h;
        function shrink(blob) {
          if (blob.size <= maxBytes) {
            return { blob: blob, mime: "image/jpeg", name: name.replace(/\.[^.]+$/, "") + ".jpg", width: ww, height: hh };
          }
          if (quality > 0.6) {
            quality = Math.max(0.6, quality - 0.12);
            return asJpeg(quality, ww, hh).then(shrink);
          }
          if (Math.max(ww, hh) > 1200) {
            const scale = 1200 / Math.max(ww, hh);
            ww = Math.max(1, Math.round(ww * scale));
            hh = Math.max(1, Math.round(hh * scale));
            quality = 0.8;
            return asJpeg(quality, ww, hh).then(shrink);
          }
          return Promise.reject(new Error("Não deu para reduzir a imagem a 1 MB. Tente outra foto, por favor."));
        }
        return asJpeg(quality, ww, hh).then(shrink);
      });
    });
  };


  Jana.FOTO_CAMPOS = {
    x: { min: 0, max: 100, def: 50, step: 0.1 },
    y: { min: 0, max: 100, def: 50, step: 0.1 },
    zoom: { min: 1, max: 4, def: 1, step: 0.05 },
    brilho: { min: 0.25, max: 2, def: 1, step: 0.01 },
    contraste: { min: 0.25, max: 2, def: 1, step: 0.01 },
    saturacao: { min: 0, max: 2, def: 1, step: 0.01 },
    vibrancia: { min: 0, max: 2, def: 1, step: 0.01 },
    gamma: { min: 0.3, max: 2.5, def: 1, step: 0.01 },
  };

  Jana.fotoDefaults = function fotoDefaults() {
    const out = {};
    Object.keys(Jana.FOTO_CAMPOS).forEach(function each(k) {
      out[k] = Jana.FOTO_CAMPOS[k].def;
    });
    return out;
  };

  Jana.clampFotoValue = function clampFotoValue(key, value) {
    const spec = Jana.FOTO_CAMPOS[key];
    if (!spec) return null;
    const n = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(n)) return spec.def;
    const clamped = Math.min(spec.max, Math.max(spec.min, n));
    const dec = spec.step < 0.1 ? 2 : 1;
    return Number((Math.round(clamped / spec.step) * spec.step).toFixed(dec));
  };

  Jana.normalizeFoto = function normalizeFoto(foto) {
    const out = Jana.fotoDefaults();
    if (!foto || typeof foto !== "object") return out;
    Object.keys(Jana.FOTO_CAMPOS).forEach(function each(k) {
      if (Object.prototype.hasOwnProperty.call(foto, k) && foto[k] != null && foto[k] !== "") {
        out[k] = Jana.clampFotoValue(k, foto[k]);
      }
    });
    return out;
  };

  Jana.fotoIsDefault = function fotoIsDefault(foto) {
    if (!foto || typeof foto !== "object") return true;
    const n = Jana.normalizeFoto(foto);
    const d = Jana.fotoDefaults();
    return Object.keys(d).every(function eq(k) {
      return Math.abs(n[k] - d[k]) < 0.0005;
    });
  };

  Jana.fotoForSave = function fotoForSave(foto) {
    const n = Jana.normalizeFoto(foto);
    const d = Jana.fotoDefaults();
    const out = {};
    Object.keys(d).forEach(function keep(k) {
      if (Math.abs(n[k] - d[k]) >= 0.0005) out[k] = n[k];
    });
    return Object.keys(out).length ? out : null;
  };

  Jana.fotoFilterId = function fotoFilterId(raw) {
    const id = String(raw || "banner").replace(/[^A-Za-z0-9_-]/g, "");
    return "jana-foto-" + (id || "banner");
  };

  Jana.fotoNeedsSvgFilter = function fotoNeedsSvgFilter(foto) {
    const f = Jana.normalizeFoto(foto);
    return Math.abs(f.gamma - 1) >= 0.0005 || Math.abs(f.vibrancia - 1) >= 0.0005;
  };

  Jana.fotoSvgFilterSupported = function fotoSvgFilterSupported() {
    if (Jana._fotoSvgOk != null) return Jana._fotoSvgOk;
    if (typeof document === "undefined") {
      Jana._fotoSvgOk = true;
      return true;
    }
    try {
      const el = document.createElement("div");
      el.style.filter = "url(#jana-foto-support)";
      Jana._fotoSvgOk = /url\(/i.test(el.style.filter || "");
    } catch (err) {
      Jana._fotoSvgOk = false;
    }
    return Jana._fotoSvgOk;
  };

  Jana.fotoFilterUrl = function fotoFilterUrl(id) {
    if (typeof location !== "undefined" && location.href) {
      return 'url("' + String(location.href).split("#")[0].replace(/"/g, "") + "#" + id + '")';
    }
    return "url(#" + id + ")";
  };

  Jana.fotoCssFilter = function fotoCssFilter(foto, id) {
    const f = Jana.normalizeFoto(foto);
    const parts = [];
    if (Math.abs(f.brilho - 1) >= 0.0005) parts.push("brightness(" + f.brilho + ")");
    if (Math.abs(f.contraste - 1) >= 0.0005) parts.push("contrast(" + f.contraste + ")");
    if (Math.abs(f.saturacao - 1) >= 0.0005) parts.push("saturate(" + f.saturacao + ")");
    if (id && Jana.fotoNeedsSvgFilter(f) && Jana.fotoSvgFilterSupported()) {
      parts.push(Jana.fotoFilterUrl(id));
    }
    return parts.length ? parts.join(" ") : "none";
  };

  Jana.fotoSvgInner = function fotoSvgInner(id, foto) {
    const f = Jana.normalizeFoto(foto);
    if (!Jana.fotoNeedsSvgFilter(f)) return "";
    const g = f.gamma;
    const v = f.vibrancia;
    let body =
      '<feComponentTransfer in="SourceGraphic" result="afterGamma">' +
      '<feFuncR type="gamma" amplitude="1" exponent="' + g + '" offset="0"/>' +
      '<feFuncG type="gamma" amplitude="1" exponent="' + g + '" offset="0"/>' +
      '<feFuncB type="gamma" amplitude="1" exponent="' + g + '" offset="0"/>' +
      "</feComponentTransfer>";
    if (Math.abs(v - 1) >= 0.0005) {
      body +=
        '<feColorMatrix in="afterGamma" type="saturate" values="' + v + '" result="boosted"/>' +
        '<feColorMatrix in="afterGamma" type="saturate" values="0" result="gray"/>' +
        '<feComposite in="afterGamma" in2="gray" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0" result="chroma"/>' +
        '<feColorMatrix in="chroma" type="luminanceToAlpha" result="satA"/>' +
        '<feComponentTransfer in="satA" result="lowSat"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>' +
        '<feComposite in="boosted" in2="lowSat" operator="in" result="boostedMasked"/>' +
        '<feComposite in="boostedMasked" in2="afterGamma" operator="over"/>';
    }
    return (
      '<filter id="' +
      id +
      '" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">' +
      body +
      "</filter>"
    );
  };

  Jana.fotoSvgMarkup = function fotoSvgMarkup(id, foto) {
    const inner = Jana.fotoSvgInner(id, foto);
    if (!inner) return "";
    return (
      '<svg class="hero__foto-svg" width="0" height="0" aria-hidden="true" focusable="false">' +
      inner +
      "</svg>"
    );
  };

  Jana.fotoImgStyle = function fotoImgStyle(foto, id) {
    const f = Jana.normalizeFoto(foto);
    if (Jana.fotoIsDefault(f)) return "";
    return (
      "--foto-x:" +
      f.x +
      "%;--foto-y:" +
      f.y +
      "%;--foto-zoom:" +
      f.zoom +
      ";filter:" +
      Jana.fotoCssFilter(f, id)
    );
  };

  Jana.applyFotoStyle = function applyFotoStyle(el, foto, id) {
    if (!el) return;
    const f = Jana.normalizeFoto(foto);
    const def = Jana.fotoIsDefault(f);
    el.classList.toggle("hero__foto--ajustada", !def);
    if (def) {
      el.style.removeProperty("--foto-x");
      el.style.removeProperty("--foto-y");
      el.style.removeProperty("--foto-zoom");
      el.style.removeProperty("filter");
      el.removeAttribute("style");
      return;
    }
    el.style.setProperty("--foto-x", f.x + "%");
    el.style.setProperty("--foto-y", f.y + "%");
    el.style.setProperty("--foto-zoom", String(f.zoom));
    el.style.filter = Jana.fotoCssFilter(f, id);
  };

  /* Converte um arrasto em pixels para x/y (0–100), sem deixar área vazia (zoom mínimo 1). */
  Jana.fotoPanFromDrag = function fotoPanFromDrag(foto, dx, dy, frameW, frameH, natW, natH) {
    const f = Jana.normalizeFoto(foto);
    const W = Number(frameW) || 0;
    const H = Number(frameH) || 0;
    if (W <= 0 || H <= 0) return f;
    const iw = Number(natW) > 0 ? Number(natW) : W;
    const ih = Number(natH) > 0 ? Number(natH) : H;
    const z = f.zoom;
    const cover = Math.max(W / iw, H / ih);
    const dispW = iw * cover * z;
    const dispH = ih * cover * z;
    const extraW = Math.max(0, dispW - W);
    const extraH = Math.max(0, dispH - H);
    const next = Object.assign({}, f);
    if (extraW > 0.5) next.x = Jana.clampFotoValue("x", f.x - (dx / extraW) * 100);
    if (extraH > 0.5) next.y = Jana.clampFotoValue("y", f.y - (dy / extraH) * 100);
    return next;
  };

  Jana.coverCropRect = function coverCropRect(w0, h0, ratioW, ratioH) {
    const width = Number(w0) || 0;
    const height = Number(h0) || 0;
    const rw = Number(ratioW) || 1;
    const rh = Number(ratioH) || 1;
    if (width < 1 || height < 1 || rw <= 0 || rh <= 0) {
      return { sx: 0, sy: 0, sw: Math.max(1, width), sh: Math.max(1, height) };
    }
    const target = rw / rh;
    const current = width / height;
    if (current > target) {
      const sw = Math.max(1, Math.round(height * target));
      return { sx: Math.round((width - sw) / 2), sy: 0, sw: sw, sh: height };
    }
    const sh = Math.max(1, Math.round(width / target));
    return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh: sh };
  };

  /* Recorte visível (object-fit: cover + object-position + zoom) na proporção pedida. */
  Jana.fotoCropRect = function fotoCropRect(iw, ih, ratioW, ratioH, foto) {
    const f = Jana.normalizeFoto(foto);
    const width = Number(iw) || 0;
    const height = Number(ih) || 0;
    const base = Jana.coverCropRect(width, height, ratioW, ratioH);
    const z = Math.max(1, Number(f.zoom) || 1);
    const sw = Math.max(1, base.sw / z);
    const sh = Math.max(1, base.sh / z);
    const maxX = Math.max(0, width - sw);
    const maxY = Math.max(0, height - sh);
    const sx = Math.min(maxX, Math.max(0, maxX * (f.x / 100)));
    const sy = Math.min(maxY, Math.max(0, maxY * (f.y / 100)));
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  };

  Jana.footerMap = function footerMap(site) {
    const data = site || {};
    const address = String(data.footerAddress || "").trim();
    const query =
      String(data.footerMapQuery || "").trim() ||
      [data.brandName, address].filter(Boolean).join(" ").trim();
    if (!address) {
      return { visible: false, address: "", query: "", link: "", embed: "" };
    }
    return {
      visible: true,
      address: address,
      query: query,
      link: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query),
      embed: "https://maps.google.com/maps?q=" + encodeURIComponent(query) + "&output=embed",
    };
  };

  Jana.decorateBannerFoto = function decorateBannerFoto(imgHtml, foto, id) {

    const f = Jana.normalizeFoto(foto);
    if (Jana.fotoIsDefault(f)) return { html: imgHtml, svg: "" };
    const style = Jana.fotoImgStyle(f, id);
    let html = imgHtml;
    if (/\sclass="/.test(html)) html = html.replace(/\sclass="/, ' class="hero__foto--ajustada ');
    else html = html.replace(/<img\s/, '<img class="hero__foto--ajustada" ');
    if (/\sstyle="/.test(html)) html = html.replace(/\sstyle="/, ' style="' + style + ";");
    else html = html.replace(/<img\s/, '<img style="' + style + '" ');
    return { html: html, svg: Jana.fotoSvgMarkup(id, f) };
  };

  global.Jana = Jana;
})(typeof window !== "undefined" ? window : globalThis);
