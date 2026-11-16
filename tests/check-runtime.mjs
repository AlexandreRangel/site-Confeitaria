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
if (Jana.toCents(10.005) !== 1001 || Jana.toCents(0) !== 0) {
  errors.push("toCents must round to integer cents, got " + Jana.toCents(10.005));
}
if (Jana.infinitePayCustomerName("Jo") || Jana.infinitePayCustomerName("  Al  ") || Jana.infinitePayCustomerName("")) {
  errors.push("customer name shorter than 3 chars must be omitted");
}
if (Jana.infinitePayCustomerName("  Ana  ") !== "Ana") {
  errors.push("customer name must trim and keep 3+ chars, got " + Jana.infinitePayCustomerName("  Ana  "));
}
if (Jana.infinitePayPhone("+55619812461") !== "") {
  errors.push("short +55 phone must be omitted, got " + Jana.infinitePayPhone("+55619812461"));
}
if (Jana.infinitePayPhone("61 98124-6112") !== "+5561981246112") {
  errors.push("phone with spaces/dashes must normalise, got " + Jana.infinitePayPhone("61 98124-6112"));
}
if (Jana.infinitePayPhone("5561981246112") !== "+5561981246112") {
  errors.push("phone already starting with 55 must normalise, got " + Jana.infinitePayPhone("5561981246112"));
}
if (Jana.infinitePayEmail("invalido") !== "" || Jana.infinitePayEmail("ana@jana.com") !== "ana@jana.com") {
  errors.push("email must use a basic pattern");
}
const mixedCustomer = Jana.infinitePayCustomer({
  name: "Jo",
  telefone: "61 98124-6112",
  email: "nao-email",
});
if (!mixedCustomer || mixedCustomer.name || mixedCustomer.email || mixedCustomer.phone_number !== "+5561981246112") {
  errors.push("customer must keep only valid fields, got " + JSON.stringify(mixedCustomer));
}
if (Jana.infinitePayCustomer({ name: "Ab", telefone: "619812461", email: "x" })) {
  errors.push("customer with no valid fields must be omitted");
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
const filteredItems = Jana.infinitePayItems(
  [
    { name: "Tábua Signature", quantity: 1, price: 467 },
    { name: "Brinde", quantity: 1, price: 0 },
  ],
  { taxa: 0, taxaPendente: false }
);
if (filteredItems.length !== 1 || filteredItems[0].price !== 46700) {
  errors.push("items with price <= 0 must be dropped, got " + JSON.stringify(filteredItems));
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
const retryCalls = [];
const retryFetch = async function retryFetch(url, opts) {
  const body = JSON.parse(opts.body);
  retryCalls.push(body);
  if (body.customer) {
    return {
      ok: false,
      status: 422,
      text: async function text() {
        return JSON.stringify({ message: "Invalid checkout link params" });
      },
    };
  }
  return {
    ok: true,
    status: 200,
    text: async function text() {
      return JSON.stringify({ checkout_url: "https://checkout.infinitepay.io/pay/retry", slug: "ok" });
    },
  };
};
const retried = await Jana.createInfinitePayLink({
  handle: "loja",
  order_nsu: "JA-RETRY",
  items: [{ quantity: 1, price: 1000, description: "Item" }],
  customer: { name: "Ana", phone_number: "+5561981246112" },
}, retryFetch);
if (!retried || retried.checkout_url !== "https://checkout.infinitepay.io/pay/retry") {
  errors.push("422 must retry once without customer, got " + JSON.stringify(retried));
}
if (retryCalls.length !== 2 || !retryCalls[0].customer || retryCalls[1].customer) {
  errors.push("422 retry must drop the customer block, got " + JSON.stringify(retryCalls));
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

if (typeof Jana.siteText !== "function") {
  errors.push("Jana.siteText must exist");
} else {
  const fallback = "texto fixo";
  if (Jana.siteText({}, "paidDisclaimer", fallback) !== fallback) {
    errors.push("siteText must use the fallback when the key is missing");
  }
  if (Jana.siteText({ paidDisclaimer: null }, "paidDisclaimer", fallback) !== fallback) {
    errors.push("siteText must use the fallback when the key is null");
  }
  if (Jana.siteText({ paidDisclaimer: "  Aviso editado  " }, "paidDisclaimer", fallback) !== "Aviso editado") {
    errors.push("siteText must use the trimmed site.json value when the key exists");
  }
  if (Jana.siteText({ paidDisclaimer: "   " }, "paidDisclaimer", fallback) !== "") {
    errors.push("siteText must return empty when the key exists and is blank");
  }
}
{
  const order = { clientName: "Ada", clientPhone: "61999999999", items: [{ name: "Bolo", quantity: 1, price: 10 }], total: 10 };
  const check = { order_nsu: "NSU1", receipt_url: "https://r.example/1" };
  const params = { slug: "abc" };
  const custom = Jana.buildPaidWhatsAppMessage(order, { nome: "Jana", paidDisclaimer: "Aviso do cartão editado." }, check, params);
  if (!/Aviso do cartão editado/.test(custom) || /Após o pagamento, seu pedido é enviado/.test(custom)) {
    errors.push("paid WhatsApp must use site.paidDisclaimer when the key exists");
  }
  const blank = Jana.buildPaidWhatsAppMessage(order, { nome: "Jana", paidDisclaimer: "" }, check, params);
  if (/Após o pagamento, seu pedido é enviado/.test(blank) || /Aviso do cartão editado/.test(blank)) {
    errors.push("paid WhatsApp must omit the disclaimer when paidDisclaimer is empty");
  }
  const missing = Jana.buildPaidWhatsAppMessage(order, { nome: "Jana" }, check, params);
  if (!/Após o pagamento, seu pedido é enviado/.test(missing)) {
    errors.push("paid WhatsApp must fall back to PAID_DISCLAIMER when the key is missing");
  }
}


// editor: links dos banners, banners por página e datas comemorativas
{
  const prods = [{ slug: "bolo-x", name: "Bolo X", active: true }];
  const car = [
    { id: "a", image: "assets/carousel/a.webp", order: 2, linkTipo: "url", url: "https://www.instagram.com/x/", title: "A", formato: "banner", imageMobile: "assets/carousel/a-cel.webp" },
    { id: "b", image: "assets/carousel/b.webp", order: 1, productSlug: "bolo-x" },
    { id: "c", image: "assets/carousel/c.webp", order: 1, linkTipo: "categoria", linkCategory: "bolos", pagina: "bolos", title: "C" },
    { id: "d", image: "assets/carousel/d.webp", order: 3, linkTipo: "nenhum", title: "D" },
    { id: "e", image: "assets/carousel/e.webp", order: 4, linkTipo: "url", url: "https://janaabreuconfeitaria.com.br/sobre-nos/", title: "E" },
  ];
  const home = Jana.pageCarouselSlides(car, prods, "home");
  if (home.map((x) => x.image.slice(-6)).join(",") !== "b.webp,a.webp,d.webp,e.webp") errors.push("home banners: order/page filter wrong");
  if (!/produto\/\?slug=bolo-x/.test(home[0].href) || home[0].external) errors.push("legacy productSlug banner must link to the product");
  if (home[1].href !== "https://www.instagram.com/x/" || !home[1].external || home[1].imageMobile !== "assets/carousel/a-cel.webp" || !home[1].banner) errors.push("url banner must be external with mobile image");
  if (home[2].href !== "") errors.push("nenhum banner must have no link");
  if (home[3].external) errors.push("own-domain url banner must not open a new tab");
  const bolos = Jana.pageCarouselSlides(car, prods, "bolos");
  if (bolos.length !== 1 || !/bolos\/$/.test(bolos[0].href)) errors.push("category banner must link to the area page");
  const site0 = {};
  const now = new Date("2026-12-10T15:00:00Z");
  const mk = (ativacao) => ({ id: "natal", seasonal: true, ativacao });
  if (Jana.isAreaActive(mk({ modo: "desligado", inicio: "", fim: "" }), site0, now)) errors.push("desligado must hide");
  if (!Jana.isAreaActive(mk({ modo: "ligado", inicio: "", fim: "" }), site0, now)) errors.push("ligado must show");
  if (!Jana.isAreaActive(mk({ modo: "datas", inicio: "2026-12-10", fim: "2026-12-10" }), site0, now)) errors.push("datas must include both ends");
  if (Jana.isAreaActive(mk({ modo: "datas", inicio: "2026-12-11", fim: "2026-12-25" }), site0, now)) errors.push("future datas must hide");
  if (Jana.isAreaActive(mk({ modo: "datas", inicio: "2026-11-01", fim: "2026-12-09" }), site0, now)) errors.push("past datas must hide");
  if (!Jana.isAreaActive({ id: "bolos" }, site0, now)) errors.push("non-seasonal areas always show");
  if (Jana.todayYmd(new Date("2026-12-11T02:30:00Z")) !== "2026-12-10") errors.push("todayYmd must use São Paulo time");
}

{
  const prods = [
    { slug: "bolo-x", name: "Bolo X", active: true, price: 80, description: "Recheio   de ninho", images: ["assets/products/bolo-x/1.webp"] },
    { slug: "torta-y", name: "Torta Y", active: false, price: 50, images: ["assets/products/torta-y/1.webp"] },
    { slug: "sem-foto", name: "Sem foto", active: true, price: 10, images: [] },
    { slug: "consulta", name: "Bolo sob consulta", active: true, images: ["assets/products/consulta/1.webp"] },
  ];
  const car = [
    { id: "p1", tipo: "produto", productSlug: "bolo-x", order: 1 },
    { id: "p2", tipo: "produto", productSlug: "bolo-x", order: 2, overrides: { title: "Bolo especial", price: 99, description: "" } },
    { id: "p3", tipo: "produto", productSlug: "torta-y", order: 3 },
    { id: "p4", tipo: "produto", productSlug: "sumiu", order: 4 },
    { id: "p5", tipo: "produto", productSlug: "sem-foto", order: 5 },
    { id: "img", tipo: "imagem", image: "assets/carousel/a.webp", title: "A", order: 6, linkTipo: "nenhum" },
  ];
  const home = Jana.pageCarouselSlides(car, prods, "home");
  if (home.length !== 3 || home[0].title !== "Bolo X" || home[1].title !== "Bolo especial" || home[2].image !== "assets/carousel/a.webp") {
    errors.push("product banners: resolve/filter/order wrong");
  }
  if (home[0].priceLabel !== Jana.formatBRL(80) || home[0].description !== "Recheio de ninho" || !/produto\/\?slug=bolo-x/.test(home[0].href)) {
    errors.push("product banner must pull live name, description, price and product link");
  }
  if (home[1].priceLabel !== Jana.formatBRL(99) || home[1].description) errors.push("product banner overrides must replace price and hide empty description");
  prods[0].price = 120;
  prods[0].name = "Bolo X novo";
  const live = Jana.pageCarouselSlides(car, prods, "home");
  if (live[0].title !== "Bolo X novo" || live[0].priceLabel !== Jana.formatBRL(120)) errors.push("product banner without override must follow live product data");
  if (live[1].title !== "Bolo especial" || live[1].priceLabel !== Jana.formatBRL(99)) errors.push("overridden product banner fields must stay as saved");
  const html = Jana.productBannerHtml(home[0]);
  if (!/^<a class="hero__slide hero__slide--produto"/.test(html) || (html.match(/<a /g) || []).length !== 1) errors.push("product banner must be a single link");
  if (!html.includes("Comprar") || !html.includes("span class=\"btn btn--solid btn--acquire\"") || /hydra/i.test(html)) {
    errors.push("product banner Comprar must be a visual span without Hydra");
  }
  if (!html.includes("Bolo X") || !html.includes(Jana.formatBRL(80))) errors.push("product banner html must show name and price");
  const preview = Jana.productBannerHtml(home[0], { preview: true });
  if (/<a /.test(preview) || !preview.includes("hero__produto")) errors.push("editor product banner preview must skip the wrapping link");
  const consulta = Jana.resolveProductBanner({ tipo: "produto", productSlug: "consulta" }, prods[3]);
  if (consulta.priceLabel !== "Sob consulta") errors.push("product without fixed price must say Sob consulta");
  if (html.includes("hero__foto--ajustada") || html.includes("--foto-zoom")) {
    errors.push("legacy product banner without foto must render unchanged");
  }
  const edited = Jana.resolveProductBanner({ id: "p2", tipo: "produto", productSlug: "bolo-x", foto: { zoom: 2, x: 20, brilho: 1.2, gamma: 1.3 } }, prods[0]);
  const editedHtml = Jana.productBannerHtml(edited);
  if (!editedHtml.includes("hero__foto--ajustada") || !editedHtml.includes("hero__produto-foto--ajustada") || !editedHtml.includes("--foto-zoom:2") || !editedHtml.includes("brightness(1.2)") || !editedHtml.includes("jana-foto-p2")) {
    errors.push("product banner must apply foto framing and CSS filters");
  }
  if (html.includes("hero__produto-foto--ajustada")) {
    errors.push("unadjusted product banner must not mark the photo frame as adjusted");
  }
  if (!editedHtml.includes("feFuncR") || !/exponent="1.3"/.test(editedHtml) || !editedHtml.includes("color-interpolation-filters=\"sRGB\"")) {
    errors.push("non-default gamma must emit an sRGB SVG filter");
  }
}

{
  if (typeof Jana.normalizeFoto !== "function") {
    errors.push("Jana.normalizeFoto must exist");
  } else {
    const def = Jana.normalizeFoto(undefined);
    if (def.x !== 50 || def.y !== 50 || def.zoom !== 1 || def.brilho !== 1 || def.gamma !== 1) {
      errors.push("normalizeFoto defaults must be centered 1x with neutral adjustments");
    }
    const clamped = Jana.normalizeFoto({ x: -10, y: 200, zoom: 9, brilho: 0, saturacao: "1.5", foo: 1 });
    if (clamped.x !== 0 || clamped.y !== 100 || clamped.zoom !== 4 || clamped.brilho !== 0.25 || clamped.saturacao !== 1.5 || clamped.foo) {
      errors.push("normalizeFoto must clamp ranges and ignore unknown keys, got " + JSON.stringify(clamped));
    }
    if (Jana.fotoForSave({}) || Jana.fotoForSave({ zoom: 1, x: 50 }) || !Jana.fotoIsDefault(null)) {
      errors.push("default foto must not be saved");
    }
    const saved = Jana.fotoForSave({ zoom: 8, brilho: 1.2, x: 50 });
    if (!saved || saved.zoom !== 4 || saved.brilho !== 1.2 || saved.x != null) {
      errors.push("fotoForSave must keep only non-default clamped fields, got " + JSON.stringify(saved));
    }
    const pan = Jana.fotoPanFromDrag({ zoom: 2 }, 10, 0, 100, 100, 100, 100);
    if (!(pan.x < 50) || pan.y !== 50) errors.push("drag right must decrease object-position x and keep y when the photo is square");
    const noPan = Jana.fotoPanFromDrag({ zoom: 1 }, 40, 0, 200, 100, 200, 100);
    if (noPan.x !== 50) errors.push("zoom 1 on a matching frame must not pan into empty area");
    const img = Jana.imageBannerHtml({ id: "hero-1", image: "assets/carousel/a.webp", title: "A", href: "/x", foto: { contraste: 1.1, vibrancia: 1.4 } });
    if (!img.includes('class="hero__slide"') || !img.includes("contrast(1.1)") || !img.includes("luminanceToAlpha") || !img.includes("jana-foto-hero-1")) {
      errors.push("image banner must apply CSS contrast and SVG vibrance without breaking the slide");
    }
    const plain = Jana.imageBannerHtml({ id: "hero-2", image: "assets/carousel/a.webp", title: "A" });
    if (plain.includes("hero__foto--ajustada") || plain.includes("<filter")) {
      errors.push("image banner without foto must stay as a plain slide");
    }
    const fromProduct = Jana.imageBannerHtml({ image: "assets/products/x/1.webp", productSlug: "bolo-x", title: "Bolo X" });
    if (!/href="[^"]*produto\/\?slug=bolo-x"/.test(fromProduct)) {
      errors.push("area product photo slides must still link to the product");
    }
    if (typeof Jana.footerMap !== "function") {
      errors.push("Jana.footerMap must exist");
    } else {
      const hidden = Jana.footerMap({ brandName: "Jana", footerAddress: "  ", footerMapQuery: "x" });
      if (hidden.visible) errors.push("empty footer address must hide the map block");
      const shown = Jana.footerMap({
        brandName: "Jana Abreu Confeitaria",
        footerAddress: "Guará II QE 15 Cj I, 24 - Guará, Brasília - DF, 71050-091",
        footerMapQuery: "Jana Abreu Confeitaria Guará II QE 15 Cj I 24 Brasília",
      });
      if (!shown.visible || !shown.link.includes("api=1") || !shown.embed.includes("output=embed") || !shown.embed.includes("maps.google.com/maps?q=")) {
        errors.push("footer map must build a keyless search link and embed URL");
      }
      if (!shown.embed.includes("Guar") && !shown.embed.includes("Guara")) {
        errors.push("footer map embed query must include the address");
      }
      const fallback = Jana.footerMap({ brandName: "Jana Abreu Confeitaria", footerAddress: "Guará II, 24" });
      if (!fallback.visible || !fallback.query.includes("Jana Abreu Confeitaria") || !fallback.query.includes("Guará II, 24")) {
        errors.push("empty map query must fall back to brand name plus address");
      }
    }
    if (typeof Jana.slugifyArea !== "function" || typeof Jana.isReservedAreaSlug !== "function") {
      errors.push("Jana.slugifyArea must exist");
    } else {
      if (Jana.slugifyArea("Páscoa Feliz", []) !== "pascoa-feliz") errors.push("slugifyArea must fold Portuguese accents, got " + Jana.slugifyArea("Páscoa Feliz", []));
      if (!Jana.isReservedAreaSlug("painel") || !Jana.isReservedAreaSlug("sobremesas")) errors.push("reserved slugs must include painel and redirect folders");
      const taken = Jana.slugifyArea("Bolos", ["bolos"]);
      if (taken === "bolos" || taken.indexOf("bolos-") !== 0) errors.push("slugifyArea must avoid taken slugs, got " + taken);
    }
    const hidden = { id: "x", slug: "x", seasonal: false, enabled: false };
    const vis = Jana.visibleAreas([{ id: "a", slug: "a", name: "A", order: 1 }, hidden], {});
    if (vis.length !== 1 || vis[0].id !== "a") errors.push("enabled:false must hide a category from the public site");

    const catalog = [
      { slug: "b-torta", name: "Torta", price: 80, active: true, categoryIds: ["bolos"] },
      { slug: "a-acai", name: "Açaí", price: 20, active: true, categoryIds: ["bolos"] },
      { slug: "c-consulta", name: "Bolo especial", price: 0, priceLabel: "Sob consulta", active: true, categoryIds: ["bolos"] },
      { slug: "d-arvore", name: "Árvore", price: 40, active: true, categoryIds: ["bolos"] },
      { slug: "e-oculto", name: "Oculto", price: 10, active: false, categoryIds: ["bolos"] },
      { slug: "f-outra", name: "Outra", price: 5, active: true, categoryIds: ["cestas"] },
    ];
    const areaCat = { id: "bolos", sourceCategoryIds: ["bolos"] };
    const bySlug = (list) => list.map((p) => p.slug).join(",");
    const catalogOrder = Jana.productsForArea(catalog, areaCat);
    if (bySlug(catalogOrder) !== "b-torta,a-acai,c-consulta,d-arvore") errors.push("default area order must stay catalogue order, got " + bySlug(def));
    const alfa = Jana.productsForArea(catalog, Object.assign({}, areaCat, { productSort: "alfa" }));
    if (bySlug(alfa) !== "a-acai,d-arvore,c-consulta,b-torta") errors.push("alfa sort must be pt-BR accent-aware, got " + bySlug(alfa));
    const cheap = Jana.productsForArea(catalog, Object.assign({}, areaCat, { productSort: "preco-asc" }));
    if (bySlug(cheap) !== "a-acai,d-arvore,b-torta,c-consulta") errors.push("preco-asc must put unpriced last, got " + bySlug(cheap));
    const dear = Jana.productsForArea(catalog, Object.assign({}, areaCat, { productSort: "preco-desc" }));
    if (bySlug(dear) !== "b-torta,d-arvore,a-acai,c-consulta") errors.push("preco-desc must put unpriced last, got " + bySlug(dear));
    const manual = Jana.productsForArea(catalog, Object.assign({}, areaCat, { productSort: "manual", productOrder: ["d-arvore", "b-torta"] }));
    if (bySlug(manual) !== "d-arvore,b-torta,a-acai,c-consulta") errors.push("manual sort must follow productOrder and append new slugs, got " + bySlug(manual));
    const natalArea = { id: "natal", sourceCategoryIds: ["natal"], productSort: "preco-asc" };
    const natalList = Jana.productsForArea(
      [
        { slug: "n2", name: "Dois", price: 30, active: true, categoryIds: ["natal"] },
        { slug: "n1", name: "Um", price: 10, active: true, categoryIds: ["natal"] },
        { slug: "n0", name: "Consulta", priceLabel: "Sob consulta", active: true, categoryIds: ["natal"] },
      ],
      natalArea
    );
    if (bySlug(natalList) !== "n1,n2,n0") errors.push("seasonal area pages must honor productSort, got " + bySlug(natalList));
    const other = Jana.productsForArea(catalog, { id: "cestas", sourceCategoryIds: ["cestas"], productSort: "manual", productOrder: ["f-outra"] });
    if (bySlug(other) !== "f-outra") errors.push("product position must be independent per category");
  }
}



{
  const wedNight = new Date("2026-11-12T02:30:00Z"); // 23:30 de quarta em Brasília
  const thuMorning = new Date("2026-11-12T03:30:00Z"); // 00:30 de quinta em Brasília
  if (Jana.addDaysYmd("2026-11-11", 2) !== "2026-11-13") errors.push("addDaysYmd +2");
  if (Jana.addDaysYmd("2026-12-31", 2) !== "2027-01-02") errors.push("addDaysYmd year wrap");
  if (Jana.todayYmd(wedNight) !== "2026-11-11") errors.push("23:30 Brasília still Wednesday");
  if (Jana.minLeadDateYmd(wedNight) !== "2026-11-13") errors.push("min at 23:30 Brasília must be Friday 13/11");
  if (Jana.minLeadDateYmd(thuMorning) !== "2026-11-14") errors.push("min after midnight Brasília must be Saturday");
  if (Jana.formatDateLongBR("2026-11-13") !== "sexta-feira, 13/11") errors.push("formatDateLongBR, got " + Jana.formatDateLongBR("2026-11-13"));
  const empty = Jana.validateDesiredDate("", null, wedNight);
  if (!empty.ok || !empty.empty) errors.push("empty date stays optional");
  const today = Jana.validateDesiredDate("2026-11-11", null, wedNight);
  if (today.ok || !/pelo menos 2 dias/.test(today.message) || !/sexta-feira, 13\/11/.test(today.message)) {
    errors.push("today must be blocked, got " + today.message);
  }
  if (Jana.validateDesiredDate("2026-11-12", null, wedNight).ok) errors.push("tomorrow must be blocked");
  if (!Jana.validateDesiredDate("2026-11-13", null, wedNight).ok) errors.push("Friday must be allowed");
  const skipped = Jana.firstAvailableDesiredDate(
    { ativo: false, inicio: "", fim: "", periodos: [{ inicio: "2026-11-13", fim: "2026-11-13" }], fimDeSemana: false },
    wedNight
  );
  if (skipped !== "2026-11-14") errors.push("must skip paused Friday, got " + skipped);
  const weekend = Jana.firstAvailableDesiredDate(
    { ativo: false, inicio: "", fim: "", periodos: [], fimDeSemana: true },
    new Date("2026-11-13T18:00:00-03:00")
  );
  if (weekend !== "2026-11-16") errors.push("weekend pause must skip to Monday, got " + weekend);
  const indefinite = Jana.firstAvailableDesiredDate(
    { ativo: true, inicio: "", fim: "", periodos: [], fimDeSemana: false },
    wedNight
  );
  if (indefinite !== "2026-11-13") errors.push("indefinite pause must not shift delivery min, got " + indefinite);
}


{
  if (!Jana.productAceitaImagem({ aceitaImagemPersonalizacao: true })) errors.push("flag true must accept personalization image");
  if (Jana.productAceitaImagem({ aceitaImagemPersonalizacao: false }) || Jana.productAceitaImagem({}) || Jana.productAceitaImagem(null)) {
    errors.push("missing or false flag must not accept personalization image");
  }
  if (Jana.personalizacaoWhatsAppLinha({ enviadas: 1 }) !== "Este pedido inclui imagem anexada para personalização.") {
    errors.push("whatsapp must mention an attached personalization image");
  }
  if (Jana.personalizacaoWhatsAppLinha({ pendentes: 1 }) !== "Vou enviar a imagem da personalização nesta conversa.") {
    errors.push("whatsapp must ask to send the personalization image when upload failed");
  }
  if (Jana.personalizacaoWhatsAppLinha({}) || Jana.personalizacaoWhatsAppLinha()) {
    errors.push("whatsapp must stay quiet when there is no personalization image");
  }
}


{
  const pausa = {
    ativo: false,
    inicio: "",
    fim: "",
    periodos: [{ inicio: "2026-11-20", fim: "2026-11-22", mensagem: "Evento fechado" }],
    fimDeSemana: false,
    datasBloqueadas: [{ data: "2026-11-19", motivo: "Feriado municipal" }],
  };
  const wedNight = new Date("2026-11-12T02:30:00Z");
  if (!Jana.isDesiredDateUnavailable("2026-11-19", pausa)) errors.push("blocked date must be unavailable");
  if (!Jana.isDesiredDateUnavailable("2026-11-20", pausa) || !Jana.isDesiredDateUnavailable("2026-11-22", pausa)) {
    errors.push("pause range must still block desired dates");
  }
  const blocked = Jana.validateDesiredDate("2026-11-19", pausa, wedNight);
  if (blocked.ok || !/Feriado municipal/.test(blocked.message) || !/13\/11/.test(blocked.message)) {
    errors.push("blocked date must explain the reason and next free day, got " + blocked.message);
  }
  if (Jana.firstAvailableDesiredDate(pausa, wedNight) !== "2026-11-13") {
    errors.push("first free day stays Friday when the block is later, got " + Jana.firstAvailableDesiredDate(pausa, wedNight));
  }
  const later = {
    ativo: false, inicio: "", fim: "", periodos: [], fimDeSemana: false,
    datasBloqueadas: [{ data: "2026-11-13", motivo: "" }, { data: "2026-11-14", motivo: "" }],
  };
  if (Jana.firstAvailableDesiredDate(later, wedNight) !== "2026-11-15") {
    errors.push("must skip blocked Fri/Sat to Sunday 15/11, got " + Jana.firstAvailableDesiredDate(later, wedNight));
  }
  const ext = Jana.formatDateExtensoBR("2026-11-19");
  if (!/quinta-feira/.test(ext) || !/novembro/.test(ext) || !/2026/.test(ext)) {
    errors.push("formatDateExtensoBR must be long pt-BR, got " + ext);
  }
}

{
  const allProducts = JSON.parse(readFileSync(join(root, "data/products.json"), "utf8"));
  const allAreas = JSON.parse(readFileSync(join(root, "data/areas.json"), "utf8"));
  const allCats = JSON.parse(readFileSync(join(root, "data/categories.json"), "utf8"));
  const names = {};
  allCats.forEach(function (c) {
    names[c.id] = c.name;
  });
  const flat = Jana.catalogProductsForPicker(allProducts, "");
  if (flat.length !== allProducts.length) {
    errors.push("product picker count must equal catalog: got " + flat.length + " of " + allProducts.length);
  }
  const groups = Jana.productPickerGroups(allProducts, allAreas, { categoryNames: names });
  const unique = new Set();
  groups.forEach(function (g) {
    g.products.forEach(function (p) {
      unique.add(p.slug);
    });
  });
  if (unique.size !== allProducts.length) {
    errors.push("grouped picker must include every product: got " + unique.size + " of " + allProducts.length);
  }
  const sem = groups.find(function (g) {
    return g.id === "sem-categoria";
  });
  const sobre = groups.find(function (g) {
    return g.name === "Sobremesas" || g.id === "cat:sobremesas";
  });
  if (!sem || !sem.products.length) errors.push("products with no category must go in Sem categoria");
  if (!sobre || sobre.products.length !== 3) errors.push("Sobremesas leftover group should have the 3 cheesecakes");
  const sample = {
    slug: "alfa",
    name: "Árvore de Natal",
    price: 10,
    categoryIds: ["bolos", "cestas-presentes"],
    images: [],
  };
  const hidden = { slug: "oculto-x", name: "Doce oculto", active: false, images: ["x.webp"] };
  const consulta = { slug: "consulta-x", name: "Bolo Pâtissier", categoryIds: [] };
  const mixed = Jana.catalogProductsForPicker([hidden, consulta, sample, { name: "sem slug" }], "");
  if (mixed.length !== 3 || mixed[0].slug !== "alfa") errors.push("picker must include hidden and unpriced products, skip no-slug, sort pt-BR");
  const q = Jana.catalogProductsForPicker([sample, consulta], "patissier");
  if (q.length !== 1 || q[0].slug !== "consulta-x") errors.push("picker search must ignore accents");
  const multi = Jana.productPickerGroups([sample, hidden, consulta], allAreas, {});
  const inBolos = (multi.find((g) => g.id === "area:bolos") || {}).products || [];
  const inCestas = (multi.find((g) => g.id === "area:cestas") || {}).products || [];
  const inSem = (multi.find((g) => g.id === "sem-categoria") || {}).products || [];
  if (inBolos.map((p) => p.slug).join() !== "alfa" || inCestas.map((p) => p.slug).join() !== "alfa") {
    errors.push("a product in several categories must appear in each group");
  }
  if (!inSem.some((p) => p.slug === "consulta-x") || !inSem.some((p) => p.slug === "oculto-x")) {
    errors.push("hidden and uncategorized products must appear in Sem categoria");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("runtime checks ok");
void csv;
