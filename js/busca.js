(function createBusca(global) {
  const Jana = global.Jana || (global.Jana = {});
  const SUGGESTION_LIMIT = 8;
  let catalog = null;
  let loading = null;
  let ui = null;
  let open = false;
  let activeIndex = -1;
  let suggestions = [];
  let lastQuery = "";
  let viewportHandler = null;

  function doc() {
    return global.document;
  }

  function qs(sel, root) {
    return (root || doc()).querySelector(sel);
  }

  function isDesktop() {
    return global.matchMedia && global.matchMedia("(min-width: 720px)").matches;
  }

  function setCatalog(data) {
    catalog = data || catalog;
  }

  async function ensureCatalog() {
    if (catalog && catalog.products) return catalog;
    if (loading) return loading;
    loading = Promise.all([
      Jana.loadJSON("data/products.json"),
      Jana.loadJSON("data/areas.json").catch(function noAreas() {
        return [];
      }),
      Jana.loadJSON("data/site.json").catch(function noSite() {
        return {};
      }),
    ]).then(function done(rows) {
      catalog = { products: rows[0] || [], areas: rows[1] || [], site: rows[2] || {} };
      return catalog;
    });
    return loading;
  }

  function resultsUrl(query) {
    const base = Jana.assetUrl ? Jana.assetUrl("busca/") : "busca/";
    const q = String(query || "").trim();
    return q ? base + "?q=" + encodeURIComponent(q) : base;
  }

  function productHref(product) {
    if (Jana.productPageUrl) return Jana.productPageUrl(product.slug);
    return Jana.assetUrl("produto/" + product.slug + "/");
  }

  function priceLabel(product) {
    if (Jana.productHasFixedPrice && Jana.productHasFixedPrice(product)) {
      return Jana.formatBRL(product.price);
    }
    if (typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0) {
      return Jana.formatBRL(product.price);
    }
    return "";
  }

  function ensureUi() {
    if (ui && doc().body.contains(ui.root)) return ui;
    const root = doc().createElement("div");
    root.className = "busca-ui";
    root.hidden = true;
    root.innerHTML =
      '<div class="busca-ui__backdrop" data-busca="close" hidden></div>' +
      '<div class="busca-ui__panel" role="dialog" aria-modal="true" aria-labelledby="busca-titulo">' +
      '  <div class="busca-ui__bar">' +
      '    <button type="button" class="busca-ui__fechar" data-busca="close" aria-label="Fechar busca">×</button>' +
      '    <form class="busca-ui__form" method="get" role="search">' +
      '      <span class="sr-only" id="busca-titulo">Buscar</span>' +
      '      <label class="sr-only" for="busca-campo">Buscar</label>' +
      '      <input id="busca-campo" name="q" type="search" autocomplete="off" enterkeyhint="search" inputmode="search" placeholder="Buscar produtos" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="busca-sugestoes" aria-haspopup="listbox">' +
      '      <button type="submit" class="busca-ui__submit" aria-label="Ver resultados">' +
      '        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M15.2 15.2 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>' +
      "      </button>" +
      "    </form>" +
      "  </div>" +
      '  <ul id="busca-sugestoes" class="busca-ui__lista" role="listbox" hidden></ul>' +
      '  <p class="busca-ui__vazio" data-busca="empty" hidden></p>' +
      "</div>";
    doc().body.appendChild(root);
    const input = qs("#busca-campo", root);
    const list = qs("#busca-sugestoes", root);
    const form = qs(".busca-ui__form", root);
    const empty = qs("[data-busca='empty']", root);
    form.addEventListener("submit", function onSubmit(event) {
      event.preventDefault();
      goToResults(input.value);
    });
    input.addEventListener("input", function onInput() {
      renderSuggestions(input.value);
    });
    input.addEventListener("keydown", onInputKey);
    root.addEventListener("click", function onClick(event) {
      const close = event.target.closest("[data-busca='close']");
      if (close) {
        event.preventDefault();
        closeSearch();
        return;
      }
      const option = event.target.closest("[data-busca-slug]");
      if (option) {
        event.preventDefault();
        chooseSuggestion(option.getAttribute("data-busca-slug"));
      }
    });
    ui = { root: root, input: input, list: list, form: form, empty: empty, panel: qs(".busca-ui__panel", root) };
    return ui;
  }

  function positionPanel() {
    if (!ui || !isDesktop()) {
      if (ui) {
        ui.root.style.top = "";
        ui.root.style.left = "";
        ui.root.style.width = "";
      }
      return;
    }
    const trigger = qs(".topo__busca-abrir");
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const width = Math.min(28.5 * 16, Math.max(280, global.innerWidth - 32));
    let left = box.left + box.width / 2 - width / 2;
    left = Math.max(16, Math.min(left, global.innerWidth - width - 16));
    ui.root.style.position = "fixed";
    ui.root.style.top = Math.round(box.bottom + 6) + "px";
    ui.root.style.left = Math.round(left) + "px";
    ui.root.style.width = Math.round(width) + "px";
    ui.root.style.transform = "none";
  }

  function syncViewport() {
    const vv = global.visualViewport;
    const height = vv && vv.height ? vv.height : global.innerHeight;
    doc().documentElement.style.setProperty("--busca-vvh", height + "px");
  }

  function bindViewport(on) {
    const vv = global.visualViewport;
    if (on) {
      syncViewport();
      if (viewportHandler) return;
      viewportHandler = function onView() {
        syncViewport();
        positionPanel();
      };
      if (vv) {
        vv.addEventListener("resize", viewportHandler);
        vv.addEventListener("scroll", viewportHandler);
      }
      global.addEventListener("resize", viewportHandler);
    } else if (viewportHandler) {
      if (vv) {
        vv.removeEventListener("resize", viewportHandler);
        vv.removeEventListener("scroll", viewportHandler);
      }
      global.removeEventListener("resize", viewportHandler);
      viewportHandler = null;
      doc().documentElement.style.removeProperty("--busca-vvh");
    }
  }

  function trackSearch(term) {
    if (Jana.Analytics && Jana.Analytics.search) {
      Jana.Analytics.search(term);
    }
  }

  function goToResults(query) {
    const q = String(query || "").trim();
    trackSearch(q);
    global.location.href = resultsUrl(q);
  }

  function chooseSuggestion(slug) {
    const item = suggestions.find(function find(row) {
      return row.product && row.product.slug === slug;
    });
    if (!item) return;
    trackSearch(ui && ui.input ? ui.input.value : lastQuery);
    global.location.href = productHref(item.product);
  }

  function setActive(index) {
    if (!ui) return;
    const options = ui.list.querySelectorAll("[role='option']");
    if (!options.length) {
      activeIndex = -1;
      ui.input.removeAttribute("aria-activedescendant");
      return;
    }
    if (index < 0) index = options.length - 1;
    if (index >= options.length) index = 0;
    activeIndex = index;
    Array.prototype.forEach.call(options, function mark(el, i) {
      const on = i === activeIndex;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
      if (on) {
        ui.input.setAttribute("aria-activedescendant", el.id);
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function renderSuggestions(query) {
    if (!ui || !catalog) return;
    lastQuery = query;
    const matches = Jana.searchProducts
      ? Jana.searchProducts(query, catalog.products, catalog.areas, catalog.site)
      : [];
    suggestions = matches.slice(0, SUGGESTION_LIMIT);
    activeIndex = -1;
    ui.input.removeAttribute("aria-activedescendant");
    const q = String(query || "").trim();
    if (!q) {
      ui.list.innerHTML = "";
      ui.list.hidden = true;
      ui.empty.hidden = true;
      ui.input.setAttribute("aria-expanded", "false");
      return;
    }
    if (!suggestions.length) {
      ui.list.innerHTML = "";
      ui.list.hidden = true;
      ui.empty.hidden = false;
      ui.empty.textContent = "Nenhum produto com «" + q + "». Toque em buscar para ver a página de resultados.";
      ui.input.setAttribute("aria-expanded", "false");
      return;
    }
    ui.empty.hidden = true;
    ui.list.hidden = false;
    ui.input.setAttribute("aria-expanded", "true");
    ui.list.innerHTML = suggestions
      .map(function row(item, i) {
        const product = item.product;
        const img = product.images && product.images[0] ? Jana.assetUrl(product.images[0]) : "";
        const price = priceLabel(product);
        const thumb = img
          ? '<img class="busca-ui__thumb" src="' +
            Jana.escapeHtml(img) +
            '" alt="" width="44" height="44">'
          : '<span class="busca-ui__thumb busca-ui__thumb--vazia" aria-hidden="true"></span>';
        return (
          '<li>' +
          '<a class="busca-ui__opcao" role="option" id="busca-opcao-' +
          i +
          '" href="' +
          Jana.escapeHtml(productHref(product)) +
          '" data-busca-slug="' +
          Jana.escapeHtml(product.slug) +
          '" aria-selected="false">' +
          thumb +
          '<span class="busca-ui__info"><span class="busca-ui__nome">' +
          Jana.escapeHtml(product.name) +
          "</span>" +
          (price ? '<span class="busca-ui__preco">' + Jana.escapeHtml(price) + "</span>" : "") +
          "</span></a></li>"
        );
      })
      .join("");
  }

  function onInputKey(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!suggestions.length) renderSuggestions(ui.input.value);
      setActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!suggestions.length) renderSuggestions(ui.input.value);
      setActive(activeIndex < 0 ? suggestions.length - 1 : activeIndex - 1);
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        chooseSuggestion(suggestions[activeIndex].product.slug);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    } else if (event.key === "Home" && suggestions.length && (event.ctrlKey || event.metaKey || event.altKey)) {
      /* keep default caret movement unless we want list home */
    }
  }

  async function openSearch(initial) {
    const box = ensureUi();
    open = true;
    box.root.hidden = false;
    box.root.classList.add("is-open");
    box.form.setAttribute("action", Jana.assetUrl ? Jana.assetUrl("busca/") : "busca/");
    doc().body.classList.add("is-busca-aberta");
    if (Jana.qs && Jana.qs("#topo") && typeof global.setMenuOpen !== "function") {
      /* menu close is handled via CustomEvent below */
    }
    doc().dispatchEvent(new CustomEvent("jana:busca-aberta"));
    bindViewport(true);
    positionPanel();
    try {
      await ensureCatalog();
    } catch (err) {
      catalog = catalog || { products: [], areas: [], site: {} };
    }
    const start = initial == null ? "" : String(initial);
    box.input.value = start;
    renderSuggestions(start);
    box.input.focus();
    try {
      box.input.setSelectionRange(start.length, start.length);
    } catch (err) {}
  }

  function closeSearch() {
    if (!ui) return;
    open = false;
    ui.root.classList.remove("is-open");
    ui.root.hidden = true;
    ui.input.setAttribute("aria-expanded", "false");
    ui.input.removeAttribute("aria-activedescendant");
    doc().body.classList.remove("is-busca-aberta");
    bindViewport(false);
    suggestions = [];
    activeIndex = -1;
    const trigger = qs(".topo__busca-abrir");
    if (trigger) trigger.focus();
  }

  function onDocumentClick(event) {
    const opener = event.target.closest && event.target.closest("[data-action='open-search'], .topo__busca-abrir");
    if (opener) {
      event.preventDefault();
      openSearch();
      return;
    }
    if (!open || !ui) return;
    if (isDesktop() && !ui.root.contains(event.target) && !event.target.closest(".topo__busca")) {
      closeSearch();
    }
  }

  function onDocumentKey(event) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeSearch();
    }
  }

  function currentQuery() {
    try {
      return String(new URLSearchParams(global.location.search).get("q") || "");
    } catch (err) {
      return "";
    }
  }

  function renderSearchPage(state) {
    const page = doc().body && doc().body.getAttribute("data-page") === "search";
    if (!page) return;
    if (state) setCatalog(state);
    const q = currentQuery();
    const input = qs('[data-bind="busca-q"]');
    const form = qs('[data-bind="busca-form"]');
    const status = qs('[data-bind="busca-status"]');
    const list = qs('[data-bind="busca-lista"]');
    if (form && Jana.assetUrl) form.setAttribute("action", Jana.assetUrl("busca/"));
    if (input && input !== doc().activeElement) input.value = q;
    const trimmed = q.trim();
    if (Jana.Analytics && Jana.Analytics.search && trimmed && !renderSearchPage.tracked) {
      Jana.Analytics.search(trimmed);
      renderSearchPage.tracked = true;
    }
    if (!catalog) return;
    if (status) {
      if (!trimmed) {
        status.textContent = "Digite o que você procura para ver os produtos da confeitaria.";
      } else {
        const found = Jana.searchProducts(trimmed, catalog.products, catalog.areas, catalog.site);
        if (!found.length) {
          status.innerHTML =
            "Não encontramos produtos para «" +
            Jana.escapeHtml(trimmed) +
            "». Tente outra palavra, ou <a href=\"https://wa.me/5561981246112\" target=\"_blank\" rel=\"noopener noreferrer\">fale com a gente pelo WhatsApp</a>.";
        } else {
          status.textContent =
            found.length === 1
              ? "Encontramos 1 produto para «" + trimmed + "»."
              : "Encontramos " + found.length + " produtos para «" + trimmed + "».";
        }
      }
    }
    if (list) {
      if (!trimmed) {
        list.innerHTML = "";
        return;
      }
      const found = Jana.searchProducts(trimmed, catalog.products, catalog.areas, catalog.site);
      if (!found.length) {
        list.innerHTML = "";
        return;
      }
      if (typeof Jana.renderSearchCards === "function") {
        list.innerHTML = found
          .map(function row(item) {
            return Jana.renderSearchCards(item.product);
          })
          .join("");
      }
    }
  }

  function bind() {
    if (!doc()) return;
    doc().addEventListener("click", onDocumentClick);
    doc().addEventListener("keydown", onDocumentKey);
    global.addEventListener("resize", function onResize() {
      if (open) positionPanel();
    });
  }

  if (doc() && doc().readyState === "loading") {
    doc().addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  Jana.setSearchCatalog = setCatalog;
  Jana.openSearch = openSearch;
  Jana.closeSearch = closeSearch;
  Jana.renderSearchPage = renderSearchPage;
})(window);
