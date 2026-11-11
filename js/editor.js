/**
 * Editor do site — Jana Abreu Confeitaria.
 * Lê o conteúdo pelo Worker (que lê o GitHub), deixa a Jana editar e salva cada alteração
 * como um commit no branch publicado pelo GitHub Pages. Nenhum segredo aqui: só o token de
 * sessão do painel (o mesmo dos pedidos). Sem a chave do GitHub configurada no Worker,
 * o editor abre para consulta e avisa «falta configurar».
 */
(function startEditor(global) {
  function hasFixedPrice(p) {
    if (Jana.productHasFixedPrice) return Jana.productHasFixedPrice(p);
    return !!p && typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0;
  }
  const Jana = global.Jana;
  const F = {
    products: "data/products.json",
    areas: "data/areas.json",
    categories: "data/categories.json",
    carousel: "data/carousel.json",
    site: "data/site.json",
    pausa: "data/pausa.json",
    sobre: "data/sobre.json",
    sabores: "data/sabores-bolos.json",
  };
  const EDITOR_TABS = ["produtos", "carrossel", "datas", "textos", "historico"];
  const STAGED_TABS = ["carrossel", "datas", "textos"];
  const RAW_BASE = "https://raw.githubusercontent.com/AlexandreRangel/site-Confeitaria/preview/";
  const BANNER_SIZES = {
    home: { pc: [2400, 700], cel: [1200, 800] },
    area: { pc: [2400, 800], cel: [1200, 860] },
  };
  const IMG = {
    produto: { maxW: 1400, maxH: 1400, alvo: 360 * 1024 },
    bannerPc: { maxW: 2400, maxH: 1200, alvo: 480 * 1024 },
    bannerCel: { maxW: 1200, maxH: 1200, alvo: 320 * 1024 },
    area: { maxW: 840, maxH: 840, alvo: 200 * 1024 },
    sobre: { maxW: 1200, maxH: 1400, alvo: 320 * 1024 },
  };

  const ED = {
    site: null, // site.json estático (endereço do Worker)
    logado: false,
    carregado: false,
    carregando: false,
    configurado: false,
    somenteLeitura: true,
    saved: {},
    shas: {},
    drafts: {},
    pending: new Map(), // caminho → { blob, url }
    tab: "pedidos",
    busy: false,
    pollTimer: null,
    produto: null, // edição aberta
    banner: null,
    carrosselPagina: "home",
    filtro: "todos",
    busca: "",
    historico: [],
  };

  /* ---------- utilidades ---------- */

  const esc = (v) => Jana.escapeHtml(v == null ? "" : v);
  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

  function semAcento(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function slugify(text) {
    return (
      semAcento(text)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "") || "produto"
    );
  }

  function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function parsePreco(text) {
    const raw = String(text || "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
    if (!raw) return null;
    let norm = raw;
    if (norm.indexOf(",") !== -1) norm = norm.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(norm)) return NaN;
    return Math.round(Number(norm) * 100) / 100;
  }

  function precoTexto(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "";
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function dataBR(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
  }

  function hoje() {
    return Jana.todayYmd();
  }

  function imgSrc(path) {
    if (!path) return "";
    const pend = ED.pending.get(path);
    if (pend) return pend.url;
    if (/^https?:/i.test(path)) return path;
    return "../" + String(path).replace(/^\.?\//, "");
  }

  function imgTag(path, alt, cls) {
    if (!path) return '<span class="ed-semfoto ' + (cls || "") + '" aria-hidden="true">sem foto</span>';
    return (
      '<img class="' + (cls || "") + '" src="' + esc(imgSrc(path)) + '" data-raw="' + esc(/^https?:/.test(path) ? "" : path) +
      '" alt="' + esc(alt || "") + '" loading="lazy" decoding="async">'
    );
  }

  // foto recém-enviada que o Pages ainda não publicou: tenta a cópia do GitHub
  document.addEventListener(
    "error",
    function onImgError(event) {
      const img = event.target;
      if (!img || img.tagName !== "IMG" || !img.dataset || !img.dataset.raw || img.dataset.tentou) return;
      img.dataset.tentou = "1";
      img.src = RAW_BASE + img.dataset.raw;
    },
    true
  );

  function getPath(obj, path) {
    return path.split(".").reduce(function walk(acc, key) {
      return acc == null ? undefined : acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let node = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] == null || typeof node[keys[i]] !== "object") node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
  }

  function areas() {
    return (ED.saved[F.areas] || []).slice().sort(byOrder);
  }

  function products() {
    return ED.saved[F.products] || [];
  }

  function areaById(id) {
    return areas().find((a) => a.id === id) || null;
  }

  function productCats(product) {
    return Jana.productCategoryIds(product) || [];
  }

  function productAreas(product) {
    const cats = productCats(product);
    return areas().filter((a) => (a.sourceCategoryIds || []).some((id) => cats.indexOf(id) !== -1));
  }

  /* Marca/desmarca categorias principais mantendo os códigos antigos (subcategorias). */
  function applyAreas(product, checkedIds) {
    const all = areas();
    const owned = new Set();
    all.forEach((a) => (a.sourceCategoryIds || []).forEach((id) => owned.add(id)));
    const current = productCats(product);
    const next = current.filter((id) => !owned.has(id));
    all.forEach(function addArea(area) {
      if (checkedIds.indexOf(area.id) === -1) return;
      const src = area.sourceCategoryIds || [];
      const kept = current.filter((id) => src.indexOf(id) !== -1);
      (kept.length ? kept : src.slice(0, 1)).forEach((id) => {
        if (next.indexOf(id) === -1) next.push(id);
      });
    });
    // mantém a ordem original dos códigos que já existiam
    next.sort(function keepOrder(a, b) {
      const ia = current.indexOf(a);
      const ib = current.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return next;
  }

  function categoryName(id) {
    const cat = (ED.saved[F.categories] || []).find((c) => c.id === id);
    if (cat) return cat.name;
    const area = areas().find((a) => (a.sourceCategoryIds || []).indexOf(id) !== -1);
    return area ? area.name : null;
  }

  function seasonalStatusText(area, rule) {
    const test = Object.assign({}, area, { ativacao: rule || area.ativacao });
    const on = Jana.isAreaActive(test, ED.saved[F.site] || {});
    return on ? "aparecendo no site agora" : "escondida agora";
  }

  /* ---------- chamadas ao Worker ---------- */

  function api(method, path, body) {
    return Jana.Central.adminRequest(ED.site, method, path, body);
  }

  async function blobToBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* ---------- fotos: reduz e comprime no navegador ---------- */

  async function decodeImage(file) {
    if (global.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (err) {
        /* tenta pelo <img> */
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function processImage(file, opts) {
    if (!file || !/^image\//.test(file.type || "") ) {
      throw new Error("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
    }
    if (file.size > 30 * 1024 * 1024) throw new Error("A imagem é grande demais (mais de 30 MB).");
    let source;
    try {
      source = await decodeImage(file);
    } catch (err) {
      throw new Error("Não consegui abrir esta imagem. Use JPG, PNG ou WebP.");
    }
    const w0 = source.width || source.naturalWidth;
    const h0 = source.height || source.naturalHeight;
    if (!w0 || !h0) throw new Error("Não consegui ler o tamanho da imagem.");
    const scale = Math.min(1, opts.maxW / w0, opts.maxH / h0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    if (source.close) source.close();
    let type = "image/webp";
    let quality = 0.86;
    let blob = await canvasBlob(canvas, type, quality);
    if (!blob || blob.type !== "image/webp") {
      type = "image/jpeg";
      blob = await canvasBlob(canvas, type, quality);
    }
    while (blob && blob.size > opts.alvo && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, type, quality);
    }
    if (!blob) throw new Error("Não consegui preparar a imagem neste aparelho.");
    if (blob.size > 1500 * 1024) throw new Error("Mesmo reduzida, a imagem ficou pesada demais. Tente outra.");
    return { blob, ext: type === "image/webp" ? "webp" : "jpg", width: w, height: h, origW: w0, origH: h0 };
  }

  function addPending(dir, base, result) {
    const path = dir + "/" + base + "-" + randomId() + "." + result.ext;
    ED.pending.set(path, { blob: result.blob, url: URL.createObjectURL(result.blob), w: result.width, h: result.height });
    return path;
  }

  function proporcaoAviso(result, alvo) {
    if (!alvo) return "";
    const r = result.origW / result.origH;
    const a = alvo[0] / alvo[1];
    const diff = Math.abs(r - a) / a;
    const tam = result.origW + " × " + result.origH + " px";
    if (diff > 0.06) {
      return "Esta imagem tem " + tam + ". O tamanho recomendado é " + alvo[0] + " × " + alvo[1] + " px; com outra proporção, as bordas podem ser cortadas.";
    }
    if (result.origW < alvo[0] * 0.6) {
      return "Esta imagem tem " + tam + " e pode ficar sem nitidez. O ideal é " + alvo[0] + " × " + alvo[1] + " px.";
    }
    return "";
  }

  /* ---------- status e publicação ---------- */

  function setStatus(kind, text, extraHtml) {
    const el = qs('[data-ed="status"]');
    if (!el) return;
    if (!kind) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.setAttribute("data-kind", kind);
    el.innerHTML =
      '<span class="ed-status__icon" aria-hidden="true"></span><span class="ed-status__text">' + esc(text) + "</span>" + (extraHtml || "");
  }

  function setAviso(html) {
    const el = qs('[data-ed="aviso"]');
    if (!el) return;
    el.hidden = !html;
    el.innerHTML = html || "";
  }

  function refreshAviso() {
    if (!ED.logado) {
      setAviso("");
      return;
    }
    if (ED.carregado && !ED.configurado) {
      setAviso(
        "<strong>Falta configurar a publicação.</strong> Você já pode olhar tudo aqui, mas salvar só vai funcionar depois que a chave do GitHub for colocada no Cloudflare (veja docs/EDITOR.md)."
      );
      return;
    }
    if (ED.carregado && ED.somenteLeitura) {
      setAviso("<strong>Editor só para consulta agora.</strong> Não consegui ler a versão mais nova do site. Toque em Recarregar daqui a pouco.");
      return;
    }
    setAviso("");
  }

  function collectImages(files) {
    const text = JSON.stringify(files);
    const out = [];
    ED.pending.forEach(function check(info, path) {
      if (!info.enviado && text.indexOf('"' + path + '"') !== -1) out.push(path);
    });
    return out;
  }

  async function publish(files, resumo) {
    if (ED.busy) return { ok: false };
    if (!ED.configurado || ED.somenteLeitura) {
      setStatus("erro", ED.configurado ? "Não dá para salvar agora: recarregue o editor." : "Falta configurar a publicação (chave do GitHub). Nada foi salvo.");
      return { ok: false };
    }
    const paths = Object.keys(files);
    const imagens = collectImages(files);
    if (imagens.length > 16) {
      setStatus("erro", "São muitas fotos novas de uma vez (" + imagens.length + "). Salve em partes, até 16 fotos por vez.");
      return { ok: false };
    }
    ED.busy = true;
    document.body.classList.add("ed-ocupado");
    setStatus("salvando", "Salvando…");
    try {
      const payload = { arquivos: files, bases: {}, imagens: [], resumo: resumo };
      paths.forEach((p) => (payload.bases[p] = ED.shas[p] || null));
      for (const path of imagens) {
        payload.imagens.push({ path: path, base64: await blobToBase64(ED.pending.get(path).blob) });
      }
      const r = await api("POST", "/admin/conteudo/publicar", payload);
      if (!r.ok) {
        if (r.status === 409) {
          setStatus(
            "erro",
            (r.data && r.data.mensagem) || "Outra alteração foi salva antes desta. Recarregue para ver a versão mais nova.",
            ' <button type="button" class="btn btn--small" data-ed-action="recarregar">Recarregar</button>'
          );
        } else if (r.reason === "denied") {
          setStatus("erro", "Sua sessão acabou. Entre de novo com a senha (no alto da página). Nada foi salvo.");
          ED.logado = false;
          renderLogin();
        } else {
          setStatus("erro", "Não foi possível salvar: " + ((r.data && r.data.error) || "o servidor não respondeu") + ".");
        }
        return { ok: false, result: r };
      }
      paths.forEach(function done(p) {
        ED.saved[p] = clone(files[p]);
        ED.shas[p] = r.data.shas[p];
      });
      imagens.forEach((p) => (ED.pending.get(p).enviado = true));
      watchPublication(r.data.commit);
      return { ok: true, commit: r.data.commit };
    } finally {
      ED.busy = false;
      document.body.classList.remove("ed-ocupado");
      updateSavebar();
    }
  }

  function watchPublication(commit) {
    if (ED.pollTimer) clearTimeout(ED.pollTimer);
    setStatus("publicando", "Salvo ✓ Publicando no site… costuma levar cerca de 1 minuto.");
    let tries = 0;
    const tick = async function tick() {
      tries++;
      const r = await api("GET", "/admin/conteudo/publicacao?commit=" + encodeURIComponent(commit));
      const estado = r.ok ? r.data.estado : "desconhecido";
      if (estado === "no_ar") {
        setStatus("ok", "No ar ✓ O site já mostra a alteração.");
        return;
      }
      if (estado === "erro") {
        setStatus("erro", "Salvo, mas o GitHub não conseguiu publicar. Tente salvar de novo daqui a pouco.");
        return;
      }
      if ((estado === "desconhecido" && tries >= 15) || tries >= 40) {
        setStatus("ok", "Salvo ✓ O site deve mostrar a alteração em 1 ou 2 minutos.");
        return;
      }
      ED.pollTimer = setTimeout(tick, 5000);
    };
    ED.pollTimer = setTimeout(tick, 4000);
  }

  /* ---------- confirmação ---------- */

  function confirmar(opts) {
    const dialog = qs('[data-ed="dialog-confirmar"]');
    return new Promise(function ask(resolve) {
      dialog.innerHTML =
        '<form method="dialog" class="ed-confirmar">' +
        '<h2 id="ed-confirmar-titulo">' + esc(opts.titulo) + "</h2>" +
        '<p>' + esc(opts.texto) + "</p>" +
        (opts.extra ? '<p class="ed-dica">' + esc(opts.extra) + "</p>" : "") +
        '<div class="ed-dialog__acoes">' +
        '<button type="submit" value="nao" class="btn btn--outline">Cancelar</button>' +
        '<button type="submit" value="sim" class="btn ' + (opts.perigo ? "btn--danger" : "btn--solid") + '">' + esc(opts.botao || "Confirmar") + "</button>" +
        "</div></form>";
      const done = function done() {
        dialog.removeEventListener("close", done);
        resolve(dialog.returnValue === "sim");
      };
      dialog.returnValue = "";
      dialog.addEventListener("close", done);
      dialog.showModal();
      const cancel = dialog.querySelector('button[value="nao"]');
      if (cancel) cancel.focus();
    });
  }

  /* ---------- carregar ---------- */

  async function loadStatic() {
    const out = {};
    await Promise.all(
      Object.keys(F).map(async function get(key) {
        try {
          out[F[key]] = await Jana.loadJSON("../" + F[key]);
        } catch (err) {
          out[F[key]] = null;
        }
      })
    );
    return out;
  }

  async function load() {
    if (ED.carregando) return;
    ED.carregando = true;
    renderLoading();
    try {
      const r = await api("GET", "/admin/conteudo");
      if (!r.ok && r.reason === "denied") {
        ED.logado = false;
        renderLogin();
        return;
      }
      let files;
      if (r.ok && r.data.configurado) {
        ED.configurado = true;
        ED.somenteLeitura = false;
        files = {};
        ED.shas = {};
        Object.keys(r.data.arquivos || {}).forEach(function put(p) {
          files[p] = r.data.arquivos[p].data;
          ED.shas[p] = r.data.arquivos[p].sha;
        });
      } else {
        ED.configurado = !r.ok; // sem resposta: não sabemos; com resposta, falta a chave do GitHub
        ED.somenteLeitura = true;
        files = await loadStatic();
        if (!r.ok) {
          setStatus("erro", "Não consegui falar com o servidor (" + ((r.data && r.data.error) || "sem resposta") + "). Mostrando a versão publicada, só para consulta.");
        }
      }
      ED.saved = files;
      ED.carregado = true;
      resetDrafts();
      refreshAviso();
      renderAll();
    } finally {
      ED.carregando = false;
    }
  }

  function resetDrafts(only) {
    const tabs = only ? [only] : STAGED_TABS;
    tabs.forEach(function reset(tab) {
      ED.drafts[tab] = DRAFTS[tab].from();
    });
  }

  /* Rascunho de cada aba e os arquivos que ela gera ao salvar. */
  const DRAFTS = {
    carrossel: {
      from: () => ({ carousel: clone(ED.saved[F.carousel] || []) }),
      files: function files(d) {
        const list = d.carousel.map((s) => Object.assign({}, s));
        const counters = {};
        list
          .slice()
          .sort(byOrder)
          .forEach(function renumber(s) {
            const page = s.pagina || "home";
            counters[page] = (counters[page] || 0) + 1;
            s.order = counters[page];
          });
        return changed({ [F.carousel]: list });
      },
      resumo: () => "carrossel atualizado",
    },
    datas: {
      from: function from() {
        const ativ = {};
        areas()
          .filter((a) => Jana.isSeasonalArea(a))
          .forEach((a) => (ativ[a.id] = clone(a.ativacao || { modo: "desligado", inicio: "", fim: "" })));
        return { pausa: clone(ED.saved[F.pausa] || {}), sazonais: ativ };
      },
      files: function files(d) {
        const list = clone(ED.saved[F.areas] || []).map(function apply(a) {
          if (d.sazonais[a.id]) a.ativacao = clone(d.sazonais[a.id]);
          return a;
        });
        return changed({ [F.pausa]: d.pausa, [F.areas]: list });
      },
      resumo: function resumo(d) {
        const out = [];
        if (!same(d.pausa, ED.saved[F.pausa])) out.push("pausa nas encomendas");
        Object.keys(d.sazonais).forEach(function each(id) {
          const area = areaById(id);
          if (area && !same(d.sazonais[id], area.ativacao || { modo: "desligado", inicio: "", fim: "" })) out.push(area.name);
        });
        return "datas: " + (out.join(", ") || "ajustes");
      },
    },
    textos: {
      from: () => ({
        site: clone(ED.saved[F.site] || {}),
        areas: areas().map((a) => ({ id: a.id, name: a.name, description: a.description || "", image: a.image, order: a.order })),
        sabores: clone(ED.saved[F.sabores] || { label: "Recheio do bolo", flavors: [] }),
        sobre: clone(ED.saved[F.sobre] || {}),
      }),
      files: function files(d) {
        const list = clone(ED.saved[F.areas] || []).map(function apply(a) {
          const t = d.areas.find((x) => x.id === a.id);
          if (!t) return a;
          a.name = t.name;
          a.image = t.image;
          a.order = t.order;
          if (t.description) a.description = t.description;
          else delete a.description;
          return a;
        });
        return changed({ [F.site]: d.site, [F.areas]: list, [F.sabores]: d.sabores, [F.sobre]: d.sobre });
      },
      resumo: () => "textos do site",
    },
  };

  function changed(files) {
    const out = {};
    Object.keys(files).forEach(function cmp(p) {
      if (!same(files[p], ED.saved[p])) out[p] = files[p];
    });
    return out;
  }

  function tabDirty(tab) {
    if (STAGED_TABS.indexOf(tab) === -1 || !ED.drafts[tab]) return false;
    return Object.keys(DRAFTS[tab].files(ED.drafts[tab])).length > 0;
  }

  function anyDirty() {
    return STAGED_TABS.some(tabDirty) || !!(ED.produto && produtoMudou()) || !!(ED.banner && ED.banner.mudou);
  }

  function updateSavebar() {
    const bar = qs('[data-ed="savebar"]');
    if (!bar) return;
    const show = ED.carregado && STAGED_TABS.indexOf(ED.tab) !== -1 && tabDirty(ED.tab);
    bar.hidden = !show;
    document.body.classList.toggle("ed-com-barra", show);
    const btn = qs('[data-ed-action="salvar-aba"]', bar);
    if (btn) {
      btn.disabled = ED.busy || ED.somenteLeitura;
      btn.title = ED.somenteLeitura ? "Falta configurar a publicação" : "";
    }
    const text = qs('[data-ed="savebar-texto"]', bar);
    if (text) text.textContent = ED.somenteLeitura ? "Alterações não publicadas — falta configurar a publicação." : "Você tem alterações ainda não publicadas.";
    STAGED_TABS.forEach(function mark(tab) {
      const b = qs('.painel-tabs [data-tab="' + tab + '"]');
      if (b) b.classList.toggle("ed-tab-pendente", tabDirty(tab));
    });
  }

  async function salvarAba() {
    const tab = ED.tab;
    const d = ED.drafts[tab];
    if (!d) return;
    const err = validarAba(tab);
    if (err) {
      setStatus("erro", err);
      return;
    }
    const files = DRAFTS[tab].files(d);
    if (!Object.keys(files).length) return;
    const r = await publish(files, DRAFTS[tab].resumo(d));
    if (r.ok) {
      resetDrafts(tab);
      renderTab(tab);
    }
  }

  async function descartarAba() {
    const ok = await confirmar({
      titulo: "Descartar alterações?",
      texto: "As mudanças desta aba que ainda não foram publicadas serão perdidas.",
      botao: "Descartar",
      perigo: true,
    });
    if (!ok) return;
    resetDrafts(ED.tab);
    renderTab(ED.tab);
    updateSavebar();
  }

  /* ---------- telas gerais ---------- */

  function panels() {
    return EDITOR_TABS.map((t) => qs('[data-ed="' + (t === "produtos" ? "lista-produtos" : t) + '"]'));
  }

  function renderLogin() {
    const dica = qs('[data-ed="login-dica"]');
    if (dica) dica.hidden = ED.logado;
    if (ED.logado) return;
    ED.carregado = false;
    setAviso("");
    const msg = '<p class="ed-vazio">Entre com a senha da loja (no alto desta página) para editar o site.</p>';
    ["carrossel", "datas", "textos", "historico"].forEach((t) => {
      const el = qs('[data-ed="' + t + '"]');
      if (el) el.innerHTML = msg;
    });
    const lista = qs('[data-ed="lista-produtos"]');
    if (lista) lista.innerHTML = '<li class="ed-vazio">Entre com a senha da loja (no alto desta página) para editar os produtos.</li>';
    const cont = qs('[data-ed="contagem"]');
    if (cont) cont.textContent = "";
    updateSavebar();
  }

  function renderLoading() {
    ["carrossel", "datas", "textos"].forEach((t) => {
      const el = qs('[data-ed="' + t + '"]');
      if (el) el.innerHTML = '<p class="ed-vazio">Carregando…</p>';
    });
    const lista = qs('[data-ed="lista-produtos"]');
    if (lista) lista.innerHTML = '<li class="ed-vazio">Carregando…</li>';
  }

  function renderAll() {
    renderFiltro();
    renderProdutos();
    renderCarrossel();
    renderDatas();
    renderTextos();
    if (ED.tab === "historico") loadHistorico();
    updateSavebar();
  }

  function renderTab(tab) {
    if (tab === "produtos") renderProdutos();
    if (tab === "carrossel") renderCarrossel();
    if (tab === "datas") renderDatas();
    if (tab === "textos") renderTextos();
    if (tab === "historico") loadHistorico();
    updateSavebar();
  }

  /* ---------- Produtos ---------- */

  function renderFiltro() {
    const sel = qs('[data-ed="filtro"]');
    if (!sel) return;
    const opts = [["todos", "Todos os produtos"]]
      .concat(areas().map((a) => [a.id, a.name]))
      .concat([["sem", "Sem categoria"], ["ocultos", "Ocultos (não aparecem no site)"]]);
    sel.innerHTML = opts
      .map((o) => '<option value="' + esc(o[0]) + '"' + (ED.filtro === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>")
      .join("");
  }

  function filteredProducts() {
    const term = semAcento(ED.busca).trim();
    return products().filter(function match(p) {
      if (term && semAcento(p.name + " " + (p.tags || []).join(" ")).indexOf(term) === -1) return false;
      if (ED.filtro === "todos") return true;
      if (ED.filtro === "ocultos") return p.active === false;
      const pa = productAreas(p);
      if (ED.filtro === "sem") return pa.length === 0;
      return pa.some((a) => a.id === ED.filtro);
    });
  }

  function renderProdutos() {
    const list = qs('[data-ed="lista-produtos"]');
    if (!list || !ED.carregado) return;
    const items = filteredProducts();
    const cont = qs('[data-ed="contagem"]');
    if (cont) cont.textContent = items.length + (items.length === 1 ? " produto" : " produtos");
    if (!items.length) {
      list.innerHTML = '<li class="ed-vazio">Nenhum produto encontrado.</li>';
      return;
    }
    list.innerHTML = items
      .map(function row(p) {
        const pa = productAreas(p);
        const chips = pa.length
          ? pa.map((a) => '<span class="ed-chip' + (Jana.isSeasonalArea(a) ? " ed-chip--sazonal" : "") + '">' + esc(a.name) + "</span>").join("")
          : '<span class="ed-chip ed-chip--alerta">Sem categoria</span>';
        return (
          '<li><button type="button" class="ed-produto" data-ed-action="editar-produto" data-id="' + esc(p.id) + '">' +
          imgTag(p.images && p.images[0], "", "ed-produto__foto") +
          '<span class="ed-produto__info"><span class="ed-produto__nome">' + esc(p.name) + "</span>" +
          '<span class="ed-produto__preco">' + esc(hasFixedPrice(p) ? Jana.formatBRL(p.price) : "Sob consulta") + "</span>" +
          '<span class="ed-chips">' + chips + (p.active === false ? '<span class="ed-chip ed-chip--oculto">Oculto</span>' : "") + "</span></span>" +
          '<span class="ed-produto__editar" aria-hidden="true">Editar ›</span></button></li>'
        );
      })
      .join("");
  }

  function novoProdutoDraft() {
    return {
      original: null,
      nome: "",
      preco: "",
      sobConsulta: false,
      descricao: "",
      areas: ED.filtro && areaById(ED.filtro) ? [ED.filtro] : [],
      ativo: true,
      tags: "",
      fotos: [],
    };
  }

  function produtoDraft(p) {
    return {
      original: p,
      nome: p.name || "",
      preco: precoTexto(p.price),
      sobConsulta: !(Number(p.price) > 0),
      descricao: p.description || "",
      areas: productAreas(p).map((a) => a.id),
      ativo: p.active !== false,
      tags: (p.tags || []).join(", "),
      fotos: (p.images || []).map((src, i) => ({ path: src, alt: (p.imagesAlt && p.imagesAlt[i]) || "" })),
    };
  }

  function buildProduto(d) {
    const base = d.original ? clone(d.original) : null;
    const all = products();
    let slug = base ? base.slug : slugify(d.nome);
    let id = base ? base.id : "p-" + slug;
    if (!base) {
      let n = 2;
      const root = slug;
      while (all.some((p) => p.slug === slug || p.id === "p-" + slug)) {
        slug = (root.slice(0, 74) + "-" + n++).replace(/-+/g, "-");
      }
      id = "p-" + slug;
    }
    const prodBase = base || { categoryIds: [] };
    const cats = applyAreas(prodBase, d.areas);
    const catsChanged = !base || !same(cats, productCats(base));
    let categoryId = base ? base.categoryId : null;
    let category = base ? base.category : null;
    if (catsChanged) {
      if (!(categoryId && cats.indexOf(categoryId) !== -1)) {
        categoryId = cats[0] || null;
        category = categoryId ? categoryName(categoryId) : null;
      }
    }
    const price = d.sobConsulta ? 0 : parsePreco(d.preco);
    const tags = d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const out = base || { id: id };
    out.id = id;
    out.slug = slug;
    out.name = d.nome.trim();
    out.description = d.descricao.trim();
    out.categoryId = categoryId;
    out.categoryIds = cats;
    out.category = category;
    if (base && !d.sobConsulta && Number(base.price) === price) out.price = base.price;
    else out.price = d.sobConsulta && base && !(Number(base.price) > 0) ? base.price : price;
    out.images = d.fotos.map((f) => f.path);
    const alts = d.fotos.map((f) => f.alt.trim());
    if (alts.some(Boolean)) out.imagesAlt = alts;
    else delete out.imagesAlt;
    if (out.featured === undefined) out.featured = false;
    out.active = !!d.ativo;
    const sameTags = base && same((base.tags || []).map((t) => t.trim()).filter(Boolean), tags);
    out.tags = sameTags ? base.tags : tags;
    if (base && base.description === undefined && !out.description) delete out.description;
    if (base && (base.description || "").trim() === out.description) out.description = base.description;
    // ordem de campos igual à dos produtos existentes
    const order = ["id", "sourceId", "slug", "name", "description", "categoryId", "categoryIds", "category", "price", "images", "imagesAlt", "featured", "active", "tags"];
    const sorted = {};
    order.forEach((k) => {
      if (out[k] !== undefined) sorted[k] = out[k];
    });
    Object.keys(out).forEach((k) => {
      if (!(k in sorted)) sorted[k] = out[k];
    });
    return sorted;
  }

  function produtoMudou() {
    const d = ED.produto;
    if (!d) return false;
    if (!d.original) return !!(d.nome || d.descricao || d.fotos.length || d.preco);
    try {
      return !same(buildProduto(d), d.original);
    } catch (err) {
      return true;
    }
  }

  function validarProduto(d) {
    const erros = [];
    if (!d.nome.trim()) erros.push({ campo: "nome", msg: "Escreva o nome do produto." });
    if (!d.sobConsulta) {
      const p = parsePreco(d.preco);
      if (p === null) erros.push({ campo: "preco", msg: "Escreva o preço (ex.: 168,90) ou marque «Sob consulta»." });
      else if (!Number.isFinite(p) || p <= 0) erros.push({ campo: "preco", msg: "Preço inválido. Use só números, com vírgula para os centavos (ex.: 168,90)." });
      else if (p > 100000) erros.push({ campo: "preco", msg: "Preço alto demais." });
    }
    if (!d.fotos.length) erros.push({ campo: "fotos", msg: "Coloque pelo menos uma foto." });
    if (d.fotos.length > 12) erros.push({ campo: "fotos", msg: "No máximo 12 fotos por produto." });
    return erros;
  }

  function abrirProduto(id) {
    const p = id ? products().find((x) => x.id === id) : null;
    if (id && !p) return;
    ED.produto = p ? produtoDraft(p) : novoProdutoDraft();
    renderProdutoDialog();
    const dialog = qs('[data-ed="dialog-produto"]');
    dialog.showModal();
    const first = qs('[name="nome"]', dialog);
    if (first && !p) first.focus();
  }

  function renderProdutoDialog(erros) {
    const d = ED.produto;
    const dialog = qs('[data-ed="dialog-produto"]');
    const errs = erros || [];
    const errOf = (campo) => errs.find((e) => e.campo === campo);
    const fieldErr = (campo) =>
      errOf(campo) ? '<span class="ed-erro" id="erro-' + campo + '">' + esc(errOf(campo).msg) + "</span>" : "";
    const inv = (campo) => (errOf(campo) ? ' aria-invalid="true" aria-describedby="erro-' + campo + '"' : "");
    const siteCfg = ED.saved[F.site] || {};
    const fotos = d.fotos
      .map(function foto(f, i) {
        return (
          '<li class="ed-foto">' +
          imgTag(f.path, "", "ed-foto__img") +
          (i === 0 ? '<span class="ed-foto__capa">Capa</span>' : "") +
          '<label class="ed-field ed-field--small">Descrição da foto <span class="ed-opcional">(para quem usa leitor de tela)</span>' +
          '<input type="text" maxlength="200" data-foto-alt="' + i + '" value="' + esc(f.alt) + '" placeholder="' + esc(d.nome || "Ex.: bolo de dois andares com flores") + '"></label>' +
          '<div class="ed-foto__acoes">' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="foto-mover" data-i="' + i + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Mover foto ' + (i + 1) + ' para antes">◀</button>' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="foto-mover" data-i="' + i + '" data-dir="1"' + (i === d.fotos.length - 1 ? " disabled" : "") + ' aria-label="Mover foto ' + (i + 1) + ' para depois">▶</button>' +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="foto-remover" data-i="' + i + '" aria-label="Remover foto ' + (i + 1) + '">Remover</button>' +
          "</div></li>"
        );
      })
      .join("");
    const cats = areas()
      .map(function cat(a) {
        const saz = Jana.isSeasonalArea(a);
        return (
          '<label class="ed-check"><input type="checkbox" name="area" value="' + esc(a.id) + '"' + (d.areas.indexOf(a.id) !== -1 ? " checked" : "") + "> " +
          "<span>" + esc(a.name) + (saz ? ' <span class="ed-dica-inline">(data comemorativa — ' + esc(seasonalStatusText(a)) + ")</span>" : "") + "</span></label>"
        );
      })
      .join("");
    const pageUrl = d.original ? "/produto/?slug=" + d.original.slug : d.nome ? "/produto/?slug=" + slugify(d.nome) : "";
    dialog.innerHTML =
      '<form class="ed-form" data-ed="form-produto" novalidate>' +
      '<header class="ed-dialog__topo"><h2 id="ed-produto-titulo">' + (d.original ? "Editar produto" : "Novo produto") + "</h2>" +
      '<button type="button" class="ed-fechar" data-ed-action="fechar-produto" aria-label="Fechar sem salvar">×</button></header>' +
      '<div class="ed-dialog__corpo">' +
      (errs.length ? '<div class="ed-erros" role="alert"><strong>Confira:</strong><ul>' + errs.map((e) => "<li>" + esc(e.msg) + "</li>").join("") + "</ul></div>" : "") +
      '<fieldset class="ed-grupo" id="campo-fotos"><legend>Fotos</legend>' +
      (d.fotos.length ? '<ul class="ed-fotos">' + fotos + "</ul>" : '<p class="ed-dica">Nenhuma foto ainda.</p>') +
      fieldErr("fotos") +
      '<label class="btn btn--outline ed-arquivo">+ Adicionar fotos<input type="file" accept="image/*" multiple data-ed-file="produto"' + inv("fotos") + "></label>" +
      '<p class="ed-dica">A primeira foto é a capa. As fotos são reduzidas e comprimidas aqui mesmo antes de enviar.</p></fieldset>' +
      '<label class="ed-field">Nome <span class="ed-obrigatorio">(obrigatório)</span><input type="text" name="nome" maxlength="160" required value="' + esc(d.nome) + '"' + inv("nome") + ">" + fieldErr("nome") + "</label>" +
      '<div class="ed-linha">' +
      '<label class="ed-field">Preço (R$)<input type="text" name="preco" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + esc(d.preco) + '"' + (d.sobConsulta ? " disabled" : "") + inv("preco") + ">" + fieldErr("preco") + "</label>" +
      '<label class="ed-check ed-check--meio"><input type="checkbox" name="sobConsulta"' + (d.sobConsulta ? " checked" : "") + "> <span>Sob consulta <span class=\"ed-dica-inline\">(sem preço fixo; a cliente combina pelo WhatsApp)</span></span></label>" +
      "</div>" +
      '<label class="ed-field">Descrição<textarea name="descricao" rows="6" maxlength="8000">' + esc(d.descricao) + "</textarea></label>" +
      '<fieldset class="ed-grupo"><legend>Categorias</legend><p class="ed-dica">Pode marcar mais de uma. Natal e Páscoa só aparecem no site quando estão ligadas na aba Datas.</p>' +
      '<div class="ed-checks">' + cats + "</div></fieldset>" +
      '<label class="ed-check"><input type="checkbox" name="ativo"' + (d.ativo ? " checked" : "") + "> <span>Mostrar no site</span></label>" +
      '<details class="ed-mais"><summary>Mais opções</summary>' +
      '<label class="ed-field">Palavras-chave <span class="ed-opcional">(separadas por vírgula; não aparecem no site)</span><input type="text" name="tags" maxlength="400" value="' + esc(d.tags) + '"></label>' +
      (pageUrl ? '<p class="ed-dica">Endereço da página: <code>' + esc(pageUrl) + "</code>" + (d.original ? "" : " (criado a partir do nome)") + "</p>" : "") +
      (d.original && siteCfg ? '<p class="ed-dica"><a href="../produto/?slug=' + esc(encodeURIComponent(d.original.slug)) + '" target="_blank" rel="noopener">Ver a página no site ↗</a></p>' : "") +
      "</details>" +
      "</div>" +
      '<footer class="ed-dialog__acoes">' +
      (d.original ? '<button type="button" class="btn btn--danger ed-acao-esquerda" data-ed-action="excluir-produto">Excluir produto</button>' : "") +
      '<button type="button" class="btn btn--outline" data-ed-action="fechar-produto">Cancelar</button>' +
      '<button type="submit" class="btn btn--solid"' + (ED.somenteLeitura ? ' disabled title="Falta configurar a publicação"' : "") + ">Salvar produto</button>" +
      "</footer></form>";
  }

  function lerProdutoForm() {
    const form = qs('[data-ed="form-produto"]');
    if (!form || !ED.produto) return;
    const d = ED.produto;
    d.nome = form.nome.value;
    d.preco = form.preco.value;
    d.sobConsulta = form.sobConsulta.checked;
    d.descricao = form.descricao.value;
    d.ativo = form.ativo.checked;
    d.tags = form.tags.value;
    d.areas = qsa('input[name="area"]:checked', form).map((i) => i.value);
    qsa("[data-foto-alt]", form).forEach((inp) => {
      const i = Number(inp.getAttribute("data-foto-alt"));
      if (d.fotos[i]) d.fotos[i].alt = inp.value;
    });
  }

  async function adicionarFotosProduto(input) {
    lerProdutoForm();
    const d = ED.produto;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    const pasta = "assets/products/" + (d.original ? d.original.slug : slugify(d.nome || "novo-produto"));
    setStatus("salvando", "Preparando " + files.length + (files.length === 1 ? " foto…" : " fotos…"));
    const avisos = [];
    for (const file of files) {
      if (d.fotos.length >= 12) {
        avisos.push("Limite de 12 fotos por produto.");
        break;
      }
      try {
        const res = await processImage(file, IMG.produto);
        d.fotos.push({ path: addPending(pasta, "foto", res), alt: "" });
      } catch (err) {
        avisos.push(file.name + ": " + err.message);
      }
    }
    setStatus(avisos.length ? "erro" : "", avisos.join(" "));
    renderProdutoDialog();
  }

  async function salvarProduto() {
    lerProdutoForm();
    const d = ED.produto;
    const erros = validarProduto(d);
    if (erros.length) {
      renderProdutoDialog(erros);
      const first = qs('[data-ed="dialog-produto"] [aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    const prod = buildProduto(d);
    if (d.original && same(prod, d.original)) {
      fecharProduto(true);
      setStatus("ok", "Nada mudou neste produto.");
      return;
    }
    if (!prod.categoryIds.length) {
      const ok = await confirmar({
        titulo: "Salvar sem categoria?",
        texto: "Sem nenhuma categoria marcada, o produto não aparece em nenhuma página de categoria do site.",
        botao: "Salvar mesmo assim",
      });
      if (!ok) return;
    }
    const list = products().slice();
    if (d.original) {
      const i = list.findIndex((p) => p.id === d.original.id);
      list[i] = prod;
    } else {
      list.unshift(prod);
    }
    const r = await publish({ [F.products]: list }, "produto «" + prod.name + "» " + (d.original ? "editado" : "criado"));
    if (r.ok) {
      fecharProduto(true);
      renderProdutos();
      const btn = qs('[data-ed-action="editar-produto"][data-id="' + CSS.escape(prod.id) + '"]');
      if (btn) btn.focus();
    }
  }

  async function excluirProduto() {
    lerProdutoForm();
    const p = ED.produto && ED.produto.original;
    if (!p) return;
    const banners = (ED.saved[F.carousel] || []).filter((s) => (s.linkTipo || (s.productSlug ? "produto" : "")) === "produto" && s.productSlug === p.slug).length;
    const ok = await confirmar({
      titulo: "Excluir «" + p.name + "»?",
      texto: "O produto sai do site. Se precisar, dá para desfazer na aba Histórico.",
      extra: banners ? "Atenção: " + banners + " banner(s) do carrossel levam para este produto. Troque o link deles na aba Carrossel." : "",
      botao: "Excluir produto",
      perigo: true,
    });
    if (!ok) return;
    const list = products().filter((x) => x.id !== p.id);
    const r = await publish({ [F.products]: list }, "produto «" + p.name + "» excluído");
    if (r.ok) {
      fecharProduto(true);
      renderProdutos();
    }
  }

  async function fecharProduto(force) {
    if (!force) {
      lerProdutoForm();
      if (produtoMudou()) {
        const ok = await confirmar({ titulo: "Fechar sem salvar?", texto: "As mudanças neste produto serão perdidas.", botao: "Fechar sem salvar", perigo: true });
        if (!ok) return;
      }
    }
    ED.produto = null;
    const dialog = qs('[data-ed="dialog-produto"]');
    if (dialog.open) dialog.close();
  }

  /* ---------- Carrossel ---------- */

  function paginas() {
    return [{ id: "home", name: "Página inicial" }].concat(areas().map((a) => ({ id: a.id, name: a.name })));
  }

  function tamanhos(pagina) {
    return pagina === "home" ? BANNER_SIZES.home : BANNER_SIZES.area;
  }

  function linkResumo(s) {
    const tipo = s.linkTipo || (s.productSlug ? "produto" : "nenhum");
    if (tipo === "produto") {
      const p = products().find((x) => x.slug === s.productSlug);
      return p ? "Abre o produto «" + p.name + "»" : "Abre um produto que não existe mais — troque o link";
    }
    if (tipo === "categoria") {
      const a = areaById(s.linkCategory);
      return "Abre a categoria «" + (a ? a.name : s.linkCategory) + "»";
    }
    if (tipo === "url") return "Abre " + s.url;
    return "Sem link";
  }

  function bannersDaPagina(d, pagina) {
    return d.carousel.filter((s) => (s.pagina || "home") === pagina).sort(byOrder);
  }

  function renderCarrossel() {
    const root = qs('[data-ed="carrossel"]');
    if (!root || !ED.carregado) return;
    const d = ED.drafts.carrossel;
    const pag = ED.carrosselPagina;
    const tam = tamanhos(pag);
    const list = bannersDaPagina(d, pag);
    const savedIds = new Set((ED.saved[F.carousel] || []).map((s) => JSON.stringify(s)));
    const area = areaById(pag);
    root.innerHTML =
      '<fieldset class="ed-grupo"><legend>Qual página?</legend><div class="ed-pilulas">' +
      paginas()
        .map(
          (p) =>
            '<label class="ed-pilula"><input type="radio" name="ed-pagina" value="' + esc(p.id) + '"' + (p.id === pag ? " checked" : "") + "> <span>" + esc(p.name) +
            " (" + bannersDaPagina(d, p.id).length + ")</span></label>"
        )
        .join("") +
      "</div></fieldset>" +
      '<p class="painel-note">Tamanho recomendado: <strong>computador ' + tam.pc[0] + " × " + tam.pc[1] + " px</strong> e <strong>celular " + tam.cel[0] + " × " + tam.cel[1] +
      " px</strong>. Quando todos os banners da página têm o formato novo, eles aparecem inteiros, sem cortes. Sem imagem de celular, o celular mostra a do computador.</p>" +
      (area && !list.length
        ? '<p class="ed-vazio">Sem banners: a página «' + esc(area.name) + "» mostra as fotos dos produtos automaticamente. Se você adicionar banners, eles aparecem no lugar.</p>"
        : "") +
      (pag === "home" && !list.length ? '<p class="ed-vazio">Sem banners: o carrossel some da página inicial.</p>' : "") +
      '<ol class="ed-banners">' +
      list
        .map(function card(s, i) {
          const novo = !savedIds.has(JSON.stringify(s));
          return (
            '<li class="ed-banner">' +
            '<div class="ed-banner__fotos">' +
            '<figure class="ed-banner__pc">' + imgTag(s.image, "", "") + "<figcaption>Computador</figcaption></figure>" +
            '<figure class="ed-banner__cel">' + (s.imageMobile ? imgTag(s.imageMobile, "", "") : '<span class="ed-semfoto">usa a do computador</span>') + "<figcaption>Celular</figcaption></figure>" +
            "</div>" +
            '<div class="ed-banner__info"><p class="ed-banner__titulo">' + (i + 1) + ". " + esc(s.title || "(sem descrição)") + (novo ? ' <span class="ed-chip ed-chip--novo">não publicado</span>' : "") + "</p>" +
            '<p class="ed-dica">' + esc(linkResumo(s)) + (s.formato === "banner" ? "" : " · foto antiga, sem versão de celular") + "</p>" +
            '<div class="ed-banner__acoes">' +
            '<button type="button" class="btn btn--small btn--outline" data-ed-action="banner-mover" data-id="' + esc(s.id) + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Subir banner ' + (i + 1) + '">↑</button>' +
            '<button type="button" class="btn btn--small btn--outline" data-ed-action="banner-mover" data-id="' + esc(s.id) + '" data-dir="1"' + (i === list.length - 1 ? " disabled" : "") + ' aria-label="Descer banner ' + (i + 1) + '">↓</button>' +
            '<button type="button" class="btn btn--small btn--outline" data-ed-action="editar-banner" data-id="' + esc(s.id) + '">Editar</button>' +
            '<button type="button" class="btn btn--small btn--danger" data-ed-action="remover-banner" data-id="' + esc(s.id) + '">Remover</button>' +
            "</div></div></li>"
          );
        })
        .join("") +
      "</ol>";
  }

  function moverBanner(id, dir) {
    const d = ED.drafts.carrossel;
    const s = d.carousel.find((x) => x.id === id);
    const list = bannersDaPagina(d, s.pagina || "home");
    const i = list.indexOf(s);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    list.splice(i, 1);
    list.splice(j, 0, s);
    list.forEach((x, k) => (x.order = k + 1));
    renderCarrossel();
    updateSavebar();
    const btn = qs('[data-ed-action="banner-mover"][data-id="' + CSS.escape(id) + '"][data-dir="' + dir + '"]');
    if (btn && !btn.disabled) btn.focus();
  }

  async function removerBanner(id) {
    const d = ED.drafts.carrossel;
    const s = d.carousel.find((x) => x.id === id);
    const ok = await confirmar({
      titulo: "Remover este banner?",
      texto: "«" + (s.title || "Banner") + "» sai do carrossel quando você tocar em Salvar e publicar.",
      botao: "Remover banner",
      perigo: true,
    });
    if (!ok) return;
    d.carousel = d.carousel.filter((x) => x.id !== id);
    renderCarrossel();
    updateSavebar();
  }

  function abrirBanner(id) {
    const d = ED.drafts.carrossel;
    const s = id ? d.carousel.find((x) => x.id === id) : null;
    ED.banner = {
      original: s,
      pagina: s ? s.pagina || "home" : ED.carrosselPagina,
      image: s ? s.image : "",
      imageMobile: s ? s.imageMobile || "" : "",
      title: s ? s.title || "" : "",
      linkTipo: s ? s.linkTipo || (s.productSlug ? "produto" : "nenhum") : "nenhum",
      productSlug: s ? s.productSlug || "" : "",
      linkCategory: s ? s.linkCategory || "" : "",
      url: s ? s.url || "" : "",
      formato: s ? s.formato || "" : "banner",
      avisoPc: "",
      avisoCel: "",
      mudou: false,
    };
    renderBannerDialog();
    qs('[data-ed="dialog-banner"]').showModal();
  }

  function renderBannerDialog(erros) {
    const b = ED.banner;
    const dialog = qs('[data-ed="dialog-banner"]');
    const tam = tamanhos(b.pagina);
    const errs = erros || [];
    const errOf = (c) => errs.find((e) => e.campo === c);
    const fe = (c) => (errOf(c) ? '<span class="ed-erro" id="erro-b-' + c + '">' + esc(errOf(c).msg) + "</span>" : "");
    const inv = (c) => (errOf(c) ? ' aria-invalid="true" aria-describedby="erro-b-' + c + '"' : "");
    const prods = products()
      .slice()
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
      .map((p) => '<option value="' + esc(p.slug) + '"' + (p.slug === b.productSlug ? " selected" : "") + ">" + esc(p.name) + "</option>")
      .join("");
    const cats = areas()
      .map((a) => '<option value="' + esc(a.id) + '"' + (a.id === b.linkCategory ? " selected" : "") + ">" + esc(a.name) + "</option>")
      .join("");
    const radio = (v, label) =>
      '<label class="ed-check"><input type="radio" name="linkTipo" value="' + v + '"' + (b.linkTipo === v ? " checked" : "") + "> <span>" + label + "</span></label>";
    dialog.innerHTML =
      '<form class="ed-form" data-ed="form-banner" novalidate>' +
      '<header class="ed-dialog__topo"><h2 id="ed-banner-titulo">' + (b.original ? "Editar banner" : "Novo banner") + "</h2>" +
      '<button type="button" class="ed-fechar" data-ed-action="fechar-banner" aria-label="Fechar sem aplicar">×</button></header>' +
      '<div class="ed-dialog__corpo">' +
      (errs.length ? '<div class="ed-erros" role="alert"><strong>Confira:</strong><ul>' + errs.map((e) => "<li>" + esc(e.msg) + "</li>").join("") + "</ul></div>" : "") +
      '<p class="ed-dica">Página: <strong>' + esc((paginas().find((p) => p.id === b.pagina) || {}).name || "") + "</strong></p>" +
      '<fieldset class="ed-grupo"><legend>Imagem para computador <span class="ed-obrigatorio">(obrigatória)</span></legend>' +
      '<p class="ed-dica">' + tam.pc[0] + " × " + tam.pc[1] + " px</p>" +
      '<div class="ed-preview ed-preview--pc" style="aspect-ratio:' + tam.pc[0] + "/" + tam.pc[1] + '">' + (b.image ? imgTag(b.image, "", "") : '<span class="ed-semfoto">sem imagem</span>') + "</div>" +
      (b.avisoPc ? '<p class="ed-alerta">' + esc(b.avisoPc) + "</p>" : "") + fe("image") +
      '<label class="btn btn--outline ed-arquivo">' + (b.image ? "Trocar imagem" : "Escolher imagem") + '<input type="file" accept="image/*" data-ed-file="banner-pc"' + inv("image") + "></label></fieldset>" +
      '<fieldset class="ed-grupo"><legend>Imagem para celular <span class="ed-opcional">(opcional)</span></legend>' +
      '<p class="ed-dica">' + tam.cel[0] + " × " + tam.cel[1] + " px. Sem ela, o celular mostra a imagem do computador.</p>" +
      '<div class="ed-preview ed-preview--cel" style="aspect-ratio:' + tam.cel[0] + "/" + tam.cel[1] + '">' + (b.imageMobile ? imgTag(b.imageMobile, "", "") : '<span class="ed-semfoto">sem imagem</span>') + "</div>" +
      (b.avisoCel ? '<p class="ed-alerta">' + esc(b.avisoCel) + "</p>" : "") +
      '<div class="ed-linha"><label class="btn btn--outline ed-arquivo">' + (b.imageMobile ? "Trocar imagem" : "Escolher imagem") + '<input type="file" accept="image/*" data-ed-file="banner-cel"></label>' +
      (b.imageMobile ? '<button type="button" class="btn btn--outline" data-ed-action="banner-sem-celular">Tirar imagem do celular</button>' : "") + "</div></fieldset>" +
      '<label class="ed-field">Descrição da imagem <span class="ed-obrigatorio">(obrigatória)</span>' +
      '<span class="ed-dica-inline">O que o banner mostra ou diz. É lida por quem usa leitor de tela.</span>' +
      '<input type="text" name="title" maxlength="200" value="' + esc(b.title) + '"' + inv("title") + ">" + fe("title") + "</label>" +
      '<fieldset class="ed-grupo"><legend>Ao tocar no banner, abrir…</legend><div class="ed-checks">' +
      radio("nenhum", "Nada (sem link)") +
      radio("produto", "Um produto") +
      (b.linkTipo === "produto" ? '<label class="ed-field ed-sub">Produto<select name="productSlug"' + inv("productSlug") + '><option value="">Escolha…</option>' + prods + "</select>" + fe("productSlug") + "</label>" : "") +
      radio("categoria", "Uma categoria") +
      (b.linkTipo === "categoria" ? '<label class="ed-field ed-sub">Categoria<select name="linkCategory"' + inv("linkCategory") + '><option value="">Escolha…</option>' + cats + "</select>" + fe("linkCategory") + "</label>" : "") +
      radio("url", "Outro endereço") +
      (b.linkTipo === "url"
        ? '<label class="ed-field ed-sub">Endereço<input type="url" name="url" inputmode="url" placeholder="https://…" value="' + esc(b.url) + '"' + inv("url") + ">" + fe("url") +
          '<span class="ed-dica-inline">Links de fora do site abrem numa nova aba.</span></label>'
        : "") +
      "</div></fieldset>" +
      "</div>" +
      '<footer class="ed-dialog__acoes">' +
      '<button type="button" class="btn btn--outline" data-ed-action="fechar-banner">Cancelar</button>' +
      '<button type="submit" class="btn btn--solid">Pronto</button>' +
      "</footer></form>";
  }

  function lerBannerForm() {
    const form = qs('[data-ed="form-banner"]');
    const b = ED.banner;
    if (!form || !b) return;
    const set = (k, v) => {
      if (b[k] !== v) {
        b[k] = v;
        b.mudou = true;
      }
    };
    set("title", form.title.value);
    const tipo = qs('input[name="linkTipo"]:checked', form);
    set("linkTipo", tipo ? tipo.value : "nenhum");
    if (form.productSlug) set("productSlug", form.productSlug.value);
    if (form.linkCategory) set("linkCategory", form.linkCategory.value);
    if (form.url) set("url", form.url.value.trim());
  }

  async function bannerArquivo(input, qual) {
    lerBannerForm();
    const b = ED.banner;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    const tam = tamanhos(b.pagina);
    setStatus("salvando", "Preparando a imagem…");
    try {
      const res = await processImage(file, qual === "pc" ? IMG.bannerPc : IMG.bannerCel);
      const base = (b.original ? b.original.id : "banner").replace(/^slide-/, "").slice(0, 60);
      const path = addPending("assets/carousel", base + (qual === "pc" ? "-pc" : "-cel"), res);
      if (qual === "pc") {
        b.image = path;
        b.formato = "banner";
        b.avisoPc = proporcaoAviso(res, tam.pc);
      } else {
        b.imageMobile = path;
        b.avisoCel = proporcaoAviso(res, tam.cel);
      }
      b.mudou = true;
      setStatus("", "");
    } catch (err) {
      setStatus("erro", err.message);
    }
    renderBannerDialog();
  }

  function validarBanner(b) {
    const e = [];
    if (!b.image) e.push({ campo: "image", msg: "Escolha a imagem para computador." });
    if (!b.title.trim()) e.push({ campo: "title", msg: "Escreva a descrição da imagem." });
    if (b.linkTipo === "produto" && !b.productSlug) e.push({ campo: "productSlug", msg: "Escolha o produto." });
    if (b.linkTipo === "categoria" && !b.linkCategory) e.push({ campo: "linkCategory", msg: "Escolha a categoria." });
    if (b.linkTipo === "url") {
      if (!/^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/i.test(b.url)) e.push({ campo: "url", msg: "Escreva um endereço completo, começando com https://" });
    }
    return e;
  }

  function aplicarBanner() {
    lerBannerForm();
    const b = ED.banner;
    const erros = validarBanner(b);
    if (erros.length) {
      renderBannerDialog(erros);
      const first = qs('[data-ed="dialog-banner"] [aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    const d = ED.drafts.carrossel;
    const out = b.original ? Object.assign({}, b.original) : { id: "banner-" + randomId() };
    out.title = b.title.trim();
    out.image = b.image;
    if (b.imageMobile) out.imageMobile = b.imageMobile;
    else delete out.imageMobile;
    if (b.pagina !== "home") out.pagina = b.pagina;
    else delete out.pagina;
    const legacyProduto = b.original && !b.original.linkTipo && b.linkTipo === "produto" && b.productSlug === b.original.productSlug;
    if (!legacyProduto) {
      out.linkTipo = b.linkTipo;
      delete out.productSlug;
      delete out.linkCategory;
      delete out.url;
      if (b.linkTipo === "produto") out.productSlug = b.productSlug;
      if (b.linkTipo === "categoria") out.linkCategory = b.linkCategory;
      if (b.linkTipo === "url") out.url = b.url;
    }
    if (b.formato) out.formato = b.formato;
    if (b.original) {
      const i = d.carousel.indexOf(b.original);
      d.carousel[i] = out;
    } else {
      out.order = bannersDaPagina(d, b.pagina).length + 1;
      d.carousel.push(out);
    }
    ED.banner = null;
    qs('[data-ed="dialog-banner"]').close();
    renderCarrossel();
    updateSavebar();
    setStatus("aviso", "Banner pronto. Toque em «Salvar e publicar» para mandar para o site.");
  }

  async function fecharBanner(force) {
    if (!force && ED.banner) {
      lerBannerForm();
      if (ED.banner.mudou) {
        const ok = await confirmar({ titulo: "Fechar sem aplicar?", texto: "As mudanças neste banner serão perdidas.", botao: "Fechar", perigo: true });
        if (!ok) return;
      }
    }
    ED.banner = null;
    const dialog = qs('[data-ed="dialog-banner"]');
    if (dialog.open) dialog.close();
  }

  /* ---------- Datas ---------- */

  function pausaModo(p) {
    if (!p.ativo) return "aberto";
    if (!p.inicio && !p.fim) return "agora";
    if (!p.inicio && p.fim) return "ate";
    return "entre";
  }

  // o modo escolhido fica no rascunho: «Pausar até uma data» ainda sem data não pode virar «Pausar agora»
  function modoDatas(d) {
    return d.modo || pausaModo(d.pausa);
  }

  function pausaAgora(p) {
    return Jana.evaluatePausa ? Jana.evaluatePausa(p) : { active: false, message: "" };
  }

  function pausaPreview(p) {
    const modo = pausaModo(p);
    if (modo === "aberto") return "";
    return Jana.composePausaMensagem ? Jana.composePausaMensagem(p.inicio, p.fim, p.mensagem) : "";
  }

  function renderDatas() {
    const root = qs('[data-ed="datas"]');
    if (!root || !ED.carregado) return;
    const d = ED.drafts.datas;
    const p = d.pausa;
    const modo = modoDatas(d);
    const agora = pausaAgora(p);
    const radio = (v, label) =>
      '<label class="ed-check"><input type="radio" name="pausa-modo" value="' + v + '"' + (modo === v ? " checked" : "") + "> <span>" + label + "</span></label>";
    const aviso = [];
    if (modo === "ate" && p.fim && p.fim < hoje()) aviso.push("Essa data já passou: a pausa não vale mais.");
    if (modo === "entre" && p.inicio && p.inicio > hoje()) aviso.push("A pausa começa em " + dataBR(p.inicio) + ". Até lá, as encomendas continuam abertas.");
    if (modo === "entre" && p.fim && p.fim < hoje()) aviso.push("Essas datas já passaram: a pausa não vale mais.");
    const periodos = (p.periodos || [])
      .map(
        (x, i) =>
          '<li class="ed-periodo"><div class="ed-linha">' +
          '<label class="ed-field">De<input type="date" data-periodo="' + i + '" data-campo="inicio" value="' + esc(x.inicio) + '"></label>' +
          '<label class="ed-field">Até<input type="date" data-periodo="' + i + '" data-campo="fim" value="' + esc(x.fim) + '"></label></div>' +
          '<label class="ed-field">Recado extra <span class="ed-opcional">(opcional)</span><input type="text" maxlength="300" data-periodo="' + i + '" data-campo="mensagem" value="' + esc(x.mensagem || "") + '"></label>' +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="periodo-remover" data-i="' + i + '">Remover esta pausa programada</button></li>'
      )
      .join("");
    const sazonais = areas()
      .filter((a) => Jana.isSeasonalArea(a))
      .map(function card(a) {
        const r = d.sazonais[a.id] || { modo: "desligado", inicio: "", fim: "" };
        const on = Jana.isAreaActive(Object.assign({}, a, { ativacao: r }), ED.saved[F.site] || {});
        const count = products().filter((x) => productAreas(x).some((y) => y.id === a.id)).length;
        const nome = "saz-" + a.id;
        const rr = (v, label) =>
          '<label class="ed-check"><input type="radio" name="' + nome + '" data-sazonal="' + esc(a.id) + '" value="' + v + '"' + (r.modo === v ? " checked" : "") + "> <span>" + label + "</span></label>";
        const futuro = r.modo === "datas" && r.inicio && r.inicio > hoje();
        return (
          '<article class="ed-card ed-sazonal" data-area="' + esc(a.id) + '">' +
          '<header class="ed-card__topo"><h4>' + esc(a.name) + "</h4>" +
          '<span class="ed-estado ' + (on ? "ed-estado--on" : "ed-estado--off") + '">' + (on ? "Aparecendo no site agora" : "Escondida agora") + "</span></header>" +
          '<p class="ed-dica">Quando ligada, aparece uma caixinha «' + esc(a.name) + "» na página inicial e um item no menu Categorias, com a página dos produtos marcados com " + esc(a.name) + ".</p>" +
          '<fieldset class="ed-grupo"><legend class="sr-only">Quando mostrar ' + esc(a.name) + "</legend><div class=\"ed-checks\">" +
          rr("desligado", "Desligada") +
          rr("ligado", "Ligada agora (até eu desligar)") +
          rr("datas", "Ligar só entre duas datas") +
          (r.modo === "datas"
            ? '<div class="ed-linha ed-sub">' +
              '<label class="ed-field">De<input type="date" data-sazonal-data="' + esc(a.id) + '" data-campo="inicio" value="' + esc(r.inicio) + '"></label>' +
              '<label class="ed-field">Até<input type="date" data-sazonal-data="' + esc(a.id) + '" data-campo="fim" value="' + esc(r.fim) + '"></label></div>' +
              (futuro ? '<p class="ed-dica ed-sub">Vai aparecer sozinha em ' + esc(dataBR(r.inicio)) + " e sumir depois de " + esc(dataBR(r.fim)) + ".</p>" : "")
            : "") +
          "</div></fieldset>" +
          '<p class="ed-dica">' + count + (count === 1 ? " produto marcado" : " produtos marcados") + " com " + esc(a.name) + '. <button type="button" class="ed-link" data-ed-action="ver-produtos" data-area="' + esc(a.id) + '">Ver e marcar produtos</button></p>' +
          "</article>"
        );
      })
      .join("");
    root.innerHTML =
      '<section class="ed-secao" aria-labelledby="ed-pausa-titulo">' +
      '<h3 id="ed-pausa-titulo">Pausa nas encomendas</h3>' +
      '<p class="ed-estado ' + (agora.active ? "ed-estado--off" : "ed-estado--on") + '">' + (agora.active ? "Encomendas pausadas agora" : "Encomendas abertas agora") + "</p>" +
      (p.planilhaCsv
        ? '<p class="ed-alerta">Uma planilha Google está ligada e vale no lugar destas opções. <button type="button" class="ed-link" data-ed-action="desligar-planilha">Desligar a planilha</button></p>'
        : "") +
      '<fieldset class="ed-grupo"><legend>Situação</legend><div class="ed-checks">' +
      radio("aberto", "Aceitando encomendas") +
      radio("agora", "Pausar agora, sem data para voltar") +
      radio("ate", "Pausar até uma data") +
      (modo === "ate" ? '<label class="ed-field ed-sub">Até o dia (inclusive)<input type="date" name="pausa-fim" value="' + esc(p.fim) + '"></label>' : "") +
      radio("entre", "Pausar entre duas datas") +
      (modo === "entre"
        ? '<div class="ed-linha ed-sub"><label class="ed-field">De<input type="date" name="pausa-inicio" value="' + esc(p.inicio) + '"></label>' +
          '<label class="ed-field">Até (inclusive)<input type="date" name="pausa-fim" value="' + esc(p.fim) + '"></label></div>'
        : "") +
      "</div></fieldset>" +
      aviso.map((t) => '<p class="ed-alerta">' + esc(t) + "</p>").join("") +
      '<label class="ed-field">Recado extra <span class="ed-opcional">(opcional, vai depois do aviso)</span><input type="text" name="pausa-mensagem" maxlength="300" value="' + esc(p.mensagem || "") + '" placeholder="Ex.: Voltamos em breve!"></label>' +
      '<label class="ed-check"><input type="checkbox" name="pausa-fds"' + (p.fimDeSemana ? " checked" : "") + "> <span>Pausar todo fim de semana (sábado e domingo)</span></label>" +
      (modo !== "aberto" ? '<div class="ed-previa"><span class="ed-previa__rotulo">A cliente vê:</span> «' + esc(pausaPreview(p)) + "»</div>" : "") +
      '<details class="ed-mais"' + ((p.periodos || []).length ? " open" : "") + "><summary>Pausas programadas (férias etc.)</summary>" +
      '<p class="ed-dica">Ficam guardadas e ligam sozinhas no dia de início (horário de Brasília).</p>' +
      '<ul class="ed-periodos">' + periodos + "</ul>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="periodo-novo">+ Programar uma pausa</button></details>' +
      "</section>" +
      '<section class="ed-secao" aria-labelledby="ed-sazonais-titulo"><h3 id="ed-sazonais-titulo">Datas comemorativas</h3>' + sazonais + "</section>";
  }

  function onDatasInput(target) {
    const d = ED.drafts.datas;
    const p = d.pausa;
    let rerender = false;
    if (target.name === "pausa-modo") {
      const v = target.value;
      d.modo = v;
      if (v === "aberto") {
        p.ativo = false;
        p.inicio = "";
        p.fim = "";
      } else if (v === "agora") {
        p.ativo = true;
        p.inicio = "";
        p.fim = "";
      } else if (v === "ate") {
        p.ativo = true;
        p.inicio = "";
      } else {
        p.ativo = true;
        if (!p.inicio) p.inicio = hoje();
      }
      rerender = true;
    } else if (target.name === "pausa-inicio") {
      p.inicio = target.value;
      rerender = target.type === "date";
    } else if (target.name === "pausa-fim") {
      p.fim = target.value;
      rerender = true;
    } else if (target.name === "pausa-mensagem") {
      p.mensagem = target.value;
      const prev = qs(".ed-previa");
      if (prev) prev.innerHTML = '<span class="ed-previa__rotulo">A cliente vê:</span> «' + esc(pausaPreview(p)) + "»";
    } else if (target.name === "pausa-fds") {
      p.fimDeSemana = target.checked;
      rerender = true;
    } else if (target.hasAttribute("data-periodo")) {
      const i = Number(target.getAttribute("data-periodo"));
      p.periodos[i][target.getAttribute("data-campo")] = target.value;
    } else if (target.hasAttribute("data-sazonal")) {
      const id = target.getAttribute("data-sazonal");
      const r = d.sazonais[id];
      r.modo = target.value;
      if (r.modo !== "datas") {
        r.inicio = r.inicio || "";
        r.fim = r.fim || "";
      }
      rerender = true;
    } else if (target.hasAttribute("data-sazonal-data")) {
      d.sazonais[target.getAttribute("data-sazonal-data")][target.getAttribute("data-campo")] = target.value;
      rerender = true;
    }
    if (rerender) rerenderKeepFocus(renderDatas, target);
    updateSavebar();
  }

  function rerenderKeepFocus(fn, target) {
    const key = target && (target.name ? '[name="' + target.name + '"]' + (target.type === "radio" ? '[value="' + target.value + '"]' : "") : null);
    const attrs = ["data-sazonal", "data-sazonal-data", "data-campo", "data-periodo"]
      .filter((a) => target && target.hasAttribute(a))
      .map((a) => "[" + a + '="' + target.getAttribute(a) + '"]')
      .join("");
    fn();
    const sel = attrs ? (target.type === "radio" ? attrs + '[value="' + target.value + '"]' : attrs) : key;
    const el = sel ? qs(sel) : null;
    if (el) el.focus();
  }

  /* ---------- validação das abas com rascunho ---------- */

  function validarAba(tab) {
    if (tab === "datas") {
      const d = ED.drafts.datas;
      const p = d.pausa;
      const modo = modoDatas(d);
      if (modo === "ate" && !p.fim) return "Escolha até que dia as encomendas ficam pausadas.";
      if (modo === "entre" && (!p.inicio || !p.fim)) return "Escolha as duas datas da pausa.";
      if (p.inicio && p.fim && p.inicio > p.fim) return "Na pausa, a data final vem antes da inicial.";
      for (const x of p.periodos || []) {
        if (!x.inicio || !x.fim) return "Preencha as duas datas de cada pausa programada (ou remova a que está vazia).";
        if (x.inicio > x.fim) return "Numa pausa programada, a data final vem antes da inicial.";
      }
      for (const id of Object.keys(d.sazonais)) {
        const r = d.sazonais[id];
        const nome = (areaById(id) || {}).name || id;
        if (r.modo === "datas" && (!r.inicio || !r.fim)) return nome + ": escolha a data de início e a de fim.";
        if (r.modo === "datas" && r.inicio > r.fim) return nome + ": a data de fim vem antes do início.";
      }
    }
    if (tab === "textos") {
      const t = ED.drafts.textos;
      const s = t.site;
      if (!String(s.brandName || "").trim()) return "O nome da loja não pode ficar vazio.";
      if (!/^55\d{10,11}$/.test(String((s.contato || {}).whatsapp || ""))) return "WhatsApp: escreva o número com DDD (ex.: 61 98124-6112).";
      if (!/^[A-Za-z0-9._]{1,60}$/.test(String(((s.contato || {}).instagram || {}).handle || "").replace(/^@/, ""))) return "Instagram: escreva só o nome do perfil, como @janaabreuconfeitaria.";
      if (s.entrega && s.entrega.taxa !== null && !(Number.isFinite(s.entrega.taxa) && s.entrega.taxa >= 0)) return "Taxa de entrega inválida. Use números, ex.: 40 ou 25,50.";
      for (const a of t.areas) if (!String(a.name || "").trim()) return "Toda categoria precisa de nome.";
      for (const f of t.sabores.flavors || []) if (!String(f.nome || "").trim()) return "Todo recheio precisa de nome (ou remova o que está vazio).";
      for (const x of t.sobre.press || []) {
        if (x.url && !/^https:\/\/\S+\.\S+$/.test(x.url)) return "Imprensa: o link precisa começar com https://";
      }
    }
    return "";
  }

  /* ---------- Textos ---------- */

  function formatWhats(digits) {
    const d = String(digits || "").replace(/^55/, "");
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return digits;
  }

  function campo(label, path, value, opts) {
    const o = opts || {};
    const id = "tx-" + path.replace(/[^a-z0-9]+/gi, "-");
    const hint = o.dica ? '<span class="ed-dica-inline" id="' + id + '-dica">' + esc(o.dica) + "</span>" : "";
    const desc = o.dica ? ' aria-describedby="' + id + '-dica"' : "";
    const attrs = ' id="' + id + '" data-tx="' + esc(path) + '"' + (o.tipo ? ' data-tipo="' + o.tipo + '"' : "") + (o.max ? ' maxlength="' + o.max + '"' : "") + desc;
    const input = o.area
      ? "<textarea" + attrs + ' rows="' + (o.rows || 3) + '">' + esc(value == null ? "" : value) + "</textarea>"
      : '<input type="' + (o.type || "text") + '"' + attrs + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : "") + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") +
        ' value="' + esc(value == null ? "" : value) + '"' + (o.disabled ? " disabled" : "") + ">";
    return '<label class="ed-field" for="' + id + '">' + esc(label) + (o.opcional ? ' <span class="ed-opcional">(opcional)</span>' : "") + hint + input + "</label>";
  }

  function listaFotos(kind, items, opts) {
    return (
      '<ul class="ed-galeria">' +
      items
        .map(function item(it, i) {
          return (
            '<li class="ed-galeria__item">' + imgTag(it.src, "", "") +
            (opts.alt
              ? '<label class="ed-field ed-field--small">Descrição da foto<input type="text" maxlength="200" data-tx-lista="' + kind + '" data-i="' + i + '" data-campo="alt" value="' + esc(it.alt || "") + '"></label>'
              : "") +
            (opts.produto
              ? '<label class="ed-field ed-field--small">Ao tocar, abrir o produto<select data-tx-lista="' + kind + '" data-i="' + i + '" data-campo="productSlug"><option value="">Nenhum</option>' +
                products()
                  .slice()
                  .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
                  .map((p) => '<option value="' + esc(p.slug) + '"' + (p.slug === it.productSlug ? " selected" : "") + ">" + esc(p.name) + "</option>")
                  .join("") +
                "</select></label>"
              : "") +
            '<div class="ed-foto__acoes">' +
            '<button type="button" class="btn btn--small btn--outline" data-ed-action="tx-mover" data-lista="' + kind + '" data-i="' + i + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Mover para antes">◀</button>' +
            '<button type="button" class="btn btn--small btn--outline" data-ed-action="tx-mover" data-lista="' + kind + '" data-i="' + i + '" data-dir="1"' + (i === items.length - 1 ? " disabled" : "") + ' aria-label="Mover para depois">▶</button>' +
            '<button type="button" class="btn btn--small btn--danger" data-ed-action="tx-remover" data-lista="' + kind + '" data-i="' + i + '">Remover</button></div></li>'
          );
        })
        .join("") +
      "</ul>" +
      '<label class="btn btn--outline btn--small ed-arquivo">+ Adicionar foto<input type="file" accept="image/*"' + (opts.multiplo ? " multiple" : "") + ' data-ed-file="tx-' + kind + '"></label>'
    );
  }

  function txLista(kind) {
    const t = ED.drafts.textos;
    if (kind === "trabalhos") return (t.sobre.workGallery = t.sobre.workGallery || []);
    if (kind === "instagram") {
      t.site.instagramGallery = t.site.instagramGallery || [];
      return t.site.instagramGallery;
    }
    if (kind === "recheios") return (t.sabores.flavors = t.sabores.flavors || []);
    if (kind === "imprensa") return (t.sobre.press = t.sobre.press || []);
    if (kind === "areas") return t.areas;
    return [];
  }

  function renderTextos() {
    const root = qs('[data-ed="textos"]');
    if (!root || !ED.carregado) return;
    const t = ED.drafts.textos;
    const s = t.site;
    s.contato = s.contato || { instagram: {} };
    s.contato.instagram = s.contato.instagram || {};
    s.address = s.address || {};
    s.entrega = s.entrega || { taxa: null };
    const sobre = t.sobre;
    sobre.portrait = sobre.portrait || { src: "", alt: "Jana Abreu" };
    const taxaNull = s.entrega.taxa === null || s.entrega.taxa === undefined;
    const areasHtml = t.areas
      .slice()
      .sort(byOrder)
      .map(function area(a, i, arr) {
        const real = areaById(a.id) || {};
        return (
          '<li class="ed-card ed-area">' +
          '<div class="ed-area__foto">' + imgTag(a.image, "", "") +
          '<label class="btn btn--small btn--outline ed-arquivo">Trocar foto<input type="file" accept="image/*" data-ed-file="area" data-id="' + esc(a.id) + '"></label></div>' +
          '<div class="ed-area__campos">' +
          '<label class="ed-field">Nome' + (Jana.isSeasonalArea(real) ? ' <span class="ed-dica-inline">(data comemorativa — liga e desliga na aba Datas)</span>' : "") +
          '<input type="text" maxlength="80" data-tx-area="' + esc(a.id) + '" data-campo="name" value="' + esc(a.name) + '"></label>' +
          '<label class="ed-field">Descrição <span class="ed-opcional">(opcional; aparece no topo da página da categoria)</span>' +
          '<textarea rows="2" maxlength="800" data-tx-area="' + esc(a.id) + '" data-campo="description">' + esc(a.description || "") + "</textarea></label>" +
          '<div class="ed-foto__acoes">' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-mover" data-id="' + esc(a.id) + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Mover ' + esc(a.name) + ' para antes">◀ Antes</button>' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-mover" data-id="' + esc(a.id) + '" data-dir="1"' + (i === arr.length - 1 ? " disabled" : "") + ' aria-label="Mover ' + esc(a.name) + ' para depois">Depois ▶</button>' +
          "</div></div></li>"
        );
      })
      .join("");
    const recheios = (t.sabores.flavors || [])
      .map(
        (f, i, arr) =>
          '<li class="ed-recheio"><div class="ed-linha">' +
          '<label class="ed-field">Nome<input type="text" maxlength="80" data-tx-lista="recheios" data-i="' + i + '" data-campo="nome" value="' + esc(f.nome) + '"></label>' +
          '<label class="ed-field">Descrição <span class="ed-opcional">(opcional)</span><input type="text" maxlength="300" data-tx-lista="recheios" data-i="' + i + '" data-campo="descricao" value="' + esc(f.descricao || "") + '"></label></div>' +
          '<div class="ed-foto__acoes">' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="tx-mover" data-lista="recheios" data-i="' + i + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Subir recheio">↑</button>' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="tx-mover" data-lista="recheios" data-i="' + i + '" data-dir="1"' + (i === arr.length - 1 ? " disabled" : "") + ' aria-label="Descer recheio">↓</button>' +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="tx-remover" data-lista="recheios" data-i="' + i + '">Remover</button></div></li>'
      )
      .join("");
    const imprensa = (sobre.press || [])
      .map(
        (x, i) =>
          '<li class="ed-card"><div class="ed-linha">' +
          '<label class="ed-field">Título<input type="text" maxlength="200" data-tx-lista="imprensa" data-i="' + i + '" data-campo="title" value="' + esc(x.title || "") + '"></label>' +
          '<label class="ed-field">Veículo<input type="text" maxlength="120" data-tx-lista="imprensa" data-i="' + i + '" data-campo="outlet" value="' + esc(x.outlet || "") + '"></label></div>' +
          '<label class="ed-field">Link <span class="ed-opcional">(opcional)</span><input type="url" inputmode="url" placeholder="https://…" data-tx-lista="imprensa" data-i="' + i + '" data-campo="url" value="' + esc(x.url || "") + '"></label>' +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="tx-remover" data-lista="imprensa" data-i="' + i + '">Remover</button></li>'
      )
      .join("");
    root.innerHTML =
      '<section class="ed-secao" aria-labelledby="tx-marca"><h3 id="tx-marca">Marca e contato</h3>' +
      campo("Nome da loja", "site.brandName", s.brandName, { max: 80, dica: "Aparece no título das páginas." }) +
      campo("Slogan", "site.slogan", s.slogan, { max: 160, dica: "Aparece no topo do site e em Sobre nós." }) +
      '<div class="ed-linha">' +
      campo("WhatsApp", "site.contato.whatsapp", formatWhats(s.contato.whatsapp), { tipo: "whatsapp", type: "tel", inputmode: "tel", dica: "Com DDD. Os pedidos vão para este número." }) +
      campo("Instagram", "site.contato.instagram.handle", s.contato.instagram.handle, { tipo: "instagram", max: 61, placeholder: "@perfil" }) +
      "</div>" +
      '<div class="ed-linha">' +
      campo("Cidade", "site.address.city", s.address.city, { max: 80 }) +
      campo("Estado", "site.address.state", s.address.state, { max: 2, placeholder: "DF" }) +
      "</div>" +
      campo("Rodapé (direitos)", "site.copyright", s.copyright, { max: 120, placeholder: "© 2026 Jana Abreu" }) +
      "</section>" +
      '<section class="ed-secao" aria-labelledby="tx-enc"><h3 id="tx-enc">Encomendas e entrega</h3>' +
      '<div class="ed-linha">' +
      campo("Taxa de entrega (R$)", "site.entrega.taxa", taxaNull ? "" : precoTexto(s.entrega.taxa) || "0", { tipo: "taxa", inputmode: "decimal", disabled: taxaNull }) +
      '<label class="ed-check ed-check--meio"><input type="checkbox" data-tx-taxa-null' + (taxaNull ? " checked" : "") + "> <span>A combinar com a Jana</span></label></div>" +
      campo("Aviso no carrinho", "site.requestDisclaimer", s.requestDisclaimer, { area: true, max: 800, dica: "Aparece acima do botão de enviar a encomenda." }) +
      campo("Texto sobre os dados da cliente", "site.privacyNote", s.privacyNote, { area: true, max: 800 }) +
      campo("Texto sobre o pagamento", "site.paymentsNote", s.paymentsNote, { area: true, max: 800 }) +
      "</section>" +
      '<section class="ed-secao" aria-labelledby="tx-areas"><h3 id="tx-areas">Categorias (caixinhas da página inicial)</h3>' +
      '<p class="ed-dica">A ordem aqui é a ordem das caixinhas e do menu Categorias.</p><ol class="ed-areas">' + areasHtml + "</ol></section>" +
      '<section class="ed-secao" aria-labelledby="tx-recheios"><h3 id="tx-recheios">Recheios de bolo</h3>' +
      '<p class="ed-dica">Aparecem para a cliente escolher em todos os produtos da categoria Bolos.</p>' +
      campo("Título da escolha", "sabores.label", t.sabores.label, { max: 80 }) +
      '<ol class="ed-recheios">' + recheios + "</ol>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="tx-novo" data-lista="recheios">+ Adicionar recheio</button></section>' +
      '<section class="ed-secao" aria-labelledby="tx-sobre"><h3 id="tx-sobre">Sobre nós</h3>' +
      '<p class="ed-dica">Campos vazios não aparecem no site. Escreva só o que for real.</p>' +
      campo("Abertura", "sobre.lead", sobre.lead, { area: true, max: 2000, opcional: true }) +
      '<fieldset class="ed-grupo"><legend>Foto da Jana <span class="ed-opcional">(opcional)</span></legend>' +
      (sobre.portrait.src ? '<div class="ed-retrato">' + imgTag(sobre.portrait.src, "", "") + "</div>" : "") +
      '<div class="ed-linha"><label class="btn btn--outline btn--small ed-arquivo">' + (sobre.portrait.src ? "Trocar foto" : "Escolher foto") + '<input type="file" accept="image/*" data-ed-file="retrato"></label>' +
      (sobre.portrait.src ? '<button type="button" class="btn btn--small btn--danger" data-ed-action="retrato-remover">Remover foto</button>' : "") + "</div>" +
      campo("Descrição da foto", "sobre.portrait.alt", sobre.portrait.alt, { max: 200 }) + "</fieldset>" +
      campo("História", "sobre.story", (sobre.story || []).join("\n\n"), { area: true, rows: 7, tipo: "paragrafos", opcional: true, dica: "Deixe uma linha em branco entre os parágrafos." }) +
      '<fieldset class="ed-grupo"><legend>Galeria de trabalhos</legend>' + listaFotos("trabalhos", sobre.workGallery || [], { alt: true, produto: true, multiplo: true }) + "</fieldset>" +
      '<fieldset class="ed-grupo"><legend>Na imprensa</legend><ul class="ed-imprensa">' + imprensa + "</ul>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="tx-novo" data-lista="imprensa">+ Adicionar matéria</button></fieldset>' +
      '<fieldset class="ed-grupo"><legend>Fotos da faixa do Instagram</legend><p class="ed-dica">Aparecem em Sobre nós e levam para o Instagram.</p>' +
      listaFotos("instagram", (s.instagramGallery || []).map((src) => ({ src: src })), { multiplo: true }) + "</fieldset>" +
      "</section>";
  }

  function onTextosInput(target) {
    const t = ED.drafts.textos;
    if (target.hasAttribute("data-tx")) {
      const path = target.getAttribute("data-tx");
      const tipo = target.getAttribute("data-tipo");
      const obj = { site: t.site, sabores: t.sabores, sobre: t.sobre };
      const root = path.split(".")[0];
      const rest = path.slice(root.length + 1);
      let value = target.value;
      if (tipo === "whatsapp") {
        let dig = value.replace(/\D/g, "");
        if (dig.length === 10 || dig.length === 11) dig = "55" + dig;
        const prevLabel = t.site.contato.whatsappLabel;
        const autoLabel = formatWhats(t.site.contato.whatsapp);
        value = dig;
        if (!prevLabel || prevLabel === autoLabel) t.site.contato.whatsappLabel = formatWhats(dig);
      } else if (tipo === "instagram") {
        const handle = value.trim().replace(/^@?/, "@").replace(/\s+/g, "");
        value = handle === "@" ? "" : handle;
        t.site.contato.instagram.url = "https://www.instagram.com/" + value.replace(/^@/, "") + "/";
      } else if (tipo === "taxa") {
        const n = parsePreco(value);
        value = n === null ? NaN : n; // vazio ou inválido: a validação avisa antes de salvar
      } else if (tipo === "paragrafos") {
        value = value
          .split(/\n\s*\n/)
          .map((x) => x.trim())
          .filter(Boolean);
      }
      if (path === "site.slogan" && (t.site.tagline === undefined || t.site.tagline === t.site.slogan)) t.site.tagline = value;
      setPath(obj[root], rest, value);
    } else if (target.hasAttribute("data-tx-area")) {
      const a = t.areas.find((x) => x.id === target.getAttribute("data-tx-area"));
      a[target.getAttribute("data-campo")] = target.value;
    } else if (target.hasAttribute("data-tx-lista")) {
      const list = txLista(target.getAttribute("data-tx-lista"));
      const item = list[Number(target.getAttribute("data-i"))];
      const campoNome = target.getAttribute("data-campo");
      if (campoNome === "productSlug") {
        if (target.value) item.productSlug = target.value;
        else delete item.productSlug;
      } else item[campoNome] = target.value;
    } else if (target.hasAttribute("data-tx-taxa-null")) {
      t.site.entrega.taxa = target.checked ? null : 40;
      if (!target.checked) {
        const saved = (ED.saved[F.site] || {}).entrega;
        t.site.entrega.taxa = saved && saved.taxa != null ? saved.taxa : 0;
      }
      rerenderKeepFocus(renderTextos, target);
    }
    updateSavebar();
  }

  async function textosArquivo(input) {
    const kind = input.getAttribute("data-ed-file");
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    const t = ED.drafts.textos;
    setStatus("salvando", "Preparando a imagem…");
    const erros = [];
    for (const file of files) {
      try {
        if (kind === "area") {
          const id = input.getAttribute("data-id");
          const res = await processImage(file, IMG.area);
          t.areas.find((a) => a.id === id).image = addPending("assets/areas", id, res);
        } else if (kind === "retrato") {
          const res = await processImage(file, IMG.sobre);
          t.sobre.portrait.src = addPending("assets/sobre", "jana", res);
        } else if (kind === "tx-trabalhos") {
          const res = await processImage(file, IMG.sobre);
          txLista("trabalhos").push({ src: addPending("assets/sobre", "trabalho", res), alt: "" });
        } else if (kind === "tx-instagram") {
          const res = await processImage(file, IMG.area);
          txLista("instagram").push(addPending("assets/sobre", "instagram", res));
        }
      } catch (err) {
        erros.push(err.message);
      }
    }
    setStatus(erros.length ? "erro" : "", erros.join(" "));
    renderTextos();
    updateSavebar();
  }

  /* ---------- Histórico ---------- */

  function quando(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function loadHistorico() {
    const root = qs('[data-ed="historico"]');
    if (!root || !ED.logado) return;
    if (ED.carregado && !ED.configurado) {
      root.innerHTML = '<li class="ed-vazio">O histórico aparece quando a publicação estiver configurada.</li>';
      return;
    }
    root.innerHTML = '<li class="ed-vazio">Carregando…</li>';
    const r = await api("GET", "/admin/conteudo/historico");
    if (!r.ok) {
      root.innerHTML = '<li class="ed-vazio">Não consegui carregar o histórico agora.</li>';
      return;
    }
    ED.historico = r.data.alteracoes || [];
    if (!ED.historico.length) {
      root.innerHTML = '<li class="ed-vazio">Nenhuma alteração feita pelo editor ainda.</li>';
      return;
    }
    root.innerHTML = ED.historico
      .map(
        (h) =>
          '<li class="ed-hist"><div><p class="ed-hist__resumo">' + esc(h.resumo) + '</p><p class="ed-dica">' + esc(quando(h.data)) + "</p></div>" +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="desfazer" data-sha="' + esc(h.sha) + '"' + (ED.somenteLeitura ? " disabled" : "") + ">Desfazer</button></li>"
      )
      .join("");
  }

  async function desfazer(sha) {
    const h = ED.historico.find((x) => x.sha === sha);
    if (!h) return;
    if (anyDirty()) {
      setStatus("erro", "Salve ou descarte as alterações abertas antes de desfazer.");
      return;
    }
    const ok = await confirmar({
      titulo: "Desfazer esta alteração?",
      texto: "«" + h.resumo + "» (" + quando(h.data) + "). O site volta a ficar como estava antes dela.",
      botao: "Desfazer",
      perigo: true,
    });
    if (!ok) return;
    ED.busy = true;
    setStatus("salvando", "Desfazendo…");
    const r = await api("POST", "/admin/conteudo/desfazer", { sha: sha });
    ED.busy = false;
    if (!r.ok) {
      setStatus("erro", (r.data && (r.data.mensagem || r.data.error)) || "Não foi possível desfazer agora.");
      return;
    }
    await load();
    watchPublication(r.data.commit);
    loadHistorico();
  }

  /* ---------- eventos ---------- */

  function onTab(tab) {
    ED.tab = tab;
    const isEditor = EDITOR_TABS.indexOf(tab) !== -1;
    document.body.setAttribute("data-ed-aba", isEditor ? "editor" : "pedidos");
    if (isEditor && ED.logado && !ED.carregado) load();
    if (tab === "historico" && ED.carregado) loadHistorico();
    updateSavebar();
    if (history.replaceState) history.replaceState(null, "", "#" + tab);
  }

  function moverItem(list, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return false;
    const x = list.splice(i, 1)[0];
    list.splice(j, 0, x);
    return true;
  }

  async function onClick(event) {
    const tabBtn = event.target.closest(".painel-tabs [data-tab]");
    if (tabBtn) {
      onTab(tabBtn.getAttribute("data-tab"));
      return;
    }
    const el = event.target.closest("[data-ed-action]");
    if (!el || el.disabled) return;
    const action = el.getAttribute("data-ed-action");
    const id = el.getAttribute("data-id");
    switch (action) {
      case "novo-produto":
        if (ED.carregado) abrirProduto(null);
        break;
      case "editar-produto":
        abrirProduto(id);
        break;
      case "fechar-produto":
        fecharProduto(false);
        break;
      case "excluir-produto":
        excluirProduto();
        break;
      case "foto-mover":
        lerProdutoForm();
        moverItem(ED.produto.fotos, Number(el.getAttribute("data-i")), Number(el.getAttribute("data-dir")));
        renderProdutoDialog();
        break;
      case "foto-remover": {
        lerProdutoForm();
        const i = Number(el.getAttribute("data-i"));
        const ok = await confirmar({ titulo: "Remover esta foto?", texto: "A foto sai deste produto quando você salvar.", botao: "Remover foto", perigo: true });
        if (ok) {
          ED.produto.fotos.splice(i, 1);
          renderProdutoDialog();
        }
        break;
      }
      case "novo-banner":
        if (ED.carregado) abrirBanner(null);
        break;
      case "editar-banner":
        abrirBanner(id);
        break;
      case "remover-banner":
        removerBanner(id);
        break;
      case "banner-mover":
        moverBanner(id, Number(el.getAttribute("data-dir")));
        break;
      case "fechar-banner":
        fecharBanner(false);
        break;
      case "banner-sem-celular":
        lerBannerForm();
        ED.banner.imageMobile = "";
        ED.banner.avisoCel = "";
        ED.banner.mudou = true;
        renderBannerDialog();
        break;
      case "salvar-aba":
        salvarAba();
        break;
      case "descartar":
        descartarAba();
        break;
      case "recarregar":
        setStatus("", "");
        load();
        break;
      case "periodo-novo":
        ED.drafts.datas.pausa.periodos = ED.drafts.datas.pausa.periodos || [];
        ED.drafts.datas.pausa.periodos.push({ inicio: "", fim: "", mensagem: "" });
        renderDatas();
        updateSavebar();
        break;
      case "periodo-remover":
        ED.drafts.datas.pausa.periodos.splice(Number(el.getAttribute("data-i")), 1);
        renderDatas();
        updateSavebar();
        break;
      case "desligar-planilha":
        ED.drafts.datas.pausa.planilhaCsv = "";
        renderDatas();
        updateSavebar();
        break;
      case "ver-produtos":
        ED.filtro = el.getAttribute("data-area");
        renderFiltro();
        renderProdutos();
        qs('.painel-tabs [data-tab="produtos"]').click();
        break;
      case "area-mover": {
        const list = ED.drafts.textos.areas.slice().sort(byOrder);
        const i = list.findIndex((a) => a.id === id);
        if (moverItem(list, i, Number(el.getAttribute("data-dir")))) {
          list.forEach((a, k) => (a.order = k + 1));
          renderTextos();
          updateSavebar();
        }
        break;
      }
      case "tx-mover":
        if (moverItem(txLista(el.getAttribute("data-lista")), Number(el.getAttribute("data-i")), Number(el.getAttribute("data-dir")))) {
          renderTextos();
          updateSavebar();
        }
        break;
      case "tx-remover": {
        const ok = await confirmar({ titulo: "Remover este item?", texto: "Ele sai do site quando você tocar em Salvar e publicar.", botao: "Remover", perigo: true });
        if (ok) {
          txLista(el.getAttribute("data-lista")).splice(Number(el.getAttribute("data-i")), 1);
          renderTextos();
          updateSavebar();
        }
        break;
      }
      case "tx-novo": {
        const kind = el.getAttribute("data-lista");
        txLista(kind).push(kind === "recheios" ? { nome: "", descricao: "" } : { title: "", outlet: "", url: "" });
        renderTextos();
        updateSavebar();
        const inputs = qsa('[data-tx-lista="' + kind + '"]');
        if (inputs.length) inputs[inputs.length - (kind === "recheios" ? 2 : 3)].focus();
        break;
      }
      case "retrato-remover": {
        const ok = await confirmar({ titulo: "Remover a foto?", texto: "A foto sai de Sobre nós quando você tocar em Salvar e publicar.", botao: "Remover foto", perigo: true });
        if (ok) {
          ED.drafts.textos.sobre.portrait.src = "";
          renderTextos();
          updateSavebar();
        }
        break;
      }
      case "recarregar-historico":
        loadHistorico();
        break;
      case "desfazer":
        desfazer(el.getAttribute("data-sha"));
        break;
      default:
        break;
    }
  }

  function onInput(event) {
    const t = event.target;
    if (!t || !ED.carregado) return;
    if (t.matches('[data-ed="busca"]')) {
      // o «change» do blur não pode redesenhar a lista: o toque no produto se perderia
      if (ED.busca === t.value) return;
      ED.busca = t.value;
      renderProdutos();
      return;
    }
    if (t.closest('[data-ed="datas"]')) {
      if (t.type === "date" && event.type === "input") return; // datas: só no change
      onDatasInput(t);
      return;
    }
    if (t.closest('[data-ed="textos"]')) {
      if (event.type === "change" && t.type !== "checkbox" && t.tagName !== "SELECT") return;
      if (event.type === "input" && (t.type === "checkbox" || t.tagName === "SELECT")) return;
      onTextosInput(t);
      return;
    }
    if (t.closest('[data-ed="form-produto"]') && event.type === "change" && t.name === "sobConsulta") {
      const preco = qs('[data-ed="form-produto"] [name="preco"]');
      if (preco) preco.disabled = t.checked;
    }
    if (t.closest('[data-ed="form-banner"]') && event.type === "change" && t.name === "linkTipo") {
      lerBannerForm();
      renderBannerDialog();
      const r = qs('[data-ed="form-banner"] input[name="linkTipo"][value="' + t.value + '"]');
      if (r) r.focus();
    }
  }

  function onChange(event) {
    const t = event.target;
    if (t.matches('[data-ed="filtro"]')) {
      ED.filtro = t.value;
      renderProdutos();
      return;
    }
    if (t.matches('input[name="ed-pagina"]')) {
      ED.carrosselPagina = t.value;
      renderCarrossel();
      const r = qs('input[name="ed-pagina"][value="' + t.value + '"]');
      if (r) r.focus();
      return;
    }
    if (t.matches('input[type="file"][data-ed-file]')) {
      const kind = t.getAttribute("data-ed-file");
      if (kind === "produto") adicionarFotosProduto(t);
      else if (kind === "banner-pc") bannerArquivo(t, "pc");
      else if (kind === "banner-cel") bannerArquivo(t, "cel");
      else textosArquivo(t);
      return;
    }
    onInput(event);
  }

  function onSubmit(event) {
    const form = event.target;
    if (form.matches('[data-ed="form-produto"]')) {
      event.preventDefault();
      salvarProduto();
    } else if (form.matches('[data-ed="form-banner"]')) {
      event.preventDefault();
      aplicarBanner();
    }
  }

  function bindDialogs() {
    const prod = qs('[data-ed="dialog-produto"]');
    const ban = qs('[data-ed="dialog-banner"]');
    if (prod)
      prod.addEventListener("cancel", function onCancel(event) {
        event.preventDefault();
        fecharProduto(false);
      });
    if (ban)
      ban.addEventListener("cancel", function onCancel(event) {
        event.preventDefault();
        fecharBanner(false);
      });
  }

  async function init() {
    if (!Jana || !Jana.Central) return;
    try {
      ED.site = await Jana.loadJSON("../data/site.json");
    } catch (err) {
      ED.site = {};
    }
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("submit", onSubmit);
    bindDialogs();
    global.addEventListener("beforeunload", function warn(event) {
      if (anyDirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    document.addEventListener("jana:sessao", function onSessao(event) {
      const logado = !!(event.detail && event.detail.logado);
      const mudou = logado !== ED.logado;
      ED.logado = logado;
      if (!logado) {
        renderLogin();
      } else if (mudou || !ED.carregado) {
        const dica = qs('[data-ed="login-dica"]');
        if (dica) dica.hidden = true;
        if (EDITOR_TABS.indexOf(ED.tab) !== -1) load();
        else renderLoading();
      }
    });
    ED.logado = !!Jana.Central.session();
    if (!ED.logado) renderLogin();
    const hash = (location.hash || "").replace("#", "");
    if (EDITOR_TABS.indexOf(hash) !== -1 || hash === "clientes") {
      const btn = qs('.painel-tabs [data-tab="' + hash + '"]');
      if (btn) btn.click();
    } else {
      document.body.setAttribute("data-ed-aba", "pedidos");
    }
  }

  // exposto para os testes automatizados
  global.JanaEditor = { state: ED, applyAreas: applyAreas, parsePreco: parsePreco, slugify: slugify, buildProduto: buildProduto, processImage: processImage };

  document.addEventListener("DOMContentLoaded", init);
})(window);
