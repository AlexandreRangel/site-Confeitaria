(function createUtils(global) {
  const Jana = global.Jana || {};

  Jana.formatBRL = function formatBRL(value) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
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

  Jana.productJsonLd = function productJsonLd(product, brandName) {
    if (!product) {
      return null;
    }
    const brand = brandName || "Jana Abreu Confeitaria";
    const slug = String(product.slug || "");
    const url = slug ? Jana.publicUrl("produto/?slug=" + encodeURIComponent(slug)) : Jana.publicUrl("produto/");
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

  /* Pastas e rotas que uma categoria nova não pode usar como endereço. */
  Jana.RESERVED_AREA_SLUGS = [
    "painel", "produto", "produtos", "encomendas", "pagamento", "sobre-nos", "sobre",
    "assets", "css", "js", "data", "tests", "test", "central", "docs", "screenshots",
    "scripts", "area", "areas", "catalogo", "index", "404", "admin", "login", "api",
    "corporativo", "personalizado-para-empresas", "cestas-presentes", "combos-festa",
    "doces-festa", "festa-personalizada", "sobremesas", "favicon", "robots", "sitemap",
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
        '" width="900" height="900"' +
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
    const decorated = Jana.decorateBannerFoto(
      '<img src="' +
        Jana.escapeHtml(toUrl(item.image)) +
        '" alt="' +
        Jana.escapeHtml(item.title || "") +
        '" width="1600" height="900"' +
        (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
        (opt.editor ? " data-ed-foto" : "") +
        ' decoding="async">',
      item.foto,
      fotoId
    );
    let img = decorated.html;
    const mobileSrc = item.imageMobile ? toUrl(item.imageMobile) : "";
    if (mobileSrc && !opt.forceImage) {
      img =
        '<picture><source media="(max-width: 719px)" srcset="' +
        Jana.escapeHtml(mobileSrc) +
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
})(window);
