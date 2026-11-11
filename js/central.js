/**
 * Cliente do backend de pedidos (Cloudflare Worker "jana-pedidos" + D1).
 * Endereço em data/site.json → central.endpoint. Nenhum segredo aqui:
 * o painel pede a senha e guarda só um token de sessão (12 h) neste navegador.
 */
(function createCentral(global) {
  const Jana = global.Jana || {};
  const SESSION_KEY = "jana-abreu-admin-session-v2";

  Jana.REQUEST_DISCLAIMER =
    "Esta é uma solicitação de encomenda. A confirmação depende da disponibilidade e da confirmação da Jana pelo WhatsApp.";

  function configFrom(site) {
    const central = (site && site.central) || {};
    return {
      enabled: central.enabled === true && String(central.endpoint || "").indexOf("https://") === 0,
      endpoint: String(central.endpoint || "").replace(/\/+$/, ""),
      note: central.note || "",
    };
  }

  function isEnabled(site) {
    return configFrom(site).enabled;
  }

  function newKey() {
    return (
      (global.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      "idem-" + Date.now() + "-" + Math.random().toString(16).slice(2)
    );
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function late(resolve) {
        global.setTimeout(function timeout() {
          resolve({ ok: false, reason: "timeout" });
        }, ms);
      }),
    ]);
  }

  async function request(site, method, path, body, opts) {
    const cfg = configFrom(site);
    const options = opts || {};
    if (!cfg.enabled) {
      return { ok: false, reason: "disabled", status: 0, data: {} };
    }
    const headers = {};
    if (body != null) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = "Bearer " + options.token;
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    try {
      const response = await fetch(cfg.endpoint + path, {
        method: method,
        headers: headers,
        body: body != null ? JSON.stringify(body) : undefined,
        keepalive: options.keepalive === true,
        credentials: "omit",
      });
      const data = await response.json().catch(function noJson() {
        return {};
      });
      let reason = "ok";
      if (!response.ok) {
        reason =
          response.status === 401 || response.status === 403
            ? "denied"
            : response.status === 404
              ? "notfound"
              : response.status === 429
                ? "throttled"
                : response.status >= 500
                  ? "unavailable"
                  : "rejected";
      }
      return { ok: response.ok, status: response.status, reason: reason, data: data || {} };
    } catch (err) {
      return { ok: false, status: 0, reason: "network", data: {} };
    }
  }

  function orderBody(payload, method, extras) {
    const body = {
      method: method,
      nome: payload.nome,
      telefone: payload.telefone,
      email: payload.email,
      modalidade: payload.modalidade,
      regiao: payload.regiao,
      endereco: payload.endereco,
      data: payload.data,
      observacoes: payload.observacoes,
      items: (payload.items || []).map(function toItem(item) {
        return {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          flavor: item.flavor || "",
        };
      }),
    };
    return Object.assign(body, extras || {});
  }

  /* Cria o pedido no Worker. method: infinitepay | pix | whatsapp */
  async function createOrder(site, payload, method, extras, opts) {
    const options = opts || {};
    const call = request(site, "POST", "/pedidos", orderBody(payload, method, extras), {
      idempotencyKey: newKey(),
      keepalive: options.keepalive === true,
    });
    const result = options.timeoutMs ? await withTimeout(call, options.timeoutMs) : await call;
    return Object.assign({ savedCentral: !!result.ok }, result);
  }

  async function orderStatus(site, nsu, params, token) {
    const query = new URLSearchParams();
    const p = params || {};
    ["transaction_nsu", "slug", "receipt_url"].forEach(function add(key) {
      if (p[key]) query.set(key, p[key]);
    });
    if (token) query.set("t", token);
    const qs = query.toString();
    return request(site, "GET", "/pedidos/" + encodeURIComponent(nsu) + "/status" + (qs ? "?" + qs : ""));
  }

  /* ---------- sessão do painel ---------- */

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (session && session.token && Date.parse(session.expiresAt) > Date.now() + 60000) {
        return session;
      }
    } catch (err) {
      /* ignore */
    }
    return null;
  }

  function saveSession(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (err) {
      /* ignore */
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  async function adminLogin(site, password) {
    const result = await request(site, "POST", "/admin/login", { password: password });
    if (result.ok && result.data.token) {
      saveSession({ token: result.data.token, expiresAt: result.data.expiresAt });
    }
    return result;
  }

  function admin(site, method, path, body) {
    const session = loadSession();
    if (!session) {
      return Promise.resolve({ ok: false, reason: "denied", status: 401, data: {} });
    }
    return request(site, method, path, body, { token: session.token }).then(function after(result) {
      if (result.status === 401) clearSession();
      return result;
    });
  }

  Jana.Central = {
    configFrom: configFrom,
    isEnabled: isEnabled,
    createOrder: createOrder,
    orderStatus: orderStatus,
    declarePix: function declarePix(site, nsu, token) {
      return request(site, "POST", "/pedidos/" + encodeURIComponent(nsu) + "/pix-pago", { token: token });
    },
    session: loadSession,
    logout: clearSession,
    adminLogin: adminLogin,
    adminOrders: function adminOrders(site) {
      return admin(site, "GET", "/admin/pedidos?limit=1000");
    },
    adminPatchOrder: function adminPatchOrder(site, id, patch) {
      return admin(site, "PATCH", "/admin/pedidos/" + encodeURIComponent(id), patch || {});
    },
    adminDeleteOrder: function adminDeleteOrder(site, id) {
      return admin(site, "DELETE", "/admin/pedidos/" + encodeURIComponent(id));
    },
    adminVerifyOrder: function adminVerifyOrder(site, id) {
      return admin(site, "POST", "/admin/pedidos/" + encodeURIComponent(id) + "/verificar", {});
    },
    adminClients: function adminClients(site) {
      return admin(site, "GET", "/admin/clientes");
    },
    adminPatchClient: function adminPatchClient(site, id, patch) {
      return admin(site, "PATCH", "/admin/clientes/" + encodeURIComponent(id), patch || {});
    },
    adminDeleteClient: function adminDeleteClient(site, id) {
      return admin(site, "DELETE", "/admin/clientes/" + encodeURIComponent(id));
    },
    adminImport: function adminImport(site, orders) {
      return admin(site, "POST", "/admin/importar", { orders: orders || [] });
    },
    /* Chamada genérica às rotas /admin (usada pelo editor do site). */
    adminRequest: function adminRequest(site, method, path, body) {
      return admin(site, method, path, body);
    },
  };
  global.Jana = Jana;
})(window);
