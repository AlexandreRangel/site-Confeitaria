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
    editingId: null,
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
        '<tr><td colspan="5" class="painel-empty">Nenhum pedido ainda.</td></tr>';
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
          '<td class="painel-row-actions">' +
          '<button type="button" class="btn btn--small btn--outline" data-action="edit-order" data-id="' +
          Jana.escapeHtml(order.id) +
          '" aria-label="Editar pedido #' +
          Jana.escapeHtml(order.number || order.id) +
          '">Editar</button>' +
          '<button type="button" class="btn btn--small btn--danger" data-action="delete-order" data-id="' +
          Jana.escapeHtml(order.id) +
          '" aria-label="Excluir pedido #' +
          Jana.escapeHtml(order.number || order.id) +
          '">Excluir</button>' +
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

  function calculateSubtotal(order) {
    if (Array.isArray(order.items)) {
      return order.items.reduce(function sum(total, item) {
        const quantity = Number(item.quantity != null ? item.quantity : item.qty || item.quantidade) || 0;
        return total + (Number(item.price) || 0) * quantity;
      }, 0);
    }
    return Number(order.subtotal) || 0;
  }

  function setEditMode(editing) {
    const form = Jana.qs('[data-bind="detail-edit-form"]');
    const meta = Jana.qs('[data-bind="detail-meta"]');
    const editButton = Jana.qs('[data-action="edit-order"]', Jana.qs('[data-bind="order-detail"]'));
    if (!form || !meta) return;
    form.hidden = !editing;
    meta.hidden = editing;
    if (editButton) editButton.hidden = editing;
  }

  function populateEditForm(order) {
    const values = {
      "edit-client-name": order.clientName || "",
      "edit-client-phone": order.clientPhone || "",
      "edit-client-email": order.clientEmail || "",
      "edit-desired-date": order.desiredDate || "",
      "edit-address": order.address || "",
      "edit-notes": order.notes || "",
      "edit-frete": Number(order.frete) || 0,
    };
    Object.keys(values).forEach(function setValue(key) {
      const field = Jana.qs('[data-bind="' + key + '"]');
      if (field) field.value = values[key];
    });
  }

  function syncEditTotals() {
    const order = findOrder(state.editingId);
    const field = Jana.qs('[data-bind="edit-frete"]');
    if (!order || !field) return;
    const frete = Math.max(0, Number(field.value) || 0);
    Jana.bindText("detail-frete", Jana.formatBRL(frete));
    Jana.bindText("detail-total", Jana.formatBRL(calculateSubtotal(order) + frete));
  }

  function renderDetail(order) {
    const panel = Jana.qs('[data-bind="order-detail"]');
    if (!order) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    state.editingId = null;
    setEditMode(false);
    populateEditForm(order);
    Jana.bindText("detail-title", "Pedido #" + (order.number || order.id));
    Jana.bindText("detail-status-label", STATUS_LABELS[order.status] || order.status);
    Jana.bindText("detail-client", order.clientName || "—");
    Jana.bindText("detail-phone", formatPhone(order.clientPhone));
    Jana.bindText("detail-email", order.clientEmail || "—");
    Jana.bindText("detail-desired", formatDesired(order.desiredDate));
    Jana.bindText("detail-address", order.address || "—");
    Jana.bindText("detail-notes", order.notes || "—");
    const subtotal = calculateSubtotal(order);
    const frete = Number(order.frete) || 0;
    Jana.bindText("detail-subtotal", Jana.formatBRL(subtotal));
    Jana.bindText("detail-frete", Jana.formatBRL(frete));
    Jana.bindText("detail-total", Jana.formatBRL(subtotal + frete));

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

  function exportClientsJSON() {
    Jana.Store.downloadJSON("clientes-jana-abreu.json", state.clients);
  }

  function orderItemsSummary(order) {
    return (order.items || [])
      .map(function map(item) {
        const qty = item.qty != null ? item.qty : item.quantidade;
        const name = item.name || item.nome || "";
        return (qty != null ? qty + "x " : "") + name;
      })
      .filter(Boolean)
      .join("; ");
  }

  function orderToCsvRow(order) {
    return [
      order.number || order.id || "",
      order.status || "",
      order.createdAt || "",
      order.desiredDate || "",
      order.clientName || order.cliente || "",
      order.clientPhone || order.telefone || "",
      order.clientEmail || order.email || "",
      order.address || order.endereco || "",
      order.notes || order.observacoes || "",
      orderItemsSummary(order),
      order.subtotal != null ? order.subtotal : "",
      order.frete != null ? order.frete : "",
      order.total != null ? order.total : "",
      order.source || "",
    ];
  }

  function exportOrdersCSV() {
    const header = [
      "pedido",
      "status",
      "criado_em",
      "data_desejada",
      "nome",
      "telefone",
      "email",
      "endereco",
      "observacoes",
      "itens",
      "subtotal",
      "frete",
      "total",
      "origem",
    ];
    const rows = [header].concat(state.orders.map(orderToCsvRow));
    Jana.Store.downloadCSV("pedidos-jana-abreu.csv", rows);
  }

  function exportOrdersJSON() {
    Jana.Store.downloadJSON("pedidos-jana-abreu.json", state.orders);
  }

  function downloadOrderCSV(order) {
    const header = [
      "pedido",
      "status",
      "criado_em",
      "data_desejada",
      "nome",
      "telefone",
      "email",
      "endereco",
      "observacoes",
      "itens",
      "subtotal",
      "frete",
      "total",
      "origem",
    ];
    Jana.Store.downloadCSV(
      "pedido-" + (order.number || order.id) + ".csv",
      [header, orderToCsvRow(order)]
    );
  }

  function onStatusChange(event) {
    const select = event.target;
    const orderId = select.getAttribute("data-order-id");
    const status = select.value;
    const order = findOrder(orderId);
    if (!order) return;

    const saved = Jana.Store.updateOrder(
      Object.assign({}, order, {
        status: status,
        source: order.source === "demo" ? "demo-edit" : order.source || "painel-edit",
      })
    );
    if (!saved) return;
    state.orders = state.orders.map(function replace(row) {
      return row.id === orderId ? saved : row;
    });
    renderOrders();
    renderDetail(saved);
  }

  function startEditing(orderId) {
    const order = findOrder(orderId);
    if (!order) return;
    if (state.selectedId !== orderId) {
      selectOrder(orderId);
    }
    state.editingId = orderId;
    populateEditForm(order);
    setEditMode(true);
    const nameField = Jana.qs('[data-bind="edit-client-name"]');
    if (nameField) nameField.focus();
  }

  function cancelEditing() {
    const order = findOrder(state.selectedId);
    state.editingId = null;
    if (order) {
      renderDetail(order);
    }
  }

  function saveEditing(event) {
    event.preventDefault();
    const order = findOrder(state.editingId);
    if (!order) return;
    const getValue = function getValue(key) {
      const field = Jana.qs('[data-bind="' + key + '"]');
      return field ? field.value.trim() : "";
    };
    const name = getValue("edit-client-name");
    const nameField = Jana.qs('[data-bind="edit-client-name"]');
    if (!name) {
      if (nameField) nameField.focus();
      return;
    }
    const freteField = Jana.qs('[data-bind="edit-frete"]');
    const frete = Math.max(0, Number(freteField && freteField.value) || 0);
    const subtotal = calculateSubtotal(order);
    const saved = Jana.Store.updateOrder(
      Object.assign({}, order, {
        clientName: name,
        clientPhone: Jana.Store.digitsOnly(getValue("edit-client-phone")),
        clientEmail: getValue("edit-client-email"),
        desiredDate: getValue("edit-desired-date"),
        address: getValue("edit-address"),
        notes: getValue("edit-notes"),
        subtotal: subtotal,
        frete: frete,
        total: subtotal + frete,
        source: order.source === "demo" ? "demo-edit" : order.source || "painel-edit",
      })
    );
    if (!saved) return;
    state.orders = state.orders.map(function replace(row) {
      return row.id === saved.id ? saved : row;
    });
    state.editingId = null;
    renderOrders();
    renderDetail(saved);
  }

  function deleteOrder(orderId) {
    const order = findOrder(orderId);
    if (!order) return;
    const label = order.number || order.id;
    if (!window.confirm("Excluir o pedido #" + label + "?\nEssa ação não poderá ser desfeita.")) {
      return;
    }
    Jana.Store.deleteOrder(orderId);
    state.orders = state.orders.filter(function keep(row) {
      return row.id !== orderId;
    });
    state.editingId = null;
    if (state.selectedId === orderId) {
      state.selectedId = null;
      renderDetail(null);
    }
    renderOrders();
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
        return;
      }
      if (action === "edit-order") {
        startEditing(actionEl.getAttribute("data-id") || state.selectedId);
        return;
      }
      if (action === "delete-order") {
        deleteOrder(actionEl.getAttribute("data-id") || state.selectedId);
        return;
      }
      if (action === "cancel-edit") {
        cancelEditing();
        return;
      }
      if (action === "export-clients") {
        exportClientsCSV();
      }
      if (action === "export-clients-json") {
        exportClientsJSON();
      }
      if (action === "export-orders-csv") {
        exportOrdersCSV();
      }
      if (action === "export-orders-json") {
        exportOrdersJSON();
      }
      if (action === "download-order-csv") {
        const order = findOrder(state.selectedId);
        if (order) downloadOrderCSV(order);
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
      if (!row || event.target !== row) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectOrder(row.getAttribute("data-id"));
      }
    });

    document.addEventListener("submit", function onSubmit(event) {
      if (event.target.matches('[data-bind="detail-edit-form"]')) {
        saveEditing(event);
      }
    });
    document.addEventListener("input", function onInput(event) {
      if (event.target.matches('[data-bind="edit-frete"]')) {
        syncEditTotals();
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
