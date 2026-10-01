/**
 * Local order/client store for Jana Abreu Confeitaria.
 *
 * FUTURE Google Sheets (stub only — NO live Google integration):
 * - Replace or mirror persistOrder/persistClient with a POST to an Apps Script
 *   Web App endpoint, e.g.:
 *     // const SHEETS_ENDPOINT = "https://script.google.com/macros/s/XXXX/exec";
 *     // await fetch(SHEETS_ENDPOINT, {
 *     //   method: "POST",
 *     //   mode: "no-cors",
 *     //   headers: { "Content-Type": "text/plain" },
 *     //   body: JSON.stringify({ type: "order", payload: order }),
 *     // });
 * - Keep localStorage as offline cache until Sheets round-trip succeeds.
 * - Map columns: Pedido#, Cliente, Status, Data, Itens, Frete, Total, Endereço, Obs.
 */
(function createStore(global) {
  const Jana = global.Jana || {};
  const ORDERS_KEY = "jana-abreu-orders-v1";
  const CLIENTS_KEY = "jana-abreu-clients-v1";
  const SEQ_KEY = "jana-abreu-order-seq-v1";

  function readList(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function nextOrderNumber() {
    let seq = Number(localStorage.getItem(SEQ_KEY) || 1100);
    if (!Number.isFinite(seq) || seq < 1100) {
      seq = 1100;
    }
    seq += 1;
    localStorage.setItem(SEQ_KEY, String(seq));
    return String(seq);
  }

  function mergeById(base, extra) {
    const map = new Map();
    (base || []).forEach(function put(item) {
      if (item && item.id) {
        map.set(item.id, item);
      }
    });
    (extra || []).forEach(function put(item) {
      if (item && item.id) {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  }

  function upsertClient(client) {
    const list = readList(CLIENTS_KEY);
    const phone = digitsOnly(client.telefone);
    const email = String(client.email || "")
      .trim()
      .toLowerCase();
    let existing = list.find(function match(row) {
      const samePhone = phone && digitsOnly(row.telefone) === phone;
      const sameEmail = email && String(row.email || "").toLowerCase() === email;
      return samePhone || sameEmail;
    });
    if (existing) {
      existing.nome = client.nome || existing.nome;
      if (client.email) existing.email = client.email;
      if (client.telefone) existing.telefone = client.telefone;
    } else {
      existing = {
        id: "cli-ls-" + Date.now().toString(36),
        nome: client.nome || "",
        email: client.email || "",
        telefone: client.telefone || "",
      };
      list.unshift(existing);
    }
    writeList(CLIENTS_KEY, list);
    // FUTURE: push client row to Google Sheets Clients tab
    return existing;
  }

  function appendOrder(order) {
    const list = readList(ORDERS_KEY);
    list.unshift(order);
    writeList(ORDERS_KEY, list);
    // FUTURE: append order row to Google Sheets Pedidos tab
    return order;
  }

  function buildOrderFromCheckout(payload) {
    const number = nextOrderNumber();
    const items = (payload.items || []).map(function mapItem(item) {
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      };
    });
    const subtotal = items.reduce(function sum(total, item) {
      return total + item.price * item.quantity;
    }, 0);
    const frete = Number(payload.frete) || 0;
    return {
      id: "PED-" + number,
      number: number,
      clientName: payload.nome || "",
      clientPhone: digitsOnly(payload.telefone),
      clientEmail: payload.email || "",
      status: "novo",
      createdAt: new Date().toISOString(),
      desiredDate: payload.data || "",
      items: items,
      subtotal: subtotal,
      frete: frete,
      total: subtotal + frete,
      address: payload.endereco || "",
      notes: payload.observacoes || "",
      source: "cart",
    };
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toCSV(rows) {
    function cell(value) {
      const text = String(value == null ? "" : value);
      if (/[",\n\r]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
      }
      return text;
    }
    return rows
      .map(function line(row) {
        return row.map(cell).join(",");
      })
      .join("\n");
  }

  function downloadCSV(filename, rows) {
    const blob = new Blob(["\uFEFF" + toCSV(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  Jana.Store = {
    ORDERS_KEY: ORDERS_KEY,
    CLIENTS_KEY: CLIENTS_KEY,
    localOrders: function localOrders() {
      return readList(ORDERS_KEY);
    },
    localClients: function localClients() {
      return readList(CLIENTS_KEY);
    },
    mergeOrders: function mergeOrders(demo) {
      return mergeById(demo || [], readList(ORDERS_KEY)).sort(function byDate(a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
    },
    mergeClients: function mergeClients(demo) {
      return mergeById(demo || [], readList(CLIENTS_KEY)).sort(function byName(a, b) {
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
      });
    },
    saveCheckout: function saveCheckout(payload) {
      const order = buildOrderFromCheckout(payload);
      appendOrder(order);
      upsertClient({
        nome: payload.nome,
        email: payload.email,
        telefone: payload.telefone,
      });
      return order;
    },
    updateOrderStatus: function updateOrderStatus(orderId, status) {
      const list = readList(ORDERS_KEY);
      const row = list.find(function find(item) {
        return item.id === orderId;
      });
      if (row) {
        row.status = status;
        writeList(ORDERS_KEY, list);
        // FUTURE: update status cell in Google Sheets
        return row;
      }
      return null;
    },
    downloadJSON: downloadJSON,
    downloadCSV: downloadCSV,
    digitsOnly: digitsOnly,
  };

  global.Jana = Jana;
})(window);
