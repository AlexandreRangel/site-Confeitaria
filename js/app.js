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
    if (site.logo) {
      Jana.qsa('[data-bind="logo"]').forEach(function setLogo(img) {
        img.src = site.logo;
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

  function renderCarousel() {
    const track = Jana.qs('[data-bind="carousel"]');
    const dots = Jana.qs('[data-bind="carousel-dots"]');
    track.innerHTML = state.carousel
      .map(function slideHtml(slide) {
        return (
          '<article class="hero__slide">' +
          '<img src="' + Jana.escapeHtml(slide.image) + '" alt="' +
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
          ? "#categorias"
          : "#catalogo";
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
    Jana.qs('[data-bind="carousel"]').style.transform = "translateX(-" + state.slide * 100 + "%)";
    Jana.qsa(".hero__dot").forEach(function mark(dot, i) {
      dot.classList.toggle("is-active", i === state.slide);
    });
    updateHeroCaption(changed);
  }

  function startCarousel() {
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
    const allButton =
      '<button type="button" class="bolinha' +
      (state.filter === "todas" ? " is-active" : "") +
      '" data-action="filter-category" data-category="todas">' +
      '<span class="bolinha__media"><img src="assets/brand/logo.webp" alt=""></span>' +
      "<span>Todas</span></button>";
    row.innerHTML =
      allButton +
      state.categories
        .map(function categoryHtml(category) {
          const active = state.filter === category.id ? " is-active" : "";
          return (
            '<button type="button" class="bolinha' +
            active +
            '" data-action="filter-category" data-category="' +
            Jana.escapeHtml(category.id) +
            '">' +
            '<span class="bolinha__media"><img src="' +
            Jana.escapeHtml(category.image) +
            '" alt=""></span>' +
            "<span>" +
            Jana.escapeHtml(category.name) +
            "</span></button>"
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
      Jana.escapeHtml(product.images[0]) +
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

  function productsByCategory(categoryId) {
    return state.products.filter(function match(product) {
      return product.categoryId === categoryId;
    });
  }

  function featuredByTag(tag, categoryId) {
    return state.products.filter(function match(product) {
      const featured = product.featured || (product.tags && product.tags.indexOf(tag) !== -1);
      return featured && (!categoryId || product.categoryId === categoryId);
    });
  }

  function renderDestaques() {
    const copy = state.site.destaquesCopy;
    const promos = [
      { title: copy.kitsTitle, category: "cestas-presentes", cta: "Ver mais", image: "assets/products/cesta-rubi.webp" },
      { title: copy.bolosTitle, category: "bolos", cta: "Confira", image: "assets/products/bolo-buttercream-g.webp" },
      { title: copy.docesTitle, category: "doces-festa", cta: "Ver tudo", image: "assets/products/platter-amor-no-ar.webp" },
    ];
    Jana.qs('[data-bind="promo-cards"]').innerHTML = promos
      .map(function promoHtml(promo) {
        return (
          '<button type="button" class="promo-card" data-action="filter-category" data-category="' +
          promo.category +
          '">' +
          '<span class="promo-card__media"><img src="' +
          promo.image +
          '" alt=""></span>' +
          '<span class="promo-card__plaque">' +
          '<span class="promo-card__copy">' +
          Jana.escapeHtml(promo.title) +
          "</span>" +
          '<span class="promo-card__cta">' +
          promo.cta +
          "</span></span></button>"
        );
      })
      .join("");
    const gifts = featuredByTag("presente", "cestas-presentes");
    const giftList = (gifts.length ? gifts : productsByCategory("cestas-presentes")).slice(0, 3);
    const giftsEl = Jana.qs('[data-bind="featured-gifts"]');
    giftsEl.classList.toggle("product-grid--center", giftList.length === 1);
    giftsEl.classList.toggle("product-grid--gifts", giftList.length > 1);
    giftsEl.innerHTML = giftList.map(productCard).join("");
    const cakes = featuredByTag("mais-pedidos", "bolos");
    Jana.qs('[data-bind="featured-cakes"]').innerHTML = (cakes.length ? cakes : productsByCategory("bolos"))
      .slice(0, 4)
      .map(productCard)
      .join("");
  }

  function renderProducts() {
    const list =
      state.filter === "todas"
        ? state.products
        : state.products.filter(function match(product) {
            return product.categoryId === state.filter;
          });
    const category = state.categories.find(function findCat(item) {
      return item.id === state.filter;
    });
    Jana.bindText("filter-label", category ? category.name : "Todas as categorias");
    Jana.qs('[data-bind="products"]').innerHTML = list.length
      ? list.map(productCard).join("")
      : '<p class="empty">Nenhum produto nesta categoria. Edite data/products.json.</p>';
    renderCategories();
  }

  function renderInstagram() {
    const url = Jana.instagramUrl(state.site.contato.instagram);
    const images = state.site.instagramGallery || [];
    Jana.qs('[data-bind="instagram-grid"]').innerHTML = images
      .map(function tile(src, index) {
        return (
          '<a href="' +
          Jana.escapeHtml(url) +
          '" target="_blank" rel="noopener noreferrer" aria-label="Abrir Instagram, foto ' +
          (index + 1) +
          '">' +
          '<img src="' +
          Jana.escapeHtml(src) +
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
    image.src = product.images[state.galleryIndex];
    image.alt = product.name;
    Jana.qs('[data-bind="modal-thumbs"]').innerHTML = product.images
      .map(function thumb(src, index) {
        return (
          '<button type="button" class="' +
          (index === state.galleryIndex ? "is-active" : "") +
          '" data-action="gallery-goto" data-index="' +
          index +
          '"><img src="' +
          Jana.escapeHtml(src) +
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
      history.replaceState(null, "", "#catalogo");
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
              Jana.escapeHtml(item.image) +
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
      : '<p class="empty">Sua encomenda está vazia. Escolha um item da vitrine.</p>';
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
      history.replaceState(null, "", "#catalogo");
    }
  }

  function setFilter(categoryId) {
    state.filter = categoryId || "todas";
    renderProducts();
    Jana.qs("#catalogo").scrollIntoView({ behavior: "smooth" });
  }

  function buildWhatsAppMessage(form) {
    const data = new FormData(form);
    const nome = String(data.get("nome") || "").trim();
    const telefone = String(data.get("telefone") || "").trim();
    const dataDesejada = String(data.get("data") || "").trim();
    const observacoes = String(data.get("observacoes") || "").trim();
    const items = Jana.Cart.items();
    const lines = [
      "Olá! Gostaria de fazer uma encomenda na " + state.site.brandName + ".",
      "",
      "*Cliente:* " + nome,
      "*Telefone:* " + telefone,
    ];
    if (dataDesejada) {
      const [year, month, day] = dataDesejada.split("-");
      lines.push("*Data desejada:* " + day + "/" + month + "/" + year);
    }
    lines.push("", "*Itens:*");
    items.forEach(function pushItem(item) {
      lines.push(
        "• " + item.quantity + "x " + item.name + " — " + Jana.formatBRL(item.price * item.quantity)
      );
    });
    lines.push("", "*Total:* " + Jana.formatBRL(Jana.Cart.total()));
    if (observacoes) {
      lines.push("", "*Observações:* " + observacoes);
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
    const number = state.site.contato.whatsapp;
    const url = "https://wa.me/" + number + "?text=" + encodeURIComponent(buildWhatsAppMessage(event.target));
    window.open(url, "_blank", "noopener");
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
      if (action === "filter-category") setFilter(target.getAttribute("data-category"));
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
        if (slug) openProduct(slug);
        else if (category) setFilter(category);
      }
    });
    Jana.qs("#hero-carrossel").addEventListener("mouseenter", stopCarousel);
    Jana.qs("#hero-carrossel").addEventListener("mouseleave", startCarousel);
    Jana.qs("#checkout-form").addEventListener("submit", checkout);
    Jana.qs("#produto-modal").addEventListener("close", function onClose() {
      if (location.hash.indexOf("#produto:") === 0) {
        history.replaceState(null, "", "#catalogo");
      }
    });
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
