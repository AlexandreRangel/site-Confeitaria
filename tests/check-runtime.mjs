import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function makeStorage() {
  const map = new Map();
  return {
    getItem: function getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem: function setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem: function removeItem(key) {
      map.delete(key);
    },
  };
}

function SandboxURL(url, base) {
  return new globalThis.URL(url, base);
}
SandboxURL.createObjectURL = function createObjectURL() {
  return "blob:test";
};
SandboxURL.revokeObjectURL = function revokeObjectURL() {};

const sandbox = {
  window: {},
  document: {
    body: {
      getAttribute: function getAttribute() {
        return "";
      },
    },
    createElement: function createElement() {
      return { click: function click() {}, remove: function remove() {} };
    },
  },
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  location: {
    href: "http://127.0.0.1:8765/",
    origin: "http://127.0.0.1:8765",
    pathname: "/",
    hostname: "127.0.0.1",
    search: "",
    hash: "",
  },
  Intl: Intl,
  Date: Date,
  URL: SandboxURL,
  Blob: function Blob(parts) {
    this.parts = parts;
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.runInNewContext(
  readFileSync(join(root, "js/utils.js"), "utf8") +
    readFileSync(join(root, "js/cart.js"), "utf8") +
    readFileSync(join(root, "js/store.js"), "utf8") +
    readFileSync(join(root, "js/pix.js"), "utf8") +
    readFileSync(join(root, "js/pagamento.js"), "utf8") +
    readFileSync(join(root, "js/pausa.js"), "utf8"),
  sandbox
);

const Jana = sandbox.Jana;

function assertRedirect(label, attr, loc, expected) {
  sandbox.document.body.getAttribute = function getAttribute(name) {
    return name === "data-root" ? attr : "";
  };
  sandbox.location = loc;
  const got = Jana.infinitePayRedirectUrl();
  if (got !== expected) {
    errors.push(label + ": expected " + expected + ", got " + got);
  }
}
assertRedirect(
  "InfinitePay redirect at site root",
  "",
  {
    href: "http://127.0.0.1:8765/",
    origin: "http://127.0.0.1:8765",
    pathname: "/",
    hostname: "127.0.0.1",
  },
  "http://127.0.0.1:8765/pagamento/"
);
assertRedirect(
  "InfinitePay redirect under github.io subpath",
  "../",
  {
    href: "http://127.0.0.1:8765/site-Confeitaria/produto/?slug=tabua-signature",
    origin: "http://127.0.0.1:8765",
    pathname: "/site-Confeitaria/produto/",
    hostname: "127.0.0.1",
  },
  "http://127.0.0.1:8765/site-Confeitaria/pagamento/"
);
assertRedirect(
  "InfinitePay redirect on custom domain",
  "",
  {
    href: "https://janaabreuconfeitaria.com.br/",
    origin: "https://janaabreuconfeitaria.com.br",
    pathname: "/",
    hostname: "janaabreuconfeitaria.com.br",
  },
  "https://janaabreuconfeitaria.com.br/pagamento/"
);
sandbox.document.body.getAttribute = function getAttribute() {
  return "";
};
sandbox.location = {
  href: "http://127.0.0.1:8765/",
  origin: "http://127.0.0.1:8765",
  pathname: "/",
  hostname: "127.0.0.1",
  search: "",
  hash: "",
};

const cake = {
  id: "p-bolo-naked-g",
  slug: "bolo-naked-g",
  name: "Bolo Naked G",
  price: 370,
  images: ["assets/products/bolo-naked-g/01.webp"],
};

Jana.Cart.add(cake, 1, { flavor: "Pistache" });
Jana.Cart.add(cake, 1, { flavor: "Maracujá" });
const items = Jana.Cart.items();
if (items.length !== 2) {
  errors.push("cart must keep two lines for the same cake with different fillings, got " + items.length);
}
const pistache = items.find(function find(item) {
  return item.flavor === "Pistache";
});
Jana.Cart.setQty(Jana.Cart.lineIdOf(pistache), 3);
const after = Jana.Cart.items();
const pistacheQty = after.find(function find(item) {
  return item.flavor === "Pistache";
}).quantity;
const maracujaQty = after.find(function find(item) {
  return item.flavor === "Maracujá";
}).quantity;
if (pistacheQty !== 3 || maracujaQty !== 1) {
  errors.push("qty buttons must not mix cake fillings");
}

const csv = Jana.Store.downloadCSV;
const rows = [
  ["nome", "obs"],
  ["Ana", "=CMD|' /C calc'!A0"],
  ["Bia", "+formula"],
];
let csvText = "";
sandbox.Blob = function Blob(parts) {
  csvText = String(parts[0] || "");
};
sandbox.document.createElement = function createElement() {
  return {
    href: "",
    download: "",
    click: function click() {},
    remove: function remove() {},
  };
};
sandbox.document.body.appendChild = function appendChild() {};
Jana.Store.downloadCSV("t.csv", rows);
if (csvText.indexOf("'=CMD") === -1 || csvText.indexOf("'+formula") === -1) {
  errors.push("CSV export must neutralize formula injection, got " + csvText);
}

const order = Jana.Store.saveCheckout({
  nome: "Teste",
  telefone: "61999999999",
  email: "",
  endereco: "",
  data: "2026-11-20",
  observacoes: "",
  modalidade: "retirada",
  items: Jana.Cart.items(),
});
if (!order.items[0].flavor) {
  errors.push("saved order must keep cake filling");
}

const subtotal = Jana.Cart.total();
const pickupResolved = Jana.resolveEntrega({ entrega: { taxa: 40, porRegiao: {} } }, "retirada");
const pickupTotals = Jana.checkoutTotals(subtotal, pickupResolved);
if (pickupResolved.modalidade !== "retirada" || pickupTotals.total !== subtotal || pickupTotals.taxa !== 0) {
  errors.push("retirada must not add a delivery fee");
}
const pickupOrder = Jana.Store.saveCheckout({
  nome: "Retirada",
  telefone: "61999999999",
  endereco: "nao deve ir",
  data: "2026-11-21",
  modalidade: "retirada",
  taxa: 0,
  taxaPendente: false,
  items: Jana.Cart.items(),
});
if (pickupOrder.modalidade !== "retirada" || pickupOrder.taxa !== 0 || pickupOrder.total !== subtotal) {
  errors.push("retirada order must store modalidade and no fee");
}

const deliveryResolved = Jana.resolveEntrega({ entrega: { taxa: 40, porRegiao: {} } }, "entrega");
const deliveryTotals = Jana.checkoutTotals(subtotal, deliveryResolved);
if (deliveryResolved.taxa !== 40 || deliveryTotals.total !== subtotal + 40 || deliveryTotals.taxaPendente) {
  errors.push("entrega with taxa 40 must add R$ 40 to the total");
}
const deliveryOrder = Jana.Store.saveCheckout({
  nome: "Entrega",
  telefone: "61999999999",
  endereco: "Asa Norte",
  data: "2026-11-22",
  modalidade: "entrega",
  taxa: 40,
  taxaPendente: false,
  items: Jana.Cart.items(),
});
if (
  deliveryOrder.modalidade !== "entrega" ||
  deliveryOrder.taxa !== 40 ||
  deliveryOrder.frete !== 40 ||
  deliveryOrder.total !== subtotal + 40 ||
  deliveryOrder.address !== "Asa Norte"
) {
  errors.push("entrega order must store address and add taxa 40");
}

const pendingResolved = Jana.resolveEntrega({ entrega: { taxa: null, porRegiao: {} } }, "entrega");
const pendingTotals = Jana.checkoutTotals(subtotal, pendingResolved);
if (!pendingResolved.taxaPendente || pendingTotals.taxaLabel.indexOf("a confirmar pela Jana") === -1) {
  errors.push("entrega with taxa null must stay pending for Jana to confirm");
}
if (pendingTotals.totalLabel.indexOf("taxa a confirmar") === -1) {
  errors.push("pending delivery total must say subtotal + taxa a confirmar");
}
const pendingOrder = Jana.Store.saveCheckout({
  nome: "Entrega pendente",
  telefone: "61999999999",
  endereco: "Lago Sul",
  data: "2026-11-23",
  modalidade: "entrega",
  taxa: 0,
  taxaPendente: true,
  items: Jana.Cart.items(),
});
if (pendingOrder.taxaPendente !== true || pendingOrder.taxa !== null || pendingOrder.total !== subtotal) {
  errors.push("pending delivery order must keep taxa a confirmar");
}

const failingStorage = makeStorage();
failingStorage.setItem = function setItem() {
  throw new Error("QuotaExceededError");
};
sandbox.localStorage = failingStorage;
Jana.Cart.clear();
Jana.Cart.add(cake, 1, { flavor: "Ninho com Nutella" });
if (!Jana.Cart.items().length) {
  errors.push("cart must keep items in memory when localStorage fails");
}

if (Jana.crc16ccitt("123456789") !== "29B1") {
  errors.push("CRC16-CCITT of 123456789 must be 29B1, got " + Jana.crc16ccitt("123456789"));
}
const pixTest = {
  chave: "teste@exemplo.com",
  nome: "Jana Abreu Confeitaria",
  cidade: "Brasília",
  valor: 12.34,
  txid: "PED-1101",
};
const expectedPix =
  "00020126390014br.gov.bcb.pix0117teste@exemplo.com520400005303986540512.345802BR5922JANA ABREU CONFEITARIA6008BRASILIA62110507PED110163043C18";
const actualPix = Jana.buildPixPayload(pixTest);
if (actualPix !== expectedPix) {
  errors.push("Pix payload mismatch\n expected " + expectedPix + "\n      got " + actualPix);
}
if (actualPix.slice(-4) !== Jana.crc16ccitt(actualPix.slice(0, -4))) {
  errors.push("Pix CRC16 does not validate the generated payload");
}
if (Jana.pixIsReady({ enabled: false, chave: "teste@exemplo.com", nome: "Jana", cidade: "Brasilia" })) {
  errors.push("Pix must stay off while enabled is false");
}
if (Jana.pixIsReady({ enabled: true, chave: "", nome: "Jana", cidade: "Brasilia" })) {
  errors.push("Pix must stay off when chave is empty");
}
if (!Jana.pixIsReady({ enabled: true, chave: "teste@exemplo.com", nome: "Jana", cidade: "Brasilia" })) {
  errors.push("Pix should be ready when enabled and the three fields are filled");
}

if (Jana.infinitePayHandle({ infinitepay: { handle: " $MinhaTag " } }) !== "MinhaTag") {
  errors.push("InfinitePay handle must strip $ and trim, got " + Jana.infinitePayHandle({ infinitepay: { handle: " $MinhaTag " } }));
}
if (Jana.infinitePayIsReady({ infinitepay: { enabled: false, handle: "loja" } })) {
  errors.push("InfinitePay must stay off while enabled is false");
}
if (Jana.infinitePayIsReady({ infinitepay: { enabled: true, handle: "" } })) {
  errors.push("InfinitePay must stay off when handle is empty");
}
if (!Jana.infinitePayIsReady({ infinitepay: { enabled: true, handle: "loja" } })) {
  errors.push("InfinitePay should be ready when enabled and handle are set");
}
if (Jana.toCents(40) !== 4000 || Jana.toCents(467) !== 46700) {
  errors.push("toCents must convert reais to centavos");
}
const payItems = Jana.infinitePayItems(
  [{ name: "Tábua Signature", quantity: 1, price: 467 }],
  { taxa: 40, taxaPendente: false }
);
if (
  payItems.length !== 2 ||
  payItems[0].price !== 46700 ||
  payItems[1].description !== "Taxa de entrega" ||
  payItems[1].price !== 4000
) {
  errors.push("InfinitePay items must include delivery fee 4000 cents, got " + JSON.stringify(payItems));
}
const nsu = Jana.generateOrderNsu(new Date("2026-11-10T15:00:00-03:00"));
if (!/^JA-\d{8}-[A-Z0-9]+$/.test(nsu)) {
  errors.push("order_nsu format, got " + nsu);
}
const zeroProduct = { name: "Bolos 3D", price: 0, active: true, slug: "bolos-3d" };
if (Jana.productHasFixedPrice(zeroProduct)) {
  errors.push("price 0 must block online payment");
}
if (
  !Jana.cartHasUnpricedItems([{ price: 0, name: "Bolos 3D" }], [zeroProduct])
) {
  errors.push("cart with unpriced product must block online payment");
}
if (
  Jana.canPayOnline({
    pagamento: { infinitepay: { enabled: false, handle: "loja" } },
    items: [{ price: 10, quantity: 1 }],
    total: 10,
  })
) {
  errors.push("enabled false must keep the WhatsApp flow");
}

sandbox.localStorage = makeStorage();
sandbox.__fetchCalls = [];
sandbox.fetch = async function mockFetch(url, opts) {
  sandbox.__fetchCalls.push({ url: String(url), opts: opts || {} });
  const href = String(url);
  if (href.indexOf("/links") !== -1) {
    return {
      ok: true,
      json: async function json() {
        return { checkout_url: "https://checkout.infinitepay.io/pay/test", slug: "abc" };
      },
    };
  }
  if (href.indexOf("payment_check") !== -1) {
    const body = JSON.parse(opts.body);
    return {
      ok: true,
      json: async function json() {
        return {
          success: true,
          paid: body.order_nsu !== "UNPAID",
          amount: 50700,
          paid_amount: 50700,
          installments: 1,
          capture_method: "pix",
        };
      },
    };
  }
  throw new Error("unexpected fetch " + href);
};
const created = await Jana.createInfinitePayLink({
  handle: "loja",
  order_nsu: "JA-20261110-TEST",
  redirect_url: Jana.INFINITEPAY_REDIRECT_URL,
  items: payItems,
});
if (Jana.infinitePayCheckoutUrl(created) !== "https://checkout.infinitepay.io/pay/test") {
  errors.push("checkout URL should read checkout_url, got " + JSON.stringify(created));
}
const linkCall = sandbox.__fetchCalls[0];
if (!linkCall || /X-Api-Key|inchk_/i.test(JSON.stringify(linkCall.opts.headers || {}))) {
  errors.push("create link must not send an API key");
}
const paidCheck = await Jana.checkInfinitePay({
  handle: "loja",
  order_nsu: "JA-20261110-TEST",
  transaction_nsu: "txn",
  slug: "abc",
});
if (!paidCheck.paid) {
  errors.push("payment_check paid:true should pass");
}
const unpaidCheck = await Jana.checkInfinitePay({
  handle: "loja",
  order_nsu: "UNPAID",
  transaction_nsu: "txn",
  slug: "abc",
});
if (unpaidCheck.paid) {
  errors.push("payment_check paid:false should fail");
}

const payOrder = Jana.Store.saveCheckout({
  nome: "Pago",
  telefone: "61999999999",
  modalidade: "entrega",
  taxa: 40,
  orderNsu: "JA-20261110-ABCD",
  status: "aguardando pagamento",
  paymentStatus: "aguardando pagamento",
  paymentMethod: "infinitepay",
  items: [{ name: "Tábua Signature", quantity: 1, price: 467 }],
});
const foundNsu = Jana.Store.findByOrderNsu("JA-20261110-ABCD");
if (!foundNsu || foundNsu.paymentStatus !== "aguardando pagamento" || foundNsu.orderNsu !== "JA-20261110-ABCD") {
  errors.push("store must keep order_nsu and payment status");
}
void payOrder;

function atSP(iso) {
  return new Date(iso + "T15:00:00-03:00");
}
const off = Jana.evaluatePausa({ ativo: false, inicio: "", fim: "", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2026-12-24"));
if (off.active) {
  errors.push("pausa desligada must not block");
}
const noDates = Jana.evaluatePausa({ ativo: true, inicio: "", fim: "", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2026-12-24"));
if (!noDates.active || noDates.message !== "No momento não estamos aceitando encomendas.") {
  errors.push("ativo sem datas, got " + noDates.message);
}
const onlyEnd = Jana.evaluatePausa({ ativo: true, inicio: "", fim: "2026-01-05", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2026-01-04"));
if (!onlyEnd.active || onlyEnd.message !== "Não estamos aceitando encomendas até 05/01.") {
  errors.push("só fim durante, got " + onlyEnd.message);
}
const onlyEndAfter = Jana.evaluatePausa({ ativo: true, inicio: "", fim: "2026-01-05", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2026-01-06"));
if (onlyEndAfter.active) {
  errors.push("só fim depois do prazo still active");
}
const rangeBefore = Jana.evaluatePausa({ ativo: true, inicio: "2026-12-20", fim: "2027-01-05", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2026-12-19"));
const rangeDuring = Jana.evaluatePausa({ ativo: true, inicio: "2026-12-20", fim: "2027-01-05", mensagem: "Voltamos em breve!", periodos: [], fimDeSemana: false }, atSP("2026-12-24"));
const rangeOnEnd = Jana.evaluatePausa({ ativo: true, inicio: "2026-12-20", fim: "2027-01-05", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2027-01-05"));
const rangeAfter = Jana.evaluatePausa({ ativo: true, inicio: "2026-12-20", fim: "2027-01-05", mensagem: "", periodos: [], fimDeSemana: false }, atSP("2027-01-06"));
if (rangeBefore.active) {
  errors.push("início+fim before should be off");
}
if (!rangeDuring.active || rangeDuring.message !== "Não estamos aceitando encomendas entre 20/12 e 05/01. Voltamos em breve!") {
  errors.push("início+fim during, got " + rangeDuring.message);
}
if (!rangeOnEnd.active) {
  errors.push("inclusive end date should stay paused");
}
if (rangeAfter.active) {
  errors.push("after end date should be off");
}
const scheduled = Jana.evaluatePausa(
  { ativo: false, periodos: [{ inicio: "2026-12-20", fim: "2027-01-05", mensagem: "Férias" }], fimDeSemana: false },
  atSP("2026-12-26")
);
if (!scheduled.active || scheduled.message.indexOf("Férias") === -1) {
  errors.push("scheduled periodo should activate, got " + scheduled.message);
}
const sat = Jana.evaluatePausa({ ativo: false, periodos: [], fimDeSemana: true }, atSP("2026-12-19"));
const sun = Jana.evaluatePausa({ ativo: false, periodos: [], fimDeSemana: true }, atSP("2026-12-20"));
const mon = Jana.evaluatePausa({ ativo: false, periodos: [], fimDeSemana: true }, atSP("2026-12-21"));
if (!sat.active || !sun.active || mon.active) {
  errors.push("weekend pause should cover Saturday-Sunday only");
}
if (sat.message.indexOf("fins de semana") === -1) {
  errors.push("weekend message, got " + sat.message);
}
const csvRows = Jana.parsePausaCsv("ativo,inicio,fim,mensagem\nSIM,2026-12-20,2027-01-05,Voltamos em breve!\nNÃO,2026-07-01,2026-07-15,ignorada\n");
const fromCsv = Jana.mergePausaFromCsv({ ativo: true, fimDeSemana: true, planilhaCsv: "https://example.com/p.csv" }, csvRows);
if (!fromCsv.periodos.length || fromCsv.ativo !== false || fromCsv.fimDeSemana !== true) {
  errors.push("CSV overlay should replace JSON periods and keep weekend flag");
}
const csvEval = Jana.evaluatePausa(fromCsv, atSP("2026-12-24"));
if (!csvEval.active) {
  errors.push("valid CSV period should pause");
}
Jana.resetPausaCache();
const csvOk = await Jana.loadPausaConfig(
  { ativo: false, planilhaCsv: "https://example.com/p.csv", fimDeSemana: false },
  async function okCsv() {
    return {
      ok: true,
      text: async function text() {
        return "ativo,inicio,fim,mensagem\nSIM,2026-12-20,2027-01-05,Planilha\n";
      },
    };
  }
);
if (!Jana.evaluatePausa(csvOk, atSP("2026-12-24")).active) {
  errors.push("loaded CSV should overlay JSON");
}
Jana.resetPausaCache();
const csvFail = await Jana.loadPausaConfig(
  { ativo: true, inicio: "", fim: "", mensagem: "JSON", periodos: [], fimDeSemana: false, planilhaCsv: "https://example.com/fail.csv" },
  async function failCsv() {
    throw new Error("network");
  }
);
if (!csvFail.ativo || Jana.evaluatePausa(csvFail, atSP("2026-12-24")).message.indexOf("JSON") === -1) {
  errors.push("CSV failure must fall back to JSON without blocking");
}

function parsePixEmv(payload) {
  const fields = {};
  const source = String(payload || "");
  let i = 0;
  while (i + 4 <= source.length) {
    const id = source.slice(i, i + 2);
    const len = Number(source.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || len < 0) {
      break;
    }
    const value = source.slice(i + 4, i + 4 + len);
    fields[id] = value;
    i += 4 + len;
    if (id === "63") {
      break;
    }
  }
  return fields;
}

const pixFile = JSON.parse(readFileSync(join(root, "data/pix.json"), "utf8"));
const livePayload = Jana.buildPixPayload({
  chave: pixFile.chave,
  nome: pixFile.nome,
  cidade: pixFile.cidade,
  valor: 123.45,
  txid: "***",
});
const liveFields = parsePixEmv(livePayload);
const liveCrc = Jana.crc16ccitt(livePayload.slice(0, -4));
if (liveFields["00"] !== "01" || liveFields["52"] !== "0000" || liveFields["53"] !== "986" || liveFields["54"] !== "123.45" || liveFields["58"] !== "BR" || liveFields["59"] !== "JANA ABREU" || liveFields["60"] !== "BRASILIA") {
  errors.push("live Pix BR Code is missing required EMV fields (CRC/structure check, key omitted)");
}
if (!String(liveFields["26"] || "").startsWith("0014br.gov.bcb.pix")) {
  errors.push("live Pix field 26 must start with br.gov.bcb.pix (key omitted)");
}
if (!String(liveFields["62"] || "").includes("***")) {
  errors.push("static Pix txid must be ***");
}
if (liveFields["63"] !== liveCrc) {
  errors.push("live Pix CRC16 does not match");
}

const pricedOpts = {
  pagamento: { infinitepay: { enabled: true, handle: "loja" } },
  pix: { enabled: true, chave: "teste@exemplo.com", nome: "JANA ABREU", cidade: "BRASILIA" },
  items: [{ price: 10, quantity: 1 }],
  products: [{ price: 10, slug: "x", active: true }],
  total: 10,
};
const payOptions = Jana.checkoutPayOptions(pricedOpts);
if (!payOptions.pix || !payOptions.infinitepay) {
  errors.push("priced cart must offer both Pix and InfinitePay when both are ready");
}
if (Jana.canPayWithPix({ ...pricedOpts, items: [{ price: 0, quantity: 1, slug: "x" }], products: [{ price: 0, slug: "x", active: true }] })) {
  errors.push("unpriced cart must not offer Pix");
}
const pending = Jana.buildPixPendingWhatsAppMessage(
  { nome: "Ada", items: [{ name: "Bolo", quantity: 1, price: 10 }], total: 10 },
  { nome: "Jana", contato: { whatsapp: "5561999999999" } },
  { subtotal: 10, taxa: 0, total: 10 }
);
if (!/Pagamento via Pix — aguardando conferência/.test(pending) || /PAGO/.test(pending) || !/comprovante/.test(pending)) {
  errors.push("pending Pix WhatsApp must wait for receipt and must not say PAGO");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("runtime checks ok");
void csv;
