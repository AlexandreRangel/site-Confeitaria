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
    personalizacao: { ready: false, checked: false, checking: null, files: {} },
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
    const fromAttr = document.body.getAttribute("data-area") || pageCategoryId();
    if (fromAttr) return fromAttr;
    return Jana.areaPageSlug ? Jana.areaPageSlug() : "";
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
    const query = params.get("slug");
    if (query) {
      return query;
    }
    const fromBody = document.body && document.body.getAttribute("data-product-slug");
    if (fromBody) {
      return fromBody;
    }
    const parts = (location.pathname || "").split("/").filter(Boolean);
    const idx = parts.lastIndexOf("produto");
    if (idx >= 0 && parts[idx + 1] && parts[idx + 1] !== "index.html") {
      try {
        return decodeURIComponent(parts[idx + 1]);
      } catch (err) {
        return parts[idx + 1];
      }
    }
    return "";
  }

  function productCanonicalPath(slug) {
    const value = String(slug || "");
    if (!value) {
      return "produto/";
    }
    return "produto/?slug=" + encodeURIComponent(value);
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
    const paymentsNote = Jana.siteText ? Jana.siteText(site, "paymentsNote", "") : String(site.paymentsNote || "").trim();
    Jana.bindText("payments", paymentsNote);
    Jana.qsa('[data-bind="payments"]').forEach(function hidePayments(node) {
      node.hidden = !paymentsNote;
    });
    const pixNote = Jana.siteText ? Jana.siteText(site, "pixNote", "Pague o valor indicado. Depois toque em Já paguei e envie o comprovante pelo WhatsApp.") : (site.pixNote != null ? String(site.pixNote).trim() : "Pague o valor indicado. Depois toque em Já paguei e envie o comprovante pelo WhatsApp.");
    Jana.bindText("pix-note", pixNote);
    Jana.qsa('[data-bind="pix-note"]').forEach(function hidePixNote(node) {
      node.hidden = !pixNote;
    });
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
    (function applyFooterMap() {
      const map = Jana.footerMap ? Jana.footerMap(site) : { visible: false };
      Jana.qsa('[data-bind="footer-map"]').forEach(function show(el) {
        el.hidden = !map.visible;
      });
      Jana.bindText("footer-address", map.address || "");
      if (map.link) Jana.bindHref("footer-map-link", map.link);
      Jana.qsa('[data-bind="footer-map-embed"]').forEach(function setSrc(iframe) {
        if (map.visible && map.embed) iframe.setAttribute("src", map.embed);
        else iframe.removeAttribute("src");
      });
    })();
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
    applyAreaDescription(area);
    if (state.site && state.site.brandName) {
      document.title = name + " · " + state.site.brandName;
    }
  }

  /* Descrição opcional da área (editável no painel). Vazia: nada aparece. */
  function applyAreaDescription(area) {
    const title = Jana.qs('[data-bind="area-title"]');
    if (!title) {
      return;
    }
    const text = String((area && area.description) || "").trim();
    let node = Jana.qs('[data-bind="area-description"]');
    if (!text) {
      if (node) node.remove();
      return;
    }
    if (!node) {
      node = document.createElement("p");
      node.className = "area-page__lead";
      node.setAttribute("data-bind", "area-description");
      title.insertAdjacentElement("afterend", node);
    }
    node.textContent = text;
  }

  function visibleCarouselSlides() {
    if (isAreaPage()) {
      const area = currentArea();
      if (!area || !Jana.isAreaActive(area, state.site)) {
        return [];
      }
      const banners = Jana.pageCarouselSlides(state.carousel, state.products, area.id);
      if (banners.length) {
        return banners;
      }
      return Jana.carouselSlidesFromProducts(Jana.productsForArea(state.products, area));
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
      // banners do editor (formato "banner") aparecem inteiros, na proporção em que foram feitos
      hero.classList.toggle(
        "hero--banners",
        slides.length > 0 &&
          slides.every(function isBanner(slide) {
            return slide.banner === true;
          })
      );
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
        if (slide.tipo === "produto" && Jana.productBannerHtml) {
          return Jana.productBannerHtml(slide, { eager: index === 0 });
        }
        if (Jana.imageBannerHtml) {
          return Jana.imageBannerHtml(slide, { eager: index === 0 });
        }
        const eager = index === 0;
        let img =
          '<img src="' +
          Jana.escapeHtml(Jana.assetUrl(slide.image)) +
          '" alt="' +
          Jana.escapeHtml(slide.title || "") +
          '" width="1600" height="900"' +
          (eager ? ' fetchpriority="high"' : ' loading="lazy"') +
          ' decoding="async">';
        if (slide.imageMobile) {
          img =
            '<picture><source media="(max-width: 719px)" srcset="' +
            Jana.escapeHtml(Jana.assetUrl(slide.imageMobile)) +
            '">' +
            img +
            "</picture>";
        }
        const href = slide.href != null ? slide.href : slide.productSlug ? Jana.productUrl(slide.productSlug) : "";
        if (href) {
          return (
            '<a class="hero__slide" href="' +
            Jana.escapeHtml(href) +
            '"' +
            (slide.external ? ' target="_blank" rel="noopener noreferrer"' : "") +
            ">" +
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
          '" alt="' +
          Jana.escapeHtml("Categoria " + (area.name || "")) +
          '" width="' +
          (Jana.imageIntrinsicSize ? Jana.imageIntrinsicSize(area.image, 144, 144).width : 144) +
          '" height="' +
          (Jana.imageIntrinsicSize ? Jana.imageIntrinsicSize(area.image, 144, 144).height : 144) +
          '" loading="lazy" decoding="async"></span>' +
          '<span class="area-button__label">' +
          Jana.escapeHtml(area.name) +
          "</span></a>"
        );
      })
      .join("");
    layoutHomeAreas();
  }

  function homeAreasList() {
    return Jana.qs('body[data-page="home"] [data-bind="areas"]');
  }

  function homeAreasMinSize(list) {
    const rem = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const raw = (window.getComputedStyle(list).getPropertyValue("--area-min") || "10rem").trim();
    if (raw.slice(-3) === "rem") {
      return (parseFloat(raw) || 10) * rem;
    }
    if (raw.slice(-2) === "px") {
      return parseFloat(raw) || 10 * rem;
    }
    return 10 * rem;
  }

  function updateHomeAreaArrows() {
    const list = homeAreasList();
    const shell = list && list.closest(".areas__carousel");
    if (!list || !shell) {
      return;
    }
    const prev = shell.querySelector('[data-action="areas-prev"]');
    const next = shell.querySelector('[data-action="areas-next"]');
    const scrolling = shell.classList.contains("areas--scroll");
    const max = list.scrollWidth - list.clientWidth;
    const hasOverflow = scrolling && max > 4;
    shell.classList.toggle("is-more-start", hasOverflow && list.scrollLeft > 4);
    shell.classList.toggle("is-more-end", hasOverflow && list.scrollLeft < max - 4);
    if (prev) {
      prev.hidden = !hasOverflow;
      prev.disabled = !hasOverflow || list.scrollLeft <= 4;
    }
    if (next) {
      next.hidden = !hasOverflow;
      next.disabled = !hasOverflow || list.scrollLeft >= max - 4;
    }
  }

  function scrollHomeAreas(direction) {
    const list = homeAreasList();
    if (!list) {
      return;
    }
    const card = list.querySelector(".area-button");
    const styles = window.getComputedStyle(list);
    const gap = parseFloat(styles.columnGap || styles.gap) || 12;
    const width = card ? card.getBoundingClientRect().width : list.clientWidth / 3;
    list.scrollBy({ left: direction * (width + gap), behavior: "smooth" });
  }

  function layoutHomeAreas() {
    const list = homeAreasList();
    if (!list) {
      return;
    }
    const shell = list.closest(".areas__carousel") || list.parentElement;
    const n = list.querySelectorAll(".area-button").length;
    list.style.setProperty("--area-count", String(n));
    const rowMode = window.matchMedia("(min-width: 900px)").matches;
    let scroll = false;
    if (rowMode && n && shell) {
      const styles = window.getComputedStyle(list);
      const gap = parseFloat(styles.columnGap || styles.gap) || 12;
      const needed = n * homeAreasMinSize(list) + Math.max(0, n - 1) * gap;
      scroll = needed > list.clientWidth + 1;
    }
    const key = n + ":" + Math.round(list.clientWidth) + ":" + (rowMode ? "r" : "g") + ":" + (scroll ? "s" : "f");
    if (list.dataset.areasLayout === key) {
      updateHomeAreaArrows();
      return;
    }
    list.dataset.areasLayout = key;
    if (shell) {
      shell.classList.toggle("areas--scroll", scroll);
    }
    if (!scroll) {
      list.scrollLeft = 0;
    }
    bindHomeAreasCarousel(list);
    updateHomeAreaArrows();
  }

  function bindHomeAreasCarousel(list) {
    if (list.dataset.areasBound === "true") {
      return;
    }
    list.dataset.areasBound = "true";
    list.addEventListener(
      "scroll",
      function onHomeAreasScroll() {
        updateHomeAreaArrows();
      },
      { passive: true }
    );
    window.addEventListener("resize", function onHomeAreasResize() {
      layoutHomeAreas();
    });
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(function onHomeAreasResize() {
        layoutHomeAreas();
      });
      ro.observe(list);
    }
  }

  Jana.layoutHomeAreas = layoutHomeAreas;

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
      '<a class="card__media-link" href="' +
      Jana.escapeHtml(Jana.productUrl(product.slug)) +
      '" tabindex="-1" aria-hidden="true">' +
      (exemplo ? '<span class="badge">Exemplo</span>' : "") +
      '<img src="' +
      Jana.escapeHtml(Jana.assetUrl(product.images[0])) +
      '" alt="' +
      Jana.escapeHtml(Jana.productImageAlt(product, 0)) +
      '" width="' +
      (Jana.imageIntrinsicSize && product.images[0] ? Jana.imageIntrinsicSize(product.images[0], 600, 600).width : 600) +
      '" height="' +
      (Jana.imageIntrinsicSize && product.images[0] ? Jana.imageIntrinsicSize(product.images[0], 600, 600).height : 600) +
      '" loading="lazy" decoding="async">' +
      "</a></div>" +
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
      (Jana.productHasMinQty && Jana.productHasMinQty(product)
        ? '<span class="card__min">mín. ' + Jana.productMinQty(product) + "</span>"
        : "") +
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
          '" alt="' +
          Jana.escapeHtml(promo.title || "") +
          '" width="' +
          (Jana.imageIntrinsicSize ? Jana.imageIntrinsicSize(promo.image, 600, 600).width : 600) +
          '" height="' +
          (Jana.imageIntrinsicSize ? Jana.imageIntrinsicSize(promo.image, 600, 600).height : 600) +
          '" loading="lazy" decoding="async"></span>' +
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
    if (area && !Jana.isAreaActive(area, state.site)) {
      grid.innerHTML =
        '<p class="empty">' +
        Jana.escapeHtml(area.name) +
        ' não está disponível no momento. Veja as outras categorias no menu.</p>';
      renderCategoriesNav();
      return;
    }
    grid.innerHTML = list.length
      ? list.map(productCard).join("")
      : '<p class="empty">Nenhum produto nesta área por enquanto. Combine a encomenda pelo WhatsApp.</p>';
    renderCategoriesNav();
  }

  function instagramGalleryImages() {
    const sobre = state.sobre || {};
    if (Object.prototype.hasOwnProperty.call(sobre, "instagramGallery") && Array.isArray(sobre.instagramGallery)) {
      return sobre.instagramGallery.filter(Boolean);
    }
    return ((state.site && state.site.instagramGallery) || []).filter(Boolean);
  }

  function renderInstagram() {
    const grid = Jana.qs('[data-bind="instagram-grid"]');
    if (!grid) {
      return;
    }
    const section = grid.closest("#instagram") || grid.closest(".instagram");
    const url = Jana.instagramUrl(state.site.contato.instagram);
    const images = instagramGalleryImages();
    if (!images.length) {
      grid.innerHTML = "";
      if (section) {
        section.hidden = true;
      }
      return;
    }
    if (section) {
      section.hidden = false;
    }
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
          '" alt="Foto do Instagram" width="400" height="400" loading="eager" decoding="async"></a>'
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

  function workSlide(item, clone, index) {
    const alt = clone ? "" : Jana.escapeHtml(item.alt || "");
    const img =
      '<img src="' +
      Jana.escapeHtml(Jana.assetUrl(item.src)) +
      '" alt="' +
      alt +
      '" width="600" height="600" loading="' +
      (clone ? "lazy" : "eager") +
      '" decoding="async">';
    const externo = !item.productSlug && /^https:\/\/[^\s"'<>]+$/i.test(String(item.url || ""));
    const inner = item.productSlug || externo
      ? '<a href="' +
        Jana.escapeHtml(externo ? item.url : Jana.productUrl(item.productSlug)) +
        '"' +
        (externo ? ' target="_blank" rel="noopener noreferrer"' : "") +
        (clone ? ' tabindex="-1"' : "") +
        ">" +
        img +
        "</a>"
      : img;
    return '<li class="sobre__work-item"' + (clone ? ' aria-hidden="true"' : "") + ">" + inner + "</li>";
  }

  function workGalleryHtml(gallery) {
    if (!gallery.length) {
      return "";
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = !reduce && gallery.length >= 2;
    const slides = gallery
      .map(function tile(item, index) {
        return workSlide(item, false, index);
      })
      .join("");
    const clones = loop
      ? gallery
          .map(function tile(item) {
            return workSlide(item, true, 99);
          })
          .join("")
      : "";
    return (
      '<div class="sobre__work-viewport" aria-label="Galeria de trabalhos">' +
      '<ul class="sobre__work-track' +
      (loop ? " is-animated" : "") +
      '">' +
      slides +
      clones +
      "</ul></div>"
    );
  }

  function renderSobreIntro(sobre) {
    const node = Jana.qs('[data-bind="sobre-intro"]');
    if (!node) {
      return;
    }
    const text = String((sobre && sobre.introText) || "").trim();
    const photos = ((sobre && sobre.introPhotos) || []).filter(function keep(item) {
      return item && item.src;
    });
    if (!text && !photos.length) {
      setOptionalHtml(node, "");
      return;
    }
    const paragraphs = text
      ? text.split(/\n\n+/).map(function p(block) {
          return "<p>" + Jana.escapeHtml(block.trim()).replace(/\n/g, "<br>") + "</p>";
        }).join("")
      : "";
    const textHtml = paragraphs ? '<div class="sobre__intro-text">' + paragraphs + "</div>" : "";
    const grid = photos.length
      ? '<ul class="sobre__intro-grid">' +
        photos
          .map(function tile(item) {
            return (
              "<li><img src=\"" +
              Jana.escapeHtml(Jana.assetUrl(item.src)) +
              '" alt="' +
              Jana.escapeHtml(item.alt || "") +
              '" width="800" height="800" loading="lazy" decoding="async"></li>'
            );
          })
          .join("") +
        "</ul>"
      : "";
    const cls =
      "sobre__intro-inner" +
      (text ? " sobre__intro-inner--texto" : "") +
      (photos.length ? " sobre__intro-inner--fotos" : "");
    setOptionalHtml(node, '<div class="' + cls + '">' + textHtml + grid + "</div>");
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
      return entry && (entry.title || entry.outlet || entry.image || entry.src || entry.url);
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
    renderSobreIntro(sobre);
    setOptionalHtml(Jana.qs('[data-bind="sobre-work"]'), workGalleryHtml(gallery));
    setOptionalHtml(
      Jana.qs('[data-bind="sobre-press"]'),
      press.length ? press.map(pressCardHtml).join("") : ""
    );
  }

  function pressCardHtml(entry) {
    const title = Jana.escapeHtml(entry.title || entry.outlet || "Na imprensa");
    const outlet = entry.outlet ? '<p class="sobre__press-outlet">' + Jana.escapeHtml(entry.outlet) + "</p>" : "";
    const image = entry.image || entry.src || "";
    const fallbackAlt = entry.title
      ? "Miniatura da matéria " + String(entry.title)
      : "Miniatura da matéria na imprensa";
    const img = image
      ? '<img class="sobre__press-thumb" src="' +
        Jana.escapeHtml(Jana.assetUrl(image)) +
        '" alt="' +
        Jana.escapeHtml(entry.alt || fallbackAlt) +
        '" width="800" height="450" loading="lazy" decoding="async">'
      : "";
    const cta = entry.url ? '<span class="sobre__press-cta">Ler entrevista</span>' : "";
    const body = '<div class="sobre__press-body">' + outlet + '<p class="sobre__press-title">' + title + "</p>" + cta + "</div>";
    if (entry.url) {
      return (
        '<a class="sobre__press-card" href="' +
        Jana.escapeHtml(entry.url) +
        '" target="_blank" rel="noopener noreferrer">' +
        img +
        body +
        "</a>"
      );
    }
    return '<article class="sobre__press-card sobre__press-card--static">' + img + body + "</article>";
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
    const brand = (state.site && state.site.brandName) || "Jana Abreu Confeitaria";
    document.title = product.name + " · " + brand;
    if (Jana.setSeoTags) {
      const desc = String(product.description || "").trim() || (product.name + " · " + brand);
      const image = product.images && product.images[0] ? Jana.publicUrl(product.images[0]) : Jana.DEFAULT_OG_IMAGE;
      Jana.setSeoTags({
        title: product.name + " · " + brand,
        description: desc,
        url: Jana.publicUrl(productCanonicalPath(product.slug)),
        image: image,
      });
    }
    if (Jana.upsertJsonLd && Jana.productJsonLd) {
      Jana.upsertJsonLd("jsonld-product", Jana.productJsonLd(product, brand, Jana.publicUrl(productCanonicalPath(product.slug))));
    }
    applyProductMinQty(product);
    renderFlavorPicker(product);
    updateModalImage();
    const img = Jana.qs('[data-bind="product-image"]');
    if (img) {
      img.src = Jana.assetUrl(product.images[0]);
      img.alt = Jana.productImageAlt(product, 0);
    }
    if (Jana.Analytics && typeof Jana.Analytics.viewItem === "function") {
      Jana.Analytics.viewItem(product);
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
      image.alt = Jana.productImageAlt(product, state.galleryIndex);
    }
    const pageImage = Jana.qs('[data-bind="product-image"]');
    if (pageImage) {
      pageImage.src = Jana.assetUrl(product.images[state.galleryIndex]);
      pageImage.alt = Jana.productImageAlt(product, state.galleryIndex);
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
          '" alt="' +
          Jana.escapeHtml(Jana.productImageAlt(product, index)) +
          '" width="128" height="128" loading="lazy" decoding="async"></button>'
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

  function applyProductMinQty(product) {
    const min = Jana.productMinQty ? Jana.productMinQty(product) : 1;
    const inputs = Jana.qsa("#product-qty, #modal-qty");
    inputs.forEach(function setInput(input) {
      input.setAttribute("min", String(min));
      if (min >= 2) {
        input.setAttribute("aria-describedby", "product-min-qty");
      } else {
        input.removeAttribute("aria-describedby");
      }
      const current = Math.floor(Number(input.value) || 0);
      if (current < min) {
        input.value = String(min);
      }
    });
    Jana.qsa("[data-bind='product-min-qty']").forEach(function setNote(note) {
      if (min >= 2) {
        note.hidden = false;
        note.textContent = "Pedido mínimo: " + min + " unidades";
      } else {
        note.hidden = true;
        note.textContent = "";
      }
    });
  }

  function clampProductQtyInput(input) {
    if (!input || (input.id !== "product-qty" && input.id !== "modal-qty")) {
      return;
    }
    const product = state.currentProduct;
    const min = Jana.productMinQty ? Jana.productMinQty(product) : 1;
    const raw = String(input.value || "").trim();
    if (raw === "") {
      return;
    }
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < min) {
      input.value = String(min);
    } else if (n > (Jana.MIN_QTY_LIMIT || 1000)) {
      input.value = String(Jana.MIN_QTY_LIMIT || 1000);
    } else if (String(n) !== raw) {
      input.value = String(n);
    }
  }

  function productForCartItem(item) {
    if (!item) {
      return null;
    }
    if (Jana.productBySlug) {
      const bySlug = Jana.productBySlug(state.products, item.slug);
      if (bySlug) {
        return bySlug;
      }
    }
    return (state.products || []).find(function find(p) {
      return p.id === item.id || p.slug === item.slug;
    }) || null;
  }

  function cartMinQtyIssues() {
    return Jana.Cart.items()
      .map(function issue(item) {
        const product = productForCartItem(item);
        const min = Jana.productMinQty ? Jana.productMinQty(product) : 1;
        if (min >= 2 && item.quantity < min) {
          return { item: item, product: product, min: min };
        }
        return null;
      })
      .filter(Boolean);
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
    syncDesiredDate();
  }

  function syncDesiredDate() {
    const input = Jana.qs('#checkout-form [name="data"]');
    if (!input || !Jana.firstAvailableDesiredDate) {
      return;
    }
    const min = Jana.firstAvailableDesiredDate(state.pausa);
    input.setAttribute("min", min);
    input.removeAttribute("required");
    if (input.value && Jana.validateDesiredDate && !Jana.validateDesiredDate(input.value, state.pausa).ok) {
      input.value = "";
    }
    let hint = Jana.qs('[data-bind="checkout-date-min"]');
    if (!hint && input.parentNode) {
      hint = document.createElement("span");
      hint.className = "checkout__hint";
      hint.setAttribute("data-bind", "checkout-date-min");
      const existing = input.parentNode.querySelector(".checkout__hint");
      if (existing) {
        input.parentNode.insertBefore(hint, existing);
      } else {
        input.parentNode.appendChild(hint);
      }
    }
    if (hint && Jana.desiredDateHint) {
      hint.textContent = Jana.desiredDateHint(min);
    }
    if (Jana.mountDesiredDateCalendar) {
      Jana.mountDesiredDateCalendar(input, {
        getPausa: function getPausa() {
          return state.pausa;
        },
        onChange: function onChange() {
          applyDesiredDateValidity(input);
        },
      });
    }
    applyDesiredDateValidity(input);
  }

  function applyDesiredDateValidity(input) {
    const field = input || Jana.qs('#checkout-form [name="data"]');
    if (!field || !field.setCustomValidity || !Jana.validateDesiredDate) {
      return { ok: true, empty: true };
    }
    const check = Jana.validateDesiredDate(field.value, state.pausa);
    field.setCustomValidity(check.ok ? "" : check.message);
    return check;
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
    if (state.payMethod === "pix" || state.payMethod === "infinitepay") {
      return state.payMethod;
    }
    const checked = Jana.qs('#checkout-form [name="pagamento"]:checked');
    return (checked && checked.value) || "";
  }

  function setPayRadioChecked(radio, on) {
    if (radio && radio.checked !== !!on) {
      radio.checked = !!on;
    }
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
      setPayRadioChecked(pixRadio, method === "pix");
      if (options.pix) {
        pixRadio.setAttribute("required", "required");
      } else {
        pixRadio.removeAttribute("required");
      }
    }
    if (infRadio) {
      setPayRadioChecked(infRadio, method === "infinitepay");
      if (options.infinitepay && !options.pix) {
        infRadio.setAttribute("required", "required");
      } else if (options.pix) {
        infRadio.setAttribute("required", "required");
      } else {
        infRadio.removeAttribute("required");
      }
    }
    state.pixVisible = method === "pix";
    const submit = Jana.qs('[data-bind="checkout-submit"]') || Jana.qs("#checkout-form button[type='submit']");
    if (submit) {
      const opensWhatsApp = !onSite || method === "pix";
      if (!onSite) {
        submit.textContent = "Enviar solicitação no WhatsApp";
      } else if (method === "pix") {
        submit.textContent = "Já paguei";
      } else if (method === "infinitepay") {
        submit.textContent = "Pagar com cartão";
      } else {
        submit.textContent = "Escolha a forma de pagamento";
      }
      submit.classList.toggle("btn--whatsapp", opensWhatsApp);
      submit.classList.toggle("btn--solid", !opensWhatsApp);
      const blocked = cartMinQtyIssues().length > 0;
      submit.disabled = blocked;
      if (blocked) {
        submit.setAttribute("aria-describedby", "cart-min-qty");
      } else {
        submit.removeAttribute("aria-describedby");
      }
    }
    const site = state.site || {};
    let disclaimer = site.requestDisclaimer || Jana.REQUEST_DISCLAIMER;
    if (method === "pix") {
      disclaimer = Jana.siteText ? Jana.siteText(site, "pixDisclaimer", Jana.PIX_DISCLAIMER) : Jana.PIX_DISCLAIMER;
    } else if (method === "infinitepay") {
      disclaimer = Jana.siteText ? Jana.siteText(site, "paidDisclaimer", Jana.PAID_DISCLAIMER) : Jana.PAID_DISCLAIMER;
    }
    Jana.bindText("request-disclaimer", disclaimer);
    Jana.qsa('[data-bind="request-disclaimer"]').forEach(function hideDisc(node) {
      node.hidden = !disclaimer;
    });
    const payments = Jana.siteText ? Jana.siteText(site, "paymentsNote", "") : String(site.paymentsNote || "").trim();
    Jana.bindText("payments", payments);
    Jana.qsa('[data-bind="payments"]').forEach(function hidePayments(node) {
      node.hidden = !payments;
    });
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
    const wasHidden = block.hidden;
    block.hidden = !show;
    const code = Jana.qs('[data-bind="pix-payload"]');
    if (code) {
      code.value = show ? payload : "";
    }
    Jana.bindText("pix-value", "Valor do Pix: " + Jana.formatBRL(amount));
    if (show && wasHidden && block.scrollIntoView) {
      block.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
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


  function personalizacaoFile(lineId) {
    return state.personalizacao.files[lineId] || null;
  }

  function revokePersonalizacao(lineId) {
    const cur = state.personalizacao.files[lineId];
    if (cur && cur.url) {
      try { URL.revokeObjectURL(cur.url); } catch (err) {}
    }
    delete state.personalizacao.files[lineId];
  }

  function prunePersonalizacao() {
    const ids = {};
    Jana.Cart.items().forEach(function mark(item) {
      ids[Jana.Cart.lineIdOf(item)] = true;
    });
    Object.keys(state.personalizacao.files).forEach(function drop(id) {
      if (!ids[id]) revokePersonalizacao(id);
    });
  }

  function personalizacaoCounts() {
    const files = state.personalizacao.files;
    const keys = Object.keys(files);
    let enviadas = 0;
    let pendentes = 0;
    keys.forEach(function count(id) {
      if (files[id] && files[id].enviada) enviadas += 1;
      else if (files[id]) pendentes += 1;
    });
    return { enviadas: enviadas, pendentes: pendentes, total: keys.length };
  }

  async function ensurePersonalizacao() {
    if (state.personalizacao.checked) return state.personalizacao.ready;
    if (state.personalizacao.checking) return state.personalizacao.checking;
    if (!Jana.Central || !Jana.Central.isEnabled(state.site) || !Jana.Central.personalizacaoInfo) {
      state.personalizacao.checked = true;
      state.personalizacao.ready = false;
      return false;
    }
    const job = Jana.Central.personalizacaoInfo(state.site)
      .then(function done(res) {
        state.personalizacao.checked = true;
        state.personalizacao.ready = !!(res && res.ok && res.data && res.data.ok);
        state.personalizacao.checking = null;
        return state.personalizacao.ready;
      })
      .catch(function fail() {
        state.personalizacao.checked = true;
        state.personalizacao.ready = false;
        state.personalizacao.checking = null;
        return false;
      });
    state.personalizacao.checking = job;
    return job;
  }

  function personalizacaoBlock(item) {
    if (!state.personalizacao.ready) return "";
    const product = Jana.productBySlug ? Jana.productBySlug(state.products, item.slug) : state.products.find(function find(p) { return p.slug === item.slug; });
    if (!Jana.productAceitaImagem || !Jana.productAceitaImagem(product)) return "";
    const lineId = Jana.Cart.lineIdOf(item);
    const file = personalizacaoFile(lineId);
    if (file) {
      return (
        '<div class="cart-row__foto">' +
        '<img src="' + Jana.escapeHtml(file.url) + '" alt="Prévia da imagem para personalizar ' + Jana.escapeHtml(item.name) + '">' +
        '<p class="cart-row__foto-nome">' + Jana.escapeHtml(file.name) + '</p>' +
        '<button type="button" class="btn btn--outline btn--small" data-action="personalizacao-remover" data-id="' +
        Jana.escapeHtml(lineId) +
        '">Remover imagem</button></div>'
      );
    }
    return (
      '<div class="cart-row__foto">' +
      '<label class="cart-row__foto-envia arquivo-escolha">' +
      '<span class="arquivo-escolha__legenda">Enviar imagem para personalizar (opcional, JPG ou PNG)</span>' +
      '<span class="arquivo-escolha__controle">' +
      '<span class="btn btn--outline btn--small arquivo-escolha__botao">Escolher arquivo' +
      '<input type="file" accept="image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png" data-action="personalizacao-arquivo" data-id="' +
      Jana.escapeHtml(lineId) +
      '"></span>' +
      '<span class="arquivo-escolha__status">Nenhum arquivo escolhido</span>' +
      "</span></label></div>"
    );
  }

  async function handlePersonalizacaoArquivo(input) {
    const lineId = input.getAttribute("data-id");
    const file = input.files && input.files[0];
    input.value = "";
    if (!file || !lineId) return;
    setCheckoutStatus("Preparando a imagem…");
    try {
      const res = await Jana.compressPersonalizationImage(file);
      revokePersonalizacao(lineId);
      state.personalizacao.files[lineId] = {
        blob: res.blob,
        url: URL.createObjectURL(res.blob),
        name: res.name,
        mime: res.mime,
        enviada: false,
      };
      setCheckoutStatus("");
    } catch (err) {
      setCheckoutStatus(err && err.message ? err.message : "Não foi possível usar esta imagem.");
    }
    renderCart();
  }

  async function uploadPersonalizacao(nsu, token) {
    const files = state.personalizacao.files;
    const keys = Object.keys(files);
    if (!nsu || !token || !keys.length || !Jana.Central || !Jana.Central.uploadOrderImage) {
      return personalizacaoCounts();
    }
    setCheckoutStatus("Enviando a imagem da personalização…");
    for (let i = 0; i < keys.length; i++) {
      const item = files[keys[i]];
      if (!item || item.enviada) continue;
      const result = await Jana.Central.uploadOrderImage(state.site, nsu, token, item.blob, {
        itemKey: keys[i],
        filename: item.name,
      });
      if (result && result.ok) item.enviada = true;
    }
    return personalizacaoCounts();
  }

  function renderCart() {
    prunePersonalizacao();
    Jana.bindText("cart-count", String(Jana.Cart.count()));
    const items = Jana.Cart.items();
    Jana.qs('[data-bind="cart-items"]').innerHTML = items.length
      ? items
          .map(function row(item) {
            return (
              '<article class="cart-row">' +
              '<img src="' +
              Jana.escapeHtml(Jana.assetUrl(item.image)) +
              '" alt="' +
              Jana.escapeHtml(item.name || "") +
              '" width="72" height="72">' +
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
              "</div>" +
              (function minNote() {
                const product = productForCartItem(item);
                const min = Jana.productMinQty ? Jana.productMinQty(product) : 1;
                if (min < 2) return "";
                if (item.quantity < min) {
                  return (
                    '<p class="cart-row__aviso" role="status">Pedido mínimo: ' +
                    min +
                    " unidades. Abaixo dessa quantidade este produto fica indisponível.</p>"
                  );
                }
                return '<p class="cart-row__min">Pedido mínimo: ' + min + " unidades</p>";
              })() +
              personalizacaoBlock(item) +
              "</article>"
            );
          })
          .join("")
      : '<p class="empty">Sua encomenda está vazia. Escolha um item do catálogo.</p>';
    const minIssues = cartMinQtyIssues();
    const minBox = Jana.qs('[data-bind="cart-min-qty"]');
    if (minBox) {
      if (minIssues.length) {
        minBox.hidden = false;
        minBox.textContent = minIssues
          .map(function line(issue) {
            return (
              "«" +
              issue.item.name +
              "»: pedido mínimo de " +
              issue.min +
              " unidades (há " +
              issue.item.quantity +
              " no pedido)."
            );
          })
          .join(" ");
      } else {
        minBox.hidden = true;
        minBox.textContent = "";
      }
    }
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


  function analyticsItems(items) {
    if (!Jana.Analytics || typeof Jana.Analytics.itemFrom !== "function") {
      return [];
    }
    return (items || Jana.Cart.items()).map(function toItem(item) {
      const product = productForCartItem(item) || item;
      return Jana.Analytics.itemFrom(product, item.quantity);
    });
  }

  function trackFormEncomenda(totals) {
    if (Jana.Analytics && typeof Jana.Analytics.formEncomenda === "function") {
      const value = totals && totals.total != null ? totals.total : Jana.Cart.total();
      Jana.Analytics.formEncomenda(value);
    }
  }

  function trackPurchase(nsu, totals, items) {
    if (Jana.Analytics && typeof Jana.Analytics.purchase === "function") {
      const value = totals && totals.total != null ? totals.total : Jana.Cart.total();
      Jana.Analytics.purchase(nsu, value, items || analyticsItems());
    }
  }

  function openCart() {
    if (blockEncomenda()) {
      return;
    }
    ensurePersonalizacao().then(function maybe(ready) {
      if (ready) renderCart();
    });
    const drawer = Jana.qs("#encomendas");
    const backdrop = Jana.qs(".backdrop");
    if (!drawer || !backdrop) {
      return;
    }
    const alreadyOpen = !drawer.hidden;
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
    syncDesiredDate();
    const panel = Jana.qs(".drawer__panel");
    if (panel) {
      panel.setAttribute("tabindex", "-1");
      window.setTimeout(function focusPanel() {
        panel.focus();
      }, 0);
    }
    if (!alreadyOpen && Jana.Analytics && typeof Jana.Analytics.beginCheckout === "function") {
      Jana.Analytics.beginCheckout(Jana.Cart.total(), analyticsItems());
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
    const perso = Jana.personalizacaoWhatsAppLinha ? Jana.personalizacaoWhatsAppLinha(personalizacaoCounts()) : "";
    if (perso) {
      lines.push("", perso);
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
    const paidText = Jana.siteText
      ? Jana.siteText(state.site, "paidDisclaimer", Jana.PAID_DISCLAIMER)
      : Jana.PAID_DISCLAIMER;
    lines.push(
      "",
      pay ? paidText : state.site.requestDisclaimer || Jana.REQUEST_DISCLAIMER,
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
    const minIssues = cartMinQtyIssues();
    if (minIssues.length) {
      setCheckoutStatus(
        minIssues
          .map(function line(issue) {
            return (
              "«" +
              issue.item.name +
              "»: este produto só está disponível a partir de " +
              issue.min +
              " unidades."
            );
          })
          .join(" ")
      );
      openCart();
      return;
    }
    if (payload.data) {
      const dateCheck = applyDesiredDateValidity();
      if (!dateCheck.ok) {
        setCheckoutStatus(dateCheck.message);
        const dateInput = Jana.qs('#checkout-form [name="data"]');
        if (dateInput && dateInput.focus) {
          dateInput.focus();
        }
        openCart();
        return;
      }
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = true;
    }
    checkoutAsync(payload, submit);
  }

  function describeCentral(result) {
    if (!result || !result.attempted) {
      return "";
    }
    if (result.savedCentral) {
      return "Solicitação registrada na lista da Jana. Isso ainda não confirma a encomenda.";
    }
    return "Não deu para registrar na lista da Jana agora; a solicitação segue pelo WhatsApp.";
  }

  async function checkoutPix(payload, totals, submit) {
    payload.status = "aguardando pagamento";
    payload.paymentStatus = "aguardando conferência";
    payload.paymentMethod = "pix";
    try {
      Jana.Store.saveCheckout(payload);
    } catch (err) {
      /* keep going so the customer can still confirm */
    }
    if (!state.pixPayload) {
      state.pixVisible = true;
      renderPix(totals);
      setCheckoutStatus("Pague com Pix no valor indicado e, quando terminar, toque em Já paguei.");
      if (submit) {
        submit.disabled = false;
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
    if (Jana.Central && Jana.Central.isEnabled(state.site)) {
      setCheckoutStatus("Registrando o pedido…");
      const central = await Jana.Central.createOrder(
        state.site,
        payload,
        "pix",
        { declared: true, total: totals.total },
        { timeoutMs: 4000, keepalive: true }
      );
      if (central && central.ok && central.data && central.data.nsu) {
        order.orderNsu = central.data.nsu;
        trackFormEncomenda(totals);
        trackPurchase(central.data.nsu, totals, analyticsItems(payload.items));
        if (central.data.token) {
          const up = await uploadPersonalizacao(central.data.nsu, central.data.token);
          order.personalizacao = up;
        }
      }
    }
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
    payload.status = "aguardando pagamento";
    payload.paymentStatus = "aguardando pagamento";
    payload.paymentMethod = "infinitepay";
    const redirectUrl = Jana.infinitePayRedirectUrl ? Jana.infinitePayRedirectUrl() : Jana.INFINITEPAY_REDIRECT_URL;
    const centralOn = Jana.Central && Jana.Central.isEnabled(state.site);
    if (!Jana.infinitePayItems(payload.items, totals).length) {
      setCheckoutStatus("Não foi possível abrir o pagamento com cartão. Tente de novo, escolha Pix ou fale no WhatsApp.");
      if (submit) {
        submit.disabled = false;
      }
      syncCheckoutPayUi(totals);
      return;
    }
    setCheckoutStatus("Abrindo o pagamento…");
    let central = null;
    if (centralOn) {
      central = await Jana.Central.createOrder(
        state.site,
        payload,
        "infinitepay",
        { redirect_url: redirectUrl, total: totals.total },
        { timeoutMs: 12000 }
      );
    }
    const centralNsu = central && central.ok && central.data && central.data.nsu;
    const nsu = centralNsu || Jana.generateOrderNsu();
    payload.orderNsu = nsu;
    if (centralNsu) {
      trackFormEncomenda(totals);
    }
    if (centralNsu && central.data.token) {
      await uploadPersonalizacao(centralNsu, central.data.token);
    }
    let localOrder = null;
    try {
      localOrder = Jana.Store.saveCheckout(payload);
    } catch (err) {
      localOrder = null;
    }
    if (Jana.savePendingPay) {
      Jana.savePendingPay({
        orderId: localOrder && localOrder.id,
        orderNsu: nsu,
        centralToken: centralNsu ? central.data.token : "",
        payload: payload,
        totals: totals,
      });
    }
    const workerUrl = centralNsu && central.data.checkoutUrl;
    if (workerUrl && /^https:\/\//i.test(workerUrl)) {
      window.location.assign(workerUrl);
      return;
    }
    const body = {
      handle: Jana.infinitePayHandle(state.pagamento),
      order_nsu: nsu,
      redirect_url: redirectUrl,
      items: Jana.infinitePayItems(payload.items, totals),
    };
    if (centralOn) {
      body.webhook_url = Jana.Central.configFrom(state.site).endpoint + "/webhook/infinitepay";
    }
    const customer = Jana.infinitePayCustomer
      ? Jana.infinitePayCustomer({
          name: payload.nome,
          telefone: payload.telefone,
          email: payload.email,
        })
      : null;
    if (customer) {
      body.customer = customer;
    }
    try {
      const data = await Jana.createInfinitePayLink(body);
      const url = Jana.infinitePayCheckoutUrl(data);
      if (!url || !/^https?:\/\//i.test(url)) {
        throw new Error("Sem URL de checkout");
      }
      window.location.assign(url);
    } catch (err) {
      syncCheckoutPayUi(totals);
      if (Jana.canPayWithPix && Jana.canPayWithPix(checkoutPayOpts(totals))) {
        setCheckoutStatus("Não foi possível abrir o pagamento com cartão. Tente de novo, escolha Pix ou fale no WhatsApp.");
      } else {
        setCheckoutStatus("Não foi possível abrir o pagamento. Tente de novo ou fale no WhatsApp.");
      }
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
        await checkoutPix(payload, totals, submit);
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
      setCheckoutStatus("Registrando a solicitação…");
      centralResult = await Jana.Central.createOrder(state.site, payload, "whatsapp", { total: Jana.Cart.total() }, {
        timeoutMs: 4000,
        keepalive: true,
      });
      centralResult.attempted = true;
      if (centralResult.ok && centralResult.data && centralResult.data.nsu) {
        payload.orderNsu = centralResult.data.nsu;
        trackFormEncomenda(totals);
        if (centralResult.data.token) {
          await uploadPersonalizacao(centralResult.data.nsu, centralResult.data.token);
        }
      }
    }
    const parts = [
      state.site.requestDisclaimer || Jana.REQUEST_DISCLAIMER,
      localOrder
        ? "Cópia local #" + localOrder.number + " neste navegador (legado, não é confirmação)."
        : "Não deu para salvar neste navegador.",
      describeCentral(centralResult),
      "Abrir o WhatsApp também não confirma a encomenda.",
    ].filter(Boolean);
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
      if (action === "areas-prev" || action === "areas-next") {
        event.preventDefault();
        scrollHomeAreas(action === "areas-next" ? 1 : -1);
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
      if (action === "personalizacao-remover") {
        event.preventDefault();
        revokePersonalizacao(target.getAttribute("data-id"));
        renderCart();
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
      function rememberPayMethod(event) {
        const target = event.target;
        const radio = (target && target.name === "pagamento" && target)
          || (target && target.closest && target.closest('[data-bind="pay-option-pix"], [data-bind="pay-option-infinitepay"]')
            && target.closest('[data-bind="pay-option-pix"], [data-bind="pay-option-infinitepay"]').querySelector('input[name="pagamento"]'));
        if (!radio || !radio.value) {
          return false;
        }
        state.payMethod = radio.value;
        return true;
      }
      checkoutForm.addEventListener("pointerdown", function onPayPointerDown(event) {
        rememberPayMethod(event);
      });
      checkoutForm.addEventListener("change", function onCheckoutChange(event) {
        const name = event.target && event.target.name;
        if (name === "modalidade" || name === "regiao") {
          syncCheckoutMode();
        }
        if (name === "data") {
          applyDesiredDateValidity(event.target);
        }
        if (name === "pagamento") {
          rememberPayMethod(event);
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
    document.addEventListener("input", function onQtyInput(event) {
      clampProductQtyInput(event.target);
    });
    document.addEventListener("change", function onChange(event) {
      clampProductQtyInput(event.target);
      const fileInput = event.target.closest("[data-action='personalizacao-arquivo']");
      if (fileInput) {
        handlePersonalizacaoArquivo(fileInput);
        return;
      }
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
