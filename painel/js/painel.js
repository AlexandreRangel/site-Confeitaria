(function startPainel(global) {
  const Jana = global.Jana;
  const state = {
    orders: [],
    clients: [],
    view: "pedidos",
    currentId: null,
  };
  const STATUS = {
    novo: "Novo",
    "em-producao": "Em produção",
    pronto: "Pronto",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };

  async function init() {
    const seed = await Promise.all([
      Jana.loadJSON("../data/orders.json"),
      Jana.loadJSON("../data/clients.json"),
    ]);
    state.orders = Jana.Persist.loadOverlay(Jana.Persist.ORDERS_KEY, seed[0]);
    state.clients = Jana.Persist.loadOverlay(Jana.Persist.CLIENTS_KEY, seed[1]);
    bind();
    route();
  }

  function persist() {
    Jana.Persist.saveOrders(state.orders);
    Jana.Persist.saveClients(state.clients);
  }

  function renderList() {
    const sorted = state.orders.slice().sort(function byNumber(a, b) {
      return (b.number || 0) - (a.number || 0);
    });
    Jana.qs('[data-bind="order-list"]').innerHTML = sorted
      .map(function card(order) {
        return (
          '<button type="button" class="order-card" data-action="open-order" data-id="' +
          Jana.escapeHtml(order.id) +
          '"><div class="order-card__top"><strong>#' +
          Jana.escapeHtml(order.id) +
          '</strong><span class="status status--' +
          Jana.escapeHtml(order.status) +
          '">' +
          Jana.escapeHtml(STATUS[order.status] || order.status) +
          "</span></div><p>" +
          Jana.escapeHtml(order.customer.nome) +
          " · " +
          Jana.escapeHtml(formatDate(order.desiredDate || order.createdAt)) +
          "</p><p>" +
          Jana.formatBRL(order.total) +
          " · " +
          Jana.escapeHtml(order.address.tipo) +
          "</p></button>"
        );
      })
      .join("");
  }

  function renderDetail(id) {
    const order = state.orders.find(function match(item) {
      return item.id === id;
    });
    if (!order) {
      location.hash = "pedidos";
      return;
    }
    const phone = String(order.whatsapp || order.customer.telefone || "").replace(/\D/g, "");
    const wa = phone ? "https://wa.me/55" + phone.replace(/^55/, "") : "#";
    const rows = order.items
      .map(function itemRow(item) {
        const line = typeof item.price === "number" ? item.price * item.quantity : null;
        return (
          "<tr><td>" +
          item.quantity +
          "× " +
          Jana.escapeHtml(item.name) +
          (item.notes ? "<br><small>" + Jana.escapeHtml(item.notes) + "</small>" : "") +
          "</td><td>" +
          Jana.formatBRL(line) +
          "</td></tr>"
        );
      })
      .join("");
    Jana.qs('[data-bind="order-detail"]').innerHTML =
      '<div class="ticket__top"><p class="ticket__id">Pedido #' +
      Jana.escapeHtml(order.id) +
      '</p><span class="status status--' +
      Jana.escapeHtml(order.status) +
      '">' +
      Jana.escapeHtml(STATUS[order.status] || order.status) +
      "</span></div>" +
      '<div class="ticket__grid"><div><h2>Cliente</h2><p>' +
      Jana.escapeHtml(order.customer.nome) +
      "<br>" +
      Jana.escapeHtml(order.customer.email || "—") +
      "<br>" +
      Jana.escapeHtml(order.customer.telefone) +
      '</p><p><a class="btn btn--whatsapp" href="' +
      wa +
      '" target="_blank" rel="noopener noreferrer">WhatsApp do cliente</a></p>' +
      "<h2>Itens</h2><table><thead><tr><th>Item</th><th>Valor</th></tr></thead><tbody>" +
      rows +
      '</tbody></table></div><div><h2>Valores</h2><div class="ticket__totals"><p><span>Subtotal</span><strong>' +
      Jana.formatBRL(order.subtotal) +
      "</strong></p><p><span>Frete</span><strong>" +
      Jana.formatBRL(order.frete) +
      "</strong></p><p><span>Total</span><strong>" +
      Jana.formatBRL(order.total) +
      "</strong></p></div><h2>Endereço</h2><p>" +
      Jana.escapeHtml(order.address.tipo) +
      " · " +
      Jana.escapeHtml(order.address.bairro || "") +
      "<br>" +
      Jana.escapeHtml(order.address.line || "") +
      "<br>" +
      Jana.escapeHtml(order.address.cidade || "") +
      "</p><h2>Datas</h2><p>Pedido: " +
      Jana.escapeHtml(formatDate(order.createdAt)) +
      "<br>Desejada: " +
      Jana.escapeHtml(formatDate(order.desiredDate)) +
      "</p><h2>Observações</h2><p>" +
      Jana.escapeHtml(order.notes || "—") +
      "</p></div></div>";
  }

  function renderClients() {
    Jana.qs('[data-bind="client-rows"]').innerHTML = state.clients
      .map(function row(client) {
        return (
          "<tr><td>" +
          Jana.escapeHtml(client.nome) +
          "</td><td>" +
          Jana.escapeHtml(client.email || "") +
          "</td><td>" +
          Jana.escapeHtml(client.telefone) +
          "</td><td>" +
          Jana.escapeHtml(client.bairro || "") +
          "</td></tr>"
        );
      })
      .join("");
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split("-");
      return parts[2] + "/" + parts[1] + "/" + parts[0];
    }
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("pt-BR");
  }

  function show(view) {
    state.view = view;
    Jana.qsa("[data-panel]").forEach(function toggle(panel) {
      panel.hidden = panel.getAttribute("data-panel") !== view;
    });
    if (view === "pedidos") renderList();
    if (view === "clientes") renderClients();
    if (view === "pedido") renderDetail(state.currentId);
  }

  function route() {
    const hash = decodeURIComponent(location.hash || "#pedidos");
    if (hash.indexOf("#pedido:") === 0) {
      state.currentId = hash.replace("#pedido:", "");
      show("pedido");
      return;
    }
    if (hash === "#clientes") {
      show("clientes");
      return;
    }
    show("pedidos");
  }

  function bind() {
    document.addEventListener("click", function onClick(event) {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.getAttribute("data-action");
      if (action === "open-order") {
        location.hash = "pedido:" + target.getAttribute("data-id");
      }
      if (action === "download-orders") {
        Jana.Persist.downloadJSON("orders.json", state.orders);
      }
      if (action === "download-clients") {
        Jana.Persist.downloadJSON("clients.json", state.clients);
      }
      if (action === "export-clients-csv") {
        Jana.Persist.downloadCSV("clientes.csv", Jana.Persist.clientsToCSV(state.clients));
      }
      if (action === "reset-demo") {
        Jana.Persist.clearDemo();
        location.reload();
      }
    });
    Jana.qs("#client-form").addEventListener("submit", function onSubmit(event) {
      event.preventDefault();
      const data = new FormData(event.target);
      Jana.Persist.upsertClient(state.clients, {
        nome: String(data.get("nome") || "").trim(),
        email: String(data.get("email") || "").trim(),
        telefone: String(data.get("telefone") || "").trim(),
        bairro: String(data.get("bairro") || "").trim(),
      });
      persist();
      event.target.reset();
      renderClients();
    });
    window.addEventListener("hashchange", route);
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
