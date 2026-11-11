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
      .filter(function hasImage(slide) {
        return slide && slide.image && (slide.pagina || "home") === target;
      })
      .slice()
      .sort(function byOrder(a, b) {
        return (a.order || 0) - (b.order || 0);
      })
      .map(function toSlide(slide) {
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

  global.Jana = Jana;
})(window);
