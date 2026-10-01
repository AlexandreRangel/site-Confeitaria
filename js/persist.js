(function createPersist(global) {
  const Jana = global.Jana || {};
  const ORDERS_KEY = "jana-abreu-orders-v1";
  const CLIENTS_KEY = "jana-abreu-clients-v1";

  function readLocal(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  Jana.Persist = {
    ORDERS_KEY: ORDERS_KEY,
    CLIENTS_KEY: CLIENTS_KEY,
    loadOverlay: function loadOverlay(key, seed) {
      const local = readLocal(key);
      const base = seed || [];
      if (!local) {
        return base.slice();
      }
      const map = {};
      base.concat(local).forEach(function put(item) {
        if (item && item.id) {
          map[item.id] = item;
        }
      });
      return Object.keys(map).map(function value(id) {
        return map[id];
      });
    },
    saveOrders: function saveOrders(orders) {
      writeLocal(ORDERS_KEY, orders);
    },
    saveClients: function saveClients(clients) {
      writeLocal(CLIENTS_KEY, clients);
    },
    nextOrderId: function nextOrderId(orders) {
      const max = orders.reduce(function maxNumber(current, order) {
        return Math.max(current, Number(order.number) || 0);
      }, 1000);
      const number = max + 1;
      return { id: "JA-" + number, number: number };
    },
    upsertClient: function upsertClient(clients, customer) {
      const phone = String(customer.telefone || "").replace(/\D/g, "");
      const existing = clients.find(function match(client) {
        return String(client.telefone || "").replace(/\D/g, "") === phone && phone;
      });
      if (existing) {
        existing.nome = customer.nome || existing.nome;
        existing.email = customer.email || existing.email;
        existing.telefone = phone || existing.telefone;
        return existing;
      }
      const created = {
        id: "c-" + Date.now(),
        nome: customer.nome || "",
        email: customer.email || "",
        telefone: phone,
        bairro: customer.bairro || "",
        notas: "",
      };
      clients.push(created);
      return created;
    },
    downloadJSON: function downloadJSON(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    clientsToCSV: function clientsToCSV(clients) {
      const header = ["nome", "email", "telefone", "bairro", "notas", "id"];
      const lines = [header.join(",")];
      clients.forEach(function row(client) {
        lines.push(
          [
            csvEscape(client.nome),
            csvEscape(client.email),
            csvEscape(client.telefone),
            csvEscape(client.bairro),
            csvEscape(client.notas),
            csvEscape(client.id),
          ].join(",")
        );
      });
      return lines.join("\n");
    },
    downloadCSV: function downloadCSV(filename, csv) {
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    clearDemo: function clearDemo() {
      localStorage.removeItem(ORDERS_KEY);
      localStorage.removeItem(CLIENTS_KEY);
    },
  };

  global.Jana = Jana;
})(window);
