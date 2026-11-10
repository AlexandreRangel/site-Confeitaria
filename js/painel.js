(function createPainel(global) {
  const Jana = global.Jana;
  const STATUS_LABELS = {
    solicitado: "Solicitado",
    confirmado: "Confirmado",
    em_producao: "Em produção",
    pronto: "Pronto",
    entregue: "Entregue",
    cancelado: "Cancelado",
    novo: "Solicitado",
    em_preparo: "Em produção",
    "aguardando pagamento": "Aguardando pagamento",
    pago: "Pago",
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
    const key =
      status === "novo"
        ? "solicitado"
        : status === "em_preparo"
          ? "em_producao"
          : status === "aguardando pagamento"
            ? "solicitado"
            : status === "pago"
              ? "confirmado"
              : STATUS_LABELS[status]
                ? status
                : "solicitado";
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
    Jana.bindText("detail-payment-status", order.paymentStatus || "—");
    Jana.bindText("detail-order-nsu", order.orderNsu || "—");
    Jana.bindText("detail-payment-method", Jana.paymentMethodCsv ? Jana.paymentMethodCsv(order) : order.paymentMethod || "—");
    const receipt = Jana.qs("[data-bind='detail-receipt']");
    if (receipt) {
      if (order.receiptUrl) {
        receipt.hidden = false;
        receipt.setAttribute("href", order.receiptUrl);
        receipt.textContent = "Ver comprovante";
      } else {
        receipt.hidden = true;
        receipt.textContent = "";
      }
    }
    Jana.bindText(
      "detail-modalidade",
      order.modalidade === "entrega" ? "Entrega" : order.modalidade === "retirada" ? "Retirada" : "—"
    );
    const subtotal = calculateSubtotal(order);
    const frete = Number(order.frete) || 0;
    Jana.bindText("detail-subtotal", Jana.formatBRL(subtotal));
    Jana.bindText(
      "detail-frete",
      order.taxaPendente ? "a confirmar pela Jana" : Jana.formatBRL(order.taxa != null ? order.taxa : frete)
    );
    Jana.bindText("detail-total", Jana.formatBRL(subtotal + frete));

    const select = Jana.qs('[data-bind="detail-status"]');
    const mapped =
      order.status === "novo"
        ? "solicitado"
        : order.status === "em_preparo"
          ? "em_producao"
          : STATUS_LABELS[order.status]
            ? order.status
            : "solicitado";
    select.value = mapped;
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
        const qty = item.quantity != null ? item.quantity : item.qty != null ? item.qty : item.quantidade;
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
      order.modalidade || "",
      order.taxaPendente ? "a confirmar" : order.taxa != null ? order.taxa : order.frete != null ? order.frete : "",
      order.frete != null ? order.frete : "",
      order.total != null ? order.total : "",
      order.source || "",
      order.paymentStatus || "",
      order.orderNsu || "",
      Jana.paymentMethodCsv ? Jana.paymentMethodCsv(order) : order.paymentMethod || "",
      order.receiptUrl || "",
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
      "modalidade",
      "taxa",
      "frete",
      "total",
      "origem",
      "status_pagamento",
      "order_nsu",
      "metodo",
      "comprovante",
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
      "modalidade",
      "taxa",
      "frete",
      "total",
      "origem",
      "status_pagamento",
      "order_nsu",
      "metodo",
      "comprovante",
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

  function bindCentral(site) {
    const statusEl = Jana.qs('[data-bind="central-status"]');
    const form = Jana.qs('[data-bind="central-login"]');
    const resultEl = Jana.qs('[data-bind="central-result"]');
    const listEl = Jana.qs('[data-bind="central-orders"]');
    const enabled = Jana.Central && Jana.Central.isEnabled(site);
    if (!enabled) {
      if (statusEl) {
        statusEl.textContent =
          "Canal compartilhado desligado. Pedidos iguais entre aparelhos exigem o Worker descrito em central/README.md. Este painel local continua só neste navegador. Nada sobe automaticamente.";
      }
      if (form) form.hidden = true;
      if (listEl) listEl.hidden = true;
      return;
    }
    if (statusEl) {
      statusEl.textContent =
        "Canal ligado neste site. Informe o token de administração (fica só neste navegador). Listar ou alterar pedidos exige autorização no servidor.";
    }
    if (!form || !resultEl || !listEl) return;
    form.hidden = false;
    form.addEventListener("submit", async function onCentralLogin(event) {
      event.preventDefault();
      const token = (form.token && form.token.value ? form.token.value : "").trim();
      if (!token) {
        resultEl.textContent = "Informe o token.";
        return;
      }
      try {
        sessionStorage.setItem("jana-abreu-admin-token-v1", token);
      } catch (err) {
        /* sessionStorage may be blocked */
      }
      const listed = await Jana.Central.adminList(site, token);
      if (!listed.ok) {
        listEl.hidden = true;
        listEl.innerHTML = "";
        resultEl.textContent =
          listed.reason === "denied" ? "Acesso recusado." : "Canal indisponível.";
        return;
      }
      resultEl.textContent = listed.orders.length + " solicitação(ões) no canal.";
      listEl.hidden = false;
      listEl.innerHTML = listed.orders
        .map(function row(order) {
          return (
            '<article class="painel-central__order"><strong>#' +
            Jana.escapeHtml(order.number || order.id) +
            "</strong> " +
            Jana.escapeHtml(order.clientName || "") +
            ' <label>Status <select data-central-status data-id="' +
            Jana.escapeHtml(order.id) +
            '">' +
            Object.keys(STATUS_LABELS)
              .filter(function onlyCurrent(key) {
                return key !== "novo" && key !== "em_preparo";
              })
              .map(function option(key) {
                const selected = order.status === key ? " selected" : "";
                return (
                  '<option value="' +
                  key +
                  '"' +
                  selected +
                  ">" +
                  Jana.escapeHtml(STATUS_LABELS[key]) +
                  "</option>"
                );
              })
              .join("") +
            "</select></label></article>"
          );
        })
        .join("");
    });
    listEl.addEventListener("change", async function onCentralStatus(event) {
      const select = event.target.closest("[data-central-status]");
      if (!select) return;
      let token = "";
      try {
        token = sessionStorage.getItem("jana-abreu-admin-token-v1") || "";
      } catch (err) {
        token = "";
      }
      const patched = await Jana.Central.adminPatch(site, token, select.getAttribute("data-id"), {
        status: select.value,
      });
      resultEl.textContent = patched.ok
        ? "Status atualizado no canal."
        : patched.reason === "denied"
          ? "Acesso recusado."
          : "Não foi possível alterar o status.";
    });
  }

  async function init() {
    bindEvents();
    let site = {};
    try {
      const [orders, clients, loadedSite] = await Promise.all([
        Jana.loadJSON("../data/orders.json"),
        Jana.loadJSON("../data/clients.json"),
        Jana.loadJSON("../data/site.json"),
      ]);
      site = loadedSite || {};
      state.siteWhatsApp = (site.contato && site.contato.whatsapp) || state.siteWhatsApp;
      state.orders = Jana.Store.mergeOrders(orders);
      state.clients = Jana.Store.mergeClients(clients);
    } catch (err) {
      state.orders = Jana.Store.mergeOrders([]);
      state.clients = Jana.Store.mergeClients([]);
      console.error(err);
    }
    bindCentral(site);
    renderOrders();
    renderClients();
    if (state.orders[0]) {
      selectOrder(state.orders[0].id);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
