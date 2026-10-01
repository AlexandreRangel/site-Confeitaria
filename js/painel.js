(function createPainel(global) {
  const Jana = global.Jana;
  const STATUS_LABELS = {
    novo: "Novo",
    em_preparo: "Em preparo",
    pronto: "Pronto",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };

  const state = {
    orders: [],
    clients: [],
    selectedId: null,
    siteWhatsApp: "5561981246112",
  };

  function formatDate(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDesired(value) {
    if (!value) return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-");
      return d + "/" + m + "/" + y;
    }
    return value;
  }

  function formatPhone(value) {
    const digits = Jana.Store.digitsOnly(value);
    if (digits.length === 11) {
      return (
        "(" +
        digits.slice(0, 2) +
        ") " +
        digits.slice(2, 7) +
        "-" +
        digits.slice(7)
      );
    }
    if (digits.length === 10) {
      return (
        "(" +
        digits.slice(0, 2) +
        ") " +
        digits.slice(2, 6) +
        "-" +
        digits.slice(6)
      );
    }
    return value || "—";
  }

  function statusBadge(status) {
    const key = STATUS_LABELS[status] ? status : "novo";
    return (
      '<span class="badge badge--' +
      key +
      '">' +
      Jana.escapeHtml(STATUS_LABELS[key] || status) +
      "</span>"
    );
  }

  function findOrder(id) {
    return state.orders.find(function match(order) {
      return order.id === id;
    });
  }

  function renderOrders() {
    const body = Jana.qs('[data-bind="orders-body"]');
    if (!state.orders.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="painel-empty">Nenhum pedido ainda.</td></tr>';
      return;
    }
    body.innerHTML = state.orders
      .map(function row(order) {
        const selected = order.id === state.selectedId ? " is-selected" : "";
        return (
          '<tr class="' +
          selected.trim() +
          '" tabindex="0" data-action="open-order" data-id="' +
          Jana.escapeHtml(order.id) +
          '">' +
          "<td><strong>#" +
          Jana.escapeHtml(order.number || order.id) +
          "</strong></td>" +
          "<td>" +
          Jana.escapeHtml(order.clientName || "—") +
          "</td>" +
          "<td>" +
          statusBadge(order.status) +
          "</td>" +
          "<td>" +
          Jana.escapeHtml(formatDate(order.createdAt)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderClients() {
    const body = Jana.qs('[data-bind="clients-body"]');
    if (!state.clients.length) {
      body.innerHTML =
        '<tr><td colspan="3" class="painel-empty">Nenhum cliente cadastrado.</td></tr>';
      return;
    }
    body.innerHTML = state.clients
      .map(function row(client) {
        return (
          "<tr>" +
          "<td>" +
          Jana.escapeHtml(client.nome || "—") +
          "</td>" +
          "<td>" +
          Jana.escapeHtml(client.email || "—") +
          "</td>" +
          "<td>" +
          Jana.escapeHtml(formatPhone(client.telefone)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderDetail(order) {
    const panel = Jana.qs('[data-bind="order-detail"]');
    if (!order) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    Jana.bindText("detail-title", "Pedido #" + (order.number || order.id));
    Jana.bindText("detail-status-label", STATUS_LABELS[order.status] || order.status);
    Jana.bindText("detail-client", order.clientName || "—");
    Jana.bindText("detail-phone", formatPhone(order.clientPhone));
    Jana.bindText("detail-email", order.clientEmail || "—");
    Jana.bindText("detail-desired", formatDesired(order.desiredDate));
    Jana.bindText("detail-address", order.address || "—");
    Jana.bindText("detail-notes", order.notes || "—");
    Jana.bindText("detail-subtotal", Jana.formatBRL(order.subtotal || 0));
    Jana.bindText("detail-frete", Jana.formatBRL(order.frete || 0));
    Jana.bindText("detail-total", Jana.formatBRL(order.total || 0));

    const select = Jana.qs('[data-bind="detail-status"]');
    select.value = STATUS_LABELS[order.status] ? order.status : "novo";
    select.setAttribute("data-order-id", order.id);

    Jana.qs('[data-bind="detail-items"]').innerHTML = (order.items || [])
      .map(function item(row) {
        return (
          "<li><span>" +
          Jana.escapeHtml(row.quantity + "× " + row.name) +
          "</span><span>" +
          Jana.escapeHtml(Jana.formatBRL((row.price || 0) * (row.quantity || 0))) +
          "</span></li>"
        );
      })
      .join("") || "<li>Sem itens</li>";

    const phone = Jana.Store.digitsOnly(order.clientPhone);
    const wa = phone
      ? phone.length <= 11
        ? "55" + phone
        : phone
      : state.siteWhatsApp;
    const message =
      "Olá " +
      (order.clientName || "") +
      "! Sobre o pedido #" +
      (order.number || order.id) +
      " da Jana Abreu Confeitaria.";
    Jana.bindHref(
      "detail-whatsapp",
      "https://wa.me/" + wa + "?text=" + encodeURIComponent(message)
    );
  }

  function selectOrder(id) {
    state.selectedId = id;
    renderOrders();
    renderDetail(findOrder(id));
  }

  function switchTab(tab) {
    Jana.qsa(".painel-tabs button").forEach(function mark(btn) {
      const active = btn.getAttribute("data-tab") === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    Jana.qsa(".painel-panel").forEach(function panel(node) {
      const active = node.id === "tab-" + tab;
      node.classList.toggle("is-active", active);
      node.hidden = !active;
    });
  }

  function exportClientsCSV() {
    const rows = [["nome", "email", "telefone"]].concat(
      state.clients.map(function map(client) {
        return [client.nome || "", client.email || "", client.telefone || ""];
      })
    );
    Jana.Store.downloadCSV("clientes-jana-abreu.csv", rows);
    // FUTURE: also write Clients sheet via Google Apps Script
  }

  function onStatusChange(event) {
    const select = event.target;
    const orderId = select.getAttribute("data-order-id");
    const status = select.value;
    const order = findOrder(orderId);
    if (!order) return;

    order.status = status;
    // Demo JSON orders are not writable on disk; persist override in localStorage.
    const local = Jana.Store.localOrders();
    const existing = local.find(function find(item) {
      return item.id === orderId;
    });
    if (existing) {
      Jana.Store.updateOrderStatus(orderId, status);
    } else {
      local.unshift(Object.assign({}, order, { source: order.source || "demo-edit" }));
      localStorage.setItem(Jana.Store.ORDERS_KEY, JSON.stringify(local));
      // FUTURE: PATCH status in Google Sheets
    }
    renderOrders();
    renderDetail(order);
  }

  function bindEvents() {
    document.addEventListener("click", function onClick(event) {
      const tabBtn = event.target.closest("[data-tab]");
      if (tabBtn) {
        switchTab(tabBtn.getAttribute("data-tab"));
        return;
      }
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.getAttribute("data-action");
      if (action === "open-order") {
        selectOrder(actionEl.getAttribute("data-id"));
      }
      if (action === "export-clients") {
        exportClientsCSV();
      }
      if (action === "download-order") {
        const order = findOrder(state.selectedId);
        if (order) {
          Jana.Store.downloadJSON(
            "pedido-" + (order.number || order.id) + ".json",
            order
          );
        }
      }
    });

    document.addEventListener("keydown", function onKey(event) {
      const row = event.target.closest('[data-action="open-order"]');
      if (!row) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectOrder(row.getAttribute("data-id"));
      }
    });

    Jana.qs('[data-bind="detail-status"]').addEventListener("change", onStatusChange);
  }

  async function init() {
    bindEvents();
    try {
      const [orders, clients, site] = await Promise.all([
        Jana.loadJSON("../data/orders.json"),
        Jana.loadJSON("../data/clients.json"),
        Jana.loadJSON("../data/site.json"),
      ]);
      state.siteWhatsApp = (site.contato && site.contato.whatsapp) || state.siteWhatsApp;
      state.orders = Jana.Store.mergeOrders(orders);
      state.clients = Jana.Store.mergeClients(clients);
    } catch (err) {
      state.orders = Jana.Store.mergeOrders([]);
      state.clients = Jana.Store.mergeClients([]);
      console.error(err);
    }
    renderOrders();
    renderClients();
    if (state.orders[0]) {
      selectOrder(state.orders[0].id);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
