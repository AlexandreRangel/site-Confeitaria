/**
 * jana-pedidos — backend de pedidos da Jana Abreu Confeitaria.
 * Cloudflare Worker + D1. Sem segredos neste arquivo: ADMIN_PASSWORD_HASH,
 * SESSION_SECRET, INFINITE_HANDLE e GITHUB_TOKEN (editor do site) são secrets do Worker.
 */

const MAX_BODY = 32 * 1024;
const MAX_ITEMS = 60;
const SESSION_HOURS = 12;
const ORDER_STATUSES = [
  "solicitado",
  "aguardando pagamento",
  "pago",
  "confirmado",
  "em_producao",
  "pronto",
  "entregue",
  "cancelado",
];
const PAYMENT_STATUSES = ["pendente", "declarado", "pago", "nao_pago", "a_combinar", "estornado"];
const METHODS = ["infinitepay", "pix", "whatsapp"];

/* ---------------- helpers ---------------- */

function nowIso() {
  return new Date().toISOString();
}

const ANTECEDENCIA_MINIMA_DIAS = 2;

function pad2(value) {
  return ("0" + String(value)).slice(-2);
}

function todayYmd(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now || new Date());
  const map = {};
  parts.forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value;
  });
  return map.year + "-" + map.month + "-" + map.day;
}

function addDaysYmd(ymd, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0)));
  return date.getUTCFullYear() + "-" + pad2(date.getUTCMonth() + 1) + "-" + pad2(date.getUTCDate());
}

function formatDateLongBR(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(date);
  return weekday + ", " + match[3] + "/" + match[2];
}

function minDesiredDate(now) {
  return addDaysYmd(todayYmd(now), ANTECEDENCIA_MINIMA_DIAS);
}

function assertCustomerDesiredDate(desired, now) {
  if (!desired) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desired)) throw new HttpError(400, "data inválida");
  const min = minDesiredDate(now);
  if (desired < min) {
    throw new HttpError(
      400,
      "Precisamos de pelo menos 2 dias para preparar sua encomenda. Escolha a partir de " + formatDateLongBR(min) + "."
    );
  }
}

