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
      return page === "category" || page === "area" || page === "product" || page === "about" ? "../" : "";
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

  Jana.visibleAreas = function visibleAreas(areas, site) {
    return (areas || [])
      .filter(function keepArea(area) {
        if (!area || area.enabled === false) {
          return false;
        }
        if (Jana.isNatalArea(area)) {
          return Jana.isNatalEnabled(site);
        }
        return true;
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

  Jana.homeCarouselSlides = function homeCarouselSlides(carousel, products) {
    return (carousel || [])
      .filter(function hasImage(slide) {
        return slide && slide.image;
      })
      .map(function toSlide(slide) {
        const product = Jana.productBySlug(products, slide.productSlug);
        return {
          image: slide.image,
          productSlug: (product && product.slug) || slide.productSlug || "",
          title: (product && product.name) || slide.title || "",
          matched: !!product,
        };
      });
  };

  global.Jana = Jana;
})(window);
