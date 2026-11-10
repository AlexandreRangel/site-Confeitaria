/**
 * Pure order-central logic. No secrets, no live network.
 * The Cloudflare Worker (worker.mjs) is a thin HTTP adapter around this.
 * Disabled by default on the storefront until an endpoint is provisioned.
 */

export const STATUSES = [
  "solicitado",
  "confirmado",
  "em_producao",
  "pronto",
  "entregue",
  "cancelado",
];

export const LEGACY_STATUS = {
  novo: "solicitado",
  em_preparo: "em_producao",
};

export function normalizeStatus(status) {
  const raw = String(status || "");
  if (LEGACY_STATUS[raw]) {
    return LEGACY_STATUS[raw];
  }
  return STATUSES.indexOf(raw) === -1 ? "solicitado" : raw;
}

export function canTransition(from, to) {
  const current = normalizeStatus(from);
  const next = normalizeStatus(to);
  if (current === next) {
    return true;
  }
  if (current === "cancelado" || current === "entregue") {
    return next === current;
  }
  return STATUSES.indexOf(next) !== -1;
}

function jsonResponse(status, body, corsOrigin) {
  return {
    status: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": corsOrigin || "*",
      "access-control-allow-headers": "Authorization, Content-Type, Idempotency-Key",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isAdmin(authorization, adminToken) {
  if (!adminToken) {
    return false;
  }
  const header = String(authorization || "");
  const prefix = "Bearer ";
  if (header.indexOf(prefix) !== 0) {
    return false;
  }
  return timingSafeEqual(header.slice(prefix.length), adminToken);
}

function sanitizeItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 40).map(function mapItem(item) {
    return {
      id: String((item && item.id) || "").slice(0, 80),
      name: String((item && item.name) || "").slice(0, 160),
      quantity: Math.max(0, Math.min(99, Number(item && item.quantity) || 0)),
      price: Number(item && item.price) || 0,
      flavor: String((item && item.flavor) || "").slice(0, 80),
    };
  });
}

export function createMemoryStore() {
  const map = new Map();
  return {
    get: async function get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    put: async function put(key, value) {
      map.set(key, value);
    },
    list: async function list(prefix) {
      const out = [];
      map.forEach(function each(value, key) {
        if (String(key).indexOf(prefix) === 0) {
          out.push(value);
        }
      });
      return out;
    },
  };
}

export async function handleRequest(request, env) {
  const corsOrigin = (env && env.corsOrigin) || "*";
  const method = request.method || "GET";
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (method === "OPTIONS") {
    return jsonResponse(204, {}, corsOrigin);
  }

  if (!env || !env.store) {
    return jsonResponse(503, { error: "central_unconfigured", savedCentral: false }, corsOrigin);
  }

  if (path === "/v1/solicitacoes" && method === "POST") {
    return createSolicitation(request, env, corsOrigin);
  }

  if (path === "/v1/solicitacoes" && method === "GET") {
    if (!env.adminToken) {
      return jsonResponse(503, { error: "admin_unconfigured" }, corsOrigin);
    }
    if (!isAdmin(request.headers.get("authorization"), env.adminToken)) {
      return jsonResponse(401, { error: "unauthorized" }, corsOrigin);
    }
    const orders = await env.store.list("order:");
    orders.sort(function byDate(a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return jsonResponse(200, { orders: orders }, corsOrigin);
  }

  const patchMatch = path.match(/^\/v1\/solicitacoes\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    if (!env.adminToken) {
      return jsonResponse(503, { error: "admin_unconfigured" }, corsOrigin);
    }
    if (!isAdmin(request.headers.get("authorization"), env.adminToken)) {
      return jsonResponse(401, { error: "unauthorized" }, corsOrigin);
    }
    return patchSolicitation(patchMatch[1], request, env, corsOrigin);
  }

  return jsonResponse(404, { error: "not_found" }, corsOrigin);
}

async function createSolicitation(request, env, corsOrigin) {
  let payload = {};
  try {
    payload = await request.json();
  } catch (err) {
    return jsonResponse(400, { error: "invalid_json", savedCentral: false }, corsOrigin);
  }
  const nome = String(payload.nome || "").trim();
  const telefone = String(payload.telefone || "").replace(/\D/g, "");
  if (!nome || telefone.length < 10) {
    return jsonResponse(400, { error: "invalid_payload", savedCentral: false }, corsOrigin);
  }
  const idempotencyKey = String(
    request.headers.get("idempotency-key") || payload.idempotencyKey || ""
  ).slice(0, 120);
  if (idempotencyKey) {
    const existingId = await env.store.get("idem:" + idempotencyKey);
    if (existingId) {
      const existing = await env.store.get("order:" + existingId);
      return jsonResponse(
        200,
        { savedCentral: true, duplicate: true, order: existing, confirmed: false, whatsappSent: false },
        corsOrigin
      );
    }
  }
  const now = new Date().toISOString();
  const id = "SOL-" + now.replace(/[^\d]/g, "").slice(0, 14) + "-" + Math.floor(Math.random() * 1000);
  const order = {
    id: id,
    number: id.replace("SOL-", ""),
    status: "solicitado",
    createdAt: now,
    history: [{ status: "solicitado", at: now, actor: "cliente" }],
    clientName: nome.slice(0, 120),
    clientPhone: telefone.slice(0, 15),
    clientEmail: String(payload.email || "").trim().slice(0, 120),
    desiredDate: String(payload.data || "").slice(0, 10),
    address: String(payload.endereco || "").slice(0, 200),
    notes: String(payload.observacoes || "").slice(0, 1000),
    modalidade: payload.modalidade === "entrega" ? "entrega" : "retirada",
    taxa: payload.taxaPendente ? null : Number(payload.taxa) || 0,
    taxaPendente: payload.taxaPendente === true,
    frete: payload.taxaPendente ? 0 : Number(payload.taxa) || Number(payload.frete) || 0,
    items: sanitizeItems(payload.items),
    source: "vitrine",
    confirmed: false,
    whatsappSent: false,
  };
  await env.store.put("order:" + id, order);
  if (idempotencyKey) {
    await env.store.put("idem:" + idempotencyKey, id);
  }
  return jsonResponse(
    201,
    { savedCentral: true, duplicate: false, order: order, confirmed: false, whatsappSent: false },
    corsOrigin
  );
}

async function patchSolicitation(id, request, env, corsOrigin) {
  const current = await env.store.get("order:" + id);
  if (!current) {
    return jsonResponse(404, { error: "not_found" }, corsOrigin);
  }
  let payload = {};
  try {
    payload = await request.json();
  } catch (err) {
    return jsonResponse(400, { error: "invalid_json" }, corsOrigin);
  }
  if (payload.status) {
    if (!canTransition(current.status, payload.status)) {
      return jsonResponse(409, { error: "invalid_transition" }, corsOrigin);
    }
    current.status = normalizeStatus(payload.status);
    current.history = (current.history || []).concat({
      status: current.status,
      at: new Date().toISOString(),
      actor: "admin",
    });
    current.confirmed = current.status === "confirmado" || current.status === "em_producao" || current.status === "pronto" || current.status === "entregue";
  }
  await env.store.put("order:" + id, current);
  return jsonResponse(200, { order: current }, corsOrigin);
}