function str(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function digits(value, max) {
  return String(value == null ? "" : value).replace(/\D/g, "").slice(0, max || 20);
}

function toCents(reais) {
  const n = Number(reais);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function fromCents(cents) {
  return cents == null ? null : Math.round(Number(cents)) / 100;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function originAllowed(env, origin) {
  if (!origin) return false;
  const list = allowedOrigins(env);
  if (list.includes(origin)) return true;
  if (env.ALLOW_LOCALHOST === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (originAllowed(env, origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(env, request, data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
      corsHeaders(env, request)
    ),
  });
}

async function readJson(request, max) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > max) throw new HttpError(413, "corpo grande demais");
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "corpo grande demais");
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("x");
    return data;
  } catch (e) {
    throw new HttpError(400, "JSON inválido");
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function randomToken(bytes) {
  const buf = new Uint8Array(bytes || 24);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

function b64url(buf) {
  let s = "";
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return b64url(d);
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

function safeEqual(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function generateNsu() {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let tail = "";
  for (const b of buf) tail += alphabet[b % alphabet.length];
  return "JA-" + ymd + "-" + tail;
}

const NSU_RE = /^JA-\d{8}-[A-Z0-9]{4,10}$/;

/* ---------------- catálogo (preços oficiais do site) ---------------- */

let catalogCache = null;

async function loadCatalog(env) {
  if (catalogCache && Date.now() - catalogCache.at < 5 * 60 * 1000) return catalogCache;
  const bases = String(env.SITE_DATA_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const base of bases) {
    try {
      const root = base.endsWith("/") ? base : base + "/";
      const [pr, sr] = await Promise.all([
        fetch(root + "data/products.json", { cf: { cacheTtl: 120 } }),
        fetch(root + "data/site.json", { cf: { cacheTtl: 120 } }),
      ]);
      if (!pr.ok || !sr.ok) continue;
      const products = await pr.json();
      const site = await sr.json();
      if (!Array.isArray(products)) continue;
      const map = new Map();
      for (const p of products) {
        if (p && p.id) map.set(String(p.id), p);
      }
      catalogCache = { at: Date.now(), products: map, site: site || {} };
      return catalogCache;
    } catch (e) {
      /* tenta a próxima base */
    }
  }
  return null;
}

function resolveTaxa(site, modalidade, regiao) {
  if (modalidade !== "entrega") return { taxa: 0, pendente: false };
  const raw = (site && site.entrega) || {};
  const table = raw.porRegiao && typeof raw.porRegiao === "object" ? raw.porRegiao : {};
  const ids = Object.keys(table);
  if (ids.length) {
    const v = table[regiao];
    if (v == null) return { taxa: 0, pendente: true };
    const t = Number(typeof v === "object" ? (v.taxa != null ? v.taxa : v.valor) : v);
    return Number.isFinite(t) ? { taxa: t, pendente: false } : { taxa: 0, pendente: true };
  }
  const t = raw.taxa == null || raw.taxa === "" ? null : Number(raw.taxa);
  return Number.isFinite(t) ? { taxa: t, pendente: false } : { taxa: 0, pendente: true };
}

function fixedPrice(product) {
  if (!product || product.active === false) return null;
  const price = product.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const label = String(product.priceLabel || product.precoLabel || "");
  if (/\ba combinar\b|\bsob consulta\b/i.test(label)) return null;
  return price;
}

/* ---------------- validação do pedido ---------------- */

function cleanItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  if (rawItems.length > MAX_ITEMS) throw new HttpError(400, "itens demais");
  return rawItems.map((it) => {
    const quantity = Math.floor(Number(it && it.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 500) {
      throw new HttpError(400, "quantidade inválida");
    }
    const price = Number(it && it.price);
    return {
      id: str(it && it.id, 120),
      name: str(it && it.name, 160) || "Item",
      flavor: str(it && it.flavor, 120),
      quantity,
      price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
    };
  });
}

async function priceOrder(env, items, modalidade, regiao, requireFixed) {
  const catalog = await loadCatalog(env);
  const notes = [];
  let verified = !!catalog;
  const priced = items.map((it) => {
    if (!catalog) return Object.assign({}, it);
    const product = catalog.products.get(it.id);
    const official = fixedPrice(product);
    if (official == null) {
      verified = false;
      notes.push("sem preço fixo: " + (it.id || it.name));
      return Object.assign({}, it);
    }
    if (Math.abs(official - it.price) > 0.004) {
      notes.push("preço corrigido: " + it.id + " " + it.price + "→" + official);
    }
    return Object.assign({}, it, { price: official, name: str(product.name, 160) || it.name });
  });
  if (requireFixed && (!catalog || !verified)) {
    throw new HttpError(
      catalog ? 422 : 503,
      catalog ? "item sem preço fixo para pagamento online" : "catálogo indisponível"
    );
  }
  const taxa = resolveTaxa(catalog ? catalog.site : {}, modalidade, regiao);
  if (requireFixed && taxa.pendente) throw new HttpError(422, "taxa de entrega a confirmar");
  const subtotalCents = priced.reduce((s, it) => s + Math.round(it.price * 100) * it.quantity, 0);
  const taxaCents = taxa.pendente ? null : Math.round(taxa.taxa * 100);
  return {
    items: priced,
    subtotalCents,
    taxaCents,
    taxaPendente: taxa.pendente,
    totalCents: subtotalCents + (taxaCents || 0),
    verified,
    notes,
  };
}

/* ---------------- InfinitePay ---------------- */

function ipBase(env) {
  return String(env.INFINITEPAY_API || "https://api.checkout.infinitepay.io").replace(/\/+$/, "");
}

function handleOf(env) {
  return String(env.INFINITE_HANDLE || "").replace(/\$/g, "").trim();
}

async function paymentCheck(env, orderNsu, transactionNsu, slug) {
  const handle = handleOf(env);
  if (!handle) throw new HttpError(503, "handle não configurado");
  const res = await fetch(ipBase(env) + "/payment_check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug,
    }),
  });
  if (!res.ok) throw new HttpError(502, "payment_check " + res.status);
  const data = await res.json().catch(() => ({}));
  return data || {};
}

function checkoutUrlOf(data) {
  if (!data) return "";
  const nested = data.data || data.result || {};
  return data.checkout_url || data.link || data.url || nested.checkout_url || nested.link || nested.url || "";
}

async function createLink(env, order, items, redirectUrl, customer) {
  const handle = handleOf(env);
  if (!handle) return { ok: false, reason: "handle" };
  const ipItems = items.map((it) => ({
    quantity: it.quantity,
    price: Math.round(it.price * 100),
    description: (it.name + (it.flavor ? " (" + it.flavor + ")" : "")).slice(0, 120),
  }));
  if (order.taxaCents && order.taxaCents > 0) {
    ipItems.push({ quantity: 1, price: order.taxaCents, description: "Taxa de entrega" });
  }
  const body = {
    handle,
    order_nsu: order.nsu,
    redirect_url: redirectUrl,
    webhook_url: webhookUrl(env),
    items: ipItems,
  };
  if (customer) body.customer = customer;
  const post = (payload) =>
    fetch(ipBase(env) + "/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  try {
    let res = await post(body);
    if (res.status === 422 && body.customer) {
      // a API recusa alguns formatos de cliente; tenta de novo sem o bloco customer
      delete body.customer;
      res = await post(body);
    }
    if (!res.ok) return { ok: false, reason: "http " + res.status };
    const url = checkoutUrlOf(await res.json().catch(() => null));
    if (!/^https:\/\//i.test(url)) return { ok: false, reason: "sem url" };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, reason: "rede" };
  }
}

/* Mesmas regras do site (js/pagamento.js → infinitePayCustomer): a API responde 422 a dados fora do formato. */
function ipCustomer(nome, telefoneRaw, email) {
  const customer = {};
  const name = String(nome || "").trim();
  if (name.length >= 3) customer.name = name;
  const raw = String(telefoneRaw || "");
  const d = raw.replace(/\D/g, "");
  let national = d;
  if (d.indexOf("55") === 0 && (d.length === 12 || d.length === 13 || /^\s*(\+\s*|00\s*)55/.test(raw))) national = d.slice(2);
  if (national.length === 10 || national.length === 11) customer.phone_number = "+55" + national;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim())) customer.email = String(email).trim();
  return Object.keys(customer).length ? customer : null;
}

function webhookUrl(env) {
  return String(env.PUBLIC_URL || "").replace(/\/+$/, "") + "/webhook/infinitepay";
}

function validRedirect(env, url) {
  try {
    const u = new URL(url);
    const origin = u.origin;
    if (!originAllowed(env, origin)) return false;
    return /\/pagamento\/?$/.test(u.pathname) && !u.search && !u.hash;
  } catch (e) {
    return false;
  }
}

/* ---------------- persistência ---------------- */

function rowToOrder(row) {
  if (!row) return null;
  let items = [];
  let history = [];
  try {
    items = JSON.parse(row.items_json || "[]");
  } catch (e) {
    items = [];
  }
  try {
    history = JSON.parse(row.history_json || "[]");
  } catch (e) {
    history = [];
  }
  const taxa = fromCents(row.taxa_cents);
  return {
    id: row.nsu,
    number: String(1100 + Number(row.seq)),
    orderNsu: row.nsu,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.method,
    captureMethod: row.capture_method,
    clientId: row.client_id || "",
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    modalidade: row.modalidade,
    regiao: row.regiao,
    address: row.address,
    desiredDate: row.desired_date,
    notes: row.notes,
    adminNotes: row.admin_notes,
    items,
    subtotal: fromCents(row.subtotal_cents),
    taxa: row.taxa_pendente ? null : taxa,
    taxaPendente: !!row.taxa_pendente,
    frete: taxa || 0,
    total: fromCents(row.total_cents),
    clientTotal: fromCents(row.client_total_cents),
    priceVerified: !!row.price_verified,
    priceNote: row.price_note,
    transactionNsu: row.transaction_nsu || "",
    checkoutSlug: row.invoice_slug,
    receiptUrl: row.receipt_url,
    paidAmount: fromCents(row.paid_amount_cents),
    amountMismatch: !!row.amount_mismatch,
    paidAt: row.paid_at || "",
    paidVia: row.paid_via,
    source: "worker",
    history,
  };
}

async function getOrderRow(env, nsu) {
  return env.DB.prepare("SELECT * FROM orders WHERE nsu = ?").bind(nsu).first();
}

function pushHistory(row, entry) {
  let list = [];
  try {
    list = JSON.parse(row.history_json || "[]");
  } catch (e) {
    list = [];
  }
  list.push(Object.assign({ at: nowIso() }, entry));
  return JSON.stringify(list.slice(-60));
}

async function upsertClient(env, nome, telefone, email) {
  const phone = digits(telefone, 15);
  const mail = str(email, 160).toLowerCase();
  if (!phone && !mail) return null;
  let existing = null;
  if (phone) {
    existing = await env.DB.prepare("SELECT * FROM clients WHERE telefone = ? LIMIT 1").bind(phone).first();
  }
  if (!existing && mail) {
    existing = await env.DB.prepare("SELECT * FROM clients WHERE email = ? LIMIT 1").bind(mail).first();
  }
  const t = nowIso();
  if (existing) {
    await env.DB.prepare(
      "UPDATE clients SET nome = ?, telefone = ?, email = ?, updated_at = ? WHERE id = ?"
    )
      .bind(nome || existing.nome, phone || existing.telefone, mail || existing.email, t, existing.id)
      .run();
    return existing.id;
  }
  const id = "cli-" + randomToken(9);
  await env.DB.prepare(
    "INSERT INTO clients (id, nome, telefone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, nome, phone, mail, t, t)
    .run();
  return id;
}

/* Marca como pago SOMENTE após payment_check confirmar. Idempotente. */
async function confirmPayment(env, nsu, transactionNsu, slug, receiptUrl, via) {
  const row = await getOrderRow(env, nsu);
  if (!row) return { ok: false, code: "pedido_desconhecido" };
  if (row.method !== "infinitepay") return { ok: false, code: "metodo_diferente" };
  if (row.payment_status === "pago" && row.transaction_nsu) {
    return {
      ok: true,
      already: true,
      paid: true,
      sameTransaction: row.transaction_nsu === transactionNsu,
      row,
    };
  }
  const check = await paymentCheck(env, nsu, transactionNsu, slug);
  const paid = !!(check && check.success !== false && check.paid === true);
  if (!paid) return { ok: true, paid: false, row, check };
  const amount = Number(check.amount);
  const paidAmount = Number(check.paid_amount != null ? check.paid_amount : check.amount);
  const mismatch = Number.isFinite(amount) && amount !== row.total_cents ? 1 : 0;
  const receipt = /^https:\/\//i.test(String(receiptUrl || "")) ? str(receiptUrl, 500) : row.receipt_url;
  const t = nowIso();
  const res = await env.DB.prepare(
    `UPDATE orders SET payment_status = 'pago',
       status = CASE WHEN status IN ('solicitado','aguardando pagamento') THEN 'pago' ELSE status END,
       capture_method = ?, transaction_nsu = ?, invoice_slug = ?, receipt_url = ?,
       paid_amount_cents = ?, amount_mismatch = ?, paid_at = ?, paid_via = ?, updated_at = ?, history_json = ?
     WHERE nsu = ? AND payment_status != 'pago'`
  )
    .bind(
      str(check.capture_method, 30),
      str(transactionNsu, 80),
      str(slug, 80),
      receipt || "",
      Number.isFinite(paidAmount) ? Math.round(paidAmount) : null,
      mismatch,
      t,
      via,
      t,
      pushHistory(row, { event: "pago", via, amount: Number.isFinite(amount) ? amount : null }),
      nsu
    )
    .run();
  const updated = await getOrderRow(env, nsu);
  return { ok: true, paid: true, already: !res.meta || res.meta.changes === 0, row: updated, check };
}

/* ---------------- rotas públicas ---------------- */

async function createOrder(env, request) {
  const body = await readJson(request, MAX_BODY);
  const method = METHODS.includes(body.method) ? body.method : null;
  if (!method) throw new HttpError(400, "método inválido");
  const nome = str(body.nome, 120);
  const telefone = digits(body.telefone, 15);
  if (!nome) throw new HttpError(400, "nome obrigatório");
  if (telefone.length < 10) throw new HttpError(400, "telefone inválido");
  const email = str(body.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "e-mail inválido");
  const modalidade = body.modalidade === "entrega" ? "entrega" : "retirada";
  const address = modalidade === "entrega" ? str(body.endereco, 300) : "";
  if (modalidade === "entrega" && !address) throw new HttpError(400, "endereço obrigatório");
  const regiao = str(body.regiao, 60);
  const desired = str(body.data, 10);
  if (desired && !/^\d{4}-\d{2}-\d{2}$/.test(desired)) throw new HttpError(400, "data inválida");
  assertCustomerDesiredDate(desired);
  const notes = str(body.observacoes, 1500);
  const items = cleanItems(body.items);
  if (!items.length && !notes) throw new HttpError(400, "pedido vazio");
  if (method !== "whatsapp" && !items.length) throw new HttpError(400, "pedido sem itens");

  const idem = str(request.headers.get("Idempotency-Key"), 80);
  if (idem) {
    const prev = await env.DB.prepare("SELECT * FROM orders WHERE idem_key = ?").bind(idem).first();
    if (prev) {
      return json(env, request, { ok: true, duplicate: true, nsu: prev.nsu, checkoutUrl: prev.checkout_url || "" }, 200);
    }
  }

  const pricing = await priceOrder(env, items, modalidade, regiao, method === "infinitepay");
  const clientTotal = toCents(body.total);
  const priceNotes = pricing.notes.slice();
  if (clientTotal != null && clientTotal !== pricing.totalCents) {
    priceNotes.push("total do navegador " + clientTotal + " ≠ calculado " + pricing.totalCents);
  }

  let redirectUrl = "";
  if (method === "infinitepay") {
    redirectUrl = str(body.redirect_url, 300);
    if (!validRedirect(env, redirectUrl)) throw new HttpError(400, "redirect_url inválida");
    if (pricing.totalCents < 100) throw new HttpError(422, "total mínimo R$ 1,00");
  }

  const nsu = generateNsu();
  const token = randomToken(18);
  const tokenHash = await sha256(token);
  const t = nowIso();
  const clientId = await upsertClient(env, nome, telefone, email);
  const status = method === "whatsapp" ? "solicitado" : "aguardando pagamento";
  const paymentStatus =
    method === "pix" ? (body.declared === true ? "declarado" : "pendente") : method === "whatsapp" ? "a_combinar" : "pendente";
  await env.DB.prepare(
    `INSERT INTO orders (nsu, token_hash, idem_key, created_at, updated_at, method, status, payment_status, client_id,
      client_name, client_phone, client_email, modalidade, regiao, address, desired_date, notes, items_json,
      subtotal_cents, taxa_cents, taxa_pendente, total_cents, client_total_cents, price_verified, price_note, history_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      nsu,
      tokenHash,
      idem || null,
      t,
      t,
      method,
      status,
      paymentStatus,
      clientId,
      nome,
      telefone,
      email,
      modalidade,
      regiao,
      address,
      desired,
      notes,
      JSON.stringify(pricing.items),
      pricing.subtotalCents,
      pricing.taxaCents,
      pricing.taxaPendente ? 1 : 0,
      pricing.totalCents,
      clientTotal,
      pricing.verified ? 1 : 0,
      priceNotes.join("; ").slice(0, 900),
      JSON.stringify([{ at: t, event: "criado", method, paymentStatus }])
    )
    .run();

  let checkoutUrl = "";
  let linkError = "";
  if (method === "infinitepay" && body.createLink !== false) {
    const link = await createLink(
      env,
      { nsu, taxaCents: pricing.taxaCents },
      pricing.items,
      redirectUrl,
      ipCustomer(nome, body.telefone, email)
    );
    if (link.ok) {
      checkoutUrl = link.url;
      await env.DB.prepare("UPDATE orders SET checkout_url = ? WHERE nsu = ?").bind(checkoutUrl, nsu).run();
    } else {
      linkError = link.reason;
    }
  }

  return json(
    env,
    request,
    {
      ok: true,
      nsu,
      token,
      number: undefined,
      status,
      paymentStatus,
      totals: {
        subtotal: fromCents(pricing.subtotalCents),
        taxa: fromCents(pricing.taxaCents),
        taxaPendente: pricing.taxaPendente,
        total: fromCents(pricing.totalCents),
      },
      items: pricing.items,
      priceVerified: pricing.verified,
      checkoutUrl,
      linkError,
      webhookUrl: method === "infinitepay" ? webhookUrl(env) : undefined,
    },
    201
  );
}

async function declarePix(env, request, nsu) {
  const body = await readJson(request, 2048);
  const row = await getOrderRow(env, nsu);
  if (!row || !safeEqual(row.token_hash, await sha256(str(body.token, 100)))) {
    throw new HttpError(404, "pedido não encontrado");
  }
  if (row.method !== "pix") throw new HttpError(409, "não é Pix");
  if (row.payment_status === "pendente") {
    await env.DB.prepare("UPDATE orders SET payment_status = 'declarado', updated_at = ?, history_json = ? WHERE nsu = ?")
      .bind(nowIso(), pushHistory(row, { event: "cliente declarou Pix pago" }), nsu)
      .run();
  }
  return json(env, request, { ok: true, nsu, paymentStatus: "declarado" });
}

async function orderStatus(env, request, nsu, url) {
  if (!NSU_RE.test(nsu)) throw new HttpError(404, "pedido não encontrado");
  let row = await getOrderRow(env, nsu);
  if (!row) throw new HttpError(404, "pedido não encontrado");
  const txn = str(url.searchParams.get("transaction_nsu"), 80);
  const slug = str(url.searchParams.get("slug"), 80);
  const receipt = str(url.searchParams.get("receipt_url"), 500);
  let checked = false;
  let checkError = "";
  if (row.method === "infinitepay" && row.payment_status !== "pago" && txn && slug) {
    try {
      const r = await confirmPayment(env, nsu, txn, slug, receipt, "retorno");
      checked = true;
      if (r.row) row = r.row;
    } catch (e) {
      checkError = "verificação indisponível";
    }
  }
  const token = str(url.searchParams.get("t"), 100);
  const withDetails = token && safeEqual(row.token_hash, await sha256(token));
  const out = {
    ok: true,
    nsu,
    paid: row.payment_status === "pago",
    paymentStatus: row.payment_status,
    status: row.status,
    method: row.method,
    captureMethod: row.capture_method,
    paidAmount: fromCents(row.paid_amount_cents),
    total: fromCents(row.total_cents),
    checked,
    checkError,
  };
  if (withDetails) out.order = rowToOrder(row);
  return json(env, request, out);
}

async function webhook(env, request, ctx) {
  let body = {};
  let raw = "";
  try {
    raw = await request.text();
    if (raw.length > 16 * 1024) return json(env, request, { ok: false, error: "grande demais" }, 413);
    body = JSON.parse(raw || "{}");
  } catch (e) {
    return json(env, request, { ok: false, error: "JSON inválido" }, 400);
  }
  const nsu = str(body.order_nsu, 40);
  const txn = str(body.transaction_nsu, 80);
  const slug = str(body.invoice_slug || body.slug, 80);
  const receipt = str(body.receipt_url, 500);
  const log = async (verified, result) => {
    await env.DB.prepare(
      "INSERT INTO webhook_events (received_at, order_nsu, transaction_nsu, slug, verified, result, body) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(nowIso(), nsu, txn, slug, verified ? 1 : 0, result, raw.slice(0, 4000))
      .run();
  };
  if (!NSU_RE.test(nsu) || !txn || !slug) {
    await log(false, "campos ausentes");
    return json(env, request, { ok: false, error: "campos ausentes" }, 400);
  }
  let r;
  try {
    r = await confirmPayment(env, nsu, txn, slug, receipt, "webhook");
  } catch (e) {
    await log(false, "payment_check falhou");
    return json(env, request, { ok: false, error: "verificação indisponível" }, 400);
  }
  if (!r.ok) {
    await log(false, r.code);
    // pedido inexistente: 200 para não gerar reenvios infinitos
    return json(env, request, { ok: false, ignored: r.code }, 200);
  }
  if (!r.paid) {
    await log(false, "payment_check: não pago");
    return json(env, request, { ok: false, error: "pagamento não confirmado" }, 400);
  }
  await log(true, r.already ? "já estava pago" : "marcado pago");
  return json(env, request, { ok: true, paid: true, already: !!r.already });
}

/* ---------------- admin ---------------- */

/* Senha do painel: ADMIN_PASSWORD_HASH = "pbkdf2$<iterações>$<sal b64>$<hash b64>" (preferido)
   ou, só como legado, ADMIN_PASSWORD em texto. */
function adminConfigured(env) {
  return !!((env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD) && env.SESSION_SECRET);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function passwordMatches(env, pass) {
  const stored = String(env.ADMIN_PASSWORD_HASH || "");
  if (stored) {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = Math.min(100000, Math.max(1000, Number(parts[1]) || 0));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: b64ToBytes(parts[2]), iterations },
      key,
      256
    );
    const got = btoa(String.fromCharCode(...new Uint8Array(bits)));
    return safeEqual(got, parts[3]);
  }
  if (!env.ADMIN_PASSWORD) return false;
  return safeEqual(await sha256(pass), await sha256(env.ADMIN_PASSWORD));
}

async function sessionKey(env) {
  return env.SESSION_SECRET + "|" + (env.ADMIN_PASSWORD_HASH || (await sha256(env.ADMIN_PASSWORD || "")));
}

async function adminLogin(env, request) {
  if (!adminConfigured(env)) throw new HttpError(503, "admin não configurado");
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const nowS = Math.floor(Date.now() / 1000);
  const fail = await env.DB.prepare("SELECT * FROM login_failures WHERE ip = ?").bind(ip).first();
  if (fail && nowS - fail.window_start < 900 && fail.count >= 10) {
    throw new HttpError(429, "muitas tentativas; espere 15 minutos");
  }
  const body = await readJson(request, 1024);
  const pass = String(body.password || "");
  if (!(await passwordMatches(env, pass))) {
    if (!fail || nowS - fail.window_start >= 900) {
      await env.DB.prepare("INSERT OR REPLACE INTO login_failures (ip, count, window_start) VALUES (?, 1, ?)")
        .bind(ip, nowS)
        .run();
    } else {
      await env.DB.prepare("UPDATE login_failures SET count = count + 1 WHERE ip = ?").bind(ip).run();
    }
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, "senha incorreta");
  }
  if (fail) await env.DB.prepare("DELETE FROM login_failures WHERE ip = ?").bind(ip).run();
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = "adm." + exp + "." + randomToken(8);
  const sig = await hmac(await sessionKey(env), payload);
  return json(env, request, { ok: true, token: payload + "." + sig, expiresAt: new Date(exp).toISOString() });
}

async function requireAdmin(env, request) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(adm\.(\d+)\.[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m || !adminConfigured(env)) throw new HttpError(401, "login necessário");
  if (Number(m[2]) < Date.now()) throw new HttpError(401, "sessão expirada");
  const expected = await hmac(await sessionKey(env), m[1]);
  if (!safeEqual(expected, m[3])) throw new HttpError(401, "login necessário");
}

async function adminListOrders(env, request, url) {
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit")) || 500));
  const { results } = await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return json(env, request, { ok: true, orders: results.map(rowToOrder) });
}

async function adminPatchOrder(env, request, nsu) {
  const row = await getOrderRow(env, nsu);
  if (!row) throw new HttpError(404, "pedido não encontrado");
  const body = await readJson(request, MAX_BODY);
  const sets = [];
  const vals = [];
  const changed = [];
  const setField = (col, value, label) => {
    sets.push(col + " = ?");
    vals.push(value);
    changed.push(label);
  };
  if (body.status != null) {
    if (!ORDER_STATUSES.includes(body.status)) throw new HttpError(400, "status inválido");
    setField("status", body.status, "status=" + body.status);
  }
  if (body.paymentStatus != null) {
    if (!PAYMENT_STATUSES.includes(body.paymentStatus)) throw new HttpError(400, "status de pagamento inválido");
    setField("payment_status", body.paymentStatus, "pagamento=" + body.paymentStatus);
  }
  const textFields = {
    clientName: ["client_name", 120],
    clientEmail: ["client_email", 160],
    address: ["address", 300],
    notes: ["notes", 1500],
    adminNotes: ["admin_notes", 1500],
    regiao: ["regiao", 60],
  };
  for (const key of Object.keys(textFields)) {
    if (body[key] != null) setField(textFields[key][0], str(body[key], textFields[key][1]), key);
  }
  if (body.clientPhone != null) setField("client_phone", digits(body.clientPhone, 15), "clientPhone");
  if (body.desiredDate != null) {
    const d = str(body.desiredDate, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, "data inválida");
    setField("desired_date", d, "desiredDate");
  }
  if (body.modalidade != null) {
    setField("modalidade", body.modalidade === "entrega" ? "entrega" : "retirada", "modalidade");
  }
  let subtotal = row.subtotal_cents;
  let taxa = row.taxa_cents;
  if (body.items != null) {
    const items = cleanItems(body.items);
    subtotal = items.reduce((s, it) => s + Math.round(it.price * 100) * it.quantity, 0);
    setField("items_json", JSON.stringify(items), "items");
    setField("subtotal_cents", subtotal, "subtotal");
  }
  if (body.frete != null || body.taxa != null) {
    const c = toCents(body.frete != null ? body.frete : body.taxa);
    if (c == null) throw new HttpError(400, "taxa inválida");
    taxa = c;
    setField("taxa_cents", c, "taxa");
    setField("taxa_pendente", 0, "taxa_pendente");
  }
  if (body.items != null || body.frete != null || body.taxa != null) {
    setField("total_cents", subtotal + (taxa || 0), "total");
  }
  if (!sets.length) return json(env, request, { ok: true, order: rowToOrder(row) });
  sets.push("updated_at = ?");
  vals.push(nowIso());
  sets.push("history_json = ?");
  vals.push(pushHistory(row, { event: "editado no painel", fields: changed.slice(0, 20) }));
  vals.push(nsu);
  await env.DB.prepare("UPDATE orders SET " + sets.join(", ") + " WHERE nsu = ?").bind(...vals).run();
  return json(env, request, { ok: true, order: rowToOrder(await getOrderRow(env, nsu)) });
}

async function adminDeleteOrder(env, request, nsu) {
  const res = await env.DB.prepare("DELETE FROM orders WHERE nsu = ?").bind(nsu).run();
  if (!res.meta || !res.meta.changes) throw new HttpError(404, "pedido não encontrado");
  return json(env, request, { ok: true, deleted: nsu });
}

async function adminVerify(env, request, nsu) {
  const row = await getOrderRow(env, nsu);
  if (!row) throw new HttpError(404, "pedido não encontrado");
  if (!row.transaction_nsu && !row.invoice_slug) {
    return json(env, request, { ok: true, order: rowToOrder(row), note: "sem dados de transação ainda" });
  }
  const r = await confirmPayment(env, nsu, row.transaction_nsu, row.invoice_slug, "", "painel");
  return json(env, request, { ok: true, paid: !!r.paid, order: rowToOrder(r.row || row) });
}

async function adminListClients(env, request) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) AS pedidos
     FROM clients c ORDER BY c.nome COLLATE NOCASE LIMIT 2000`
  ).all();
  return json(env, request, { ok: true, clients: results });
}

async function adminPatchClient(env, request, id) {
  const row = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "cliente não encontrado");
  const body = await readJson(request, 4096);
  const nome = body.nome != null ? str(body.nome, 120) : row.nome;
  const telefone = body.telefone != null ? digits(body.telefone, 15) : row.telefone;
  const email = body.email != null ? str(body.email, 160).toLowerCase() : row.email;
  const notes = body.notes != null ? str(body.notes, 1500) : row.notes;
  await env.DB.prepare("UPDATE clients SET nome = ?, telefone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?")
    .bind(nome, telefone, email, notes, nowIso(), id)
    .run();
  const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
  return json(env, request, { ok: true, client });
}

async function adminDeleteClient(env, request, id) {
  const res = await env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(id).run();
  if (!res.meta || !res.meta.changes) throw new HttpError(404, "cliente não encontrado");
  await env.DB.prepare("UPDATE orders SET client_id = NULL WHERE client_id = ?").bind(id).run();
  return json(env, request, { ok: true, deleted: id });
}

/* Importa pedidos antigos do localStorage de um aparelho (botão manual no painel). */
async function adminImport(env, request) {
  const body = await readJson(request, 512 * 1024);
  const list = Array.isArray(body.orders) ? body.orders.slice(0, 500) : [];
  let imported = 0;
  let skipped = 0;
  for (const o of list) {
    const legacyId = str(o && (o.orderNsu || o.id), 60);
    if (!legacyId) {
      skipped++;
      continue;
    }
    const nsu = NSU_RE.test(legacyId) ? legacyId : "JA-LOCAL-" + legacyId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
    const exists = await getOrderRow(env, nsu);
    if (exists) {
      skipped++;
      continue;
    }
    let items = [];
    try {
      items = cleanItems(o.items || []);
    } catch (e) {
      items = [];
    }
    const subtotal = items.reduce((s, it) => s + Math.round(it.price * 100) * it.quantity, 0);
    const taxa = toCents(o.taxa != null ? o.taxa : o.frete) || 0;
    const method = METHODS.includes(o.paymentMethod) ? o.paymentMethod : "whatsapp";
    const status = ORDER_STATUSES.includes(o.status) ? o.status : "solicitado";
    const pay = PAYMENT_STATUSES.includes(o.paymentStatus) ? o.paymentStatus : method === "whatsapp" ? "a_combinar" : "pendente";
    const created = str(o.createdAt, 40) || nowIso();
    const clientId = await upsertClient(env, str(o.clientName, 120), o.clientPhone, o.clientEmail);
    await env.DB.prepare(
      `INSERT INTO orders (nsu, token_hash, created_at, updated_at, method, status, payment_status, client_id, client_name,
        client_phone, client_email, modalidade, address, desired_date, notes, items_json, subtotal_cents, taxa_cents,
        total_cents, price_note, history_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        nsu,
        await sha256(randomToken(18)),
        created,
        nowIso(),
        method,
        status,
        pay,
        clientId,
        str(o.clientName, 120),
        digits(o.clientPhone, 15),
        str(o.clientEmail, 160),
        o.modalidade === "entrega" ? "entrega" : "retirada",
        str(o.address, 300),
        /^\d{4}-\d{2}-\d{2}$/.test(String(o.desiredDate || "")) ? o.desiredDate : "",
        str(o.notes, 1500),
        JSON.stringify(items),
        subtotal,
        taxa,
        subtotal + taxa,
        "importado de aparelho",
        JSON.stringify([{ at: nowIso(), event: "importado do aparelho", legacyId }])
      )
      .run();
    imported++;
  }
  return json(env, request, { ok: true, imported, skipped });
}

async function adminWebhookLog(env, request) {
  const { results } = await env.DB.prepare(
    "SELECT id, received_at, order_nsu, transaction_nsu, slug, verified, result FROM webhook_events ORDER BY id DESC LIMIT 100"
  ).all();
  return json(env, request, { ok: true, events: results });
}

/* ---------------- editor do site (commits no GitHub) ----------------
   O painel envia o JSON completo de cada arquivo alterado + fotos já reduzidas no navegador.
   O Worker confere a sessão, valida tudo e grava UM commit no branch publicado pelo GitHub Pages.
   Segredo: GITHUB_TOKEN (token fine-grained só deste repositório, Contents: read/write; Pages: read opcional). */

const CONTENT_READ = [
  "data/products.json",
  "data/areas.json",
  "data/categories.json",
  "data/carousel.json",
  "data/site.json",
  "data/pausa.json",
  "data/sobre.json",
  "data/sabores-bolos.json",
];
const CONTENT_WRITE = CONTENT_READ.filter((p) => p !== "data/categories.json");
const IMAGE_PATH_RE = /^assets\/(products\/[a-z0-9][a-z0-9-]{0,99}|carousel|areas|sobre)\/[a-z0-9][a-z0-9-]{0,119}\.(webp|jpg)$/;
const ASSET_RE = /^assets\/[A-Za-z0-9._\/-]{1,200}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CONTENT_BODY = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1600 * 1024;
const MAX_IMAGES = 16;
const COMMIT_PREFIX = "Editor: ";

function ghConfig(env) {
  return {
    token: String(env.GITHUB_TOKEN || "").trim(),
    repo: String(env.GITHUB_REPO || "AlexandreRangel/site-Confeitaria").trim(),
    branch: String(env.GITHUB_BRANCH || "preview").trim(),
    api: String(env.GITHUB_API || "https://api.github.com").replace(/\/+$/, ""),
  };
}

function contentConfigured(env) {
  const cfg = ghConfig(env);
  return !!(cfg.token && /^[\w.-]+\/[\w.-]+$/.test(cfg.repo) && cfg.branch);
}

async function gh(env, method, path, body) {
  const cfg = ghConfig(env);
  const headers = {
    Authorization: "Bearer " + cfg.token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "jana-pedidos-editor",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(cfg.api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new HttpError(502, "GitHub fora do ar agora; tente de novo em instantes");
  }
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function ghFail(r, what) {
  if (r.status === 401) return new HttpError(503, "a chave do GitHub está inválida ou venceu");
  if (r.status === 403 || r.status === 404) return new HttpError(503, "a chave do GitHub não tem permissão para " + what);
  return new HttpError(502, "o GitHub recusou " + what + " (" + r.status + ")");
}

async function ghOk(env, method, path, body, what) {
  const r = await gh(env, method, path, body);
  if (!r.ok) throw ghFail(r, what);
  return r.data;
}

function repoPath(env) {
  const cfg = ghConfig(env);
  return "/repos/" + cfg.repo;
}

async function headState(env) {
  const cfg = ghConfig(env);
  const base = repoPath(env);
  const ref = await ghOk(env, "GET", base + "/git/ref/heads/" + encodeURIComponent(cfg.branch), undefined, "ler o site");
  const commitSha = ref.object.sha;
  const commit = await ghOk(env, "GET", base + "/git/commits/" + commitSha, undefined, "ler o site");
  const tree = await ghOk(env, "GET", base + "/git/trees/" + commit.tree.sha, undefined, "ler o site");
  const dataEntry = (tree.tree || []).find((e) => e.path === "data" && e.type === "tree");
  const shas = {};
  if (dataEntry) {
    const dataTree = await ghOk(env, "GET", base + "/git/trees/" + dataEntry.sha, undefined, "ler o site");
    for (const e of dataTree.tree || []) if (e.type === "blob") shas["data/" + e.path] = e.sha;
  }
  return { commitSha, treeSha: commit.tree.sha, shas };
}

function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function readBlobText(env, sha) {
  const blob = await ghOk(env, "GET", repoPath(env) + "/git/blobs/" + sha, undefined, "ler o site");
  return new TextDecoder().decode(b64ToBytes(String(blob.content || "").replace(/\s+/g, "")));
}

async function gitBlobSha(bytes) {
  const head = new TextEncoder().encode("blob " + bytes.length + "\0");
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head, 0);
  all.set(bytes, head.length);
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", all));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---- validação: nada que quebre a vitrine passa daqui ---- */

function bad(message) {
  throw new HttpError(400, message);
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function optText(v, max, label) {
  if (v == null) return;
  if (typeof v !== "string") bad(label + ": precisa ser texto");
  if (v.length > max) bad(label + ": texto longo demais (máximo " + max + " letras)");
}

function reqText(v, max, label) {
  if (typeof v !== "string" || !v.trim()) bad(label + ": não pode ficar vazio");
  optText(v, max, label);
}

function assetOk(v, label, allowEmpty) {
  if ((v == null || v === "") && allowEmpty) return;
  if (typeof v !== "string" || (!ASSET_RE.test(v) && !/^https:\/\/[^\s"'<>]{4,300}$/.test(v)) || v.includes("..")) {
    bad(label + ": imagem inválida");
  }
}

function dateOk(v, label) {
  if (v == null || v === "") return;
  if (typeof v !== "string" || !YMD_RE.test(v) || isNaN(Date.parse(v + "T12:00:00Z"))) bad(label + ": data inválida");
}

function linkOk(v, label) {
  if (v == null || v === "") return;
  if (typeof v !== "string" || v.length > 400) bad(label + ": link inválido");
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return;
  if (/^\/?[a-z0-9][a-z0-9\/?=&#._%-]*$/i.test(v)) return;
  bad(label + ": use um link começando com https:// ou um endereço do site");
}

function validateProducts(list) {
  if (!Array.isArray(list) || list.length > 1500) bad("lista de produtos inválida");
  const ids = new Set();
  const slugs = new Set();
  list.forEach((p, i) => {
    if (!isObj(p)) bad("produto " + (i + 1) + " inválido");
    const label = "Produto «" + String(p.name || i + 1).slice(0, 60) + "»";
    if (!ID_RE.test(String(p.id || ""))) bad(label + ": código interno inválido");
    if (!ID_RE.test(String(p.slug || ""))) bad(label + ": endereço da página inválido");
    if (ids.has(p.id)) bad(label + ": código repetido");
    if (slugs.has(p.slug)) bad(label + ": já existe outro produto com o mesmo endereço");
    ids.add(p.id);
    slugs.add(p.slug);
    reqText(p.name, 160, label + " (nome)");
    if (typeof p.price !== "number" || !Number.isFinite(p.price) || p.price < 0 || p.price > 100000) bad(label + ": preço inválido");
    optText(p.description, 8000, label + " (descrição)");
    if (!Array.isArray(p.images) || !p.images.length || p.images.length > 12) bad(label + ": precisa de 1 a 12 fotos");
    p.images.forEach((src) => assetOk(src, label + " (foto)"));
    if (p.imagesAlt != null) {
      if (!Array.isArray(p.imagesAlt) || p.imagesAlt.length > 12) bad(label + ": descrições das fotos inválidas");
      p.imagesAlt.forEach((a) => optText(a, 200, label + " (descrição da foto)"));
    }
    if (p.categoryIds != null) {
      if (!Array.isArray(p.categoryIds) || p.categoryIds.length > 20) bad(label + ": categorias inválidas");
      p.categoryIds.forEach((c) => {
        if (!ID_RE.test(String(c))) bad(label + ": categoria inválida");
      });
    }
    if (p.categoryId != null && !ID_RE.test(String(p.categoryId))) bad(label + ": categoria inválida");
    if (p.active != null && typeof p.active !== "boolean") bad(label + ": campo «mostrar no site» inválido");
    if (p.tags != null && (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== "string" || t.length > 80))) {
      bad(label + ": palavras-chave inválidas");
    }
  });
}

function validateCarousel(list) {
  if (!Array.isArray(list) || list.length > 80) bad("lista de banners inválida");
  const ids = new Set();
  list.forEach((s, i) => {
    if (!isObj(s)) bad("banner " + (i + 1) + " inválido");
    const label = "Banner " + (i + 1);
    if (!ID_RE.test(String(s.id || "")) || ids.has(s.id)) bad(label + ": código inválido");
    ids.add(s.id);
    assetOk(s.image, label + " (imagem do computador)");
    assetOk(s.imageMobile, label + " (imagem do celular)", true);
    optText(s.title, 200, label + " (descrição)");
    if (s.pagina != null && !ID_RE.test(String(s.pagina))) bad(label + ": página inválida");
    if (s.linkTipo != null && !["produto", "categoria", "url", "nenhum"].includes(s.linkTipo)) bad(label + ": tipo de link inválido");
    if (s.productSlug != null && s.productSlug !== "" && !ID_RE.test(String(s.productSlug))) bad(label + ": produto inválido");
    if (s.linkCategory != null && s.linkCategory !== "" && !ID_RE.test(String(s.linkCategory))) bad(label + ": categoria inválida");
    if (s.linkTipo === "url" && !s.url) bad(label + ": falta o link");
    linkOk(s.url, label);
    if (s.order != null && !Number.isFinite(s.order)) bad(label + ": ordem inválida");
  });
}

function validateAreas(list) {
  if (!Array.isArray(list) || !list.length || list.length > 30) bad("lista de categorias inválida");
  const ids = new Set();
  list.forEach((a, i) => {
    if (!isObj(a)) bad("categoria " + (i + 1) + " inválida");
    const label = "Categoria «" + String(a.name || i + 1).slice(0, 40) + "»";
    if (!ID_RE.test(String(a.id || "")) || ids.has(a.id)) bad(label + ": código inválido");
    ids.add(a.id);
    if (!ID_RE.test(String(a.slug || ""))) bad(label + ": endereço inválido");
    reqText(a.name, 80, label + " (nome)");
    optText(a.description, 800, label + " (descrição)");
    assetOk(a.image, label + " (foto)");
    if (!Array.isArray(a.sourceCategoryIds) || a.sourceCategoryIds.some((c) => !ID_RE.test(String(c)))) bad(label + ": vínculo inválido");
    if (a.ativacao != null) {
      if (!isObj(a.ativacao) || !["desligado", "ligado", "datas"].includes(a.ativacao.modo)) bad(label + ": ligar/desligar inválido");
      dateOk(a.ativacao.inicio, label + " (início)");
      dateOk(a.ativacao.fim, label + " (fim)");
      if (a.ativacao.modo === "datas") {
        if (!a.ativacao.inicio || !a.ativacao.fim) bad(label + ": escolha a data de início e a de fim");
        if (a.ativacao.inicio > a.ativacao.fim) bad(label + ": a data de fim vem antes do início");
      }
    }
  });
}

function validatePausa(p) {
  if (!isObj(p)) bad("pausa inválida");
  if (typeof p.ativo !== "boolean") bad("pausa: ligado/desligado inválido");
  dateOk(p.inicio, "pausa (início)");
  dateOk(p.fim, "pausa (fim)");
  if (p.inicio && p.fim && p.inicio > p.fim) bad("pausa: a data de fim vem antes do início");
  optText(p.mensagem, 300, "pausa (recado)");
  if (!Array.isArray(p.periodos) || p.periodos.length > 40) bad("pausa: períodos inválidos");
  p.periodos.forEach((x) => {
    if (!isObj(x)) bad("pausa: período inválido");
    dateOk(x.inicio, "pausa programada (início)");
    dateOk(x.fim, "pausa programada (fim)");
    if (!x.inicio && !x.fim) bad("pausa programada: escolha as datas");
    if (x.inicio && x.fim && x.inicio > x.fim) bad("pausa programada: a data de fim vem antes do início");
    optText(x.mensagem, 300, "pausa programada (recado)");
  });
  if (typeof p.fimDeSemana !== "boolean") bad("pausa: fim de semana inválido");
  if (p.planilhaCsv && !/^https:\/\/[^\s"'<>]+$/.test(String(p.planilhaCsv))) bad("pausa: link da planilha inválido");
}

function validateSite(s) {
  if (!isObj(s)) bad("textos do site inválidos");
  reqText(s.brandName, 80, "Nome da loja");
  optText(s.slogan, 160, "Slogan");
  optText(s.tagline, 160, "Slogan");
  if (!isObj(s.contato)) bad("contato inválido");
  if (!/^55\d{10,11}$/.test(String(s.contato.whatsapp || ""))) bad("WhatsApp: use 55 + DDD + número, só dígitos");
  optText(s.contato.whatsappLabel, 40, "WhatsApp (como aparece)");
  if (!isObj(s.contato.instagram)) bad("Instagram inválido");
  optText(s.contato.instagram.handle, 60, "Instagram");
  if (!/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,60}\/?$/.test(String(s.contato.instagram.url || ""))) bad("Instagram: link inválido");
  if (!isObj(s.address)) bad("endereço inválido");
  ["street", "neighborhood", "city", "state", "note"].forEach((k) => optText(s.address[k], 160, "Endereço"));
  ["copyright", "hours"].forEach((k) => optText(s[k], 200, "Texto do rodapé"));
  ["paymentsNote", "requestDisclaimer", "privacyNote", "heroVisitTitle", "heroVisitSubtitle"].forEach((k) => optText(s[k], 800, "Texto"));
  if (!isObj(s.entrega)) bad("entrega inválida");
  if (s.entrega.taxa !== null && (typeof s.entrega.taxa !== "number" || !Number.isFinite(s.entrega.taxa) || s.entrega.taxa < 0 || s.entrega.taxa > 2000)) {
    bad("Taxa de entrega inválida");
  }
  if (s.instagramGallery != null) {
    if (!Array.isArray(s.instagramGallery) || s.instagramGallery.length > 24) bad("fotos do Instagram inválidas");
    s.instagramGallery.forEach((src) => assetOk(src, "Foto do Instagram"));
  }
}

function validateSobre(s) {
  if (!isObj(s)) bad("Sobre nós inválido");
  optText(s.headline, 200, "Sobre nós (título)");
  optText(s.lead, 2000, "Sobre nós (abertura)");
  if (s.portrait != null) {
    if (!isObj(s.portrait)) bad("Sobre nós: foto inválida");
    assetOk(s.portrait.src, "Sobre nós (foto)", true);
    optText(s.portrait.alt, 200, "Sobre nós (descrição da foto)");
  }
  if (!Array.isArray(s.story || []) || (s.story || []).length > 30) bad("Sobre nós: história inválida");
  (s.story || []).forEach((t) => optText(t, 4000, "Sobre nós (história)"));
  if (!Array.isArray(s.workGallery || []) || (s.workGallery || []).length > 40) bad("Sobre nós: galeria inválida");
  (s.workGallery || []).forEach((w) => {
    if (!isObj(w)) bad("Sobre nós: foto da galeria inválida");
    assetOk(w.src, "Sobre nós (galeria)");
    optText(w.alt, 200, "Sobre nós (descrição da foto)");
    if (w.productSlug && !ID_RE.test(String(w.productSlug))) bad("Sobre nós: produto inválido");
  });
  if (!Array.isArray(s.press || []) || (s.press || []).length > 40) bad("Sobre nós: imprensa inválida");
  (s.press || []).forEach((x) => {
    if (!isObj(x)) bad("Sobre nós: item de imprensa inválido");
    optText(x.title, 200, "Imprensa (título)");
    optText(x.outlet, 120, "Imprensa (veículo)");
    if (x.url && !/^https:\/\/[^\s"'<>]+$/.test(String(x.url))) bad("Imprensa: o link precisa começar com https://");
  });
}

function validateSabores(s) {
  if (!isObj(s)) bad("recheios inválidos");
  optText(s.label, 80, "Recheios (título)");
  if (!Array.isArray(s.flavors) || s.flavors.length > 80) bad("lista de recheios inválida");
  s.flavors.forEach((f) => {
    if (!isObj(f)) bad("recheio inválido");
    reqText(f.nome, 80, "Recheio (nome)");
    optText(f.descricao, 300, "Recheio (descrição)");
  });
}

const VALIDATORS = {
  "data/products.json": validateProducts,
  "data/carousel.json": validateCarousel,
  "data/areas.json": validateAreas,
  "data/pausa.json": validatePausa,
  "data/site.json": validateSite,
  "data/sobre.json": validateSobre,
  "data/sabores-bolos.json": validateSabores,
};

function imageKind(bytes) {
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return "";
}

/* ---- rotas ---- */

async function adminContentGet(env, request) {
  const cfg = ghConfig(env);
  if (!contentConfigured(env)) {
    return json(env, request, { ok: true, configurado: false, motivo: "falta_token", branch: cfg.branch });
  }
  const head = await headState(env);
  const arquivos = {};
  await Promise.all(
    CONTENT_READ.map(async (path) => {
      const sha = head.shas[path] || null;
      if (!sha) {
        arquivos[path] = { sha: null, data: null };
        return;
      }
      const text = await readBlobText(env, sha);
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }
      arquivos[path] = { sha, data };
    })
  );
  return json(env, request, { ok: true, configurado: true, head: head.commitSha, branch: cfg.branch, arquivos });
}

async function adminContentPublish(env, request) {
  if (!contentConfigured(env)) throw new HttpError(503, "falta configurar a publicação (chave do GitHub)");
  const body = await readJson(request, MAX_CONTENT_BODY);
  const arquivos = isObj(body.arquivos) ? body.arquivos : {};
  const bases = isObj(body.bases) ? body.bases : {};
  const paths = Object.keys(arquivos);
  for (const p of paths) {
    if (!CONTENT_WRITE.includes(p)) bad("arquivo não permitido: " + p);
    VALIDATORS[p](arquivos[p]);
  }
  const rawImages = Array.isArray(body.imagens) ? body.imagens : [];
  if (rawImages.length > MAX_IMAGES) bad("fotos demais de uma vez (máximo " + MAX_IMAGES + ")");
  const images = rawImages.map((img) => {
    const path = String((img && img.path) || "");
    if (!IMAGE_PATH_RE.test(path)) bad("nome de foto inválido");
    let bytes;
    try {
      bytes = b64ToBytes(String(img.base64 || ""));
    } catch (e) {
      bad("foto corrompida");
    }
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) bad("foto grande demais (máximo 1,6 MB depois de reduzida)");
    const kind = imageKind(bytes);
    if (!kind || !path.endsWith("." + kind)) bad("a foto precisa ser WebP ou JPG");
    return { path, b64: bytesToB64(bytes) };
  });
  if (!paths.length && !images.length) bad("nada para salvar");
  const resumo = str(body.resumo, 140).replace(/\s+/g, " ") || "alterações no site";
  const base = repoPath(env);
  const cfg = ghConfig(env);

  const imageShas = [];
  for (const img of images) {
    const blob = await ghOk(env, "POST", base + "/git/blobs", { content: img.b64, encoding: "base64" }, "gravar as fotos");
    imageShas.push({ path: img.path, sha: blob.sha });
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await headState(env);
    const conflitos = paths.filter((p) => (bases[p] || null) !== (head.shas[p] || null));
    if (conflitos.length) {
      return json(
        env,
        request,
        { ok: false, error: "conflito", mensagem: "Outra alteração foi salva antes desta. Recarregue para ver a versão mais nova.", arquivos: conflitos },
        409
      );
    }
    const texts = {};
    for (const p of paths) {
      let data = arquivos[p];
      if (p === "data/site.json" && head.shas[p]) {
        // o editor não mexe na ligação com o Worker de pedidos
        const current = JSON.parse(await readBlobText(env, head.shas[p]));
        data = Object.assign({}, data, { central: current.central, colors: current.colors });
      }
      texts[p] = JSON.stringify(data, null, 2) + "\n";
    }
    const tree = paths
      .map((p) => ({ path: p, mode: "100644", type: "blob", content: texts[p] }))
      .concat(imageShas.map((i) => ({ path: i.path, mode: "100644", type: "blob", sha: i.sha })));
    const newTree = await ghOk(env, "POST", base + "/git/trees", { base_tree: head.treeSha, tree }, "gravar as alterações");
    const commit = await ghOk(
      env,
      "POST",
      base + "/git/commits",
      { message: COMMIT_PREFIX + resumo, tree: newTree.sha, parents: [head.commitSha] },
      "gravar as alterações"
    );
    const upd = await gh(env, "PATCH", base + "/git/refs/heads/" + encodeURIComponent(cfg.branch), { sha: commit.sha, force: false });
    if (!upd.ok) {
      if ((upd.status === 422 || upd.status === 409) && attempt === 0) continue; // alguém publicou no meio; tenta de novo
      throw ghFail(upd, "publicar");
    }
    const shas = {};
    for (const p of paths) shas[p] = await gitBlobSha(new TextEncoder().encode(texts[p]));
    catalogCache = null;
    return json(env, request, { ok: true, commit: commit.sha, shas, imagens: imageShas.map((i) => i.path) });
  }
  throw new HttpError(409, "o site mudou enquanto salvava; tente de novo");
}

async function adminContentHistory(env, request) {
  if (!contentConfigured(env)) return json(env, request, { ok: true, configurado: false, alteracoes: [] });
  const cfg = ghConfig(env);
  const list = await ghOk(
    env,
    "GET",
    repoPath(env) + "/commits?sha=" + encodeURIComponent(cfg.branch) + "&per_page=40",
    undefined,
    "ler o histórico"
  );
  const alteracoes = (Array.isArray(list) ? list : [])
    .filter((c) => c && c.commit && String(c.commit.message || "").startsWith(COMMIT_PREFIX))
    .slice(0, 25)
    .map((c) => ({
      sha: c.sha,
      resumo: String(c.commit.message).slice(COMMIT_PREFIX.length).split("\n")[0],
      data: (c.commit.committer && c.commit.committer.date) || (c.commit.author && c.commit.author.date) || "",
    }));
  return json(env, request, { ok: true, configurado: true, alteracoes });
}

async function adminContentUndo(env, request) {
  if (!contentConfigured(env)) throw new HttpError(503, "falta configurar a publicação (chave do GitHub)");
  const body = await readJson(request, 2048);
  const sha = String(body.sha || "");
  if (!/^[0-9a-f]{40}$/.test(sha)) bad("alteração inválida");
  const base = repoPath(env);
  const cfg = ghConfig(env);
  const c = await ghOk(env, "GET", base + "/commits/" + sha, undefined, "ler o histórico");
  const message = String((c.commit && c.commit.message) || "");
  if (!message.startsWith(COMMIT_PREFIX)) bad("só dá para desfazer alterações feitas pelo editor");
  if (!Array.isArray(c.parents) || c.parents.length !== 1) bad("esta alteração não pode ser desfeita aqui");
  const parent = c.parents[0].sha;
  const files = Array.isArray(c.files) ? c.files : [];
  const head = await headState(env);
  const cmp = await ghOk(env, "GET", base + "/compare/" + sha + "..." + head.commitSha, undefined, "ler o histórico");
  if (!["ahead", "identical"].includes(cmp.status)) bad("esta alteração não está mais no site");
  const tree = [];
  for (const f of files) {
    const p = String(f.filename || "");
    if (CONTENT_WRITE.includes(p)) {
      if ((head.shas[p] || null) !== (f.status === "removed" ? null : f.sha)) {
        return json(
          env,
          request,
          { ok: false, error: "conflito", mensagem: "Depois desta houve outra alteração nos mesmos dados. Desfaça primeiro a mais recente." },
          409
        );
      }
      if (f.status === "added") {
        tree.push({ path: p, mode: "100644", type: "blob", sha: null });
      } else {
        const old = await ghOk(env, "GET", base + "/contents/" + p + "?ref=" + parent, undefined, "ler o histórico");
        tree.push({ path: p, mode: "100644", type: "blob", sha: old.sha });
      }
    } else if (IMAGE_PATH_RE.test(p)) {
      if (f.status === "added") tree.push({ path: p, mode: "100644", type: "blob", sha: null });
    } else {
      bad("esta alteração mexeu em arquivos que o editor não controla");
    }
  }
  if (!tree.length) bad("nada para desfazer");
  const newTree = await ghOk(env, "POST", base + "/git/trees", { base_tree: head.treeSha, tree }, "desfazer");
  const resumo = message.slice(COMMIT_PREFIX.length).split("\n")[0];
  const commit = await ghOk(
    env,
    "POST",
    base + "/git/commits",
    { message: COMMIT_PREFIX + "desfeito — " + resumo, tree: newTree.sha, parents: [head.commitSha] },
    "desfazer"
  );
  const upd = await gh(env, "PATCH", base + "/git/refs/heads/" + encodeURIComponent(cfg.branch), { sha: commit.sha, force: false });
  if (!upd.ok) throw upd.status === 422 ? new HttpError(409, "o site mudou agora mesmo; tente de novo") : ghFail(upd, "desfazer");
  catalogCache = null;
  return json(env, request, { ok: true, commit: commit.sha });
}

async function adminContentPublication(env, request, url) {
  const commit = String(url.searchParams.get("commit") || "");
  if (!contentConfigured(env)) return json(env, request, { ok: true, estado: "desconhecido" });
  const r = await gh(env, "GET", repoPath(env) + "/pages/builds/latest");
  if (!r.ok || !r.data) return json(env, request, { ok: true, estado: "desconhecido" });
  const build = r.data;
  let estado = "publicando";
  if (build.commit === commit) {
    estado = build.status === "built" ? "no_ar" : build.status === "errored" ? "erro" : "publicando";
  }
  return json(env, request, { ok: true, estado, build: { status: build.status, commit: build.commit } });
}

/* ---------------- roteador ---------------- */

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  const origin = request.headers.get("Origin");

  if (method === "OPTIONS") {
    return new Response(null, { status: originAllowed(env, origin) ? 204 : 403, headers: corsHeaders(env, request) });
  }

  if (path === "/" && method === "GET") {
    return json(env, request, { ok: true, service: "jana-pedidos" });
  }

  if (path === "/webhook/infinitepay" && method === "POST") {
    return webhook(env, request, ctx);
  }

  // Demais POST/PATCH/DELETE só de origens do site (navegador). Requisições sem Origin
  // (curl/servidor) só nas rotas admin, que exigem token.
  if (method !== "GET" && origin && !originAllowed(env, origin)) {
    throw new HttpError(403, "origem não permitida");
  }

  if (path === "/pedidos" && method === "POST") {
    if (!originAllowed(env, origin)) throw new HttpError(403, "origem não permitida");
    return createOrder(env, request);
  }

  let m = path.match(/^\/pedidos\/([A-Z0-9-]{6,40})\/status$/);
  if (m && method === "GET") return orderStatus(env, request, m[1], url);

  m = path.match(/^\/pedidos\/([A-Z0-9-]{6,40})\/pix-pago$/);
  if (m && method === "POST") {
    if (!originAllowed(env, origin)) throw new HttpError(403, "origem não permitida");
    return declarePix(env, request, m[1]);
  }

  if (path === "/admin/login" && method === "POST") return adminLogin(env, request);

  if (path.startsWith("/admin/")) {
    await requireAdmin(env, request);
    if (path === "/admin/sessao" && method === "GET") return json(env, request, { ok: true });
    if (path === "/admin/pedidos" && method === "GET") return adminListOrders(env, request, url);
    if (path === "/admin/importar" && method === "POST") return adminImport(env, request);
    if (path === "/admin/webhooks" && method === "GET") return adminWebhookLog(env, request);
    if (path === "/admin/clientes" && method === "GET") return adminListClients(env, request);
    if (path === "/admin/conteudo" && method === "GET") return adminContentGet(env, request);
    if (path === "/admin/conteudo/publicar" && method === "POST") return adminContentPublish(env, request);
    if (path === "/admin/conteudo/historico" && method === "GET") return adminContentHistory(env, request);
    if (path === "/admin/conteudo/desfazer" && method === "POST") return adminContentUndo(env, request);
    if (path === "/admin/conteudo/publicacao" && method === "GET") return adminContentPublication(env, request, url);
    m = path.match(/^\/admin\/pedidos\/([A-Za-z0-9-]{4,60})$/);
    if (m && method === "PATCH") return adminPatchOrder(env, request, m[1]);
    if (m && method === "DELETE") return adminDeleteOrder(env, request, m[1]);
    m = path.match(/^\/admin\/pedidos\/([A-Za-z0-9-]{4,60})\/verificar$/);
    if (m && method === "POST") return adminVerify(env, request, m[1]);
    m = path.match(/^\/admin\/clientes\/([A-Za-z0-9_-]{4,60})$/);
    if (m && method === "PATCH") return adminPatchClient(env, request, m[1]);
    if (m && method === "DELETE") return adminDeleteClient(env, request, m[1]);
  }

  throw new HttpError(404, "rota não encontrada");
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error("erro interno", err && err.stack ? err.stack : String(err));
      return json(env, request, { ok: false, error: status === 500 ? "erro interno" : err.message }, status);
    }
  },
};

export const _test = { ipCustomer, resolveTaxa, fixedPrice, cleanItems, generateNsu, NSU_RE, validRedirect, VALIDATORS, gitBlobSha, imageKind };
