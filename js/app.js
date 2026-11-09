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
    flavors: [],
    flavorLabel: "Recheio do bolo",
    selectedFlavor: "",
    lastFocus: null,
  };

  function isCategoryPage() {
    return document.body.getAttribute("data-page") === "category";
  }

  function pageCategoryId() {
    return document.body.getAttribute("data-category") || "";
  }

  function isProductPage() {
    return document.body.getAttribute("data-page") === "product";
  }

  function pageProductSlug() {
    const params = new URLSearchParams(location.search);
    return params.get("slug") || "";
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
        Jana.loadJSON("data/sabores-bolos.json").catch(function noFlavors() {
          return { flavors: [] };
        }),
      ]);
      state.site = loaded[0];
      state.categories = loaded[1].slice().sort(byOrder);
      state.carousel = loaded[2].slice().sort(byOrder);
      state.products = loaded[3].filter(function isActive(product) {
        return product.active !== false;
      });
      state.flavors = (loaded[4].flavors || []).map(normalizeFlavor);
      state.flavorLabel = loaded[4].label || "Recheio do bolo";
      state.selectedFlavor = flavorName(state.flavors[0]);
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

  function normalizeFlavor(flavor) {
    if (!flavor) {
      return { nome: "", descricao: "" };
    }
    if (typeof flavor === "string") {
      return { nome: flavor, descricao: "" };
    }
    return {
      nome: flavor.nome || flavor.name || "",
      descricao: flavor.descricao || flavor.description || "",
    };
  }

  function flavorName(flavor) {
    return normalizeFlavor(flavor).nome;
  }

  function flavorDescription(flavor) {
    return normalizeFlavor(flavor).descricao;
  }

  function flavorOptionLabel(flavor) {
    const item = normalizeFlavor(flavor);
    if (!item.descricao) {
      return item.nome;
    }
    return item.nome + " — " + item.descricao;
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
    Jana.bindText("tagline", site.slogan || site.tagline);
    Jana.bindText("slogan", site.slogan || site.tagline);
    Jana.bindText("visit-title", site.heroVisitTitle);
    Jana.bindText("visit-subtitle", site.heroVisitSubtitle);
    Jana.bindText("address", address);
    Jana.bindText("hours", site.hours);
    Jana.bindText("payments", site.paymentsNote);
    Jana.bindText(
      "request-disclaimer",
      site.requestDisclaimer || Jana.REQUEST_DISCLAIMER
    );
    Jana.bindText("privacy-note", site.privacyNote || "");
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
    applyProductPage();
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
      if (c.cream) {
        root.style.setProperty("--cream", c.cream);
        root.style.setProperty("--panel-solid", c.cream);
      }
      if (c.ink) {
        root.style.setProperty("--ink", c.ink);
        root.style.setProperty("--brown", c.ink);
      }
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
      .map(function slideHtml(slide, index) {
        const eager = index === 0;
        return (
          '<article class="hero__slide">' +
          '<img src="' +
          Jana.escapeHtml(Jana.assetUrl(slide.image)) +
          '" alt="' +
          Jana.escapeHtml(slide.title || "") +
          '" width="1600" height="900"' +
          (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
          ' decoding="async">' +
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
          '"' +
          (index === 0 ? ' aria-current="true"' : "") +
          '><span class="hero__dot-mark" aria-hidden="true"></span></button>'
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
      const active = i === state.slide;
      dot.classList.toggle("is-active", active);
      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
    updateHeroCaption(changed);
  }

  function startCarousel() {
    if (!Jana.qs("#hero-carrossel") || !state.carousel.length) {
      return;
    }
    stopCarousel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
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
          '<a class="categoria-card' +
          active +
          '" href="' +
          Jana.escapeHtml(Jana.categoryUrl(slug)) +
          '"' +
          (active ? ' aria-current="page"' : "") +
          ">" +
          '<span class="categoria-card__media"><img src="' +
          Jana.escapeHtml(Jana.assetUrl(category.image)) +
          '" alt="" width="400" height="400" decoding="async"' +
          (state.categories.indexOf(category) < 5 ? "" : ' loading="lazy"') +
          "></span>" +
          '<span class="categoria-card__label">' +
          Jana.escapeHtml(category.name) +
          "</span></a>"
        );
      })
      .join("");
    bindCategoryCarousel(row);
  }

  function bindCategoryCarousel(row) {
    ensureCategoryCarousel(row);
    requestAnimationFrame(function afterLayout() {
      updateCategoryArrows(row);
    });
    if (row.dataset.carouselBound === "true") {
      return;
    }
    row.dataset.carouselBound = "true";
    row.addEventListener(
      "scroll",
      function onCategoryScroll() {
        updateCategoryArrows(row);
      },
      { passive: true }
    );
    window.addEventListener("resize", function onCategoryResize() {
      updateCategoryArrows(row);
    });
  }

  function ensureCategoryCarousel(row) {
    if (row.parentElement && row.parentElement.classList.contains("categorias__carousel")) {
      return row.parentElement;
    }
    const shell = document.createElement("div");
    shell.className = "categorias__carousel";
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "categorias__arrow categorias__arrow--prev";
    prev.setAttribute("data-action", "categories-prev");
    prev.setAttribute("aria-label", "Ver categorias anteriores");
    prev.innerHTML = '<span aria-hidden="true">‹</span>';
    const next = document.createElement("button");
    next.type = "button";
    next.className = "categorias__arrow categorias__arrow--next";
    next.setAttribute("data-action", "categories-next");
    next.setAttribute("aria-label", "Ver mais categorias");
    next.innerHTML = '<span aria-hidden="true">›</span>';
    row.parentNode.insertBefore(shell, row);
    shell.appendChild(prev);
    shell.appendChild(row);
    shell.appendChild(next);
    return shell;
  }

  function scrollCategories(row, direction) {
    const card = row.querySelector(".categoria-card");
    const styles = window.getComputedStyle(row);
    const gap = parseFloat(styles.columnGap || styles.gap) || 8;
    const cardWidth = card ? card.getBoundingClientRect().width : row.clientWidth / 3;
    const step = (cardWidth + gap) * 2;
    row.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  function updateCategoryArrows(row) {
    const shell = row.closest(".categorias__carousel");
    if (!shell) {
      return;
    }
    const prev = shell.querySelector('[data-action="categories-prev"]');
    const next = shell.querySelector('[data-action="categories-next"]');
    const max = row.scrollWidth - row.clientWidth;
    const hasOverflow = max > 4;
    if (prev) {
      prev.hidden = !hasOverflow;
      prev.disabled = row.scrollLeft <= 4;
    }
    if (next) {
      next.hidden = !hasOverflow;
      next.disabled = row.scrollLeft >= max - 4;
    }
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
      '" width="600" height="600" loading="lazy" decoding="async">' +
      "</div>" +
      '<div class="card__body">' +
      "<h3>" +
      Jana.escapeHtml(product.name) +
      "</h3>" +
      '<p class="card__price">' +
      Jana.formatBRL(product.price) +
      "</p>" +
      '<div class="card__actions">' +
      '<a class="btn btn--outline" href="' +
      Jana.escapeHtml(Jana.productUrl(product.slug)) +
      '">Ver mais</a>' +
      (Jana.isCakeProduct(product)
        ? '<a class="btn btn--solid btn--acquire" href="' +
          Jana.escapeHtml(Jana.productUrl(product.slug)) +
          '"><span class="btn__label">Comprar</span></a>'
        : '<button type="button" class="btn btn--solid btn--acquire" data-action="add-product" data-slug="' +
          Jana.escapeHtml(product.slug) +
          '"><span class="btn__label">Comprar</span></button>') +
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
          '" alt="Foto do Instagram" width="400" height="400" loading="lazy" decoding="async"></a>'
        );
      })
      .join("");
  }

  function findProduct(slug) {
    return state.products.find(function match(product) {
      return product.slug === slug;
    });
  }

  function applyProductPage() {
    if (!isProductPage()) {
      return;
    }
    const product = findProduct(pageProductSlug());
    const article = Jana.qs("[data-bind='product-page']");
    if (!product) {
      if (article) {
        article.innerHTML = '<p class="empty">Produto não encontrado. <a href="' + Jana.escapeHtml(Jana.homeUrl()) + '">Voltar ao início</a></p>';
      }
      return;
    }
    state.currentProduct = product;
    state.galleryIndex = 0;
    const category = state.categories.find(function findCat(item) {
      return item.id === product.categoryId || item.slug === product.categoryId;
    });
    Jana.bindText("product-name", product.name);
    Jana.bindText("product-description", product.description);
    Jana.bindText("product-price", Jana.formatBRL(product.price));
    Jana.bindText("product-category", category ? category.name : "");
    Jana.bindHref("product-category-link", category ? Jana.categoryUrl(Jana.categorySlug(category)) : Jana.homeUrl());
    if (state.site && state.site.brandName) {
      document.title = product.name + " · " + state.site.brandName;
    }
    const qty = Jana.qs("#product-qty") || Jana.qs("#modal-qty");
    if (qty) {
      qty.value = "1";
    }
    renderFlavorPicker(product);
    updateModalImage();
    const img = Jana.qs('[data-bind="product-image"]');
    if (img) {
      img.src = Jana.assetUrl(product.images[0]);
      img.alt = product.name;
    }
  }

  function renderFlavorPicker(product) {
    const boxes = Jana.qsa("[data-bind='flavor-picker']");
    if (!boxes.length) {
      return;
    }
    const show = Jana.isCakeProduct(product) && state.flavors.length;
    boxes.forEach(function fill(box) {
      box.hidden = !show;
      if (!show) {
        box.innerHTML = "";
        return;
      }
      if (!state.selectedFlavor) {
        state.selectedFlavor = flavorName(state.flavors[0]);
      }
      const options = state.flavors
        .map(function option(flavor) {
          const name = flavorName(flavor);
          const selected = name === state.selectedFlavor ? " selected" : "";
          return (
            '<option value="' +
            Jana.escapeHtml(name) +
            '"' +
            selected +
            ">" +
            Jana.escapeHtml(flavorOptionLabel(flavor)) +
            "</option>"
          );
        })
        .join("");
      const radios = state.flavors
        .map(function radio(flavor, index) {
          const id = "sabor-" + index;
          const name = flavorName(flavor);
          const description = flavorDescription(flavor);
          const checked = name === state.selectedFlavor ? " checked" : "";
          return (
            '<label for="' +
            id +
            '"><input id="' +
            id +
            '" type="radio" name="sabor-bolo" value="' +
            Jana.escapeHtml(name) +
            '"' +
            checked +
            '><span class="flavor-radios__copy"><span class="flavor-radios__name">' +
            Jana.escapeHtml(name) +
            "</span>" +
            (description
              ? '<span class="flavor-radios__desc">' + Jana.escapeHtml(description) + "</span>"
              : "") +
            "</span></label>"
          );
        })
        .join("");
      box.innerHTML =
        "<legend>" +
        Jana.escapeHtml(state.flavorLabel) +
        "</legend>" +
        '<label class="flavor-picker__select">Escolha no menu' +
        '<select data-action="set-flavor">' +
        options +
        "</select></label>" +
        '<div class="flavor-radios">' +
        radios +
        "</div>";
    });
  }

  function selectedFlavor() {
    return state.selectedFlavor || "";
  }

  function openProduct(slug) {
    if (!slug) {
      return;
    }
    window.location.href = Jana.productUrl(slug);
  }

  function updateModalImage() {
    const product = state.currentProduct;
    if (!product) return;
    const image = Jana.qs('[data-bind="modal-image"]');
    if (image) {
      image.src = Jana.assetUrl(product.images[state.galleryIndex]);
      image.alt = product.name;
    }
    const pageImage = Jana.qs('[data-bind="product-image"]');
    if (pageImage) {
      pageImage.src = Jana.assetUrl(product.images[state.galleryIndex]);
      pageImage.alt = product.name;
    }
    const thumbs = Jana.qs('[data-bind="modal-thumbs"]') || Jana.qs('[data-bind="product-thumbs"]');
    if (!thumbs) {
      return;
    }
    thumbs.innerHTML = product.images
      .map(function thumb(src, index) {
        return (
          '<button type="button" class="' +
          (index === state.galleryIndex ? "is-active" : "") +
          '" data-action="gallery-goto" data-index="' +
          index +
          '" aria-label="Foto ' +
          (index + 1) +
          " de " +
          product.images.length +
          '"' +
          (index === state.galleryIndex ? ' aria-current="true"' : "") +
          '><img src="' +
          Jana.escapeHtml(Jana.assetUrl(src)) +
          '" alt="" width="128" height="128"></button>'
        );
      })
      .join("");
  }

  function closeModal() {
    const modal = Jana.qs("#produto-modal");
    if (modal && modal.open) {
      modal.close();
    }
    if (location.hash.indexOf("#produto:") === 0) {
      clearPageHash();
    }
  }

  function addProduct(slug, quantity) {
    const product = findProduct(slug) || (state.currentProduct && state.currentProduct.slug === slug ? state.currentProduct : null);
    if (!product) return;
    if (Jana.isCakeProduct(product) && !selectedFlavor()) {
      window.location.href = Jana.productUrl(product.slug);
      return;
    }
    Jana.Cart.add(product, quantity, { flavor: Jana.isCakeProduct(product) ? selectedFlavor() : "" });
    renderCart();
    openCart();
  }

  function openMoreInfo(product) {
    if (!product) {
      return;
    }
    const notes = Jana.qs('#checkout-form [name="observacoes"]');
    if (notes) {
      notes.value =
        "Olá! Gostaria de mais informações sobre este produto: " +
        product.name +
        (Jana.isCakeProduct(product) && selectedFlavor() ? " (recheio: " + selectedFlavor() + ")" : "") +
        ".";
    }
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
              "</strong>" +
              (item.flavor ? '<p class="cart-row__flavor">Recheio: ' + Jana.escapeHtml(item.flavor) + "</p>" : "") +
              "<p>" +
              Jana.formatBRL(item.price) +
              '</p></div><div class="cart-row__qty">' +
              '<button type="button" data-action="qty-minus" data-id="' +
              Jana.escapeHtml(Jana.Cart.lineIdOf(item)) +
              '" aria-label="Diminuir quantidade de ' +
              Jana.escapeHtml(item.name) +
              '">−</button>' +
              "<span>" +
              item.quantity +
              "</span>" +
              '<button type="button" data-action="qty-plus" data-id="' +
              Jana.escapeHtml(Jana.Cart.lineIdOf(item)) +
              '" aria-label="Aumentar quantidade de ' +
              Jana.escapeHtml(item.name) +
              '">+</button>' +
              "</div></article>"
            );
          })
          .join("")
      : '<p class="empty">Sua encomenda está vazia. Escolha um item do catálogo.</p>';
  }

  function setMenuOpen(open) {
    const topo = Jana.qs("#topo");
    const button = Jana.qs('[data-action="toggle-menu"]');
    if (!topo) {
      return;
    }
    topo.classList.toggle("is-open", open);
    if (button) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      const label = button.querySelector(".sr-only");
      if (label) {
        label.textContent = open ? "Fechar menu" : "Abrir menu";
      }
    }
  }

  function setPageLocked(locked) {
    document.documentElement.classList.toggle("is-locked", locked);
    document.body.classList.toggle("is-locked", locked);
    ["#topo", "main", "#rodape"].forEach(function mark(selector) {
      const node = Jana.qs(selector);
      if (!node) {
        return;
      }
      if (locked) {
        node.setAttribute("inert", "");
      } else {
        node.removeAttribute("inert");
      }
    });
  }

  function setCartHash(open) {
    const next = location.pathname + location.search + (open ? "#encomendas" : "");
    const current = location.pathname + location.search + location.hash;
    if (current !== next) {
      history.replaceState(null, "", next);
    }
  }

  function openCart() {
    const drawer = Jana.qs("#encomendas");
    const backdrop = Jana.qs(".backdrop");
    if (!drawer || !backdrop) {
      return;
    }
    setMenuOpen(false);
    if (!state.lastFocus) {
      state.lastFocus = document.activeElement;
    }
    drawer.hidden = false;
    backdrop.hidden = false;
    drawer.removeAttribute("hidden");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    Jana.qsa('[data-action="open-cart"]').forEach(function mark(btn) {
      btn.setAttribute("aria-expanded", "true");
    });
    setPageLocked(true);
    setCartHash(true);
    const panel = Jana.qs(".drawer__panel");
    if (panel) {
      panel.setAttribute("tabindex", "-1");
      window.setTimeout(function focusPanel() {
        panel.focus();
      }, 0);
    }
  }

  function closeCart() {
    const drawer = Jana.qs("#encomendas");
    const backdrop = Jana.qs(".backdrop");
    if (drawer) {
      drawer.hidden = true;
    }
    if (backdrop) {
      backdrop.hidden = true;
    }
    Jana.qsa('[data-action="open-cart"]').forEach(function mark(btn) {
      btn.setAttribute("aria-expanded", "false");
    });
    setPageLocked(false);
    setCartHash(false);
    const toRestore = state.lastFocus;
    state.lastFocus = null;
    if (toRestore && typeof toRestore.focus === "function") {
      toRestore.focus();
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
    if (payload.items.length) {
      payload.items.forEach(function pushItem(item) {
        lines.push(
          "• " +
            item.quantity +
            "x " +
            item.name +
            (item.flavor ? " (recheio: " + item.flavor + ")" : "") +
            " — " +
            Jana.formatBRL(item.price * item.quantity)
        );
      });
    } else if (payload.observacoes) {
      lines.push("• Pedido de informações sobre produto");
    }
    lines.push("", "*Total:* " + Jana.formatBRL(Jana.Cart.total()));
    if (payload.observacoes) {
      lines.push("", "*Observações:* " + payload.observacoes);
    }
    lines.push(
      "",
      state.site.requestDisclaimer || Jana.REQUEST_DISCLAIMER,
      "",
      state.site.paymentsNote
    );
    return lines.join("\n");
  }

  function setCheckoutStatus(message) {
    Jana.bindText("checkout-status", message || "");
  }

  function openWhatsApp(url) {
    const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
    if (!coarse) {
      try {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened) {
          return;
        }
      } catch (err) {
        /* fall through */
      }
    }
    window.location.assign(url);
  }

  function checkout(event) {
    event.preventDefault();
    const form = event.target;
    const payload = readCheckoutForm(form);
    if (!Jana.Cart.items().length && !payload.observacoes) {
      setCheckoutStatus("Adicione um item ou descreva o pedido em Observações.");
      openCart();
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = true;
    }
    checkoutAsync(payload, submit);
  }

  function describeCentral(result) {
    if (!result || !result.attempted) {
      return "Painel compartilhado ainda não está ligado; a solicitação segue pelo WhatsApp.";
    }
    if (result.savedCentral) {
      return result.duplicate
        ? "Solicitação já estava no painel central (sem duplicar)."
        : "Solicitação registrada no painel central. Isso ainda não confirma a encomenda.";
    }
    if (result.reason === "network" || result.reason === "unavailable") {
      return "Painel central indisponível. O carrinho foi mantido. Você pode falar no WhatsApp.";
    }
    if (result.reason === "denied") {
      return "Acesso ao painel central foi recusado. O carrinho foi mantido.";
    }
    return "Não foi possível gravar no painel central. O carrinho foi mantido.";
  }

  async function checkoutAsync(payload, submit) {
    let localOrder = null;
    try {
      localOrder = Jana.Store.saveCheckout(payload);
    } catch (err) {
      localOrder = null;
    }
    let centralResult = { attempted: false, savedCentral: false, confirmed: false };
    if (Jana.Central && Jana.Central.isEnabled(state.site)) {
      setCheckoutStatus("Enviando solicitação ao painel central…");
      centralResult = await Jana.Central.submitRequest(state.site, payload);
    }
    const parts = [
      state.site.requestDisclaimer || Jana.REQUEST_DISCLAIMER,
      localOrder
        ? "Cópia local #" + localOrder.number + " neste navegador (legado, não é confirmação)."
        : "Não deu para salvar neste navegador.",
      describeCentral(centralResult),
      "Abrir o WhatsApp também não confirma a encomenda.",
    ];
    setCheckoutStatus(parts.join(" "));
    const number = state.site.contato.whatsapp;
    const url =
      "https://wa.me/" +
      number +
      "?text=" +
      encodeURIComponent(buildWhatsAppMessage(payload));
    openWhatsApp(url);
    if (submit) {
      submit.disabled = false;
    }
  }

  function bindEvents() {
    document.addEventListener("click", function onClick(event) {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.getAttribute("data-action");
      if (action === "toggle-menu") {
        const topo = document.querySelector("#topo");
        setMenuOpen(!topo.classList.contains("is-open"));
      }
      if (action === "open-cart") {
        event.preventDefault();
        openCart();
      }
      if (action === "close-cart") closeCart();
      if (action === "close-modal") closeModal();
      if (action === "carousel-prev") goToSlide(state.slide - 1);
      if (action === "carousel-next") goToSlide(state.slide + 1);
      if (action === "categories-prev" || action === "categories-next") {
        const row = Jana.qs('[data-bind="categories"]');
        if (row) {
          event.preventDefault();
          scrollCategories(row, action === "categories-next" ? 1 : -1);
        }
      }
      if (action === "carousel-goto") goToSlide(Number(target.getAttribute("data-index")));
      if (action === "open-product") openProduct(target.getAttribute("data-slug"));
      if (action === "add-product") addProduct(target.getAttribute("data-slug"), 1);
      if (action === "add-from-modal" && state.currentProduct) {
        addProduct(state.currentProduct.slug, (Jana.qs("#modal-qty") || Jana.qs("#product-qty")).value);
      }
      if (action === "add-from-product" && state.currentProduct) {
        addProduct(state.currentProduct.slug, (Jana.qs("#product-qty") || Jana.qs("#modal-qty")).value);
      }
      if (action === "more-info") {
        openMoreInfo(state.currentProduct || findProduct(target.getAttribute("data-slug")));
      }
      if (action === "set-flavor") {
        state.selectedFlavor = target.value || target.getAttribute("data-flavor") || "";
        renderFlavorPicker(state.currentProduct);
      }
      if (action === "gallery-goto") {
        state.galleryIndex = Number(target.getAttribute("data-index"));
        updateModalImage();
      }
      if (action === "qty-plus") {
        const lineId = target.getAttribute("data-id");
        const item = Jana.Cart.items().find(function find(row) {
          return Jana.Cart.lineIdOf(row) === lineId;
        });
        if (item) Jana.Cart.setQty(lineId, item.quantity + 1);
        renderCart();
      }
      if (action === "qty-minus") {
        const lineId = target.getAttribute("data-id");
        const item = Jana.Cart.items().find(function find(row) {
          return Jana.Cart.lineIdOf(row) === lineId;
        });
        if (item) Jana.Cart.setQty(lineId, item.quantity - 1);
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
      let touchStartX = 0;
      let touchStartY = 0;
      hero.addEventListener(
        "touchstart",
        function onTouchStart(event) {
          const point = event.changedTouches[0];
          touchStartX = point.clientX;
          touchStartY = point.clientY;
        },
        { passive: true }
      );
      hero.addEventListener(
        "touchend",
        function onTouchEnd(event) {
          const point = event.changedTouches[0];
          const dx = point.clientX - touchStartX;
          const dy = point.clientY - touchStartY;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
            goToSlide(state.slide + (dx < 0 ? 1 : -1));
          }
        },
        { passive: true }
      );
    }
    document.addEventListener("keydown", function onKey(event) {
      const drawer = Jana.qs("#encomendas");
      const drawerOpen = drawer && !drawer.hidden;
      if (event.key === "Escape") {
        if (drawerOpen) {
          event.preventDefault();
          closeCart();
          return;
        }
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerOpen) {
        return;
      }
      const focusable = Array.from(
        drawer.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(function visible(node) {
        return !node.closest("[hidden]") && node.getClientRects().length > 0;
      });
      if (!focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    document.addEventListener("click", function onDocumentClick(event) {
      const topo = Jana.qs("#topo");
      if (!topo || !topo.classList.contains("is-open")) {
        return;
      }
      if (event.target.closest("#topo")) {
        if (event.target.closest(".topo__nav a")) {
          setMenuOpen(false);
        }
        return;
      }
      setMenuOpen(false);
    });
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
    document.addEventListener("change", function onChange(event) {
      const flavorControl = event.target.closest("[data-action='set-flavor']") || event.target;
      if (flavorControl && (flavorControl.getAttribute("data-action") === "set-flavor" || flavorControl.name === "sabor-bolo")) {
        state.selectedFlavor = flavorControl.value || "";
        renderFlavorPicker(state.currentProduct);
      }
    });
    window.addEventListener("hashchange", openFromHash);
  }

  function openFromHash() {
    const hash = decodeURIComponent(location.hash || "");
    if (hash.indexOf("#produto:") === 0) {
      window.location.replace(Jana.productUrl(hash.replace("#produto:", "")));
      return;
    }
    if (hash === "#encomendas") {
      openCart();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
