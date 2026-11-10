(function createPagamento(global) {
  const Jana = global.Jana || {};
  const PENDING_KEY = "jana-abreu-pending-pay-v1";
  const LINKS_URL = "https://api.checkout.infinitepay.io/links";
  const CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";
  const REDIRECT_URL = "https://alexandrerangel.github.io/site-Confeitaria/pagamento/";

  Jana.INFINITEPAY_LINKS_URL = LINKS_URL;
  Jana.INFINITEPAY_CHECK_URL = CHECK_URL;
  Jana.INFINITEPAY_REDIRECT_URL = REDIRECT_URL;
  Jana.PAID_DISCLAIMER =
    "Após o pagamento, seu pedido é enviado para nós pelo WhatsApp. Caso a data esteja indisponível, entramos em contato.";

  Jana.infinitePayHandle = function infinitePayHandle(config) {
    const inf = config && config.infinitepay ? config.infinitepay : config || {};
    return String(inf.handle || "")
      .replace(/\$/g, "")
      .trim();
  };

  Jana.infinitePayConfig = function infinitePayConfig(config) {
    const inf = (config && config.infinitepay) || {};
    return {
      enabled: inf.enabled === true,
      handle: Jana.infinitePayHandle(config),
    };
  };

  Jana.infinitePayIsReady = function infinitePayIsReady(config) {
    const cfg = Jana.infinitePayConfig(config);
    return !!(cfg.enabled && cfg.handle);
  };

  Jana.toCents = function toCents(reais) {
    const n = Number(reais);
    if (!Number.isFinite(n) || n <= 0) {
      return 0;
    }
    return Math.round(n * 100);
  };

  Jana.isOnlinePayablePrice = function isOnlinePayablePrice(price) {
    return typeof price === "number" && Number.isFinite(price) && price > 0;
  };

  Jana.productHasFixedPrice = function productHasFixedPrice(product) {
    if (!product) {
      return false;
    }
    if (!Jana.isOnlinePayablePrice(product.price)) {
      return false;
    }
    const label = String(product.priceLabel || product.precoLabel || "");
    if (/\ba combinar\b|\bsob consulta\b/i.test(label)) {
      return false;
    }
    return true;
  };

  Jana.unpricedProducts = function unpricedProducts(products) {
    return (products || []).filter(function withoutPrice(product) {
      return product && product.active !== false && !Jana.productHasFixedPrice(product);
    });
  };

  Jana.cartHasUnpricedItems = function cartHasUnpricedItems(items, products) {
    const catalog = products || [];
    return (items || []).some(function unpriced(item) {
      if (!Jana.isOnlinePayablePrice(item.price)) {
        return true;
      }
      const product = catalog.find(function match(row) {
        return row.id === item.id || row.slug === item.slug;
      });
      return product ? !Jana.productHasFixedPrice(product) : false;
    });
  };

  Jana.canPayOnline = function canPayOnline(opts) {
    const options = opts || {};
    if (!Jana.infinitePayIsReady(options.pagamento)) {
      return false;
    }
    if (!options.items || !options.items.length) {
      return false;
    }
    if (Jana.cartHasUnpricedItems(options.items, options.products)) {
      return false;
    }
    if (options.taxaPendente) {
      return false;
    }
    return Number(options.total) >= 1;
  };

  Jana.generateOrderNsu = function generateOrderNsu(now) {
    const date = now || new Date();
    const ymd = Jana.ymdInTimeZone
      ? Jana.ymdInTimeZone(date, "America/Sao_Paulo").replace(/-/g, "")
      : String(date.getFullYear()) +
        ("0" + (date.getMonth() + 1)).slice(-2) +
        ("0" + date.getDate()).slice(-2);
    const rand = Math.random()
      .toString(36)
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 4)
      .toUpperCase();
    const tail = ("0000" + Date.now().toString(36).toUpperCase()).slice(-4);
    return "JA-" + ymd + "-" + (rand || tail);
  };

  Jana.infinitePayItems = function infinitePayItems(cartItems, totals) {
    const items = (cartItems || []).map(function toItem(item) {
      const flavor = item.flavor ? " (" + item.flavor + ")" : "";
      return {
        quantity: Math.max(1, Number(item.quantity) || 1),
        price: Jana.toCents(item.price),
        description: String(item.name || "Item")
          .concat(flavor)
          .slice(0, 120),
      };
    });
    if (totals && !totals.taxaPendente && Number(totals.taxa) > 0) {
      items.push({
        quantity: 1,
        price: Jana.toCents(totals.taxa),
        description: "Taxa de entrega",
      });
    }
    return items;
  };

  Jana.infinitePayCheckoutUrl = function infinitePayCheckoutUrl(data) {
    if (!data) {
      return "";
    }
    if (typeof data === "string" && /^https?:\/\//i.test(data)) {
      return data;
    }
    const nested = data.data || data.result || {};
    return (
      data.checkout_url ||
      data.link ||
      data.url ||
      nested.checkout_url ||
      nested.link ||
      nested.url ||
      ""
    );
  };

  Jana.infinitePayPhone = function infinitePayPhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }
    return digits.charAt(0) === "5" ? "+" + digits : "+55" + digits;
  };

  Jana.captureMethodLabel = function captureMethodLabel(method) {
    if (method === "pix") {
      return "pix";
    }
    if (method === "credit_card") {
      return "cartão";
    }
    return "pix/cartão";
  };

  Jana.createInfinitePayLink = async function createInfinitePayLink(body, fetchFn) {
    const fetchImpl = fetchFn || fetch;
    const response = await fetchImpl(LINKS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error("InfinitePay " + response.status);
    }
    return response.json();
  };

  Jana.checkInfinitePay = async function checkInfinitePay(body, fetchFn) {
    const fetchImpl = fetchFn || fetch;
    const response = await fetchImpl(CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error("InfinitePay " + response.status);
    }
    return response.json();
  };

  Jana.savePendingPay = function savePendingPay(data) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(data || {}));
    } catch (err) {
      /* ignore quota */
    }
  };

  Jana.loadPendingPay = function loadPendingPay() {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  };

  Jana.clearPendingPay = function clearPendingPay() {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch (err) {
      /* ignore */
    }
  };

  Jana.paymentMethodCsv = function paymentMethodCsv(order) {
    if (!order) {
      return "";
    }
    if (order.captureMethod === "pix") {
      return "infinitepay-pix";
    }
    if (order.captureMethod === "credit_card") {
      return "infinitepay-cartao";
    }
    return order.paymentMethod || "";
  };

  Jana.formatDesiredDate = function formatDesiredDate(value) {
    if (!value || String(value).indexOf("-") === -1) {
      return value || "";
    }
    const parts = String(value).split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  };

  Jana.buildPaidWhatsAppMessage = function buildPaidWhatsAppMessage(order, site, check, params) {
    const brand = (site && site.brandName) || "Jana Abreu Confeitaria";
    const method = Jana.captureMethodLabel(
      (check && check.capture_method) || (params && params.capture_method) || (order && order.captureMethod)
    );
    const paidCents = Number((check && (check.paid_amount || check.amount)) || 0);
    const paidReais =
      paidCents > 0 ? paidCents / 100 : order && order.paidAmount != null ? order.paidAmount : order && order.total;
    const receipt = (params && params.receipt_url) || (order && order.receiptUrl) || "";
    const nsu = (params && params.order_nsu) || (order && order.orderNsu) || "";
    const isEntrega = order && order.modalidade === "entrega";
    const lines = [
      "Olá! Gostaria de fazer uma encomenda na " + brand + ".",
      "",
      "*Cliente:* " + ((order && order.clientName) || ""),
      "*Telefone:* " + ((order && order.clientPhone) || ""),
    ];
    if (order && order.clientEmail) {
      lines.push("*E-mail:* " + order.clientEmail);
    }
    lines.push("*Modalidade:* " + (isEntrega ? "Entrega" : "Retirada"));
    if (isEntrega && order.address) {
      lines.push("*Endereço:* " + order.address);
    }
    if (order && order.desiredDate) {
      lines.push("*" + (isEntrega ? "Data de entrega" : "Data de retirada") + ":* " + Jana.formatDesiredDate(order.desiredDate));
    }
    lines.push("", "*Itens:*");
    const items = (order && order.items) || [];
    if (items.length) {
      items.forEach(function pushItem(item) {
        lines.push(
          "• " +
            item.quantity +
            "x " +
            item.name +
            (item.flavor ? " (recheio: " + item.flavor + ")" : "") +
            " — " +
            Jana.formatBRL((item.price || 0) * (item.quantity || 0))
        );
      });
    }
    if (isEntrega) {
      lines.push("", "*Subtotal:* " + Jana.formatBRL((order && order.subtotal) || 0));
      lines.push("*Taxa de entrega:* " + Jana.formatBRL((order && order.taxa) || 0));
    }
    lines.push("*Total:* " + Jana.formatBRL((order && order.total) || paidReais || 0));
    lines.push("", "*PAGO via InfinitePay (" + method + ")*");
    if (nsu) {
      lines.push("*Pedido:* " + nsu);
    }
    lines.push("*Valor pago:* " + Jana.formatBRL(paidReais || 0));
    if (receipt) {
      lines.push("*Comprovante:* " + receipt);
    }
    if (order && order.notes) {
      lines.push("", "*Observações:* " + order.notes);
    }
    lines.push("", Jana.PAID_DISCLAIMER);
    return lines.join("\n");
  };

  global.Jana = Jana;
})(window);
