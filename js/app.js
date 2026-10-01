(function startApp(global) {
  const Jana = global.Jana;
  const state = {
    site: null,
    categories: [],
    carousel: [],
    products: [],
    filter: "todas",
    slide: 0,
    timer: null,
    currentProduct: null,
    galleryIndex: 0,
  };

  function isCategoryPage() {
    return document.body.getAttribute("data-page") === "category";
  }

  function pageCategoryId() {
    return document.body.getAttribute("data-category") || "";
  }

  function clearPageHash() {
    history.replaceState(null, "", location.pathname + location.search);
  }

  async function init() {
    try {
      const loaded = await Promise.all([
        Jana.loadJSON("data/site.json"),
        Jana.loadJSON("data/categories.json"),
        Jana.loadJSON("data/carousel.json"),
        Jana.loadJSON("data/products.json"),
      ]);
      state.site = loaded[0];
      state.categories = loaded[1].slice().sort(byOrder);
      state.carousel = loaded[2].slice().sort(byOrder);
      state.products = loaded[3].filter(function isActive(product) {
        return product.active !== false;
      });
      if (isCategoryPage()) {
        state.filter = pageCategoryId() || "todas";
      }
      applyBrand();
      renderCarousel();
      renderCategories();
      renderDestaques();
      renderProducts();
      renderInstagram();
      renderCart();
      bindEvents();
      startCarousel();
      openFromHash();
    } catch (err) {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<p class="empty" role="alert">Não foi possível carregar os dados JSON. Sirva a pasta do site por HTTP (GitHub Pages ou um servidor local).</p>'
      );
    }
  }

  function byOrder(a, b) {
    return (a.order || 0) - (b.order || 0);
  }

  function applyBrand() {
    const site = state.site;
    const instagram = site.contato.instagram;
    const handle = Jana.instagramHandle(instagram);
    const instaUrl = Jana.instagramUrl(instagram);
    const whatsapp = site.contato.whatsapp;
    const address = [site.address.street, site.address.neighborhood, site.address.city + " - " + site.address.state]
      .filter(Boolean)
      .join(", ");
    Jana.bindText("brandName", site.brandName);
    Jana.bindText("tagline", site.tagline);
    Jana.bindText("visit-title", site.heroVisitTitle);
    Jana.bindText("visit-subtitle", site.heroVisitSubtitle);
    Jana.bindText("address", address);
    Jana.bindText("hours", site.hours);
    Jana.bindText("payments", site.paymentsNote);
    Jana.bindText("whatsapp-label", site.contato.whatsappLabel);
    Jana.bindHref("whatsapp-link", "https://wa.me/" + whatsapp);
    Jana.bindText("instagram-handle", handle);
    Jana.bindHref("instagram-link", instaUrl);
    Jana.bindText("sobremesas-title", site.destaquesCopy.sobremesasTitle);
    Jana.bindText("sobremesas-text", site.destaquesCopy.sobremesasText);
    Jana.bindText("presentes-title", site.destaquesCopy.presentesTitle);
    Jana.bindText("bolos-title", site.destaquesCopy.bolosPedidosTitle);
    Jana.bindText("year", String(new Date().getFullYear()));
    document.title = site.brandName;
    applyCategoryTitle();
    if (site.logo) {
      Jana.qsa('[data-bind="logo"]').forEach(function setLogo(img) {
        img.src = Jana.assetUrl(site.logo);
        img.alt = site.brandName || "";
      });
    }
    if (site.colors) {
      const root = document.documentElement;
      const c = site.colors;
      if (c.primary) {
        root.style.setProperty("--primary", c.primary);
        root.style.setProperty("--mint", c.primary);
        root.style.setProperty("--copper", c.primary);
      }
      if (c.secondary) {
        root.style.setProperty("--secondary", c.secondary);
        root.style.setProperty("--mint-light", c.secondary);
        root.style.setProperty("--blush", c.secondary);
      }
      if (c.mint) root.style.setProperty("--mint", c.mint);
      if (c.mintLight) root.style.setProperty("--mint-light", c.mintLight);
      if (c.blush) root.style.setProperty("--blush", c.blush);
      if (c.copper) root.style.setProperty("--copper", c.copper);
      if (c.cream) root.style.setProperty("--cream", c.cream);
      if (c.ink) root.style.setProperty("--ink", c.ink);
    }
  }

  function applyCategoryTitle() {
    if (!isCategoryPage()) {
      return;
    }
    const category = state.categories.find(function findCat(item) {
      return item.id === state.filter || item.slug === state.filter;
    });
    const name = category ? category.name : "Categoria";
    Jana.bindText("category-title", name);
    if (state.site && state.site.brandName) {
      document.title = name + " · " + state.site.brandName;
    }
  }

  function renderCarousel() {
    const track = Jana.qs('[data-bind="carousel"]');
    const dots = Jana.qs('[data-bind="carousel-dots"]');
    if (!track || !dots) {
      return;
    }
    track.innerHTML = state.carousel
      .map(function slideHtml(slide) {
        return (
          '<article class="hero__slide">' +
          '<img src="' + Jana.escapeHtml(Jana.assetUrl(slide.image)) + '" alt="' +
          Jana.escapeHtml(slide.title || "") +
          '">' +
          "</article>"
        );
      })
      .join("");
    dots.innerHTML = state.carousel
      .map(function dotHtml(_, index) {
        return (
          '<button type="button" class="hero__dot' +
          (index === 0 ? " is-active" : "") +
          '" data-action="carousel-goto" data-index="' +
          index +
          '" aria-label="Ir para o slide ' +
          (index + 1) +
          '"></button>'
        );
      })
      .join("");
    updateHeroCaption(false);
  }

  function updateHeroCaption(animate) {
    const slide = state.carousel[state.slide];
    if (!slide) return;
    const inner = Jana.qs('[data-bind="hero-caption-inner"]');
    const titleEl = Jana.qs('[data-bind="hero-slide-title"]');
    const subtitleEl = Jana.qs('[data-bind="hero-slide-subtitle"]');
    const cta = Jana.qs('[data-bind="hero-slide-cta"]');
    if (!inner || !titleEl || !subtitleEl || !cta) return;

    const apply = function applyText() {
      titleEl.textContent = slide.title || "";
      subtitleEl.textContent = slide.subtitle || "";
      cta.setAttribute("data-category", slide.linkCategory || "");
      cta.setAttribute("data-slug", slide.productSlug || "");
      const target = slide.productSlug
        ? "#produto:" + slide.productSlug
        : slide.linkCategory
          ? Jana.categoryUrl(slide.linkCategory)
          : "#categorias";
      cta.setAttribute("data-href", target);
    };

    if (!animate) {
      apply();
      inner.classList.remove("is-fading");
      return;
    }

    inner.classList.add("is-fading");
    window.setTimeout(function onFaded() {
      apply();
      inner.classList.remove("is-fading");
    }, 280);
  }

  function goToSlide(index) {
    const total = state.carousel.length;
    if (!total) return;
    const next = (index + total) % total;
    const changed = next !== state.slide;
    state.slide = next;
    const track = Jana.qs('[data-bind="carousel"]');
    if (track) {
      track.style.transform = "translateX(-" + state.slide * 100 + "%)";
    }
    Jana.qsa(".hero__dot").forEach(function mark(dot, i) {
      dot.classList.toggle("is-active", i === state.slide);
    });
    updateHeroCaption(changed);
  }

  function startCarousel() {
    if (!Jana.qs("#hero-carrossel") || !state.carousel.length) {
      return;
    }
    stopCarousel();
    state.timer = setInterval(function advance() {
      goToSlide(state.slide + 1);
    }, 5600);
  }

  function stopCarousel() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function renderCategories() {
    const row = Jana.qs('[data-bind="categories"]');
    if (!row) {
      return;
    }
    const current = isCategoryPage() ? state.filter : "";
    row.innerHTML = state.categories
      .map(function categoryHtml(category) {
        const slug = Jana.categorySlug(category);
        const active = current === category.id || current === slug ? " is-active" : "";
        return (
          '<a class="bolinha' +
          active +
          '" href="' +
          Jana.escapeHtml(Jana.categoryUrl(slug)) +
          '"' +
          (active ? ' aria-current="page"' : "") +
          ">" +
          '<span class="bolinha__media"><img src="' +
          Jana.escapeHtml(Jana.assetUrl(category.image)) +
          '" alt=""></span>' +
          "<span>" +
          Jana.escapeHtml(category.name) +
          "</span></a>"
        );
      })
      .join("");
  }

  function productCard(product) {
    const exemplo = product.tags && product.tags.indexOf("exemplo") !== -1;
    return (
      '<article class="card" id="produto:' +
      Jana.escapeHtml(product.slug) +
      '">' +
      '<div class="card__media">' +
      (exemplo ? '<span class="badge">Exemplo</span>' : "") +
      '<img src="' +
      Jana.escapeHtml(Jana.assetUrl(product.images[0])) +
      '" alt="' +
      Jana.escapeHtml(product.name) +
      '">' +
      "</div>" +
      '<div class="card__body">' +
      "<h3>" +
      Jana.escapeHtml(product.name) +
      "</h3>" +
      '<p class="card__price">' +
      Jana.formatBRL(product.price) +
      "</p>" +
      '<div class="card__actions">' +
      '<button type="button" class="btn btn--outline" data-action="open-product" data-slug="' +
      Jana.escapeHtml(product.slug) +
      '">Ver mais</button>' +
      '<button type="button" class="btn btn--solid" data-action="add-product" data-slug="' +
      Jana.escapeHtml(product.slug) +
      '">Adicionar</button>' +
      "</div></div></article>"
    );
  }

  function renderDestaques() {
    const copy = state.site.destaquesCopy;
    const promos = [
      { title: copy.kitsTitle, category: "cestas-presentes", cta: "Ver mais", image: "assets/products/cesta-rubi/01.webp" },
      { title: copy.bolosTitle, category: "bolos", cta: "Confira", image: "assets/products/bolo-2-andares-g-p/01.webp" },
      { title: copy.docesTitle, category: "doces-festa", cta: "Ver tudo", image: "assets/products/caixa-parabens-individual-kit-com-10-und/01.webp" },
    ];
    const promoEl = Jana.qs('[data-bind="promo-cards"]');
    if (!promoEl) {
      return;
    }
    promoEl.innerHTML = promos
      .map(function promoHtml(promo) {
        return (
          '<a class="promo-card" href="' +
          Jana.escapeHtml(Jana.categoryUrl(promo.category)) +
          '">' +
          '<span class="promo-card__media"><img src="' +
          Jana.escapeHtml(Jana.assetUrl(promo.image)) +
          '" alt=""></span>' +
          '<span class="promo-card__plaque">' +
          '<span class="promo-card__copy">' +
          Jana.escapeHtml(promo.title) +
          "</span>" +
          '<span class="promo-card__cta">' +
          promo.cta +
          "</span></span></a>"
        );
      })
      .join("");
  }

  function renderProducts() {
    const grid = Jana.qs('[data-bind="products"]');
    if (!grid) {
      return;
    }
    const list =
      state.filter === "todas"
        ? state.products
        : state.products.filter(function match(product) {
            return (product.categoryIds && product.categoryIds.indexOf(state.filter) !== -1) || product.categoryId === state.filter;
          });
    const category = state.categories.find(function findCat(item) {
      return item.id === state.filter || item.slug === state.filter;
    });
    Jana.bindText("filter-label", category ? category.name : "Todas as categorias");
    applyCategoryTitle();
    grid.innerHTML = list.length
      ? list.map(productCard).join("")
      : '<p class="empty">Nenhum produto nesta categoria. Edite data/products.json.</p>';
    renderCategories();
  }

  function renderInstagram() {
    const grid = Jana.qs('[data-bind="instagram-grid"]');
    if (!grid) {
      return;
    }
    const url = Jana.instagramUrl(state.site.contato.instagram);
    const images = state.site.instagramGallery || [];
    grid.innerHTML = images
      .map(function tile(src, index) {
        return (
          '<a href="' +
          Jana.escapeHtml(url) +
          '" target="_blank" rel="noopener noreferrer" aria-label="Abrir Instagram, foto ' +
          (index + 1) +
          '">' +
          '<img src="' +
          Jana.escapeHtml(Jana.assetUrl(src)) +
          '" alt="Foto do Instagram"></a>'
        );
      })
      .join("");
  }

  function findProduct(slug) {
    return state.products.find(function match(product) {
      return product.slug === slug;
    });
  }

  function openProduct(slug) {
    const product = findProduct(slug);
    if (!product) return;
    state.currentProduct = product;
    state.galleryIndex = 0;
    const category = state.categories.find(function findCat(item) {
      return item.id === product.categoryId;
    });
    Jana.bindText("modal-name", product.name);
    Jana.bindText("modal-description", product.description);
    Jana.bindText("modal-price", Jana.formatBRL(product.price));
    Jana.bindText("modal-category", category ? category.name : "");
    Jana.qs("#modal-qty").value = "1";
    updateModalImage();
    const modal = Jana.qs("#produto-modal");
    if (typeof modal.showModal === "function") {
      modal.showModal();
    }
    history.replaceState(null, "", "#produto:" + product.slug);
  }

  function updateModalImage() {
    const product = state.currentProduct;
    if (!product) return;
    const image = Jana.qs('[data-bind="modal-image"]');
    image.src = Jana.assetUrl(product.images[state.galleryIndex]);
    image.alt = product.name;
    Jana.qs('[data-bind="modal-thumbs"]').innerHTML = product.images
      .map(function thumb(src, index) {
        return (
          '<button type="button" class="' +
          (index === state.galleryIndex ? "is-active" : "") +
          '" data-action="gallery-goto" data-index="' +
          index +
          '"><img src="' +
          Jana.escapeHtml(Jana.assetUrl(src)) +
          '" alt=""></button>'
        );
      })
      .join("");
  }

  function closeModal() {
    const modal = Jana.qs("#produto-modal");
    if (modal.open) {
      modal.close();
    }
    if (location.hash.indexOf("#produto:") === 0) {
      clearPageHash();
    }
  }

  function addProduct(slug, quantity) {
    const product = findProduct(slug);
    if (!product) return;
    Jana.Cart.add(product, quantity);
    renderCart();
    openCart();
  }

  function renderCart() {
    Jana.bindText("cart-count", String(Jana.Cart.count()));
    Jana.bindText("cart-total", Jana.formatBRL(Jana.Cart.total()));
    const items = Jana.Cart.items();
    Jana.qs('[data-bind="cart-items"]').innerHTML = items.length
      ? items
          .map(function row(item) {
            return (
              '<article class="cart-row">' +
              '<img src="' +
              Jana.escapeHtml(Jana.assetUrl(item.image)) +
              '" alt="">' +
              "<div><strong>" +
              Jana.escapeHtml(item.name) +
              "</strong><p>" +
              Jana.formatBRL(item.price) +
              '</p></div><div class="cart-row__qty">' +
              '<button type="button" data-action="qty-minus" data-id="' +
              Jana.escapeHtml(item.id) +
              '" aria-label="Diminuir">−</button>' +
              "<span>" +
              item.quantity +
              "</span>" +
              '<button type="button" data-action="qty-plus" data-id="' +
              Jana.escapeHtml(item.id) +
              '" aria-label="Aumentar">+</button>' +
              "</div></article>"
            );
          })
          .join("")
      : '<p class="empty">Sua encomenda está vazia. Escolha um item do catálogo.</p>';
  }

  function openCart() {
    Jana.qs("#encomendas").hidden = false;
    Jana.qs(".backdrop").hidden = false;
    Jana.qs("#encomendas").removeAttribute("hidden");
    location.hash = "encomendas";
  }

  function closeCart() {
    Jana.qs("#encomendas").hidden = true;
    Jana.qs(".backdrop").hidden = true;
    if (location.hash === "#encomendas") {
      clearPageHash();
    }
  }

  function readCheckoutForm(form) {
    const data = new FormData(form);
    return {
      nome: String(data.get("nome") || "").trim(),
      telefone: String(data.get("telefone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      endereco: String(data.get("endereco") || "").trim(),
      data: String(data.get("data") || "").trim(),
      observacoes: String(data.get("observacoes") || "").trim(),
      frete: 0,
      items: Jana.Cart.items(),
    };
  }

  function buildWhatsAppMessage(payload) {
    const lines = [
      "Olá! Gostaria de fazer uma encomenda na " + state.site.brandName + ".",
      "",
      "*Cliente:* " + payload.nome,
      "*Telefone:* " + payload.telefone,
    ];
    if (payload.email) {
      lines.push("*E-mail:* " + payload.email);
    }
    if (payload.endereco) {
      lines.push("*Endereço / retirada:* " + payload.endereco);
    }
    if (payload.data) {
      const [year, month, day] = payload.data.split("-");
      lines.push("*Data desejada:* " + day + "/" + month + "/" + year);
    }
    lines.push("", "*Itens:*");
    payload.items.forEach(function pushItem(item) {
      lines.push(
        "• " + item.quantity + "x " + item.name + " — " + Jana.formatBRL(item.price * item.quantity)
      );
    });
    lines.push("", "*Total:* " + Jana.formatBRL(Jana.Cart.total()));
    if (payload.observacoes) {
      lines.push("", "*Observações:* " + payload.observacoes);
    }
    lines.push("", state.site.paymentsNote);
    return lines.join("\n");
  }

  function checkout(event) {
    event.preventDefault();
    if (!Jana.Cart.items().length) {
      openCart();
      return;
    }
    const payload = readCheckoutForm(event.target);
    // Persist order + client locally for /painel/ (optional Google Sheets later — see js/store.js).
    const order = Jana.Store.saveCheckout(payload);
    const number = state.site.contato.whatsapp;
    const url =
      "https://wa.me/" +
      number +
      "?text=" +
      encodeURIComponent(buildWhatsAppMessage(payload));
    window.open(url, "_blank", "noopener");
    if (
      window.confirm(
        "Pedido #" +
          order.number +
          " salvo neste navegador.\n\nDeseja baixar o JSON do pedido?"
      )
    ) {
      Jana.Store.downloadJSON("pedido-" + order.number + ".json", order);
    }
  }

  function bindEvents() {
    document.addEventListener("click", function onClick(event) {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.getAttribute("data-action");
      if (action === "toggle-menu") {
        document.querySelector("#topo").classList.toggle("is-open");
        target.setAttribute("aria-expanded", document.querySelector("#topo").classList.contains("is-open"));
      }
      if (action === "open-cart") {
        event.preventDefault();
        openCart();
      }
      if (action === "close-cart") closeCart();
      if (action === "close-modal") closeModal();
      if (action === "carousel-prev") goToSlide(state.slide - 1);
      if (action === "carousel-next") goToSlide(state.slide + 1);
      if (action === "carousel-goto") goToSlide(Number(target.getAttribute("data-index")));
      if (action === "open-product") openProduct(target.getAttribute("data-slug"));
      if (action === "add-product") addProduct(target.getAttribute("data-slug"), 1);
      if (action === "add-from-modal" && state.currentProduct) {
        addProduct(state.currentProduct.slug, Jana.qs("#modal-qty").value);
      }
      if (action === "gallery-goto") {
        state.galleryIndex = Number(target.getAttribute("data-index"));
        updateModalImage();
      }
      if (action === "qty-plus") {
        const item = Jana.Cart.items().find(function find(row) {
          return row.id === target.getAttribute("data-id");
        });
        if (item) Jana.Cart.setQty(item.id, item.quantity + 1);
        renderCart();
      }
      if (action === "qty-minus") {
        const item = Jana.Cart.items().find(function find(row) {
          return row.id === target.getAttribute("data-id");
        });
        if (item) Jana.Cart.setQty(item.id, item.quantity - 1);
        renderCart();
      }
      if (action === "carousel-link") {
        const slug = target.getAttribute("data-slug");
        const category = target.getAttribute("data-category");
        if (slug) {
          openProduct(slug);
        } else if (category) {
          window.location.href = Jana.categoryUrl(category);
        }
      }
    });
    const hero = Jana.qs("#hero-carrossel");
    if (hero) {
      hero.addEventListener("mouseenter", stopCarousel);
      hero.addEventListener("mouseleave", startCarousel);
    }
    const checkoutForm = Jana.qs("#checkout-form");
    if (checkoutForm) {
      checkoutForm.addEventListener("submit", checkout);
    }
    const productModal = Jana.qs("#produto-modal");
    if (productModal) {
      productModal.addEventListener("close", function onClose() {
        if (location.hash.indexOf("#produto:") === 0) {
          clearPageHash();
        }
      });
    }
    window.addEventListener("hashchange", openFromHash);
  }

  function openFromHash() {
    const hash = decodeURIComponent(location.hash || "");
    if (hash.indexOf("#produto:") === 0) {
      openProduct(hash.replace("#produto:", ""));
    }
    if (hash === "#encomendas") {
      openCart();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
