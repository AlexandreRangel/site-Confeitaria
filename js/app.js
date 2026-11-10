(function startApp(global) {
  const Jana = global.Jana;
  const state = {
    site: null,
    categories: [],
    areas: [],
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
    categoriesOpen: false,
    slides: [],
    sobre: {},
    pix: { enabled: false, chave: "", nome: "", cidade: "" },
    pixPayload: "",
    pixVisible: false,
    payMethod: "",
    carouselIgnoreClick: false,
    pagamento: { infinitepay: { enabled: false, handle: "" } },
    pausa: { ativo: false, inicio: "", fim: "", mensagem: "", periodos: [], fimDeSemana: false },
    pausaEval: { active: false, message: "" },
  };

  function isCategoryPage() {
    return document.body.getAttribute("data-page") === "category";
  }

  function isAreaPage() {
    return document.body.getAttribute("data-page") === "area";
  }

  function pageCategoryId() {
    return document.body.getAttribute("data-category") || "";
  }

  function pageAreaId() {
    return document.body.getAttribute("data-area") || pageCategoryId();
  }

  function currentArea() {
    const id = pageAreaId();
    return state.areas.find(function findArea(item) {
      return item.id === id || item.slug === id;
    });
  }

  function isProductPage() {
    return document.body.getAttribute("data-page") === "product";
  }

  function isAboutPage() {
    return document.body.getAttribute("data-page") === "about";
  }

  function isEncomendasPage() {
    return document.body.getAttribute("data-page") === "encomendas";
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
        Jana.loadJSON("data/areas.json").catch(function noAreas() {
          return [];
        }),
        Jana.loadJSON("data/carousel.json"),
        Jana.loadJSON("data/products.json"),
        Jana.loadJSON("data/sabores-bolos.json").catch(function noFlavors() {
          return { flavors: [] };
        }),
        Jana.loadJSON("data/sobre.json").catch(function noSobre() {
          return {};
        }),
        Jana.loadJSON("data/pix.json").catch(function noPix() {
          return { enabled: false, chave: "", nome: "", cidade: "" };
        }),
        Jana.loadJSON("data/pagamento.json").catch(function noPay() {
          return { infinitepay: { enabled: false, handle: "" } };
        }),
        Jana.loadJSON("data/pausa.json").catch(function noPausa() {
          return { ativo: false, inicio: "", fim: "", mensagem: "", periodos: [], fimDeSemana: false, planilhaCsv: "" };
        }),
      ]);
      state.site = loaded[0];
      state.categories = loaded[1].slice().sort(byOrder);
      state.areas = loaded[2].slice().sort(byOrder);
      state.carousel = loaded[3].slice().sort(byOrder);
      state.products = loaded[4].filter(function isActive(product) {
        return product.active !== false;
      });
      state.flavors = (loaded[5].flavors || []).map(normalizeFlavor);
      state.flavorLabel = loaded[5].label || "Recheio do bolo";
      state.selectedFlavor = flavorName(state.flavors[0]);
      state.sobre = loaded[6] || {};
      state.pix = loaded[7] || { enabled: false, chave: "", nome: "", cidade: "" };
      state.pagamento = loaded[8] || { infinitepay: { enabled: false, handle: "" } };
      state.pausa = Jana.loadPausaConfig ? await Jana.loadPausaConfig(loaded[9] || {}) : loaded[9] || {};
      state.pausaEval = Jana.evaluatePausa ? Jana.evaluatePausa(state.pausa) : { active: false, message: "" };
      if (isAreaPage() || isCategoryPage()) {
        state.filter = pageAreaId() || "todas";
      }
      applyBrand();
      renderCarousel();
      renderAreas();
      renderCategoriesNav();
      renderDestaques();
      renderProducts();
      renderSobre();
      renderInstagram();
      renderEntregaRegions();
      renderCart();
      if (Jana.bindPausaEvents) {
        Jana.bindPausaEvents();
      }
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
    Jana.bindText("copyright", site.copyright || "© 2026 Jana Abreu");
    Jana.bindText(
      "city-state",
      [site.address && site.address.city, site.address && site.address.state].filter(Boolean).join(" ")
    );
    document.title = site.brandName;
    applyCategoryTitle();
    applyAreaTitle();
    applyProductPage();
    if (isAboutPage() && site.brandName) {
      document.title = "Sobre nós · " + site.brandName;
    }
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

  function applyAreaTitle() {
    if (!isAreaPage()) {
      return;
    }
    const area = currentArea();
    const name = area ? area.name : "Área";
    Jana.bindText("area-title", name);
    Jana.bindText("category-title", name);
    if (state.site && state.site.brandName) {
      document.title = name + " · " + state.site.brandName;
    }
  }

  function visibleCarouselSlides() {
    if (isAreaPage()) {
      return Jana.carouselSlidesFromProducts(Jana.productsForArea(state.products, currentArea()));
    }
    return Jana.homeCarouselSlides(state.carousel, state.products);
  }

  function renderCarousel() {
    const track = Jana.qs('[data-bind="carousel"]');
    const dots = Jana.qs('[data-bind="carousel-dots"]');
    const hero = Jana.qs("#hero-carrossel");
    if (!track) {
      return;
    }
    const slides = visibleCarouselSlides();
    state.slides = slides;
    state.slide = 0;
    if (hero) {
      hero.hidden = slides.length === 0;
    }
    if (!slides.length) {
      track.innerHTML = "";
      if (dots) {
        dots.innerHTML = "";
      }
      return;
    }
    track.style.setProperty("--carousel-transition", Jana.CAROUSEL_TRANSITION_MS + "ms");
    track.innerHTML = slides
      .map(function slideHtml(slide, index) {
        const eager = index === 0;
        const img =
          '<img src="' +
          Jana.escapeHtml(Jana.assetUrl(slide.image)) +
          '" alt="' +
          Jana.escapeHtml(slide.title || "") +
          '" width="1600" height="900"' +
          (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
          ' decoding="async">';
        if (slide.productSlug) {
          return (
            '<a class="hero__slide" href="' +
            Jana.escapeHtml(Jana.productUrl(slide.productSlug)) +
            '">' +
            img +
            "</a>"
          );
        }
        return '<article class="hero__slide">' + img + "</article>";
      })
      .join("");
    const showDots = slides.length > 1 && slides.length <= Jana.CAROUSEL_MAX_DOTS;
    if (dots) {
      dots.hidden = !showDots;
      dots.innerHTML = showDots
        ? slides
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
            .join("")
        : "";
    }
    Jana.qsa('[data-action="carousel-prev"], [data-action="carousel-next"]').forEach(function toggleArrow(btn) {
      btn.hidden = slides.length < 2;
    });
  }

  function goToSlide(index) {
    const total = (state.slides || []).length;
    if (!total) return;
    state.slide = (index + total) % total;
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
  }

  function startCarousel() {
    if (!Jana.qs("#hero-carrossel") || !(state.slides || []).length) {
      return;
    }
    stopCarousel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    state.timer = setInterval(function advance() {
      goToSlide(state.slide + 1);
    }, Jana.CAROUSEL_INTERVAL_MS);
  }

  function stopCarousel() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function renderAreas() {
    const list = Jana.qs('[data-bind="areas"]');
    if (!list) {
      return;
    }
    const areas = Jana.visibleAreas(state.areas, state.site);
    const current = isAreaPage() ? pageAreaId() : "";
    list.innerHTML = areas
      .map(function areaHtml(area) {
        const active = current === area.id || current === area.slug ? " is-active" : "";
        return (
          '<a class="area-button' +
          active +
          '" href="' +
          Jana.escapeHtml(Jana.areaUrl(area.slug)) +
          '"' +
          (active ? ' aria-current="page"' : "") +
          ">" +
          '<span class="area-button__media"><img src="' +
          Jana.escapeHtml(Jana.assetUrl(area.image)) +
          '" alt="" width="144" height="144" decoding="async"></span>' +
          '<span class="area-button__label">' +
          Jana.escapeHtml(area.name) +
          "</span></a>"
        );
      })
      .join("");
  }

  function renderCategoriesNav() {
    const menu = Jana.qs("#menu-categorias");
    if (!menu) {
      return;
    }
    const areas = Jana.visibleAreas(state.areas, state.site);
    const current = isAreaPage() ? pageAreaId() : "";
    menu.innerHTML = areas
      .map(function navLink(area) {
        const active = current === area.id || current === area.slug;
        return (
          '<a href="' +
          Jana.escapeHtml(Jana.areaUrl(area.slug)) +
          '"' +
          (active ? ' aria-current="page"' : "") +
          ">" +
          Jana.escapeHtml(area.name) +
          "</a>"
        );
      })
      .join("");
  }

  function renderCategories() {
    renderAreas();
    renderCategoriesNav();
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
      '<p class="card__excerpt">' +
      Jana.escapeHtml(Jana.productCardExcerpt ? Jana.productCardExcerpt(product) : "") +
      "</p>" +
      '<p class="card__price">' +
      Jana.escapeHtml(
        Jana.productHasFixedPrice && Jana.productHasFixedPrice(product)
          ? Jana.formatBRL(product.price)
          : "Sob consulta"
      ) +
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
    const area = currentArea();
    const list = area
      ? Jana.productsForArea(state.products, area)
      : state.filter === "todas"
        ? state.products
        : state.products.filter(function match(product) {
            return (product.categoryIds && product.categoryIds.indexOf(state.filter) !== -1) || product.categoryId === state.filter;
          });
    const label = area
      ? area.name
      : (state.categories.find(function findCat(item) {
          return item.id === state.filter || item.slug === state.filter;
        }) || {}).name || "Todas as categorias";
    Jana.bindText("filter-label", label);
    applyCategoryTitle();
    applyAreaTitle();
    grid.innerHTML = list.length
      ? list.map(productCard).join("")
      : '<p class="empty">Nenhum produto nesta área por enquanto. Combine a encomenda pelo WhatsApp.</p>';
    renderCategoriesNav();
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

  function setOptionalHtml(node, html) {
    if (!node) {
      return;
    }
    const wrap = node.closest("[data-optional]") || node;
    if (!html) {
      wrap.hidden = true;
      node.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    node.innerHTML = html;
  }

  function renderSobre() {
    if (!isAboutPage()) {
      return;
    }
    const sobre = state.sobre || {};
    const lead = String(sobre.lead || sobre.headline || "").trim();
    const portrait = sobre.portrait || {};
    const story = (sobre.story || []).filter(Boolean);
    const press = (sobre.press || []).filter(function keep(entry) {
      return entry && (entry.title || entry.outlet || entry.src || entry.url);
    });
    const gallery = (sobre.workGallery || []).filter(function keep(entry) {
      return entry && entry.src;
    });
    setOptionalHtml(Jana.qs('[data-bind="sobre-lead"]'), lead ? "<p>" + Jana.escapeHtml(lead) + "</p>" : "");
    const portraitEl = Jana.qs('[data-bind="sobre-portrait"]');
    if (portraitEl) {
      if (portrait.src) {
        setOptionalHtml(
          portraitEl,
          '<img src="' +
            Jana.escapeHtml(Jana.assetUrl(portrait.src)) +
            '" alt="' +
            Jana.escapeHtml(portrait.alt || "Jana Abreu") +
            '" width="480" height="640">'
        );
      } else {
        setOptionalHtml(portraitEl, "");
      }
    }
    setOptionalHtml(
      Jana.qs('[data-bind="sobre-story"]'),
      story.length
        ? story
            .map(function paragraph(text) {
              return "<p>" + Jana.escapeHtml(text) + "</p>";
            })
            .join("")
        : ""
    );
    setOptionalHtml(
      Jana.qs('[data-bind="sobre-work"]'),
      gallery.length
        ? gallery
            .map(function tile(item) {
              const img =
                '<img src="' +
                Jana.escapeHtml(Jana.assetUrl(item.src)) +
                '" alt="' +
                Jana.escapeHtml(item.alt || "") +
                '" width="600" height="600" loading="lazy" decoding="async">';
              if (item.productSlug) {
                return (
                  '<a href="' + Jana.escapeHtml(Jana.productUrl(item.productSlug)) + '">' + img + "</a>"
                );
              }
              return img;
            })
            .join("")
        : ""
    );
    setOptionalHtml(
      Jana.qs('[data-bind="sobre-press"]'),
      press.length
        ? press
            .map(function item(entry) {
              const label = Jana.escapeHtml(entry.title || entry.outlet || "Na imprensa");
              if (entry.url) {
                return (
                  '<a href="' +
                  Jana.escapeHtml(entry.url) +
                  '" target="_blank" rel="noopener noreferrer">' +
                  label +
                  "</a>"
                );
              }
              return "<p>" + label + "</p>";
            })
            .join("")
        : ""
    );
    const areasEl = Jana.qs('[data-bind="sobre-areas"]');
    if (areasEl) {
      areasEl.textContent = Jana.visibleAreas(state.areas, state.site)
        .map(function nameOf(area) {
          return area.name;
        })
        .join(" · ");
    }
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
    const area = Jana.areaForProduct(product, Jana.visibleAreas(state.areas, state.site));
    Jana.bindText("product-name", product.name);
    Jana.bindText("product-description", product.description);
    Jana.bindText("product-price", Jana.formatBRL(product.price));
    Jana.bindText("product-category", area ? area.name : "");
    Jana.bindHref("product-category-link", area ? Jana.areaUrl(area.slug) : Jana.homeUrl());
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

  function stepGallery(delta) {
    const product = state.currentProduct;
    if (!product || !product.images || product.images.length < 2) {
      return;
    }
    const length = product.images.length;
    state.galleryIndex = (state.galleryIndex + delta + length) % length;
    updateModalImage();
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
      pageImage.setAttribute("draggable", "false");
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
    const hasMany = product.images.length > 1;
    Jana.qsa('[data-action="gallery-prev"], [data-action="gallery-next"]').forEach(function setArrow(btn) {
      btn.hidden = !hasMany;
    });
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
    if (blockEncomenda()) {
      return;
    }
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
    if (blockEncomenda()) {
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

  function selectedModalidade() {
    const checked = Jana.qs('#checkout-form [name="modalidade"]:checked');
    return checked ? checked.value : "";
  }

  function renderEntregaRegions() {
    const select = Jana.qs('#checkout-form [name="regiao"]');
    if (!select) {
      return;
    }
    const current = select.value;
    const config = Jana.entregaConfig(state.site);
    select.innerHTML =
      '<option value="">Escolha a região</option>' +
      config.regions
        .map(function option(region) {
          return (
            '<option value="' +
            Jana.escapeHtml(region.id) +
            '">' +
            Jana.escapeHtml(region.label) +
            "</option>"
          );
        })
        .join("");
    if (current) {
      select.value = current;
    }
  }

  function syncCheckoutMode() {
    const mode = selectedModalidade();
    const isEntrega = mode === "entrega";
    const isRetirada = mode === "retirada";
    const config = Jana.entregaConfig(state.site);
    const hasRegions = config.regions.length > 0;
    const addressWrap = Jana.qs('[data-bind="checkout-address"]');
    const addressInput = Jana.qs('#checkout-form [name="endereco"]');
    const dateCaption = Jana.qs('[data-bind="checkout-date-caption"]');
    const regionWrap = Jana.qs('[data-bind="checkout-region"]');
    const regionSelect = Jana.qs('#checkout-form [name="regiao"]');
    const feeEl = Jana.qs('[data-bind="checkout-fee"]');
    if (addressWrap) {
      addressWrap.hidden = !isEntrega;
    }
    if (addressInput) {
      if (isEntrega) {
        addressInput.setAttribute("required", "required");
      } else {
        addressInput.removeAttribute("required");
      }
    }
    if (dateCaption) {
      dateCaption.textContent = isEntrega
        ? "Data de entrega"
        : isRetirada
          ? "Data de retirada"
          : "Data desejada";
    }
    if (regionWrap) {
      regionWrap.hidden = !isEntrega || !hasRegions;
    }
    if (regionSelect) {
      if (isEntrega && hasRegions) {
        regionSelect.setAttribute("required", "required");
      } else {
        regionSelect.removeAttribute("required");
      }
    }
    const resolved = Jana.resolveEntrega(state.site, mode, regionSelect && regionSelect.value);
    const totals = Jana.checkoutTotals(Jana.Cart.total(), resolved);
    Jana.bindText("cart-total", totals.totalLabel);
    if (feeEl) {
      if (isEntrega) {
        feeEl.hidden = false;
        feeEl.textContent = "Taxa de entrega: " + totals.taxaLabel;
      } else {
        feeEl.hidden = true;
        feeEl.textContent = "";
      }
    }
    renderPix(totals);
    syncCheckoutPayUi(totals);
  }

  function checkoutPayOpts(totals) {
    const row = totals || Jana.checkoutTotals(Jana.Cart.total(), Jana.resolveEntrega(state.site, selectedModalidade(), ""));
    return {
      pagamento: state.pagamento,
      pix: state.pix,
      items: Jana.Cart.items(),
      products: state.products,
      taxaPendente: row.taxaPendente,
      total: row.total,
    };
  }

  function cartCanPayOnline(totals) {
    return Jana.canPayOnline(checkoutPayOpts(totals));
  }

  function cartPayOptions(totals) {
    if (Jana.checkoutPayOptions) {
      return Jana.checkoutPayOptions(checkoutPayOpts(totals));
    }
    return { pix: false, infinitepay: cartCanPayOnline(totals) };
  }

  function selectedPayMethod() {
    const checked = Jana.qs('#checkout-form [name="pagamento"]:checked');
    return (checked && checked.value) || state.payMethod || "";
  }

  function syncCheckoutPayUi(totals) {
    const options = cartPayOptions(totals);
    const onSite = !!(options.pix || options.infinitepay);
    const methodBox = Jana.qs('[data-bind="pay-method"]');
    const pixLabel = Jana.qs('[data-bind="pay-option-pix"]');
    const infLabel = Jana.qs('[data-bind="pay-option-infinitepay"]');
    if (pixLabel) {
      pixLabel.hidden = !options.pix;
    }
    if (infLabel) {
      infLabel.hidden = !options.infinitepay;
    }
    if (methodBox) {
      methodBox.hidden = !onSite;
    }
    let method = selectedPayMethod();
    if (method === "pix" && !options.pix) {
      method = "";
    }
    if (method === "infinitepay" && !options.infinitepay) {
      method = "";
    }
    if (!method && options.pix) {
      method = "pix";
    } else if (!method && options.infinitepay) {
      method = "infinitepay";
    }
    state.payMethod = method;
    const pixRadio = Jana.qs('#checkout-form [name="pagamento"][value="pix"]');
    const infRadio = Jana.qs('#checkout-form [name="pagamento"][value="infinitepay"]');
    if (pixRadio) {
      pixRadio.checked = method === "pix";
      if (options.pix) {
        pixRadio.setAttribute("required", "required");
      } else {
        pixRadio.removeAttribute("required");
      }
    }
    if (infRadio) {
      infRadio.checked = method === "infinitepay";
      if (options.infinitepay && !options.pix) {
        infRadio.setAttribute("required", "required");
      } else if (options.pix) {
        infRadio.setAttribute("required", "required");
      } else {
        infRadio.removeAttribute("required");
      }
    }
    if (method !== "pix") {
      state.pixVisible = false;
    }
    const submit = Jana.qs('[data-bind="checkout-submit"]') || Jana.qs("#checkout-form button[type='submit']");
    if (submit) {
      const opensWhatsApp = !onSite || (method === "pix" && state.pixVisible);
      if (!onSite) {
        submit.textContent = "Enviar solicitação no WhatsApp";
      } else if (method === "pix") {
        submit.textContent = state.pixVisible ? "Já paguei" : "Gerar Pix";
      } else if (method === "infinitepay") {
        submit.textContent = "Pagar pela InfinitePay";
      } else {
        submit.textContent = "Escolha a forma de pagamento";
      }
      submit.classList.toggle("btn--whatsapp", opensWhatsApp);
      submit.classList.toggle("btn--solid", !opensWhatsApp);
    }
    let disclaimer = state.site.requestDisclaimer || Jana.REQUEST_DISCLAIMER;
    let payments = state.site.paymentsNote || "";
    if (method === "pix") {
      disclaimer = Jana.PIX_DISCLAIMER || disclaimer;
      payments = "";
    } else if (method === "infinitepay") {
      disclaimer = Jana.PAID_DISCLAIMER || disclaimer;
      payments = "Pagamento no site pela InfinitePay (cartão ou Pix) ao enviar o pedido.";
    }
    Jana.bindText("request-disclaimer", disclaimer);
    Jana.bindText("payments", payments);
    const unpricedNote = Jana.qs("[data-bind='checkout-unpriced']");
    if (unpricedNote) {
      const methodsReady = !!(
        (Jana.pixIsReady && Jana.pixIsReady(state.pix)) ||
        (Jana.infinitePayIsReady && Jana.infinitePayIsReady(state.pagamento))
      );
      const show = methodsReady && Jana.cartHasUnpricedItems(Jana.Cart.items(), state.products);
      unpricedNote.hidden = !show;
    }
    renderPix(totals);
  }

  function currentPixAmount(totals) {
    const row = totals || Jana.checkoutTotals(Jana.Cart.total(), Jana.resolveEntrega(state.site, selectedModalidade(), ""));
    return Number(row.total) || 0;
  }

  function renderPix(totals) {
    const block = Jana.qs('[data-bind="pix-block"]');
    if (!block) {
      return;
    }
    const ready = Jana.pixIsReady(state.pix);
    const amount = currentPixAmount(totals);
    const show = ready && amount > 0 && state.pixVisible && selectedPayMethod() === "pix";
    if (!show) {
      block.hidden = true;
      const code = Jana.qs('[data-bind="pix-payload"]');
      if (code) {
        code.value = "";
      }
      if (!ready || amount <= 0) {
        state.pixPayload = "";
      }
      return;
    }
    const cfg = Jana.pixConfig(state.pix);
    const payload = Jana.buildPixPayload({
      chave: cfg.chave,
      nome: cfg.nome,
      cidade: cfg.cidade,
      valor: amount,
      txid: "***",
    });
    state.pixPayload = payload;
    block.hidden = !show;
    const code = Jana.qs('[data-bind="pix-payload"]');
    if (code) {
      code.value = show ? payload : "";
    }
    Jana.bindText("pix-value", "Valor do Pix: " + Jana.formatBRL(amount));
    const img = Jana.qs('[data-bind="pix-qr"]');
    if (img && payload && typeof qrcode === "function") {
      const qr = qrcode(0, "M");
      qr.addData(payload);
      qr.make();
      img.src = qr.createDataURL(6, 2);
      img.alt = "QR Code Pix no valor de " + Jana.formatBRL(amount);
    }
  }

  function copyPixCode() {
    const text = state.pixPayload || "";
    const status = Jana.qs('[data-bind="pix-copy-status"]');
    function done(ok) {
      if (status) {
        status.textContent = ok ? "Código Pix copiado." : "Não foi possível copiar. Selecione o QR e tente de novo.";
      }
    }
    if (!text) {
      done(false);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function onCopy() {
          done(true);
        },
        function onFail() {
          copyPixFallback(text, done);
        }
      );
      return;
    }
    copyPixFallback(text, done);
  }

  function copyPixFallback(text, done) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    field.remove();
    done(ok);
  }

  function renderCart() {
    Jana.bindText("cart-count", String(Jana.Cart.count()));
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
    syncCheckoutMode();
  }

  function setCategoriesOpen(open) {
    const button = Jana.qs('[data-action="toggle-categories"]');
    const menu = Jana.qs("#menu-categorias");
    state.categoriesOpen = !!open;
    if (button) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (menu) {
      menu.hidden = !open;
    }
    const wrap = Jana.qs(".topo__categories");
    if (wrap) {
      wrap.classList.toggle("is-open", !!open);
    }
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
    if (!open) {
      setCategoriesOpen(false);
    }
  }

  function setPageLocked(locked) {
    document.documentElement.classList.toggle("is-locked", locked);
    document.body.classList.toggle("is-locked", locked);
    ["#topo", "main", "#instagram", "#rodape"].forEach(function mark(selector) {
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

  function encomendasPausadas() {
    return !!(state.pausaEval && state.pausaEval.active);
  }

  function blockEncomenda(event) {
    if (!encomendasPausadas()) {
      return false;
    }
    if (event) {
      event.preventDefault();
    }
    closeCart();
    if (Jana.openPausaModal) {
      Jana.openPausaModal(state.pausaEval, state.site, { onLock: setPageLocked });
    }
    return true;
  }

  function openCart() {
    if (blockEncomenda()) {
      return;
    }
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
    const modalidade = String(data.get("modalidade") || "").trim();
    const regiao = String(data.get("regiao") || "").trim();
    const resolved = Jana.resolveEntrega(state.site, modalidade, regiao);
    const totals = Jana.checkoutTotals(Jana.Cart.total(), resolved);
    return {
      nome: String(data.get("nome") || "").trim(),
      telefone: String(data.get("telefone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      endereco: modalidade === "entrega" ? String(data.get("endereco") || "").trim() : "",
      data: String(data.get("data") || "").trim(),
      observacoes: String(data.get("observacoes") || "").trim(),
      modalidade: resolved.modalidade,
      regiao: resolved.regiao,
      regiaoLabel: resolved.regiaoLabel,
      taxa: totals.taxa,
      taxaPendente: totals.taxaPendente,
      frete: totals.taxa,
      items: Jana.Cart.items(),
    };
  }

  function formatDesiredDate(value) {
    if (!value || value.indexOf("-") === -1) {
      return value;
    }
    const parts = value.split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function buildWhatsAppMessage(payload) {
    const resolved = Jana.resolveEntrega(state.site, payload.modalidade, payload.regiao);
    const totals = Jana.checkoutTotals(Jana.Cart.total(), resolved);
    const isEntrega = payload.modalidade === "entrega";
    const dateLabel = isEntrega ? "Data de entrega" : "Data de retirada";
    const lines = [
      "Olá! Gostaria de fazer uma encomenda na " + state.site.brandName + ".",
      "",
      "*Cliente:* " + payload.nome,
      "*Telefone:* " + payload.telefone,
    ];
    if (payload.email) {
      lines.push("*E-mail:* " + payload.email);
    }
    lines.push("*Modalidade:* " + (isEntrega ? "Entrega" : "Retirada"));
    if (isEntrega && payload.endereco) {
      lines.push("*Endereço:* " + payload.endereco);
    }
    if (isEntrega && payload.regiaoLabel) {
      lines.push("*Região:* " + payload.regiaoLabel);
    }
    if (payload.data) {
      lines.push("*" + dateLabel + ":* " + formatDesiredDate(payload.data));
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
    if (isEntrega) {
      lines.push("", "*Subtotal:* " + Jana.formatBRL(totals.subtotal));
      lines.push("*Taxa de entrega:* " + totals.taxaLabel);
      lines.push("*Total:* " + totals.totalLabel);
    } else {
      lines.push("", "*Total:* " + totals.totalLabel);
    }
    if (Jana.pixIsReady(state.pix) && !(Jana.infinitePayIsReady && Jana.infinitePayIsReady(state.pagamento))) {
      lines.push("", "O pagamento será por Pix após a confirmação da Jana. Total: " + totals.totalLabel);
    }
    if (payload.observacoes) {
      lines.push("", "*Observações:* " + payload.observacoes);
    }
    const pay = Jana.canPayOnline({
      pagamento: state.pagamento,
      items: payload.items,
      products: state.products,
      taxaPendente: totals.taxaPendente,
      total: totals.total,
    });
    lines.push(
      "",
      pay ? Jana.PAID_DISCLAIMER : state.site.requestDisclaimer || Jana.REQUEST_DISCLAIMER,
      "",
      pay ? "" : state.site.paymentsNote
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
    if (blockEncomenda(event)) {
      return;
    }
    const form = event.target;
    const payload = readCheckoutForm(form);
    if (!payload.modalidade || (payload.modalidade !== "retirada" && payload.modalidade !== "entrega")) {
      setCheckoutStatus("Escolha Retirada ou Entrega.");
      openCart();
      return;
    }
    if (payload.modalidade === "entrega" && !payload.endereco) {
      setCheckoutStatus("Informe o endereço para entrega.");
      openCart();
      return;
    }
    const config = Jana.entregaConfig(state.site);
    if (payload.modalidade === "entrega" && config.regions.length && !payload.regiao) {
      setCheckoutStatus("Escolha a região de entrega.");
      openCart();
      return;
    }
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

  function checkoutPix(payload, totals, submit) {
    if (!state.pixVisible) {
      payload.status = "aguardando pagamento";
      payload.paymentStatus = "aguardando conferência";
      payload.paymentMethod = "pix";
      try {
        Jana.Store.saveCheckout(payload);
      } catch (err) {
        /* keep going so the customer can still pay */
      }
      state.pixVisible = true;
      renderPix(totals);
      syncCheckoutPayUi(totals);
      setCheckoutStatus("Pague com Pix no valor indicado e, quando terminar, toque em Já paguei.");
      if (submit) {
        submit.disabled = false;
      }
      const qr = Jana.qs('[data-bind="pix-qr"]');
      if (qr && qr.scrollIntoView) {
        qr.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }
    const order = {
      nome: payload.nome,
      telefone: payload.telefone,
      email: payload.email,
      modalidade: payload.modalidade,
      endereco: payload.endereco,
      data: payload.data,
      items: payload.items,
      observacoes: payload.observacoes,
      total: totals.total,
      subtotal: totals.subtotal,
      taxa: totals.taxa,
    };
    const message = Jana.buildPixPendingWhatsAppMessage
      ? Jana.buildPixPendingWhatsAppMessage(order, state.site, totals)
      : "Pagamento via Pix — aguardando conferência";
    const number = state.site.contato.whatsapp;
    const url = "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
    setCheckoutStatus("Abrindo o WhatsApp para enviar o comprovante…");
    openWhatsApp(url);
    if (submit) {
      submit.disabled = false;
    }
  }

  async function checkoutInfinitePay(payload, totals, submit) {
    const nsu = Jana.generateOrderNsu();
    payload.orderNsu = nsu;
    payload.status = "aguardando pagamento";
    payload.paymentStatus = "aguardando pagamento";
    payload.paymentMethod = "infinitepay";
    let localOrder = null;
    try {
      localOrder = Jana.Store.saveCheckout(payload);
    } catch (err) {
      localOrder = null;
    }
    const body = {
      handle: Jana.infinitePayHandle(state.pagamento),
      order_nsu: nsu,
      redirect_url: Jana.INFINITEPAY_REDIRECT_URL,
      items: Jana.infinitePayItems(payload.items, totals),
    };
    if (payload.nome) {
      body.customer = { name: payload.nome };
      const phone = Jana.infinitePayPhone(payload.telefone);
      if (phone) {
        body.customer.phone_number = phone;
      }
      if (payload.email) {
        body.customer.email = payload.email;
      }
    }
    if (Jana.savePendingPay) {
      Jana.savePendingPay({
        orderId: localOrder && localOrder.id,
        orderNsu: nsu,
        payload: payload,
        totals: totals,
      });
    }
    setCheckoutStatus("Abrindo o pagamento…");
    try {
      const data = await Jana.createInfinitePayLink(body);
      const url = Jana.infinitePayCheckoutUrl(data);
      if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error("Sem URL de checkout");
      }
      window.location.assign(url);
    } catch (err) {
      setCheckoutStatus("Não foi possível abrir o pagamento. Tente de novo ou fale no WhatsApp.");
      if (submit) {
        submit.disabled = false;
      }
    }
  }

  async function checkoutAsync(payload, submit) {
    if (encomendasPausadas()) {
      if (submit) {
        submit.disabled = false;
      }
      blockEncomenda();
      return;
    }
    const resolved = Jana.resolveEntrega(state.site, payload.modalidade, payload.regiao);
    const totals = Jana.checkoutTotals(Jana.Cart.total(), resolved);
    const payOpts = {
      pagamento: state.pagamento,
      pix: state.pix,
      items: payload.items,
      products: state.products,
      taxaPendente: totals.taxaPendente,
      total: totals.total,
    };
    const options = Jana.checkoutPayOptions ? Jana.checkoutPayOptions(payOpts) : { pix: false, infinitepay: Jana.canPayOnline(payOpts) };
    const method = selectedPayMethod();
    if (options.pix || options.infinitepay) {
      if (!method) {
        setCheckoutStatus("Escolha como prefere pagar.");
        if (submit) {
          submit.disabled = false;
        }
        openCart();
        return;
      }
      if (method === "pix" && options.pix) {
        checkoutPix(payload, totals, submit);
        return;
      }
      if (method === "infinitepay" && options.infinitepay) {
        await checkoutInfinitePay(payload, totals, submit);
        return;
      }
      setCheckoutStatus("Escolha como prefere pagar.");
      if (submit) {
        submit.disabled = false;
      }
      return;
    }
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
      if (action === "toggle-categories") {
        event.preventDefault();
        event.stopPropagation();
        const topo = Jana.qs("#topo");
        const willOpen = !state.categoriesOpen;
        if (willOpen && topo && window.matchMedia("(max-width: 719px)").matches) {
          setMenuOpen(true);
        }
        setCategoriesOpen(willOpen);
        if (willOpen) {
          const first = Jana.qs("#menu-categorias a");
          if (first) {
            window.setTimeout(function focusFirst() {
              first.focus();
            }, 0);
          }
        }
      }
      if (action === "open-cart") {
        event.preventDefault();
        if (blockEncomenda(event)) {
          return;
        }
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
      if (action === "gallery-prev") {
        stepGallery(-1);
      }
      if (action === "gallery-next") {
        stepGallery(1);
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
      if (action === "copy-pix") {
        event.preventDefault();
        copyPixCode();
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
          state.carouselIgnoreClick = false;
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
            state.carouselIgnoreClick = true;
            goToSlide(state.slide + (dx < 0 ? 1 : -1));
          }
        },
        { passive: true }
      );
      hero.addEventListener(
        "click",
        function onHeroClick(event) {
          if (!state.carouselIgnoreClick) {
            return;
          }
          state.carouselIgnoreClick = false;
          event.preventDefault();
        },
        true
      );
    }
    const galleryViewer = Jana.qs('[data-bind="product-viewer"]') || Jana.qs(".produto-detalhe__gallery");
    if (galleryViewer) {
      let pointerStartX = 0;
      let pointerStartY = 0;
      let pointerTracking = false;
      const swipeThreshold = 48;
      galleryViewer.addEventListener("dragstart", function onDragStart(event) {
        event.preventDefault();
      });
      galleryViewer.addEventListener("pointerdown", function onPointerDown(event) {
        if (event.target.closest("button")) {
          return;
        }
        if (event.pointerType === "mouse" && event.button !== 0) {
          return;
        }
        pointerTracking = true;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        if (galleryViewer.setPointerCapture) {
          try {
            galleryViewer.setPointerCapture(event.pointerId);
          } catch (err) {}
        }
      });
      galleryViewer.addEventListener("pointerup", function onPointerUp(event) {
        if (!pointerTracking) {
          return;
        }
        pointerTracking = false;
        const dx = event.clientX - pointerStartX;
        const dy = event.clientY - pointerStartY;
        if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
          stepGallery(dx < 0 ? 1 : -1);
        }
      });
      galleryViewer.addEventListener("pointercancel", function onPointerCancel() {
        pointerTracking = false;
      });
      galleryViewer.addEventListener(
        "touchstart",
        function onTouchStart(event) {
          if (event.target.closest("button")) {
            return;
          }
          const point = event.changedTouches[0];
          pointerTracking = true;
          pointerStartX = point.clientX;
          pointerStartY = point.clientY;
        },
        { passive: true }
      );
      galleryViewer.addEventListener(
        "touchend",
        function onTouchEnd(event) {
          if (!pointerTracking) {
            return;
          }
          pointerTracking = false;
          const point = event.changedTouches[0];
          const dx = point.clientX - pointerStartX;
          const dy = point.clientY - pointerStartY;
          if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
            stepGallery(dx < 0 ? 1 : -1);
          }
        },
        { passive: true }
      );
    }

    document.addEventListener("keydown", function onKey(event) {
      const drawer = Jana.qs("#encomendas");
      const drawerOpen = drawer && !drawer.hidden;
      if (event.key === "Escape") {
        if (Jana.isPausaModalOpen && Jana.isPausaModalOpen()) {
          event.preventDefault();
          Jana.closePausaModal();
          return;
        }
        if (drawerOpen) {
          event.preventDefault();
          closeCart();
          return;
        }
        if (state.categoriesOpen) {
          event.preventDefault();
          const categoriesBtn = Jana.qs('[data-action="toggle-categories"]');
          setCategoriesOpen(false);
          if (categoriesBtn) {
            categoriesBtn.focus();
          }
          return;
        }
        setMenuOpen(false);
        return;
      }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && isProductPage()) {
        const tag = event.target && event.target.tagName ? event.target.tagName : "";
        if (drawerOpen || /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
          return;
        }
        event.preventDefault();
        stepGallery(event.key === "ArrowRight" ? 1 : -1);
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
      if (state.categoriesOpen && !event.target.closest(".topo__categories")) {
        setCategoriesOpen(false);
      }
      if (!topo || !topo.classList.contains("is-open")) {
        return;
      }
      if (event.target.closest("#topo")) {
        if (event.target.closest(".topo__nav a") && !event.target.closest("#menu-categorias")) {
          setMenuOpen(false);
        }
        if (event.target.closest("#menu-categorias a")) {
          setMenuOpen(false);
          setCategoriesOpen(false);
        }
        return;
      }
      setMenuOpen(false);
    });
    document.addEventListener("focusin", function onFocusIn(event) {
      if (!state.categoriesOpen) {
        return;
      }
      if (!event.target.closest(".topo__categories")) {
        setCategoriesOpen(false);
      }
    });
    const checkoutForm = Jana.qs("#checkout-form");
    if (checkoutForm) {
      checkoutForm.addEventListener("submit", checkout);
      checkoutForm.addEventListener("change", function onCheckoutChange(event) {
        const name = event.target && event.target.name;
        if (name === "modalidade" || name === "regiao") {
          syncCheckoutMode();
        }
        if (name === "pagamento") {
          state.payMethod = event.target.value || "";
          if (state.payMethod !== "pix") {
            state.pixVisible = false;
          }
          syncCheckoutPayUi();
        }
      });
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
    if (hash === "#encomendas" || isEncomendasPage()) {
      if (blockEncomenda()) {
        return;
      }
      openCart();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
