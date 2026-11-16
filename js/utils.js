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


  Jana.productsForArea = function productsForArea(products, area) {
    const ids = (area && area.sourceCategoryIds) || [];
    return (products || []).filter(function inArea(product) {
      if (product.active === false) {
        return false;
      }
      const cats = Jana.productCategoryIds(product);
      return cats.some(function hasId(id) {
        return ids.indexOf(id) !== -1;
      });
    });
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
    };
  };

  Jana.productBannerHtml = function productBannerHtml(data, options) {
    const opt = options || {};
    if (!data || !data.image) {
      return "";
    }
    const eager = !!opt.eager;
    const toUrl = opt.assetUrl || Jana.assetUrl;
    const img =
      '<img src="' +
      Jana.escapeHtml(toUrl(data.image)) +
      '" alt="' +
      Jana.escapeHtml(data.alt || data.title || "") +
      '" width="900" height="900"' +
      (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
      ' decoding="async">';
    const desc = data.description
      ? '<p class="hero__produto-desc">' + Jana.escapeHtml(data.description) + "</p>"
      : "";
    const inner =
      '<div class="hero__produto">' +
      '<div class="hero__produto-inner">' +
      '<div class="hero__produto-foto">' +
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
          image: slide.image,
          imageMobile: slide.imageMobile || "",
          productSlug: tipo === "produto" ? (product && product.slug) || slide.productSlug || "" : "",
          href: link.href,
          external: link.external,
          title: (tipo === "produto" && !slide.linkTipo && product && product.name) || slide.title || (product && product.name) || "",
          banner: slide.formato === "banner",
          matched: !!product,
        };
      });
  };

  Jana.homeCarouselSlides = function homeCarouselSlides(carousel, products) {
    return Jana.pageCarouselSlides(carousel, products, "home");
  };


  Jana.productAceitaImagem = function productAceitaImagem(product) {
    return !!(product && product.aceitaImagemPersonalizacao === true);
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

  global.Jana = Jana;
})(window);
