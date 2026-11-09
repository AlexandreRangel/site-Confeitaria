(function createCentral(global) {
  const Jana = global.Jana || {};
  const IDEMPOTENCY_KEY = "jana-abreu-idempotency-v1";

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

  function idempotencyKey() {
    try {
      let key = sessionStorage.getItem(IDEMPOTENCY_KEY);
      if (!key) {
        key =
          (global.crypto && crypto.randomUUID && crypto.randomUUID()) ||
          "idem-" + Date.now() + "-" + Math.random().toString(16).slice(2);
        sessionStorage.setItem(IDEMPOTENCY_KEY, key);
      }
      return key;
    } catch (err) {
      return "idem-" + Date.now();
    }
  }

  async function submitRequest(site, payload) {
    const cfg = configFrom(site);
    if (!cfg.enabled) {
      return {
        attempted: false,
        savedCentral: false,
        confirmed: false,
        whatsappSent: false,
        reason: "disabled",
      };
    }
    try {
      const response = await fetch(cfg.endpoint + "/v1/solicitacoes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey(),
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(function noJson() {
        return {};
      });
      if (response.status === 401 || response.status === 403) {
        return {
          attempted: true,
          savedCentral: false,
          confirmed: false,
          whatsappSent: false,
          reason: "denied",
        };
      }
      if (response.status >= 500 || response.status === 503) {
        return {
          attempted: true,
          savedCentral: false,
          confirmed: false,
          whatsappSent: false,
          reason: "unavailable",
        };
      }
      if (!response.ok && response.status !== 409) {
        return {
          attempted: true,
          savedCentral: false,
          confirmed: false,
          whatsappSent: false,
          reason: "rejected",
        };
      }
      return {
        attempted: true,
        savedCentral: data.savedCentral === true || response.ok,
        duplicate: data.duplicate === true || response.status === 409,
        confirmed: data.confirmed === true,
        whatsappSent: false,
        order: data.order || null,
        reason: "ok",
      };
    } catch (err) {
      return {
        attempted: true,
        savedCentral: false,
        confirmed: false,
        whatsappSent: false,
        reason: "network",
      };
    }
  }

  async function adminList(site, token) {
    const cfg = configFrom(site);
    if (!cfg.enabled) {
      return { ok: false, reason: "disabled", orders: [] };
    }
    try {
      const response = await fetch(cfg.endpoint + "/v1/solicitacoes", {
        headers: { authorization: "Bearer " + token },
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: "denied", orders: [] };
      }
      if (!response.ok) {
        return { ok: false, reason: "unavailable", orders: [] };
      }
      const data = await response.json();
      return { ok: true, orders: data.orders || [] };
    } catch (err) {
      return { ok: false, reason: "network", orders: [] };
    }
  }

  async function adminPatch(site, token, id, payload) {
    const cfg = configFrom(site);
    if (!cfg.enabled) {
      return { ok: false, reason: "disabled" };
    }
    try {
      const response = await fetch(cfg.endpoint + "/v1/solicitacoes/" + encodeURIComponent(id), {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + token,
        },
        body: JSON.stringify(payload || {}),
      });
      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: "denied" };
      }
      if (!response.ok) {
        return { ok: false, reason: "unavailable" };
      }
      const data = await response.json();
      return { ok: true, order: data.order || null };
    } catch (err) {
      return { ok: false, reason: "network" };
    }
  }

  Jana.Central = {
    configFrom: configFrom,
    isEnabled: isEnabled,
    submitRequest: submitRequest,
    adminList: adminList,
    adminPatch: adminPatch,
    idempotencyKey: idempotencyKey,
  };
  global.Jana = Jana;
})(window);
