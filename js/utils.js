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

  Jana.assetRoot = function assetRoot() {
    const raw = document.body.getAttribute("data-root");
    if (raw === null || raw === "") {
      return document.body.getAttribute("data-page") === "category" ? "../" : "";
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

  Jana.categoryUrl = function categoryUrl(slug) {
    return Jana.assetUrl(String(slug || "") + "/");
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

  global.Jana = Jana;
})(window);
