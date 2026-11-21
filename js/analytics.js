(function createAnalytics(global) {
  const Jana = global.Jana || (global.Jana = {});
  const PURCHASE_KEY = "jana-abreu-gtm-purchase-";
  let viewedSlug = "";

  function dataLayer() {
    const w = global;
    if (!w.dataLayer || !Array.isArray(w.dataLayer)) {
      w.dataLayer = [];
    }
    return w.dataLayer;
  }

  function push(payload) {
    try {
      dataLayer().push(payload);
    } catch (err) {
      /* GTM bloqueado ou dataLayer indisponível não pode quebrar o site */
    }
  }

  function primaryCategory(product) {
    if (!product) {
      return "";
    }
    if (product.category) {
      return String(product.category);
    }
    if (product.item_category) {
      return String(product.item_category);
    }
    const ids =
      product.categoryIds && product.categoryIds.length
        ? product.categoryIds
        : product.categoryId
          ? [product.categoryId]
          : [];
    return ids[0] ? String(ids[0]) : "";
  }

  function itemFrom(source, quantity) {
    const product = source || {};
    const qty = quantity != null ? Number(quantity) : Number(product.quantity || 1);
    const price = Number(product.price || product.preco || 0);
    const item = {
      item_id: String(product.slug || product.id || ""),
      item_name: String(product.name || product.nome || ""),
      item_category: primaryCategory(product),
      price: Number.isFinite(price) ? price : 0,
    };
    if (quantity != null || product.quantity != null) {
      item.quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
    }
    return item;
  }

  function pushEcommerce(event, ecommerce) {
    push({ ecommerce: null });
    push({
      event: event,
      ecommerce: ecommerce,
    });
  }

  function alreadyPurchased(id) {
    try {
      return global.sessionStorage && global.sessionStorage.getItem(PURCHASE_KEY + id) === "1";
    } catch (err) {
      return false;
    }
  }

  function markPurchased(id) {
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(PURCHASE_KEY + id, "1");
      }
    } catch (err) {
      /* ignore */
    }
  }

  function isWhatsAppHref(href) {
    return /wa\.me|api\.whatsapp\.com/i.test(String(href || ""));
  }

  function onDocumentClick(event) {
    const target = event && event.target;
    if (!target || !target.closest) {
      return;
    }
    const link = target.closest("a[href]");
    if (!link) {
      return;
    }
    const href = String(link.href || link.getAttribute("href") || "");
    if (!isWhatsAppHref(href)) {
      return;
    }
    push({
      event: "whatsapp_click",
      click_location: (global.location && global.location.pathname) || "",
      link_url: href,
    });
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener("click", onDocumentClick, true);
  }

  Jana.Analytics = {
    itemFrom: itemFrom,
    primaryCategory: primaryCategory,
    viewItem: function viewItem(product) {
      if (!product) {
        return;
      }
      const slug = String(product.slug || product.id || "");
      if (slug && slug === viewedSlug) {
        return;
      }
      viewedSlug = slug;
      const item = itemFrom(product);
      pushEcommerce("view_item", {
        currency: "BRL",
        value: Number(product.price || product.preco || 0),
        items: [item],
      });
    },
    addToCart: function addToCart(product, quantity) {
      if (!product) {
        return;
      }
      const qty = Number(quantity);
      const count = Number.isFinite(qty) && qty > 0 ? qty : 1;
      const item = itemFrom(product, count);
      const price = Number(item.price || 0);
      pushEcommerce("add_to_cart", {
        currency: "BRL",
        value: price * count,
        items: [item],
      });
    },
    beginCheckout: function beginCheckout(total, items) {
      pushEcommerce("begin_checkout", {
        currency: "BRL",
        value: Number(total || 0),
        items: items || [],
      });
    },
    formEncomenda: function formEncomenda(total) {
      push({
        event: "form_encomenda",
        lead_source: "formulario_encomenda",
        currency: "BRL",
        value: Number(total || 0),
      });
    },
    purchase: function purchase(transactionId, total, items) {
      const id = String(transactionId || "");
      if (!id || alreadyPurchased(id)) {
        return;
      }
      markPurchased(id);
      pushEcommerce("purchase", {
        transaction_id: id,
        currency: "BRL",
        value: Number(total || 0),
        payment_type: "pix",
        items: items || [],
      });
    },
  };
})(window);
