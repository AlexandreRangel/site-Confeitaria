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
  URL: {
    createObjectURL: function createObjectURL() {
      return "blob:test";
    },
    revokeObjectURL: function revokeObjectURL() {},
  },
  Blob: function Blob(parts) {
    this.parts = parts;
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.runInNewContext(
  readFileSync(join(root, "js/utils.js"), "utf8") +
    readFileSync(join(root, "js/cart.js"), "utf8") +
    readFileSync(join(root, "js/store.js"), "utf8"),
  sandbox
);

const Jana = sandbox.Jana;
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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("runtime checks ok");
void csv;
