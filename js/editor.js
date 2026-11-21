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
    faq: "data/faq.json",
  };
  const EDITOR_TABS = ["produtos", "carrossel", "datas", "categorias", "sobre", "faq", "textos", "historico"];
  const STAGED_TABS = ["carrossel", "datas", "categorias", "sobre", "faq", "textos"];
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
          const err = (r.data && r.data.error) || "o servidor não respondeu";
          if (paths.indexOf(F.faq) !== -1 && /arquivo não permitido/i.test(String(err))) {
            setStatus(
              "erro",
              "As perguntas frequentes ainda não podem ser publicadas porque o servidor do site precisa ser atualizado. As outras abas continuam salvando normalmente. Avise o Alexandre para publicar o Worker novo."
            );
          } else {
            setStatus("erro", "Não foi possível salvar: " + err + ".");
          }
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
      if (files[F.faq] == null) {
        try {
          files[F.faq] = await Jana.loadJSON("../" + F.faq);
        } catch (err) {
          files[F.faq] = [];
        }
      }
      if (Jana.normalizeFaq) files[F.faq] = Jana.normalizeFaq(files[F.faq]);
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
        const source = (ED.drafts.categorias && ED.drafts.categorias.areas) || ED.saved[F.areas] || [];
        const list = clone(source).map(function apply(a) {
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
        sabores: clone(ED.saved[F.sabores] || { label: "Recheio do bolo", flavors: [] }),
      }),
      files: function files(d) {
        return changed({ [F.site]: d.site, [F.sabores]: d.sabores });
      },
      resumo: () => "textos do site",
    },
    categorias: {
      from: () => ({ areas: clone(ED.saved[F.areas] || []).slice().sort(byOrder) }),
      files: function files(d) {
        const list = clone(d.areas || []);
        list.forEach(function mergeAtiv(a, i) {
          a.order = i + 1;
          delete a._buscaFoto;
          if (a.enabled !== false) delete a.enabled;
          if (!a.description) delete a.description;
          if (!Jana.isProductSort || !Jana.isProductSort(a.productSort)) delete a.productSort;
          if (Array.isArray(a.productOrder)) {
            const seen = Object.create(null);
            a.productOrder = a.productOrder.filter(function keepSlug(slug) {
              const s = String(slug || "");
              if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(s) || seen[s]) return false;
              seen[s] = true;
              return true;
            });
            if (!a.productOrder.length) delete a.productOrder;
          } else {
            delete a.productOrder;
          }
          if (a.productSort === "manual" && !a.productOrder) {
            a.productOrder = Jana.productsForArea(products(), Object.assign({}, a, { productSort: "" })).map(function slugOf(item) { return item.slug; });
          }
          if (ED.drafts.datas && ED.drafts.datas.sazonais && ED.drafts.datas.sazonais[a.id]) {
            a.ativacao = clone(ED.drafts.datas.sazonais[a.id]);
          } else {
            const saved = (ED.saved[F.areas] || []).find((x) => x.id === a.id);
            if (saved && saved.ativacao) a.ativacao = clone(saved.ativacao);
          }
        });
        return changed({ [F.areas]: list });
      },
      resumo: () => "categorias",
    },
    faq: {
      from: function from() {
        const raw = ED.saved[F.faq];
        return { items: clone(Jana.normalizeFaq ? Jana.normalizeFaq(raw) : raw || []) };
      },
      files: function files(d) {
        const list = (d.items || []).map(function clean(item) {
          return {
            id: item.id,
            question: String(item.question || "").trim(),
            answer: String(item.answer || "").trim(),
          };
        });
        return changed({ [F.faq]: list });
      },
      resumo: function resumo(d) {
        const n = (d.items || []).length;
        return "perguntas frequentes (" + n + (n === 1 ? " pergunta" : " perguntas") + ")";
      },
    },
    sobre: {
      from: function from() {
        const sobre = clone(ED.saved[F.sobre] || {});
        sobre.portrait = sobre.portrait || { src: "", alt: "Jana Abreu" };
        if (sobre.introText == null) sobre.introText = "";
        if (!Array.isArray(sobre.introPhotos)) sobre.introPhotos = [];
        if (!Array.isArray(sobre.instagramGallery)) {
          sobre.instagramGallery = clone(((ED.saved[F.site] || {}).instagramGallery) || []);
        }
        return { sobre: sobre };
      },
      files: function files(d) {
        return changed({ [F.sobre]: d.sobre });
      },
      resumo: () => "Sobre nós",
    },
  };

  function changed(files) {
    const out = {};
    Object.keys(files).forEach(function cmp(p) {
      if (!same(files[p], ED.saved[p])) out[p] = files[p];
    });
    return out;
  }

  function syncAreasDrafts(written) {
    if (!written) return;
    if (ED.drafts.categorias) ED.drafts.categorias.areas = clone(written);
    if (ED.drafts.datas) {
      const ativ = {};
      written
        .filter(function seasonal(a) { return Jana.isSeasonalArea(a); })
        .forEach(function each(a) {
          ativ[a.id] = clone(a.ativacao || { modo: "desligado", inicio: "", fim: "" });
        });
      ED.drafts.datas.sazonais = ativ;
    }
  }

  function produtosSoNestaCategoria(area) {
    const ids = (area && area.sourceCategoryIds) || [];
    const others = (ED.drafts.categorias ? ED.drafts.categorias.areas : areas()).filter((a) => a.id !== (area && area.id));
    return products().filter(function onlyHere(p) {
      const cats = productCats(p);
      if (!cats.some((c) => ids.indexOf(c) !== -1)) return false;
      return !others.some((o) => ((o.sourceCategoryIds || []).some((c) => cats.indexOf(c) !== -1)));
    });
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
      if (files[F.areas]) syncAreasDrafts(files[F.areas]);
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
    ["carrossel", "datas", "categorias", "sobre", "faq", "textos", "historico"].forEach((t) => {
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
    ["carrossel", "datas", "categorias", "sobre", "faq", "textos"].forEach((t) => {
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
    renderCategorias();
    renderSobreTab();
    renderFaqTab();
    renderTextos();
    if (ED.tab === "historico") loadHistorico();
    updateSavebar();
  }

  function renderTab(tab) {
    if (tab === "produtos") renderProdutos();
    if (tab === "carrossel") renderCarrossel();
    if (tab === "datas") renderDatas();
    if (tab === "categorias") renderCategorias();
    if (tab === "sobre") renderSobreTab();
    if (tab === "faq") renderFaqTab();
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
      aceitaImagem: false,
      pedidoMinimo: false,
      minQty: "",
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
      aceitaImagem: p.aceitaImagemPersonalizacao === true,
      pedidoMinimo: Jana.productHasMinQty ? Jana.productHasMinQty(p) : (Number(p.minQty) >= 2),
      minQty: Jana.productHasMinQty && Jana.productHasMinQty(p) ? String(Jana.productMinQty(p)) : "",
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
    if (d.aceitaImagem) out.aceitaImagemPersonalizacao = true;
    else delete out.aceitaImagemPersonalizacao;
    const minQty = d.pedidoMinimo ? Math.floor(Number(String(d.minQty).replace(",", "."))) : 0;
    if (d.pedidoMinimo && minQty >= 2) out.minQty = minQty;
    else delete out.minQty;
    const sameTags = base && same((base.tags || []).map((t) => t.trim()).filter(Boolean), tags);
    out.tags = sameTags ? base.tags : tags;
    if (base && base.description === undefined && !out.description) delete out.description;
    if (base && (base.description || "").trim() === out.description) out.description = base.description;
    // ordem de campos igual à dos produtos existentes
    const order = ["id", "sourceId", "slug", "name", "description", "categoryId", "categoryIds", "category", "price", "images", "imagesAlt", "featured", "active", "aceitaImagemPersonalizacao", "minQty", "tags"];
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
    if (d.pedidoMinimo) {
      const n = Math.floor(Number(String(d.minQty).replace(",", ".")));
      if (!Number.isFinite(n) || n < 2) erros.push({ campo: "minQty", msg: "A quantidade mínima precisa ser um número inteiro a partir de 2." });
      else if (n > 1000) erros.push({ campo: "minQty", msg: "A quantidade mínima pode ser no máximo 1000." });
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
      '<label class="ed-check"><input type="checkbox" name="aceitaImagem"' + (d.aceitaImagem ? " checked" : "") + '> <span>Aceita imagem para personalização <span class="ed-dica-inline">(a cliente pode enviar uma foto JPG ou PNG no pedido)</span></span></label>' +
      '<label class="ed-check"><input type="checkbox" name="pedidoMinimo"' + (d.pedidoMinimo ? " checked" : "") + '> <span>Pedido mínimo <span class="ed-dica-inline">(abaixo desta quantidade o produto fica indisponível)</span></span></label>' +
      '<div class="ed-field" data-ed="min-qty-wrap"' + (d.pedidoMinimo ? "" : " hidden") + '><label>Quantidade mínima <span class="ed-obrigatorio">(obrigatório quando o pedido mínimo está ligado)</span><input type="number" name="minQty" inputmode="numeric" min="2" max="1000" step="1" placeholder="2" value="' + esc(d.minQty) + '"' + inv("minQty") + ">" + fieldErr("minQty") + "</label></div>" +
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
    d.aceitaImagem = !!(form.aceitaImagem && form.aceitaImagem.checked);
    d.pedidoMinimo = !!(form.pedidoMinimo && form.pedidoMinimo.checked);
    d.minQty = form.minQty ? form.minQty.value : "";
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

  function bannerTipo(s) {
    return s && s.tipo === "produto" ? "produto" : "imagem";
  }

  function produtoDoBanner(s) {
    return s && s.productSlug ? products().find((x) => x.slug === s.productSlug) || null : null;
  }

  function linkResumo(s) {
    if (bannerTipo(s) === "produto") {
      const p = produtoDoBanner(s);
      if (!p) return "Banner de produto — este produto não está mais no site";
      if (p.active === false) return "Banner de produto «" + p.name + "» — oculto no site (produto indisponível)";
      return "Banner de produto «" + p.name + "»";
    }
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
      '<p class="painel-note">O modo padrão é o <strong>banner de produto</strong>: você escolhe o produto e o site monta o banner com a foto, o nome, a descrição, o preço e o link. Também é possível criar um <strong>banner de imagem</strong>, como antes. Tamanho recomendado para imagens: <strong>computador ' + tam.pc[0] + " × " + tam.pc[1] + " px</strong> e <strong>celular " + tam.cel[0] + " × " + tam.cel[1] +
      " px</strong>. Quando todos os banners da página têm o formato novo, eles aparecem inteiros, sem cortes. Sem imagem de celular, o celular mostra a do computador.</p>" +
      (area && !list.length
        ? '<p class="ed-vazio">Sem banners: a página «' + esc(area.name) + "» mostra as fotos dos produtos automaticamente. Se você adicionar banners, eles aparecem no lugar.</p>"
        : "") +
      (pag === "home" && !list.length ? '<p class="ed-vazio">Sem banners: o carrossel some da página inicial.</p>' : "") +
      '<ol class="ed-banners">' +
      list
        .map(function card(s, i) {
          const novo = !savedIds.has(JSON.stringify(s));
          const isProd = bannerTipo(s) === "produto";
          const resolved = isProd && Jana.resolveProductBanner ? Jana.resolveProductBanner(s, produtoDoBanner(s)) : null;
          const titulo = isProd ? (resolved && resolved.title) || s.productSlug || "(sem produto)" : s.title || "(sem descrição)";
          const fotos = isProd
            ? '<div class="ed-banner__fotos ed-banner__fotos--produto"><div class="ed-banner-preview ed-banner-preview--pc" style="aspect-ratio:' + tam.pc[0] + "/" + tam.pc[1] + '">' +
              (resolved && resolved.image && Jana.productBannerHtml ? Jana.productBannerHtml(Object.assign({}, resolved, { foto: s.foto }), { preview: true, eager: true, filterId: "lista-" + s.id, assetUrl: imgSrc }) : '<span class="ed-semfoto">escolha um produto</span>') +
              "</div></div>"
            : '<div class="ed-banner__fotos">' +
              '<figure class="ed-banner__pc">' + listaImagemBanner(s, s.image, "pc") + "<figcaption>Computador</figcaption></figure>" +
              '<figure class="ed-banner__cel">' + (s.imageMobile || s.image ? listaImagemBanner(s, s.imageMobile || s.image, "cel") : '<span class="ed-semfoto">usa a do computador</span>') + "<figcaption>Celular</figcaption></figure>" +
              "</div>";
          return (
            '<li class="ed-banner">' +
            fotos +
            '<div class="ed-banner__info"><p class="ed-banner__titulo">' + (i + 1) + ". " + esc(titulo) + (novo ? ' <span class="ed-chip ed-chip--novo">não publicado</span>' : "") + "</p>" +
            '<p class="ed-dica">' + esc(linkResumo(s)) + (isProd || s.formato === "banner" ? "" : " · foto antiga, sem versão de celular") + "</p>" +
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
    const tipo = s ? bannerTipo(s) : "produto";
    ED.banner = {
      original: s,
      pagina: s ? s.pagina || "home" : ED.carrosselPagina,
      tipo: tipo,
      image: s ? s.image || "" : "",
      imageMobile: s ? s.imageMobile || "" : "",
      imageW900: s ? s.imageW900 || "" : "",
      imageMobileW900: s ? s.imageMobileW900 || "" : "",
      title: s ? s.title || "" : "",
      linkTipo: s ? s.linkTipo || (s.productSlug ? "produto" : "nenhum") : "nenhum",
      productSlug: s ? s.productSlug || "" : "",
      linkCategory: s ? s.linkCategory || "" : "",
      url: s ? s.url || "" : "",
      overrides: s && s.overrides && typeof s.overrides === "object" ? Object.assign({}, s.overrides) : {},
      buscaProduto: "",
      vistaProdutos: "grupos",
      trocandoProduto: false,
      foto: Jana.normalizeFoto ? Jana.normalizeFoto(s && s.foto) : { x: 50, y: 50, zoom: 1, brilho: 1, contraste: 1, saturacao: 1, vibrancia: 1, gamma: 1 },
      formato: s ? s.formato || (tipo === "produto" ? "banner" : "") : "banner",
      avisoPc: "",
      avisoCel: "",
      mudou: false,
    };
    renderBannerDialog();
    qs('[data-ed="dialog-banner"]').showModal();
  }

  function nomesCategoriasBanner() {
    const map = {};
    (ED.saved[F.categories] || []).forEach(function add(c) {
      if (c && c.id) map[c.id] = c.name || c.id;
    });
    return map;
  }

  function produtosParaBanner() {
    if (Jana.catalogProductsForPicker) {
      return Jana.catalogProductsForPicker(products(), (ED.banner && ED.banner.buscaProduto) || "");
    }
    const q = semAcento((ED.banner && ED.banner.buscaProduto) || "");
    return products()
      .filter((p) => p && p.slug)
      .filter((p) => !q || semAcento(p.name + " " + p.slug).indexOf(q) !== -1)
      .slice()
      .sort((x, y) => String(x.name || "").localeCompare(String(y.name || ""), "pt-BR"));
  }

  function gruposProdutosBanner() {
    if (Jana.productPickerGroups) {
      return Jana.productPickerGroups(products(), areas(), {
        query: (ED.banner && ED.banner.buscaProduto) || "",
        categoryNames: nomesCategoriasBanner(),
      });
    }
    return [{ id: "todos", name: "Todos", products: produtosParaBanner() }];
  }

  function pickProdutoHtml(p, selectedSlug) {
    const preco = hasFixedPrice(p) ? Jana.formatBRL(p.price) : "Sob consulta";
    const oculto = p.active === false;
    const selected = p.slug === selectedSlug;
    const foto = p.images && p.images[0] ? p.images[0] : "";
    const rotulo = (p.name || p.slug) + (oculto ? ", oculto" : "") + ", " + preco;
    return (
      '<button type="button" class="ed-pick' +
      (selected ? " is-selected" : "") +
      (oculto ? " is-oculto" : "") +
      '" data-ed-action="banner-escolher-produto" data-slug="' +
      esc(p.slug) +
      '" aria-label="' +
      esc(rotulo) +
      '"' +
      (selected ? ' aria-current="true"' : "") +
      ">" +
      imgTag(foto, "", "ed-pick__foto") +
      "<span><strong>" +
      esc(p.name || p.slug) +
      (oculto ? ' <span class="ed-chip">oculto</span>' : "") +
      "</strong><span class=\"ed-dica-inline\">" +
      esc(preco) +
      (oculto ? " · o banner não aparece no site enquanto o produto estiver oculto" : "") +
      "</span></span></button>"
    );
  }

  function listaProdutosBannerHtml(b) {
    const lista = produtosParaBanner();
    const grupos = gruposProdutosBanner();
    const q = String((b && b.buscaProduto) || "").trim();
    const vista = (b && b.vistaProdutos) === "az" ? "az" : "grupos";
    const selected = (b && b.productSlug) || "";
    const hiddenCount = lista.filter((p) => p.active === false).length;
    const conta =
      lista.length +
      (lista.length === 1 ? " produto" : " produtos") +
      (q ? " encontrados" : " no catálogo") +
      (hiddenCount ? " · " + hiddenCount + (hiddenCount === 1 ? " oculto" : " ocultos") : "");
    const vistaBtn = function (v, label) {
      return (
        '<label class="ed-pilula"><input type="radio" name="vistaProdutos" value="' +
        v +
        '"' +
        (vista === v ? " checked" : "") +
        "> <span>" +
        label +
        "</span></label>"
      );
    };
    let corpo = "";
    if (!lista.length) {
      corpo = '<p class="ed-vazio">Nenhum produto encontrado.</p>';
    } else if (vista === "az") {
      corpo = '<div class="ed-picks__lista" role="list">' + lista.map((p) => pickProdutoHtml(p, selected)).join("") + "</div>";
    } else {
      corpo = grupos
        .map(function group(g) {
          const abre = !!(q || (selected && g.products.some((p) => p.slug === selected)));
          return (
            '<details class="ed-pick-grupo"' +
            (abre ? " open" : "") +
            "><summary>" +
            esc(g.name) +
            ' <span class="ed-pick-grupo__conta">(' +
            g.products.length +
            ")</span></summary>" +
            '<div class="ed-picks__lista" role="list">' +
            g.products.map((p) => pickProdutoHtml(p, selected)).join("") +
            "</div></details>"
          );
        })
        .join("");
    }
    return (
      '<fieldset class="ed-grupo ed-pick-vista"><legend>Como ver a lista</legend><div class="ed-pilulas">' +
      vistaBtn("grupos", "Por categoria") +
      vistaBtn("az", "Todos (A–Z)") +
      "</div></fieldset>" +
      '<p class="ed-dica ed-pick-contagem">' +
      esc(conta) +
      ". Produtos ocultos podem ser escolhidos, mas o banner só aparece no site quando o produto estiver visível.</p>" +
      '<div class="ed-picks ed-picks--catalogo" role="region" aria-label="Produtos do catálogo">' +
      corpo +
      "</div>"
    );
  }

  function setOverride(b, key, value) {
    const next = Object.assign({}, b.overrides || {});
    const prev = Object.prototype.hasOwnProperty.call(next, key) ? next[key] : null;
    if (value == null || value === "") delete next[key];
    else next[key] = value;
    const now = Object.prototype.hasOwnProperty.call(next, key) ? next[key] : null;
    if (JSON.stringify(prev) !== JSON.stringify(now)) b.mudou = true;
    b.overrides = next;
  }

  function reverterCampoBanner(campo) {
    lerBannerForm();
    const b = ED.banner;
    if (!b) return;
    const next = Object.assign({}, b.overrides || {});
    delete next[campo];
    b.overrides = next;
    b.mudou = true;
    renderBannerDialog();
    const btn = qs('[data-ed="form-banner"] [data-ed-action="banner-reverter"][data-campo="' + campo + '"]');
    const field = qs('[data-ed="form-banner"] [name="' + campo + '"]');
    if (field) field.focus();
    else if (btn) btn.focus();
  }

  function escolherProdutoBanner(slug) {
    lerBannerForm();
    const b = ED.banner;
    if (!b) return;
    b.productSlug = slug || "";
    b.overrides = {};
    b.trocandoProduto = false;
    b.buscaProduto = "";
    b.mudou = true;
    renderBannerDialog();
    const el = qs('[data-ed="form-banner"] [name="buscaProduto"], [data-ed="form-banner"] [name="title"]');
    if (el) el.focus();
  }

  function listaImagemBanner(s, src, sufixo) {
    const tag = imgTag(src, "", "");
    if (!Jana.decorateBannerFoto || !s || !s.foto) return tag;
    const dec = Jana.decorateBannerFoto(tag, s.foto, Jana.fotoFilterId("lista-" + s.id + "-" + sufixo));
    return dec.svg + dec.html;
  }

  function fotoEditorHtml(b, temFoto) {
    if (!Jana.FOTO_CAMPOS) return "";
    const f = Jana.normalizeFoto(b && b.foto);
    const camposAjuste = [
      ["brilho", "Brilho"],
      ["contraste", "Contraste"],
      ["saturacao", "Saturação"],
      ["vibrancia", "Vibrância"],
      ["gamma", "Gamma"],
    ];
    const slider = function slider(key, label) {
      const spec = Jana.FOTO_CAMPOS[key];
      const val = f[key];
      return (
        '<div class="ed-foto__slider"><label for="ed-foto-' +
        key +
        '">' +
        label +
        '</label><input id="ed-foto-' +
        key +
        '" type="range" name="foto-' +
        key +
        '" min="' +
        spec.min +
        '" max="' +
        spec.max +
        '" step="' +
        spec.step +
        '" value="' +
        val +
        '" data-foto-campo="' +
        key +
        '"><input type="number" name="foto-' +
        key +
        '-num" inputmode="decimal" min="' +
        spec.min +
        '" max="' +
        spec.max +
        '" step="' +
        spec.step +
        '" value="' +
        val +
        '" data-foto-campo="' +
        key +
        '" aria-label="' +
        label +
        ' (número)"><button type="button" class="btn btn--outline btn--small ed-foto__reset" data-ed-action="banner-foto-reset" data-campo="' +
        key +
        '" aria-label="Restaurar ' +
        label +
        '">Restaurar</button></div>'
      );
    };
    const z = Jana.FOTO_CAMPOS.zoom;
    return (
      '<fieldset class="ed-grupo ed-foto" data-ed="foto-editor"' +
      (temFoto ? "" : " hidden") +
      "><legend>Enquadramento e ajustes da foto</legend>" +
      '<p class="ed-dica">Vale só para este banner: a foto original do catálogo não muda. Arraste a foto nos previews (computador e celular) — o recorte muda conforme a tela. Também dá para usar as setas, o zoom e o teclado.</p>' +
      '<div data-ed="foto-svg" hidden></div>' +
      '<div class="ed-foto__bloco"><p class="ed-foto__rotulo" id="ed-foto-enq">Enquadramento</p>' +
      '<div class="ed-foto__setas" role="group" aria-labelledby="ed-foto-enq">' +
      '<button type="button" data-ed-action="banner-foto-nudge" data-dir="up" data-eixo="y" data-delta="2" aria-label="Mover a foto para cima">↑</button>' +
      '<button type="button" data-ed-action="banner-foto-nudge" data-dir="left" data-eixo="x" data-delta="2" aria-label="Mover a foto para a esquerda">←</button>' +
      '<button type="button" data-ed-action="banner-foto-nudge" data-dir="right" data-eixo="x" data-delta="-2" aria-label="Mover a foto para a direita">→</button>' +
      '<button type="button" data-ed-action="banner-foto-nudge" data-dir="down" data-eixo="y" data-delta="-2" aria-label="Mover a foto para baixo">↓</button>' +
      "</div>" +
      '<div class="ed-foto__zoom"><label for="ed-foto-zoom">Zoom</label>' +
      '<button type="button" class="btn btn--outline" data-ed-action="banner-foto-zoom" data-delta="-0.1" aria-label="Diminuir zoom">−</button>' +
      '<input id="ed-foto-zoom" type="range" name="foto-zoom" min="' +
      z.min +
      '" max="' +
      z.max +
      '" step="' +
      z.step +
      '" value="' +
      f.zoom +
      '" data-foto-campo="zoom">' +
      '<button type="button" class="btn btn--outline" data-ed-action="banner-foto-zoom" data-delta="0.1" aria-label="Aumentar zoom">+</button>' +
      '<input type="number" name="foto-zoom-num" inputmode="decimal" min="' +
      z.min +
      '" max="' +
      z.max +
      '" step="' +
      z.step +
      '" value="' +
      f.zoom +
      '" data-foto-campo="zoom" aria-label="Zoom (número)">' +
      "</div>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="banner-foto-restaurar-enquadramento">Restaurar enquadramento</button></div>' +
      '<div class="ed-foto__bloco"><p class="ed-foto__rotulo">Ajustes</p>' +
      camposAjuste.map(function row(item) { return slider(item[0], item[1]); }).join("") +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="banner-foto-restaurar-ajustes">Restaurar ajustes</button></div></fieldset>'
    );
  }

  function aplicarFotoNosPreviews() {
    if (!ED.banner || !Jana.applyFotoStyle) return;
    const foto = Jana.normalizeFoto(ED.banner.foto);
    const id = "jana-foto-ed";
    const host = qs('[data-ed="foto-svg"]');
    if (host) host.innerHTML = Jana.fotoNeedsSvgFilter(foto) ? Jana.fotoSvgMarkup(id, foto) : "";
    qsa("[data-ed-foto]").forEach(function each(img) {
      Jana.applyFotoStyle(img, foto, id);
    });
    qsa("[data-foto-campo]").forEach(function sync(input) {
      const key = input.getAttribute("data-foto-campo");
      if (!key || foto[key] == null) return;
      if (String(input.value) !== String(foto[key])) input.value = foto[key];
    });
  }

  function setFotoCampo(key, value) {
    if (!ED.banner || !Jana.clampFotoValue) return;
    const next = Jana.normalizeFoto(ED.banner.foto);
    const v = Jana.clampFotoValue(key, value);
    if (next[key] === v) {
      aplicarFotoNosPreviews();
      return;
    }
    next[key] = v;
    ED.banner.foto = next;
    ED.banner.mudou = true;
    aplicarFotoNosPreviews();
  }

  function restaurarFoto(modo) {
    if (!ED.banner || !Jana.fotoDefaults) return;
    const cur = Jana.normalizeFoto(ED.banner.foto);
    const def = Jana.fotoDefaults();
    const next = Object.assign({}, cur);
    if (modo === "enquadramento") {
      next.x = def.x;
      next.y = def.y;
      next.zoom = def.zoom;
    } else if (modo === "ajustes") {
      next.brilho = def.brilho;
      next.contraste = def.contraste;
      next.saturacao = def.saturacao;
      next.vibrancia = def.vibrancia;
      next.gamma = def.gamma;
    } else if (Jana.FOTO_CAMPOS[modo]) {
      next[modo] = def[modo];
    }
    ED.banner.foto = next;
    ED.banner.mudou = true;
    aplicarFotoNosPreviews();
  }

  function renderBannerDialog(erros) {
    const b = ED.banner;
    const dialog = qs('[data-ed="dialog-banner"]');
    const tam = tamanhos(b.pagina);
    const errs = erros || [];
    const errOf = (c) => errs.find((e) => e.campo === c);
    const fe = (c) => (errOf(c) ? '<span class="ed-erro" id="erro-b-' + c + '">' + esc(errOf(c).msg) + "</span>" : "");
    const inv = (c) => (errOf(c) ? ' aria-invalid="true" aria-describedby="erro-b-' + c + '"' : "");
    const prodTipo = b.tipo === "produto";
    const product = prodTipo ? products().find((x) => x.slug === b.productSlug) || null : null;
    const defaults = Jana.productBannerDefaults ? Jana.productBannerDefaults(product) : {};
    const resolved = prodTipo && Jana.resolveProductBanner ? Jana.resolveProductBanner({ productSlug: b.productSlug, overrides: b.overrides, tipo: "produto" }, product) : null;
    const ov = b.overrides || {};
    const hasOv = (k) => Object.prototype.hasOwnProperty.call(ov, k);
    const modo = (v, label) =>
      '<label class="ed-pilula"><input type="radio" name="bannerTipo" value="' + v + '"' + (b.tipo === v ? " checked" : "") + "> <span>" + label + "</span></label>";
    const reverter = (campo) =>
      hasOv(campo) ? '<button type="button" class="btn btn--outline btn--small" data-ed-action="banner-reverter" data-campo="' + campo + '">Usar o do produto</button>' : "";
    const chip = (campo) => (hasOv(campo) ? ' <span class="ed-chip">editado neste banner</span>' : ' <span class="ed-dica-inline">do produto</span>');
    let corpoProduto = "";
    if (prodTipo) {
      const mostrarBusca = !b.productSlug || b.trocandoProduto;
      corpoProduto =
        '<p class="ed-dica">Escolha o produto. O banner usa a foto, o nome, a descrição, o preço e o link da página dele. Você pode mudar qualquer um só neste banner e voltar ao dado do produto quando quiser.</p>' +
        (product && product.active === false ? '<p class="ed-alerta">Este produto está oculto no site. O banner não aparece até você escolher outro ou voltar a mostrar o produto.</p>' : "") +
        (b.productSlug && !product ? '<p class="ed-alerta">Este produto não está mais no catálogo. Escolha outro.</p>' : "") +
        fe("productSlug") +
        (product && !b.trocandoProduto
          ? '<p class="ed-banner__escolhido"><strong>' + esc(product.name) + '</strong> <button type="button" class="btn btn--outline btn--small" data-ed-action="banner-trocar-produto">Trocar produto</button></p>'
          : "") +
        (mostrarBusca
          ? '<label class="ed-field">Buscar produto <input type="search" name="buscaProduto" value="' + esc(b.buscaProduto || "") + '" placeholder="Nome do produto" autocomplete="off"' + inv("productSlug") + "></label>" +
            listaProdutosBannerHtml(b)
          : "") +
        (product
          ? '<div class="ed-banner-previews">' +
            '<figure><div class="ed-banner-preview ed-banner-preview--pc" style="aspect-ratio:' + tam.pc[0] + "/" + tam.pc[1] + '">' +
            (resolved && resolved.image && Jana.productBannerHtml ? Jana.productBannerHtml(Object.assign({}, resolved, { foto: b.foto, id: "ed-pc" }), { preview: true, eager: true, editor: true, skipSvg: true, filterId: "jana-foto-ed", assetUrl: imgSrc }) : '<span class="ed-semfoto">sem foto</span>') +
            "</div><figcaption>Computador</figcaption></figure>" +
            '<figure><div class="ed-banner-preview ed-banner-preview--cel" style="aspect-ratio:' + tam.cel[0] + "/" + tam.cel[1] + '">' +
            (resolved && resolved.image && Jana.productBannerHtml ? Jana.productBannerHtml(Object.assign({}, resolved, { foto: b.foto, id: "ed-cel" }), { preview: true, eager: true, editor: true, skipSvg: true, filterId: "jana-foto-ed", assetUrl: imgSrc }) : '<span class="ed-semfoto">sem foto</span>') +
            "</div><figcaption>Celular</figcaption></figure></div>" +
            fotoEditorHtml(b, !!(resolved && resolved.image)) +
            '<label class="ed-field">Nome' + chip("title") + '<input type="text" name="title" maxlength="200" value="' + esc(resolved.title) + '"' + inv("title") + ">" + fe("title") + reverter("title") + "</label>" +
            '<label class="ed-field">Descrição' + chip("description") + '<textarea name="description" rows="3" maxlength="800">' + esc(resolved.description) + "</textarea>" + reverter("description") + "</label>" +
            '<label class="ed-field">Preço' + chip("price") + '<input type="text" name="price" inputmode="decimal" placeholder="' + (hasFixedPrice(product) ? "" : "Sob consulta") + '" value="' +
            esc(hasOv("price") ? precoTexto(ov.price) : hasFixedPrice(product) ? precoTexto(product.price) : "") + '">' + reverter("price") +
            '<span class="ed-dica-inline">Deixe em branco para usar o preço do produto' + (hasFixedPrice(product) ? "" : " (sob consulta)") + ".</span></label>" +
            '<fieldset class="ed-grupo"><legend>Foto' + chip("image") + "</legend>" +
            '<div class="ed-preview ed-preview--foto">' + (resolved.image ? imgTag(resolved.image, resolved.alt || "", "") : '<span class="ed-semfoto">sem foto</span>') + "</div>" +
            fe("image") +
            '<div class="ed-linha"><label class="btn btn--outline ed-arquivo">Trocar foto<input type="file" accept="image/*" data-ed-file="banner-produto-foto"></label>' +
            (hasOv("image") ? '<button type="button" class="btn btn--outline" data-ed-action="banner-reverter" data-campo="image">Usar a foto do produto</button>' : "") +
            "</div></fieldset>" +
            '<label class="ed-field">Link' + chip("url") + '<input type="url" name="url" inputmode="url" placeholder="Página do produto" value="' + esc(ov.url || "") + '"' + inv("url") + ">" +
            fe("url") + reverter("url") +
            '<span class="ed-dica-inline">Vazio usa a página do produto. Links de fora do site abrem numa nova aba.</span></label>'
          : "");
    }
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
    const corpoImagem =
      '<p class="ed-dica">' + tam.pc[0] + " × " + tam.pc[1] + " px no computador; " + tam.cel[0] + " × " + tam.cel[1] + " px no celular. Sem a imagem de celular, o celular mostra a do computador.</p>" +
      '<fieldset class="ed-grupo"><legend>Imagem para computador <span class="ed-obrigatorio">(obrigatória)</span></legend>' +
      '<div class="ed-preview ed-preview--pc ed-preview--frame" data-ed-foto-frame="pc" tabindex="0" role="group" aria-label="Enquadramento no computador" style="aspect-ratio:' + tam.pc[0] + "/" + tam.pc[1] + '">' + (b.image ? imgTag(b.image, "", "") : '<span class="ed-semfoto">sem imagem</span>') + "</div>" +
      (b.avisoPc ? '<p class="ed-alerta">' + esc(b.avisoPc) + "</p>" : "") + fe("image") +
      '<label class="btn btn--outline ed-arquivo">' + (b.image ? "Trocar imagem" : "Escolher imagem") + '<input type="file" accept="image/*" data-ed-file="banner-pc"' + inv("image") + "></label></fieldset>" +
      '<fieldset class="ed-grupo"><legend>Imagem para celular <span class="ed-opcional">(opcional)</span></legend>' +
      '<div class="ed-preview ed-preview--cel ed-preview--frame" data-ed-foto-frame="cel" tabindex="0" role="group" aria-label="Enquadramento no celular" style="aspect-ratio:' + tam.cel[0] + "/" + tam.cel[1] + '">' + ((b.imageMobile || b.image) ? imgTag(b.imageMobile || b.image, "", "") : '<span class="ed-semfoto">sem imagem</span>') + "</div>" +
      (b.avisoCel ? '<p class="ed-alerta">' + esc(b.avisoCel) + "</p>" : "") +
      '<div class="ed-linha"><label class="btn btn--outline ed-arquivo">' + (b.imageMobile ? "Trocar imagem" : "Escolher imagem") + '<input type="file" accept="image/*" data-ed-file="banner-cel"></label>' +
      (b.imageMobile ? '<button type="button" class="btn btn--outline" data-ed-action="banner-sem-celular">Tirar imagem do celular</button>' : "") +
      (b.image && !b.imageMobile ? '<p class="ed-dica">Sem imagem de celular, o celular usa a do computador no recorte acima.</p>' : "") +
      "</div></fieldset>" +
      fotoEditorHtml(b, !!b.image) +
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
      "</div></fieldset>";
    dialog.innerHTML =
      '<form class="ed-form" data-ed="form-banner" novalidate>' +
      '<header class="ed-dialog__topo"><h2 id="ed-banner-titulo">' + (b.original ? "Editar banner" : "Novo banner") + "</h2>" +
      '<button type="button" class="ed-fechar" data-ed-action="fechar-banner" aria-label="Fechar sem aplicar">×</button></header>' +
      '<div class="ed-dialog__corpo">' +
      (errs.length ? '<div class="ed-erros" role="alert"><strong>Confira:</strong><ul>' + errs.map((e) => "<li>" + esc(e.msg) + "</li>").join("") + "</ul></div>" : "") +
      '<p class="ed-dica">Página: <strong>' + esc((paginas().find((p) => p.id === b.pagina) || {}).name || "") + "</strong></p>" +
      '<fieldset class="ed-grupo"><legend>Tipo de banner</legend><div class="ed-pilulas">' +
      modo("produto", "Produto (recomendado)") +
      modo("imagem", "Imagem") +
      "</div></fieldset>" +
      (prodTipo ? corpoProduto : corpoImagem) +
      "</div>" +
      '<footer class="ed-dialog__acoes">' +
      '<button type="button" class="btn btn--outline" data-ed-action="fechar-banner">Cancelar</button>' +
      '<button type="submit" class="btn btn--solid">Pronto</button>' +
      "</footer></form>";
    qsa('[data-ed="form-banner"] .ed-preview--frame img, [data-ed="form-banner"] [data-ed-foto]').forEach(function mark(img) {
      if (!img.hasAttribute("data-ed-foto")) img.setAttribute("data-ed-foto", "");
    });
    aplicarFotoNosPreviews();
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
    const tipoBanner = qs('input[name="bannerTipo"]:checked', form);
    if (tipoBanner) set("tipo", tipoBanner.value);
    if (form.buscaProduto) b.buscaProduto = form.buscaProduto.value;
    if (form.vistaProdutos) b.vistaProdutos = form.vistaProdutos.value || "grupos";
    if (b.tipo === "produto") {
      const product = products().find((x) => x.slug === b.productSlug) || null;
      const defaults = Jana.productBannerDefaults ? Jana.productBannerDefaults(product) : {};
      if (form.title) {
        const title = form.title.value.trim();
        if (!product || title === defaults.title) setOverride(b, "title", null);
        else setOverride(b, "title", title);
      }
      if (form.description) {
        const description = form.description.value;
        if (!product || description.trim() === defaults.description) {
          const next = Object.assign({}, b.overrides || {});
          delete next.description;
          b.overrides = next;
        } else {
          const next = Object.assign({}, b.overrides || {});
          next.description = description;
          b.overrides = next;
          b.mudou = true;
        }
      }
      if (form.price) {
        const raw = form.price.value.trim();
        if (!raw) setOverride(b, "price", null);
        else {
          const n = parsePreco(raw);
          if (Number.isFinite(n) && n > 0) {
            if (product && hasFixedPrice(product) && n === product.price) setOverride(b, "price", null);
            else setOverride(b, "price", n);
          }
        }
      }
      if (form.url) {
        const url = form.url.value.trim();
        setOverride(b, "url", url || null);
      }
    } else {
      if (form.title) set("title", form.title.value);
      const tipo = qs('input[name="linkTipo"]:checked', form);
      set("linkTipo", tipo ? tipo.value : "nenhum");
      if (form.productSlug) set("productSlug", form.productSlug.value);
      if (form.linkCategory) set("linkCategory", form.linkCategory.value);
      if (form.url) set("url", form.url.value.trim());
    }
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
      const kind = qual === "produto" ? IMG.produto : qual === "pc" ? IMG.bannerPc : IMG.bannerCel;
      const res = await processImage(file, kind);
      const base = (b.original ? b.original.id : "banner").replace(/^slide-/, "").slice(0, 60);
      const suffix = qual === "produto" ? "-foto" : qual === "pc" ? "-pc" : "-cel";
      const path = addPending("assets/carousel", base + suffix, res);
      if (qual === "produto") {
        setOverride(b, "image", path);
      } else if (qual === "pc") {
        b.image = path;
        b.formato = "banner";
        b.avisoPc = proporcaoAviso(res, tam.pc);
        b.mudou = true;
        delete b.imageW900;
        if (res.width > 900) {
          try {
            const narrow = await processImage(file, { maxW: 900, maxH: 20000, alvo: 220 * 1024 });
            const widePath = path.replace(/\.(webp|jpg)$/i, "-w900.$1");
            ED.pending.set(widePath, { blob: narrow.blob, url: URL.createObjectURL(narrow.blob), w: narrow.width, h: narrow.height });
            b.imageW900 = widePath;
          } catch (errWide) {
            delete b.imageW900;
          }
        }
      } else {
        b.imageMobile = path;
        b.avisoCel = proporcaoAviso(res, tam.cel);
        b.mudou = true;
        delete b.imageMobileW900;
        if (res.width > 900) {
          try {
            const narrow = await processImage(file, { maxW: 900, maxH: 20000, alvo: 220 * 1024 });
            const widePath = path.replace(/\.(webp|jpg)$/i, "-w900.$1");
            ED.pending.set(widePath, { blob: narrow.blob, url: URL.createObjectURL(narrow.blob), w: narrow.width, h: narrow.height });
            b.imageMobileW900 = widePath;
          } catch (errWide) {
            delete b.imageMobileW900;
          }
        }
      }
      setStatus("", "");
    } catch (err) {
      setStatus("erro", err.message);
    }
    renderBannerDialog();
  }

  function validarBanner(b) {
    const e = [];
    if (b.tipo === "produto") {
      if (!b.productSlug) e.push({ campo: "productSlug", msg: "Escolha o produto." });
      else {
        const p = products().find((x) => x.slug === b.productSlug);
        if (!p) e.push({ campo: "productSlug", msg: "Este produto não está mais no catálogo. Escolha outro." });
        else {
          const foto = (b.overrides && b.overrides.image) || (p.images && p.images[0]);
          if (!foto) e.push({ campo: "image", msg: "Este produto não tem foto. Escolha uma foto para o banner ou outro produto." });
        }
      }
      if (b.overrides && b.overrides.url) {
        const url = String(b.overrides.url);
        if (!/^https:\/\/[^\s"'<>]+$/i.test(url) && !/^\/?[a-z0-9][a-z0-9\/?=&#._%-]*$/i.test(url)) {
          e.push({ campo: "url", msg: "Escreva um endereço completo, começando com https://, ou um endereço do site." });
        }
      }
      if (qs('[data-ed="form-banner"] [name="price"]')) {
        const raw = qs('[data-ed="form-banner"] [name="price"]').value.trim();
        if (raw) {
          const n = parsePreco(raw);
          if (!Number.isFinite(n) || n <= 0) e.push({ campo: "price", msg: "Escreva um preço válido, ou deixe em branco para usar o do produto." });
        }
      }
    } else {
      if (!b.image) e.push({ campo: "image", msg: "Escolha a imagem para computador." });
      if (!String(b.title || "").trim()) e.push({ campo: "title", msg: "Escreva a descrição da imagem." });
      if (b.linkTipo === "produto" && !b.productSlug) e.push({ campo: "productSlug", msg: "Escolha o produto." });
      if (b.linkTipo === "categoria" && !b.linkCategory) e.push({ campo: "linkCategory", msg: "Escolha a categoria." });
      if (b.linkTipo === "url") {
        if (!/^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/i.test(b.url)) e.push({ campo: "url", msg: "Escreva um endereço completo, começando com https://" });
      }
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
    if (b.pagina !== "home") out.pagina = b.pagina;
    else delete out.pagina;
    if (b.tipo === "produto") {
      out.tipo = "produto";
      out.productSlug = b.productSlug;
      out.linkTipo = "produto";
      const p = products().find((x) => x.slug === b.productSlug);
      const resolved = Jana.resolveProductBanner({ tipo: "produto", productSlug: b.productSlug, overrides: b.overrides }, p);
      out.title = resolved.title;
      delete out.image;
      delete out.imageMobile;
      delete out.linkCategory;
      delete out.url;
      delete out.subtitle;
      delete out.formato;
      const ov = b.overrides && typeof b.overrides === "object" ? Object.assign({}, b.overrides) : {};
      Object.keys(ov).forEach((k) => {
        if (ov[k] == null || ov[k] === "") delete ov[k];
      });
      if (Object.keys(ov).length) out.overrides = ov;
      else delete out.overrides;
    } else {
      out.tipo = "imagem";
      out.title = b.title.trim();
      out.image = b.image;
      if (b.imageMobile) out.imageMobile = b.imageMobile;
      else delete out.imageMobile;
      if (b.imageW900) out.imageW900 = b.imageW900;
      else delete out.imageW900;
      if (b.imageMobileW900) out.imageMobileW900 = b.imageMobileW900;
      else delete out.imageMobileW900;
      delete out.overrides;
      const legacyProduto = b.original && !b.original.linkTipo && !b.original.tipo && b.linkTipo === "produto" && b.productSlug === b.original.productSlug;
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
    }
    const fotoSalva = Jana.fotoForSave ? Jana.fotoForSave(b.foto) : null;
    if (fotoSalva) out.foto = fotoSalva;
    else delete out.foto;
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


  function datasBloqueadasHtml(p) {
    const hojeY = hoje();
    const list = (p.datasBloqueadas || [])
      .slice()
      .map(function withIndex(item, i) { return { item: item, i: i }; })
      .sort(function byDate(a, b) { return String(a.item.data || "").localeCompare(String(b.item.data || "")); })
      .map(function row(entry) {
        const x = entry.item;
        const i = entry.i;
        const passada = x.data && x.data < hojeY;
        return (
          '<li class="ed-bloqueio' + (passada ? " is-passada" : "") + '">' +
          '<div class="ed-linha">' +
          '<label class="ed-field">Data<input type="date" data-bloqueio="' + i + '" data-campo="data" value="' + esc(x.data || "") + '"></label>' +
          '<label class="ed-field">Motivo <span class="ed-opcional">(opcional)</span><input type="text" maxlength="200" data-bloqueio="' + i + '" data-campo="motivo" value="' + esc(x.motivo || "") + '" placeholder="Ex.: Natal, agenda cheia"></label></div>' +
          (passada ? '<p class="ed-dica">Já passou — a cliente não vê esta data no calendário como futura.</p>' : "") +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="bloqueio-remover" data-i="' + i + '">Remover esta data</button></li>'
        );
      })
      .join("");
    return (
      '<div class="ed-bloqueios">' +
      "<h4>Datas específicas bloqueadas</h4>" +
      '<p class="ed-dica">Feriados ou dias com a agenda cheia. Combinam com as pausas acima. A cliente vê essas datas acinzentadas no calendário do pedido.</p>' +
      '<ul class="ed-periodos">' + (list || "") + "</ul>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="bloqueio-novo">+ Adicionar uma data</button></div>'
    );
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
      '<label class="ed-check"><input type="checkbox" name="pausa-fds"' + (p.fimDeSemana ? " checked" : "") + "> <span>Pausar todo domingo</span></label>" +
      (modo !== "aberto" ? '<div class="ed-previa"><span class="ed-previa__rotulo">A cliente vê:</span> «' + esc(pausaPreview(p)) + "»</div>" : "") +
      datasBloqueadasHtml(p) +
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
    } else if (target.hasAttribute("data-bloqueio")) {
      const i = Number(target.getAttribute("data-bloqueio"));
      p.datasBloqueadas = p.datasBloqueadas || [];
      if (p.datasBloqueadas[i]) p.datasBloqueadas[i][target.getAttribute("data-campo")] = target.value;
      rerender = target.getAttribute("data-campo") === "data";
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
    if (tab === "categorias") {
      const list = ED.drafts.categorias.areas || [];
      if (!list.length) return "Deixe pelo menos uma categoria.";
      if (list.length > 30) return "São categorias demais (máximo 30).";
      const slugs = {};
      for (const a of list) {
        if (!String(a.name || "").trim()) return "Toda categoria precisa de nome.";
        if (!a.image) return "«" + (a.name || "Categoria") + "» precisa de uma foto.";
        if (!a.slug || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(a.slug)) return "«" + a.name + "»: endereço inválido.";
        if (slugs[a.slug]) return "Duas categorias não podem ter o mesmo endereço («" + a.slug + "»).";
        slugs[a.slug] = true;
        if (Jana.isReservedAreaSlug && Jana.isReservedAreaSlug(a.slug)) return "«" + a.name + "»: este endereço é reservado pelo site. Escolha outro nome.";
        if (a.productSort && (!Jana.isProductSort || !Jana.isProductSort(a.productSort))) return "«" + a.name + "»: escolha uma ordem dos produtos válida.";
        if (a.productOrder && (!Array.isArray(a.productOrder) || a.productOrder.length > 300)) return "«" + a.name + "»: a lista de ordem dos produtos está inválida.";
      }
    }
    if (tab === "sobre") {
      const sobre = ED.drafts.sobre.sobre;
      for (const [n, w] of (sobre.workGallery || []).entries()) {
        if (typeof w.url !== "string") continue;
        let u = w.url.trim();
        if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
        u = u.replace(/^http:\/\//i, "https://");
        w.url = u;
        if (!u) return "Galeria de trabalhos, foto " + (n + 1) + ": escreva o endereço do link externo ou escolha «Nenhum link».";
        if (!/^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/i.test(u) || u.length > 500) return "Galeria de trabalhos, foto " + (n + 1) + ": o link externo não parece um endereço válido.";
      }
      for (const x of sobre.press || []) {
        if (x.url && !/^https:\/\/\S+\.\S+$/.test(x.url)) return "Imprensa: o link precisa começar com https://";
      }
    }
    if (tab === "faq") {
      const list = (ED.drafts.faq && ED.drafts.faq.items) || [];
      const qMax = Jana.FAQ_QUESTION_MAX || 200;
      const aMax = Jana.FAQ_ANSWER_MAX || 1200;
      const maxItems = Jana.FAQ_MAX_ITEMS || 30;
      if (!list.length) return "Deixe pelo menos uma pergunta frequente.";
      if (list.length > maxItems) return "São perguntas demais (máximo " + maxItems + ").";
      const ids = {};
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const n = i + 1;
        const q = String(item.question || "").trim();
        const a = String(item.answer || "").trim();
        if (!q) return "A pergunta " + n + " está vazia. Escreva a pergunta ou remova o item.";
        if (q.length > qMax) return "A pergunta " + n + " passou de " + qMax + " caracteres.";
        if (!a) return "A resposta " + n + " está vazia. Escreva a resposta ou remova o item.";
        if (a.length > aMax) return "A resposta " + n + " passou de " + aMax + " caracteres.";
        if (!item.id || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(item.id) || ids[item.id]) return "A pergunta " + n + " está com um código inválido. Recarregue a aba e tente de novo.";
        ids[item.id] = true;
      }
    }
    if (tab === "textos") {
      const t = ED.drafts.textos;
      const s = t.site;
      if (!String(s.brandName || "").trim()) return "O nome da loja não pode ficar vazio.";
      if (!/^55\d{10,11}$/.test(String((s.contato || {}).whatsapp || ""))) return "WhatsApp: escreva o número com DDD (ex.: 61 98124-6112).";
      if (!/^[A-Za-z0-9._]{1,60}$/.test(String(((s.contato || {}).instagram || {}).handle || "").replace(/^@/, ""))) return "Instagram: escreva só o nome do perfil, como @janaabreuconfeitaria.";
      if (s.entrega && s.entrega.taxa !== null && !(Number.isFinite(s.entrega.taxa) && s.entrega.taxa >= 0)) return "Taxa de entrega inválida. Use números, ex.: 40 ou 25,50.";
      for (const f of t.sabores.flavors || []) if (!String(f.nome || "").trim()) return "Todo recheio precisa de nome (ou remova o que está vazio).";
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
              ? '<label class="ed-field ed-field--small">Ao tocar, abrir<select data-tx-lista="' + kind + '" data-i="' + i + '" data-campo="productSlug"><option value="">Nenhum link</option>' +
                '<option value="__externo"' + (typeof it.url === "string" && !it.productSlug ? " selected" : "") + ">Link externo (outro site)</option>" +
                '<optgroup label="Produtos da loja">' +
                products()
                  .slice()
                  .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))
                  .map((p) => '<option value="' + esc(p.slug) + '"' + (p.slug === it.productSlug ? " selected" : "") + ">" + esc(p.name) + "</option>")
                  .join("") +
                "</optgroup></select></label>" +
                (typeof it.url === "string" && !it.productSlug
                  ? '<label class="ed-field ed-field--small">Endereço do link<input type="url" inputmode="url" maxlength="500" placeholder="https://..." data-tx-lista="' + kind + '" data-i="' + i + '" data-campo="url" value="' + esc(it.url || "") + '"></label>' +
                    '<p class="ed-dica">Abre em outra aba. Ex.: uma matéria, um vídeo ou o Instagram.</p>'
                  : "")
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
    if (kind === "recheios") {
      const t = ED.drafts.textos;
      return (t.sabores.flavors = t.sabores.flavors || []);
    }
    const s = ED.drafts.sobre && ED.drafts.sobre.sobre;
    if (!s) return [];
    if (kind === "trabalhos") return (s.workGallery = s.workGallery || []);
    if (kind === "instagram") return (s.instagramGallery = s.instagramGallery || []);
    if (kind === "intro") return (s.introPhotos = s.introPhotos || []);
    if (kind === "imprensa") return (s.press = s.press || []);
    return [];
  }

  function renderCurrentEditor() {
    renderTab(ED.tab);
  }


  function categoriasList() {
    return (ED.drafts.categorias && ED.drafts.categorias.areas) || [];
  }

  function pickerProdutosComFoto() {
    return products()
      .filter(function hasImg(p) { return p && (p.images || [])[0]; })
      .slice()
      .sort(function byName(a, b) { return String(a.name || "").localeCompare(b.name || "", "pt-BR"); });
  }

  function produtosDaCategoria(area, modo) {
    const copy = Object.assign({}, area || {});
    if (modo === "") delete copy.productSort;
    else if (modo) copy.productSort = modo;
    return Jana.productsForArea(products(), copy);
  }

  function garantirOrdemManual(area) {
    if (!area) return;
    const atuais = produtosDaCategoria(area, area.productSort === "manual" ? "" : area.productSort).map(function slugOf(p) { return p.slug; });
    if (!Array.isArray(area.productOrder) || !area.productOrder.length) {
      area.productOrder = atuais.slice();
      return;
    }
    const seen = Object.create(null);
    const next = [];
    area.productOrder.forEach(function keep(slug) {
      if (atuais.indexOf(slug) !== -1 && !seen[slug]) {
        next.push(slug);
        seen[slug] = true;
      }
    });
    atuais.forEach(function append(slug) {
      if (!seen[slug]) next.push(slug);
    });
    area.productOrder = next;
  }

  function moverProdutoCategoria(area, slug, dir) {
    garantirOrdemManual(area);
    const list = area.productOrder;
    const i = list.indexOf(slug);
    if (i < 0) return false;
    const j = i + Number(dir);
    if (j < 0 || j >= list.length) return false;
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
    return true;
  }

  function renderCategoriasPreservingScroll() {
    const y = window.scrollY;
    const open = document.activeElement;
    const focusSel = open && open.getAttribute
      ? (open.getAttribute("data-cat-campo") && open.getAttribute("data-id")
        ? '[data-cat-campo="' + open.getAttribute("data-cat-campo") + '"][data-id="' + open.getAttribute("data-id") + '"]'
        : "")
      : "";
    const lists = {};
    qsa("[data-ed-prod-order]").forEach(function store(el) {
      lists[el.getAttribute("data-id")] = el.scrollTop;
    });
    renderCategorias();
    window.scrollTo(0, y);
    Object.keys(lists).forEach(function restore(id) {
      const el = qs('[data-ed-prod-order][data-id="' + id + '"]');
      if (el) el.scrollTop = lists[id];
    });
    if (focusSel) {
      const el = qs(focusSel);
      if (el && el.focus) el.focus();
    }
  }

  function ordemProdutosDica(mode) {
    if (mode === "alfa") return "Os produtos aparecem em ordem alfabética (português, com acentos).";
    if (mode === "preco-asc") return "Do menor preço para o maior. Produtos sem preço ou «Sob consulta» ficam no final.";
    if (mode === "preco-desc") return "Do maior preço para o menor. Produtos sem preço ou «Sob consulta» ficam no final.";
    if (mode === "manual") return "Arraste pela alça ou use os botões para cima e para baixo. Produtos novos entram no final. A ordem vale só nesta categoria.";
    return "Os produtos aparecem na ordem do catálogo (como hoje), até você escolher outra.";
  }

  function precoProdutoRotulo(p) {
    if (Jana.productSortPrice && Jana.productSortPrice(p) != null && Jana.formatBRL) return Jana.formatBRL(p.price);
    return "Sob consulta";
  }

  function renderOrdemProdutos(a) {
    const mode = a.productSort || "";
    const options = [
      ["", "Ordem do catálogo"],
      ["alfa", "Ordem alfabética"],
      ["preco-asc", "Preço: menor primeiro"],
      ["preco-desc", "Preço: maior primeiro"],
      ["manual", "Manual"],
    ]
      .map(function opt(pair) {
        return '<option value="' + esc(pair[0]) + '"' + (mode === pair[0] ? " selected" : "") + ">" + esc(pair[1]) + "</option>";
      })
      .join("");
    let lista = "";
    if (mode === "manual") {
      garantirOrdemManual(a);
      const itens = produtosDaCategoria(a, "manual");
      lista =
        '<ol class="ed-area-prods" data-ed-prod-order data-id="' + esc(a.id) + '">' +
        (itens
          .map(function item(p, i, arr) {
            const img = (p.images && p.images[0]) || "";
            return (
              '<li class="ed-area-prod" data-slug="' + esc(p.slug) + '" data-id="' + esc(a.id) + '">' +
              (img ? imgTag(img, "", "") : '<span class="ed-semfoto" aria-hidden="true"></span>') +
              '<span class="ed-area-prod__info"><strong>' + esc(p.name) + "</strong><span>" + esc(precoProdutoRotulo(p)) + "</span></span>" +
              '<div class="ed-area-prod__acoes">' +
              '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-prod-mover" data-id="' + esc(a.id) + '" data-slug="' + esc(p.slug) + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Subir ' + esc(p.name) + '">↑</button>' +
              '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-prod-mover" data-id="' + esc(a.id) + '" data-slug="' + esc(p.slug) + '" data-dir="1"' + (i === arr.length - 1 ? " disabled" : "") + ' aria-label="Descer ' + esc(p.name) + '">↓</button>' +
              '<button type="button" class="ed-drag" data-ed-drag="area-prod" data-id="' + esc(a.id) + '" data-slug="' + esc(p.slug) + '" aria-label="Arrastar ' + esc(p.name) + ' para reordenar" title="Arrastar para reordenar">⋮⋮</button>' +
              "</div></li>"
            );
          })
          .join("") || '<li class="ed-vazio">Nenhum produto nesta categoria ainda.</li>') +
        "</ol>";
    }
    return (
      '<section class="ed-area__ordem" aria-label="Ordem dos produtos em ' + esc(a.name || "") + '">' +
      '<h4 class="ed-area__ordem-titulo">Ordem dos produtos nesta categoria</h4>' +
      '<label class="ed-field">Como os produtos aparecem<select data-cat-campo="productSort" data-id="' + esc(a.id) + '">' + options + "</select></label>" +
      '<p class="ed-dica">' + ordemProdutosDica(mode) + "</p>" +
      lista +
      "</section>"
    );
  }

  function renderCategorias() {
    const root = qs('[data-ed="categorias"]');
    if (!root || !ED.carregado) return;
    const list = categoriasList().slice().sort(byOrder);
    const cards = list
      .map(function area(a, i, arr) {
        const saz = Jana.isSeasonalArea(a);
        const oculta = a.enabled === false;
        const url = "/" + a.slug + "/";
        const produtosSo = produtosSoNestaCategoria(a);
        const status = oculta
          ? "oculta no site"
          : saz
            ? seasonalStatusText(a, a.ativacao)
            : "visível no site";
        const produtos = pickerProdutosComFoto();
        const busca = a._buscaFoto || "";
        const fold = Jana.foldText ? Jana.foldText(busca) : String(busca || "").toLowerCase();
        const sugeridos = busca
          ? produtos.filter(function match(p) { return (Jana.foldText ? Jana.foldText(p.name) : String(p.name || "").toLowerCase()).indexOf(fold) !== -1; }).slice(0, 20)
          : produtos.slice(0, 12);
        return (
          '<li class="ed-card ed-area' + (oculta ? " ed-area--oculta" : "") + '">' +
          '<div class="ed-area__foto">' +
          imgTag(a.image, a.name || "", "") +
          '<div class="ed-foto__acoes">' +
          '<label class="btn btn--small btn--outline ed-arquivo">Enviar foto<input type="file" accept="image/*" data-ed-file="area" data-id="' + esc(a.id) + '"></label>' +
          (a.image ? '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-foto-remover" data-id="' + esc(a.id) + '">Remover foto</button>' : "") +
          "</div>" +
          '<details class="ed-area__pick">' +
          "<summary>Usar foto de um produto</summary>" +
          '<label class="ed-field ed-field--small">Buscar produto<input type="search" data-cat-campo="buscaFoto" data-id="' + esc(a.id) + '" value="' + esc(busca) + '" placeholder="Nome do produto"></label>' +
          '<div class="ed-picks ed-picks--mini" role="list">' +
          sugeridos
            .map(function item(p) {
              return (
                '<button type="button" class="ed-pick" data-ed-action="area-foto-produto" data-id="' + esc(a.id) + '" data-src="' + esc(p.images[0]) + '" aria-label="Usar foto de ' + esc(p.name) + '">' +
                imgTag(p.images[0], "", "") +
                "<span>" + esc(p.name) + "</span></button>"
              );
            })
            .join("") +
          (sugeridos.length ? "" : '<p class="ed-dica">Nenhum produto encontrado.</p>') +
          "</div></details></div>" +
          '<div class="ed-area__campos">' +
          '<p class="ed-dica">Endereço da página: <code>' + esc(url) + "</code> · " + esc(status) +
          (saz ? " (data comemorativa — liga e desliga na aba Datas)" : "") + "</p>" +
          '<label class="ed-field">Nome<input type="text" maxlength="80" data-cat-campo="name" data-id="' + esc(a.id) + '" value="' + esc(a.name) + '"></label>' +
          '<label class="ed-field">Descrição <span class="ed-opcional">(opcional; aparece no topo da página da categoria)</span>' +
          '<textarea rows="2" maxlength="800" data-cat-campo="description" data-id="' + esc(a.id) + '">' + esc(a.description || "") + "</textarea></label>" +
          renderOrdemProdutos(a) +
          '<div class="ed-foto__acoes">' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-mover" data-id="' + esc(a.id) + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Mover ' + esc(a.name) + ' para antes">◀ Antes</button>' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-mover" data-id="' + esc(a.id) + '" data-dir="1"' + (i === arr.length - 1 ? " disabled" : "") + ' aria-label="Mover ' + esc(a.name) + ' para depois">Depois ▶</button>' +
          (saz
            ? ""
            : '<button type="button" class="btn btn--small btn--outline" data-ed-action="area-ocultar" data-id="' + esc(a.id) + '">' + (oculta ? "Mostrar no site" : "Ocultar no site") + "</button>") +
          (saz
            ? ""
            : '<button type="button" class="btn btn--small btn--danger" data-ed-action="area-excluir" data-id="' + esc(a.id) + '">Excluir</button>') +
          "</div>" +
          (produtosSo.length
            ? '<p class="ed-dica">Atenção: ' + produtosSo.length + " produto(s) só estão nesta categoria (ex.: " + esc(produtosSo[0].name) + ").</p>"
            : "") +
          "</div></li>"
        );
      })
      .join("");
    const nova = ED.novaCategoria || { name: "", description: "", image: "" };
    const slugPrev = Jana.slugifyArea
      ? Jana.slugifyArea(nova.name, list.map(function idOf(a) { return a.slug; }))
      : "";
    root.innerHTML =
      '<section class="ed-secao" aria-labelledby="cat-lista"><h3 id="cat-lista">Categorias do site</h3>' +
      '<p class="ed-dica">A ordem aqui é a das caixinhas da página inicial e do menu Categorias. A foto aparece na caixinha. A ordem dos produtos vale na página de cada categoria (incluindo Natal e Páscoa). Natal e Páscoa ligam e desligam na aba Datas; não dá para excluí-las.</p>' +
      '<ol class="ed-areas">' + (cards || '<li class="ed-vazio">Nenhuma categoria ainda.</li>') + "</ol></section>" +
      '<section class="ed-secao" aria-labelledby="cat-nova"><h3 id="cat-nova">Nova categoria</h3>' +
      '<label class="ed-field">Nome<input type="text" maxlength="80" data-cat-nova="name" value="' + esc(nova.name) + '" placeholder="Ex.: Sobremesas"></label>' +
      (nova.name ? '<p class="ed-dica">Endereço: <code>/' + esc(slugPrev) + "/</code></p>" : '<p class="ed-dica">O endereço da página é criado automaticamente a partir do nome, em português (sem acento).</p>') +
      '<label class="ed-field">Descrição <span class="ed-opcional">(opcional)</span><textarea rows="2" maxlength="800" data-cat-nova="description">' + esc(nova.description || "") + "</textarea></label>" +
      '<div class="ed-area__foto">' + imgTag(nova.image, "", "") +
      '<label class="btn btn--small btn--outline ed-arquivo">Escolher foto<input type="file" accept="image/*" data-ed-file="area-nova"></label></div>' +
      '<button type="button" class="btn btn--solid" data-ed-action="area-criar">Adicionar categoria</button></section>';
  }

  function onCategoriasInput(target) {
    const list = categoriasList();
    if (target.hasAttribute("data-cat-campo")) {
      const a = list.find((x) => x.id === target.getAttribute("data-id"));
      if (!a) return;
      const campo = target.getAttribute("data-cat-campo");
      if (campo === "productSort") {
        const value = target.value;
        const anterior = a.productSort || "";
        if (value === "manual" && (!Array.isArray(a.productOrder) || !a.productOrder.length)) {
          a.productOrder = produtosDaCategoria(a, anterior).map(function slugOf(item) { return item.slug; });
        }
        if (!value) delete a.productSort;
        else a.productSort = value;
        if (value === "manual") garantirOrdemManual(a);
        renderCategoriasPreservingScroll();
        const el = qs('[data-cat-campo="productSort"][data-id="' + a.id + '"]');
        if (el) el.focus();
        updateSavebar();
        return;
      }
      if (campo === "buscaFoto") {
        a._buscaFoto = target.value;
        renderCategorias();
        const el = qs('[data-cat-campo="buscaFoto"][data-id="' + a.id + '"]');
        if (el) {
          el.focus();
          const v = el.value;
          el.setSelectionRange(v.length, v.length);
        }
        return;
      }
      a[campo] = target.value;
    } else if (target.hasAttribute("data-cat-nova")) {
      ED.novaCategoria = ED.novaCategoria || { name: "", description: "", image: "" };
      ED.novaCategoria[target.getAttribute("data-cat-nova")] = target.value;
      if (target.getAttribute("data-cat-nova") === "name") {
        renderCategorias();
        const el = qs('[data-cat-nova="name"]');
        if (el) {
          el.focus();
          const v = el.value;
          el.setSelectionRange(v.length, v.length);
        }
        return;
      }
    }
    updateSavebar();
  }

  async function criarCategoria() {
    const nova = ED.novaCategoria || {};
    const name = String(nova.name || "").trim();
    if (!name) {
      setStatus("erro", "Escreva o nome da nova categoria.");
      return;
    }
    if (!nova.image) {
      setStatus("erro", "A nova categoria precisa de uma foto (envie uma imagem ou use a foto de um produto depois de criar).");
      return;
    }
    const list = categoriasList();
    const taken = list.map(function s(a) { return a.slug; }).concat(list.map(function s(a) { return a.id; }));
    const slug = Jana.slugifyArea(name, taken);
    if (Jana.isReservedAreaSlug(slug)) {
      setStatus("erro", "Este nome gera um endereço reservado pelo site. Escolha outro.");
      return;
    }
    list.push({
      id: slug,
      slug: slug,
      name: name,
      description: String(nova.description || "").trim(),
      image: nova.image,
      sourceCategoryIds: [slug],
      order: list.length + 1,
    });
    list.forEach(function ord(a, i) { a.order = i + 1; });
    ED.novaCategoria = { name: "", description: "", image: "" };
    renderCategorias();
    updateSavebar();
    setStatus("", "Categoria «" + name + "» adicionada. Toque em Salvar e publicar para ela aparecer no site.");
  }

  function renderSobreTab() {
    const root = qs('[data-ed="sobre"]');
    if (!root || !ED.carregado) return;
    const sobre = ED.drafts.sobre.sobre;
    sobre.portrait = sobre.portrait || { src: "", alt: "Jana Abreu" };
    const imprensa = (sobre.press || [])
      .map(
        (x, i) =>
          '<li class="ed-card"><div class="ed-imprensa-foto">' +
          (x.image ? imgTag(x.image, x.alt || "", "ed-imprensa-foto__img") : '<span class="ed-semfoto">sem miniatura</span>') +
          '<div class="ed-linha">' +
          '<label class="btn btn--outline btn--small ed-arquivo">' + (x.image ? "Trocar miniatura" : "Enviar miniatura") +
          '<input type="file" accept="image/*" data-ed-file="tx-imprensa" data-i="' + i + '"></label>' +
          (x.image ? '<button type="button" class="btn btn--small btn--danger" data-ed-action="imprensa-foto-remover" data-i="' + i + '">Remover miniatura</button>' : "") +
          "</div></div>" +
          '<div class="ed-linha">' +
          '<label class="ed-field">Título<input type="text" maxlength="200" data-tx-lista="imprensa" data-i="' + i + '" data-campo="title" value="' + esc(x.title || "") + '"></label>' +
          '<label class="ed-field">Veículo<input type="text" maxlength="120" data-tx-lista="imprensa" data-i="' + i + '" data-campo="outlet" value="' + esc(x.outlet || "") + '"></label></div>' +
          '<label class="ed-field">Link <span class="ed-opcional">(opcional)</span><input type="url" inputmode="url" placeholder="https://…" data-tx-lista="imprensa" data-i="' + i + '" data-campo="url" value="' + esc(x.url || "") + '"></label>' +
          '<label class="ed-field">Descrição da miniatura <span class="ed-opcional">(opcional)</span><input type="text" maxlength="200" data-tx-lista="imprensa" data-i="' + i + '" data-campo="alt" value="' + esc(x.alt || "") + '"></label>' +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="tx-remover" data-lista="imprensa" data-i="' + i + '">Remover</button></li>'
      )
      .join("");
    root.innerHTML =
      '<section class="ed-secao" aria-labelledby="sb-abertura"><h3 id="sb-abertura">Sobre nós</h3>' +
      '<p class="ed-dica">Campos vazios não aparecem no site. Escreva só o que for real — não invente biografia, datas ou veículos.</p>' +
      campo("Abertura", "sobre.lead", sobre.lead, { area: true, max: 2000, opcional: true }) +
      '<fieldset class="ed-grupo"><legend>Foto da Jana <span class="ed-opcional">(opcional)</span></legend>' +
      (sobre.portrait.src ? '<div class="ed-retrato">' + imgTag(sobre.portrait.src, "", "") + "</div>" : "") +
      '<div class="ed-linha"><label class="btn btn--outline btn--small ed-arquivo">' + (sobre.portrait.src ? "Trocar foto" : "Escolher foto") + '<input type="file" accept="image/*" data-ed-file="retrato"></label>' +
      (sobre.portrait.src ? '<button type="button" class="btn btn--small btn--danger" data-ed-action="retrato-remover">Remover foto</button>' : "") + "</div>" +
      campo("Descrição da foto", "sobre.portrait.alt", sobre.portrait.alt, { max: 200 }) + "</fieldset>" +
      campo("História", "sobre.story", (sobre.story || []).join("\n\n"), { area: true, rows: 7, tipo: "paragrafos", opcional: true, dica: "Deixe uma linha em branco entre os parágrafos." }) +
      "</section>" +
      '<section class="ed-secao" aria-labelledby="sb-intro"><h3 id="sb-intro">Acima de Trabalhos</h3>' +
      '<p class="ed-dica">Texto e fotos que aparecem na página Sobre nós, acima da seção Trabalhos. Se a lista de fotos estiver vazia e o texto também, o bloco não aparece.</p>' +
      campo("Texto", "sobre.introText", sobre.introText, { area: true, rows: 4, max: 4000, opcional: true }) +
      listaFotos("intro", sobre.introPhotos || [], { alt: true, multiplo: true }) +
      "</section>" +
      '<fieldset class="ed-grupo"><legend>Galeria de trabalhos</legend><p class="ed-dica">Aparecem em carrossel na página Sobre nós, numa fileira só. A ordem da lista é a ordem das fotos.</p>' + listaFotos("trabalhos", sobre.workGallery || [], { alt: true, produto: true, multiplo: true }) + "</fieldset>" +
      '<fieldset class="ed-grupo"><legend>Na imprensa</legend><p class="ed-dica">Cada matéria pode ter uma miniatura (aparece no card de Sobre nós). Se ficar sem foto, o card sai só com o texto.</p><ul class="ed-imprensa">' + imprensa + "</ul>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="tx-novo" data-lista="imprensa">+ Adicionar matéria</button></fieldset>' +
      '<fieldset class="ed-grupo"><legend>Fotos da faixa do Instagram</legend><p class="ed-dica">Aparecem em destaque em Sobre nós e levam para o perfil.</p>' +
      listaFotos("instagram", (sobre.instagramGallery || []).map(function wrap(src) { return { src: src }; }), { multiplo: true }) + "</fieldset>";
  }

  function onSobreInput(target) {
    const s = ED.drafts.sobre.sobre;
    if (target.hasAttribute("data-tx")) {
      const path = target.getAttribute("data-tx");
      const tipo = target.getAttribute("data-tipo");
      const obj = { sobre: s };
      const root = path.split(".")[0];
      const rest = path.slice(root.length + 1);
      let value = target.value;
      if (tipo === "paragrafos") {
        value = value
          .split(/\n\s*\n/)
          .map((x) => x.trim())
          .filter(Boolean);
      }
      setPath(obj[root], rest, value);
    } else if (target.hasAttribute("data-tx-lista")) {
      const list = txLista(target.getAttribute("data-tx-lista"));
      const item = list[Number(target.getAttribute("data-i"))];
      const campoNome = target.getAttribute("data-campo");
      if (campoNome === "productSlug") {
        const antes = typeof item.url === "string" ? "__externo" : item.productSlug || "";
        if (target.value === "__externo") {
          delete item.productSlug;
          if (typeof item.url !== "string") item.url = "";
        } else if (target.value) {
          item.productSlug = target.value;
          delete item.url;
        } else {
          delete item.productSlug;
          delete item.url;
        }
        const depois = typeof item.url === "string" ? "__externo" : item.productSlug || "";
        if ((antes === "__externo") !== (depois === "__externo")) {
          const base = '[data-tx-lista="' + target.getAttribute("data-tx-lista") + '"][data-i="' + target.getAttribute("data-i") + '"]';
          renderSobreTab();
          const foco = qs(base + '[data-campo="url"]') || qs(base + '[data-campo="productSlug"]');
          if (foco) foco.focus();
        }
      } else if (campoNome === "url") item.url = target.value.trim();
      else item[campoNome] = target.value;
    }
    updateSavebar();
  }

  function faqItems() {
    return (ED.drafts.faq && ED.drafts.faq.items) || [];
  }

  function newFaqId(list) {
    const seen = Object.create(null);
    (list || []).forEach(function mark(item) {
      if (item && item.id) seen[item.id] = true;
    });
    let n = 1;
    let id = "faq-" + n;
    while (seen[id]) {
      n += 1;
      id = "faq-" + n;
    }
    return id;
  }

  function renderFaqTab() {
    const root = qs('[data-ed="faq"]');
    if (!root || !ED.carregado) return;
    const list = faqItems();
    const qMax = Jana.FAQ_QUESTION_MAX || 200;
    const aMax = Jana.FAQ_ANSWER_MAX || 1200;
    const maxItems = Jana.FAQ_MAX_ITEMS || 30;
    const rows = list
      .map(function row(item, i) {
        return (
          '<li class="ed-faq-item" data-id="' +
          esc(item.id) +
          '">' +
          '<button type="button" class="ed-drag" data-ed-drag="faq" data-id="' +
          esc(item.id) +
          '" aria-label="Arrastar para reordenar">⋮⋮</button>' +
          '<div class="ed-faq-item__fields">' +
          '<label class="ed-field">Pergunta <span class="ed-obrigatorio">(obrigatório)</span>' +
          '<input type="text" maxlength="' +
          qMax +
          '" data-faq-campo="question" data-id="' +
          esc(item.id) +
          '" value="' +
          esc(item.question || "") +
          '"></label>' +
          '<label class="ed-field">Resposta <span class="ed-obrigatorio">(obrigatório)</span>' +
          '<textarea rows="4" maxlength="' +
          aMax +
          '" data-faq-campo="answer" data-id="' +
          esc(item.id) +
          '">' +
          esc(item.answer || "") +
          "</textarea></label></div>" +
          '<div class="ed-faq-item__acoes">' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="faq-mover" data-id="' +
          esc(item.id) +
          '" data-dir="-1"' +
          (i === 0 ? " disabled" : "") +
          ' aria-label="Subir pergunta">↑</button>' +
          '<button type="button" class="btn btn--small btn--outline" data-ed-action="faq-mover" data-id="' +
          esc(item.id) +
          '" data-dir="1"' +
          (i === list.length - 1 ? " disabled" : "") +
          ' aria-label="Descer pergunta">↓</button>' +
          '<button type="button" class="btn btn--small btn--danger" data-ed-action="faq-remover" data-id="' +
          esc(item.id) +
          '">Remover</button></div></li>'
        );
      })
      .join("");
    root.innerHTML =
      '<section class="ed-bloco">' +
      '<p class="ed-dica">Estas perguntas aparecem na página «Perguntas frequentes» do site e no Google. A pergunta e a resposta são obrigatórias. Você pode reordenar com as setas ou arrastando. Máximo de ' +
      maxItems +
      " perguntas.</p>" +
      (rows ? '<ol class="ed-faq-lista" data-ed-faq-order>' + rows + "</ol>" : '<p class="ed-vazio">Nenhuma pergunta ainda. Adicione a primeira.</p>') +
      '<button type="button" class="btn btn--solid" data-ed-action="faq-novo"' +
      (list.length >= maxItems ? " disabled" : "") +
      ">Adicionar pergunta</button></section>";
  }

  function renderFaqPreserving(focusId, focusCampo, selStart) {
    const root = qs('[data-ed="faq"]');
    const scroll = root ? root.scrollTop : 0;
    renderFaqTab();
    if (root) root.scrollTop = scroll;
    if (!focusId || !focusCampo) return;
    const el = qs('[data-ed="faq"] [data-faq-campo="' + focusCampo + '"][data-id="' + CSS.escape(focusId) + '"]');
    if (!el) return;
    el.focus();
    try {
      if (typeof selStart === "number") el.setSelectionRange(selStart, selStart);
    } catch (err) {}
  }

  function onFaqInput(target) {
    const id = target.getAttribute("data-id");
    const campo = target.getAttribute("data-faq-campo");
    const item = faqItems().find(function find(x) {
      return x.id === id;
    });
    if (!item || (campo !== "question" && campo !== "answer")) return;
    item[campo] = target.value;
    updateSavebar();
  }

  function moverFaq(id, dir) {
    const list = faqItems();
    const i = list.findIndex(function find(x) {
      return x.id === id;
    });
    if (!moverItem(list, i, Number(dir))) return false;
    ED.drafts.faq.items = list;
    renderFaqPreserving(id, "question");
    updateSavebar();
    return true;
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
    const taxaNull = s.entrega.taxa === null || s.entrega.taxa === undefined;
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
      campo("Endereço no rodapé", "site.footerAddress", s.footerAddress, { max: 200, opcional: true, dica: "Aparece no rodapé, com o mapa. Se ficar vazio, o bloco do endereço e do mapa não aparece." }) +
      campo("Busca do mapa", "site.footerMapQuery", s.footerMapQuery, { max: 200, opcional: true, dica: "Texto enviado ao Google Maps (sem chave de API). Se ficar vazio, usamos o nome da loja e o endereço." }) +
      "</section>" +
      '<section class="ed-secao" aria-labelledby="tx-enc"><h3 id="tx-enc">Encomendas e entrega</h3>' +
      '<div class="ed-linha">' +
      campo("Taxa de entrega (R$)", "site.entrega.taxa", taxaNull ? "" : precoTexto(s.entrega.taxa) || "0", { tipo: "taxa", inputmode: "decimal", disabled: taxaNull }) +
      '<label class="ed-check ed-check--meio"><input type="checkbox" data-tx-taxa-null' + (taxaNull ? " checked" : "") + "> <span>A combinar com a Jana</span></label></div>" +
      campo("Aviso no carrinho", "site.requestDisclaimer", s.requestDisclaimer, { area: true, max: 800, dica: "Aparece acima do botão de enviar a encomenda, quando a cliente ainda não escolheu Pix ou cartão." }) +
      campo("Texto sobre os dados da cliente", "site.privacyNote", s.privacyNote, { area: true, max: 800, dica: "Aparece no carrinho, perto dos dados que a cliente preenche." }) +
      campo("Texto sobre o pagamento", "site.paymentsNote", s.paymentsNote, { area: true, max: 800, dica: "Aparece sempre no carrinho, com qualquer forma de pagamento. Se ficar vazio, não aparece." }) +
      campo("Aviso ao escolher Pix", "site.pixDisclaimer", s.pixDisclaimer, { area: true, max: 800, dica: "Aparece no carrinho quando a cliente escolhe pagar com Pix. Se ficar vazio, não aparece." }) +
      campo("Instrução na caixa do QR Pix", "site.pixNote", s.pixNote, { area: true, max: 800, dica: "Aparece dentro da caixa do QR Code do Pix, no carrinho. Se ficar vazio, não aparece." }) +
      campo("Aviso ao escolher cartão", "site.paidDisclaimer", s.paidDisclaimer, { area: true, max: 800, dica: "Aparece no carrinho quando a cliente escolhe pagar com cartão, e também na mensagem do WhatsApp depois do pagamento. Se ficar vazio, não aparece." }) +
      "</section>" +
      '<section class="ed-secao" aria-labelledby="tx-recheios"><h3 id="tx-recheios">Recheios de bolo</h3>' +
      '<p class="ed-dica">Aparecem para a cliente escolher em todos os produtos da categoria Bolos.</p>' +
      campo("Título da escolha", "sabores.label", t.sabores.label, { max: 80 }) +
      '<ol class="ed-recheios">' + recheios + "</ol>" +
      '<button type="button" class="btn btn--outline btn--small" data-ed-action="tx-novo" data-lista="recheios">+ Adicionar recheio</button></section>' +
      '<section class="ed-secao"><h3>Categorias e Sobre nós</h3>' +
      '<p class="ed-dica">As fotos, o nome e as novas categorias editam-se na aba <button type="button" class="btn btn--small btn--outline" data-ed-action="ir-aba" data-tab="categorias">Categorias</button>. O texto e as fotos de Sobre nós (incluindo a faixa do Instagram) editam-se na aba <button type="button" class="btn btn--small btn--outline" data-ed-action="ir-aba" data-tab="sobre">Sobre nós</button>.</p></section>';
  }

  function onTextosInput(target) {
    const t = ED.drafts.textos;
    if (target.hasAttribute("data-tx")) {
      const path = target.getAttribute("data-tx");
      const tipo = target.getAttribute("data-tipo");
      const obj = { site: t.site, sabores: t.sabores };
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
    setStatus("salvando", "Preparando a imagem…");
    const erros = [];
    for (const file of files) {
      try {
        if (kind === "area") {
          const id = input.getAttribute("data-id");
          const res = await processImage(file, IMG.area);
          const a = categoriasList().find((x) => x.id === id);
          if (a) a.image = addPending("assets/areas", id, res);
        } else if (kind === "area-nova") {
          const res = await processImage(file, IMG.area);
          ED.novaCategoria = ED.novaCategoria || { name: "", description: "", image: "" };
          ED.novaCategoria.image = addPending("assets/areas", "nova", res);
        } else if (kind === "retrato") {
          const res = await processImage(file, IMG.sobre);
          ED.drafts.sobre.sobre.portrait.src = addPending("assets/sobre", "jana", res);
        } else if (kind === "tx-trabalhos") {
          const res = await processImage(file, IMG.sobre);
          txLista("trabalhos").push({ src: addPending("assets/sobre", "trabalho", res), alt: "" });
        } else if (kind === "tx-intro") {
          const res = await processImage(file, IMG.sobre);
          txLista("intro").push({ src: addPending("assets/sobre", "intro", res), alt: "" });
        } else if (kind === "tx-instagram") {
          const res = await processImage(file, IMG.area);
          txLista("instagram").push(addPending("assets/sobre", "instagram", res));
        } else if (kind === "tx-imprensa") {
          const i = Number(input.getAttribute("data-i"));
          const res = await processImage(file, IMG.sobre);
          const list = txLista("imprensa");
          if (list[i]) list[i].image = addPending("assets/sobre", "imprensa", res);
        }
      } catch (err) {
        erros.push(err.message);
      }
    }
    setStatus(erros.length ? "erro" : "", erros.join(" "));
    renderCurrentEditor();
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
      case "banner-escolher-produto":
        escolherProdutoBanner(el.getAttribute("data-slug"));
        break;
      case "banner-trocar-produto":
        lerBannerForm();
        ED.banner.trocandoProduto = true;
        ED.banner.buscaProduto = "";
        renderBannerDialog();
        {
          const busca = qs('[data-ed="form-banner"] [name="buscaProduto"]');
          if (busca) busca.focus();
        }
        break;
      case "banner-reverter":
        reverterCampoBanner(el.getAttribute("data-campo"));
        break;
      case "banner-foto-nudge":
        event.preventDefault();
        setFotoCampo(el.getAttribute("data-eixo"), Jana.normalizeFoto(ED.banner && ED.banner.foto)[el.getAttribute("data-eixo")] + Number(el.getAttribute("data-delta")));
        break;
      case "banner-foto-zoom":
        event.preventDefault();
        setFotoCampo("zoom", Jana.normalizeFoto(ED.banner && ED.banner.foto).zoom + Number(el.getAttribute("data-delta")));
        break;
      case "banner-foto-restaurar-enquadramento":
        event.preventDefault();
        restaurarFoto("enquadramento");
        break;
      case "banner-foto-restaurar-ajustes":
        event.preventDefault();
        restaurarFoto("ajustes");
        break;
      case "banner-foto-reset":
        event.preventDefault();
        restaurarFoto(el.getAttribute("data-campo"));
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
      case "bloqueio-novo":
        ED.drafts.datas.pausa.datasBloqueadas = ED.drafts.datas.pausa.datasBloqueadas || [];
        ED.drafts.datas.pausa.datasBloqueadas.push({ data: "", motivo: "" });
        renderDatas();
        updateSavebar();
        {
          const last = qsa("[data-bloqueio][data-campo='data']").pop();
          if (last) last.focus();
        }
        break;
      case "bloqueio-remover":
        ED.drafts.datas.pausa.datasBloqueadas = ED.drafts.datas.pausa.datasBloqueadas || [];
        ED.drafts.datas.pausa.datasBloqueadas.splice(Number(el.getAttribute("data-i")), 1);
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
      case "ir-aba": {
        const dest = el.getAttribute("data-tab");
        const btn = qs('.painel-tabs [data-tab="' + dest + '"]');
        if (btn) btn.click();
        break;
      }
      case "faq-novo": {
        const list = faqItems();
        const maxItems = Jana.FAQ_MAX_ITEMS || 30;
        if (list.length >= maxItems) break;
        list.push({ id: newFaqId(list), question: "", answer: "" });
        ED.drafts.faq.items = list;
        renderFaqTab();
        updateSavebar();
        {
          const last = qsa('[data-ed="faq"] [data-faq-campo="question"]').pop();
          if (last) last.focus();
        }
        break;
      }
      case "faq-remover": {
        const list = faqItems();
        const i = list.findIndex(function find(x) { return x.id === id; });
        if (i === -1) break;
        const ok = await confirmar({
          titulo: "Remover esta pergunta?",
          texto: "Ela sai da página de perguntas frequentes quando você salvar.",
          botao: "Remover pergunta",
          perigo: true,
        });
        if (ok) {
          list.splice(i, 1);
          ED.drafts.faq.items = list;
          renderFaqTab();
          updateSavebar();
        }
        break;
      }
      case "faq-mover":
        moverFaq(id, el.getAttribute("data-dir"));
        break;
      case "area-mover": {
        const list = categoriasList().slice().sort(byOrder);
        const i = list.findIndex((a) => a.id === id);
        if (moverItem(list, i, Number(el.getAttribute("data-dir")))) {
          list.forEach((a, k) => (a.order = k + 1));
          ED.drafts.categorias.areas = list;
          renderCategorias();
          updateSavebar();
        }
        break;
      }
      case "area-prod-mover": {
        const a = categoriasList().find((x) => x.id === id);
        if (a && moverProdutoCategoria(a, el.getAttribute("data-slug"), el.getAttribute("data-dir"))) {
          a.productSort = "manual";
          renderCategoriasPreservingScroll();
          updateSavebar();
        }
        break;
      }
      case "area-criar":
        criarCategoria();
        break;
      case "area-foto-produto": {
        const a = categoriasList().find((x) => x.id === id);
        if (a) {
          a.image = el.getAttribute("data-src");
          renderCategorias();
          updateSavebar();
        }
        break;
      }
      case "area-foto-remover": {
        const a = categoriasList().find((x) => x.id === id);
        if (!a) break;
        const ok = await confirmar({ titulo: "Remover a foto?", texto: "A categoria precisa de uma foto para ser publicada. Escolha outra antes de salvar.", botao: "Remover foto", perigo: true });
        if (ok) {
          a.image = "";
          renderCategorias();
          updateSavebar();
        }
        break;
      }
      case "area-ocultar": {
        const a = categoriasList().find((x) => x.id === id);
        if (!a || Jana.isSeasonalArea(a)) break;
        a.enabled = a.enabled === false ? true : false;
        if (a.enabled) delete a.enabled;
        renderCategorias();
        updateSavebar();
        break;
      }
      case "area-excluir": {
        const list = categoriasList();
        const a = list.find((x) => x.id === id);
        if (!a || Jana.isSeasonalArea(a)) break;
        const so = produtosSoNestaCategoria(a);
        const extra = so.length
          ? " Atenção: " + so.length + " produto(s) só estão nesta categoria (ex.: «" + so[0].name + "»). Eles ficam sem categoria no site até você escolher outra."
          : "";
        const ok = await confirmar({
          titulo: "Excluir a categoria «" + a.name + "»?",
          texto: "Ela sai do menu e da página inicial quando você tocar em Salvar e publicar." + extra,
          botao: "Excluir categoria",
          perigo: true,
        });
        if (ok) {
          ED.drafts.categorias.areas = list.filter((x) => x.id !== id);
          ED.drafts.categorias.areas.forEach(function ord(item, i) { item.order = i + 1; });
          renderCategorias();
          updateSavebar();
        }
        break;
      }
      case "tx-mover":
        if (moverItem(txLista(el.getAttribute("data-lista")), Number(el.getAttribute("data-i")), Number(el.getAttribute("data-dir")))) {
          renderCurrentEditor();
          updateSavebar();
        }
        break;
      case "tx-remover": {
        const ok = await confirmar({ titulo: "Remover este item?", texto: "Ele sai do site quando você tocar em Salvar e publicar.", botao: "Remover", perigo: true });
        if (ok) {
          txLista(el.getAttribute("data-lista")).splice(Number(el.getAttribute("data-i")), 1);
          renderCurrentEditor();
          updateSavebar();
        }
        break;
      }
      case "tx-novo": {
        const kind = el.getAttribute("data-lista");
        txLista(kind).push(kind === "recheios" ? { nome: "", descricao: "" } : { title: "", outlet: "", url: "", image: "", alt: "" });
        renderCurrentEditor();
        updateSavebar();
        const foco = qsa('[data-tx-lista="' + kind + '"][data-campo="' + (kind === "recheios" ? "nome" : "title") + '"]');
        if (foco.length) foco[foco.length - 1].focus();
        break;
      }
      case "imprensa-foto-remover": {
        const i = Number(el.getAttribute("data-i"));
        const item = txLista("imprensa")[i];
        if (!item) break;
        const ok = await confirmar({ titulo: "Remover a miniatura?", texto: "A matéria continua no site; só a foto sai quando você tocar em Salvar e publicar.", botao: "Remover miniatura", perigo: true });
        if (ok) {
          item.image = "";
          renderSobreTab();
          updateSavebar();
        }
        break;
      }
      case "retrato-remover": {
        const ok = await confirmar({ titulo: "Remover a foto?", texto: "A foto sai de Sobre nós quando você tocar em Salvar e publicar.", botao: "Remover foto", perigo: true });
        if (ok) {
          ED.drafts.sobre.sobre.portrait.src = "";
          renderSobreTab();
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
    if (t.closest('[data-ed="categorias"]')) {
      if (event.type === "change" && t.type !== "checkbox" && t.tagName !== "SELECT" && t.type !== "search") return;
      if (event.type === "input" && (t.type === "checkbox" || t.tagName === "SELECT")) return;
      onCategoriasInput(t);
      return;
    }
    if (t.closest('[data-ed="sobre"]')) {
      if (event.type === "change" && t.type !== "checkbox" && t.tagName !== "SELECT") return;
      if (event.type === "input" && (t.type === "checkbox" || t.tagName === "SELECT")) return;
      onSobreInput(t);
      return;
    }
    if (t.closest('[data-ed="faq"]')) {
      if (event.type === "change") return;
      onFaqInput(t);
      return;
    }
    if (t.closest('[data-ed="form-produto"]') && event.type === "change" && t.name === "sobConsulta") {
      const preco = qs('[data-ed="form-produto"] [name="preco"]');
      if (preco) preco.disabled = t.checked;
    }
    if (t.closest('[data-ed="form-produto"]') && event.type === "change" && t.name === "pedidoMinimo") {
      const wrap = qs('[data-ed="min-qty-wrap"]');
      const input = qs('[data-ed="form-produto"] [name="minQty"]');
      if (wrap) wrap.hidden = !t.checked;
      if (t.checked && input && !String(input.value || "").trim()) input.value = "2";
    }
    if (t.closest('[data-ed="form-banner"]') && event.type === "change" && t.name === "linkTipo") {
      lerBannerForm();
      renderBannerDialog();
      const r = qs('[data-ed="form-banner"] input[name="linkTipo"][value="' + t.value + '"]');
      if (r) r.focus();
    }
    if (t.closest('[data-ed="form-banner"]') && event.type === "change" && t.name === "bannerTipo") {
      lerBannerForm();
      if (t.value === "produto") {
        ED.banner.linkTipo = "produto";
        ED.banner.formato = "banner";
        if (!ED.banner.productSlug) ED.banner.trocandoProduto = true;
      }
      renderBannerDialog();
      const r = qs('[data-ed="form-banner"] input[name="bannerTipo"][value="' + t.value + '"]');
      if (r) r.focus();
    }
    if (t.closest('[data-ed="form-banner"]') && t.name === "buscaProduto" && event.type === "input") {
      ED.banner.buscaProduto = t.value;
      const start = t.selectionStart;
      const picks = qs('[data-ed="form-banner"] .ed-picks');
      const scroll = picks ? picks.scrollTop : 0;
      renderBannerDialog();
      const el = qs('[data-ed="form-banner"] [name="buscaProduto"]');
      if (el) {
        el.focus();
        try { el.setSelectionRange(start, start); } catch (err) {}
      }
      const picks2 = qs('[data-ed="form-banner"] .ed-picks');
      if (picks2) picks2.scrollTop = scroll;
    }
    if (t.closest('[data-ed="form-banner"]') && t.name === "vistaProdutos" && event.type === "change") {
      ED.banner.vistaProdutos = t.value || "grupos";
      renderBannerDialog();
      const el = qs('[data-ed="form-banner"] input[name="vistaProdutos"][value="' + ED.banner.vistaProdutos + '"]');
      if (el) el.focus();
    }
    if (t.closest('[data-ed="foto-editor"]') && t.getAttribute("data-foto-campo") && (event.type === "input" || event.type === "change")) {
      setFotoCampo(t.getAttribute("data-foto-campo"), t.value);
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
      else if (kind === "banner-produto-foto") bannerArquivo(t, "produto");
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

  let faqDrag = null;

  function onFaqPointerDown(event) {
    const handle = event.target.closest('[data-ed-drag="faq"]');
    if (!handle || (event.pointerType === "mouse" && event.button !== 0)) return false;
    const row = handle.closest(".ed-faq-item");
    const list = handle.closest("[data-ed-faq-order]");
    if (!row || !list) return false;
    faqDrag = {
      pointerId: event.pointerId,
      handle: handle,
      row: row,
      list: list,
      startY: event.clientY,
      moved: false,
    };
    try { handle.setPointerCapture(event.pointerId); } catch (err) {}
    event.preventDefault();
    return true;
  }

  function onFaqPointerMove(event) {
    if (!faqDrag || event.pointerId !== faqDrag.pointerId) return false;
    const drag = faqDrag;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 5) return true;
    drag.moved = true;
    drag.row.classList.add("is-dragging");
    const y = event.clientY;
    const rows = Array.prototype.slice.call(drag.list.querySelectorAll(".ed-faq-item"));
    let placed = false;
    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      if (item === drag.row) continue;
      const box = item.getBoundingClientRect();
      if (y < box.top + box.height / 2) {
        drag.list.insertBefore(drag.row, item);
        placed = true;
        break;
      }
    }
    if (!placed) drag.list.appendChild(drag.row);
    event.preventDefault();
    return true;
  }

  function onFaqPointerUp(event) {
    if (!faqDrag || event.pointerId !== faqDrag.pointerId) return false;
    const drag = faqDrag;
    faqDrag = null;
    drag.row.classList.remove("is-dragging");
    try { drag.handle.releasePointerCapture(event.pointerId); } catch (err) {}
    if (!drag.moved) return true;
    const order = Array.prototype.map.call(drag.list.querySelectorAll(".ed-faq-item[data-id]"), function idOf(row) {
      return row.getAttribute("data-id");
    }).filter(Boolean);
    const byId = Object.create(null);
    faqItems().forEach(function mark(item) { byId[item.id] = item; });
    const next = order.map(function pick(id) { return byId[id]; }).filter(Boolean);
    if (next.length === faqItems().length) ED.drafts.faq.items = next;
    renderFaqTab();
    updateSavebar();
    event.preventDefault();
    return true;
  }

  let areaProdDrag = null;

  function onAreaProdPointerDown(event) {
    const handle = event.target.closest('[data-ed-drag="area-prod"]');
    if (!handle || (event.pointerType === "mouse" && event.button !== 0)) return false;
    const row = handle.closest(".ed-area-prod");
    const list = handle.closest("[data-ed-prod-order]");
    if (!row || !list) return false;
    areaProdDrag = {
      pointerId: event.pointerId,
      handle: handle,
      row: row,
      list: list,
      id: handle.getAttribute("data-id") || list.getAttribute("data-id"),
      slug: handle.getAttribute("data-slug") || row.getAttribute("data-slug"),
      startY: event.clientY,
      moved: false,
    };
    try { handle.setPointerCapture(event.pointerId); } catch (err) {}
    event.preventDefault();
    return true;
  }

  function onAreaProdPointerMove(event) {
    if (!areaProdDrag || event.pointerId !== areaProdDrag.pointerId) return false;
    const drag = areaProdDrag;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 5) return true;
    drag.moved = true;
    drag.row.classList.add("is-dragging");
    const y = event.clientY;
    const rows = Array.prototype.slice.call(drag.list.querySelectorAll(".ed-area-prod"));
    let placed = false;
    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      if (item === drag.row) continue;
      const box = item.getBoundingClientRect();
      if (y < box.top + box.height / 2) {
        drag.list.insertBefore(drag.row, item);
        placed = true;
        break;
      }
    }
    if (!placed) drag.list.appendChild(drag.row);
    event.preventDefault();
    return true;
  }

  function onAreaProdPointerUp(event) {
    if (!areaProdDrag || event.pointerId !== areaProdDrag.pointerId) return false;
    const drag = areaProdDrag;
    areaProdDrag = null;
    drag.row.classList.remove("is-dragging");
    try { drag.handle.releasePointerCapture(event.pointerId); } catch (err) {}
    if (!drag.moved) return true;
    const a = categoriasList().find(function find(x) { return x.id === drag.id; });
    if (a) {
      a.productSort = "manual";
      a.productOrder = Array.prototype.map.call(drag.list.querySelectorAll(".ed-area-prod[data-slug]"), function slugOf(row) {
        return row.getAttribute("data-slug");
      }).filter(Boolean);
      renderCategoriasPreservingScroll();
      updateSavebar();
    }
    event.preventDefault();
    return true;
  }

  let fotoDrag = null;

  function onFotoPointerDown(event) {
    if (onFaqPointerDown(event) || onAreaProdPointerDown(event)) return;
    const frame = event.target.closest("[data-ed-foto-frame]");
    if (!frame || !ED.banner || event.button) return;
    const img = frame.querySelector("img");
    if (!img) return;
    const box = frame.getBoundingClientRect();
    fotoDrag = {
      pointerId: event.pointerId,
      frame: frame,
      img: img,
      startX: event.clientX,
      startY: event.clientY,
      foto: Jana.normalizeFoto(ED.banner.foto),
      width: box.width,
      height: box.height,
    };
    try { frame.setPointerCapture(event.pointerId); } catch (err) {}
    frame.classList.add("is-dragging");
    event.preventDefault();
  }

  function onFotoPointerMove(event) {
    if (onFaqPointerMove(event) || onAreaProdPointerMove(event)) return;
    if (!fotoDrag || event.pointerId !== fotoDrag.pointerId || !ED.banner) return;
    const next = Jana.fotoPanFromDrag(
      fotoDrag.foto,
      event.clientX - fotoDrag.startX,
      event.clientY - fotoDrag.startY,
      fotoDrag.width,
      fotoDrag.height,
      fotoDrag.img.naturalWidth,
      fotoDrag.img.naturalHeight
    );
    ED.banner.foto = next;
    ED.banner.mudou = true;
    aplicarFotoNosPreviews();
    event.preventDefault();
  }

  function onFotoPointerUp(event) {
    if (onFaqPointerUp(event) || onAreaProdPointerUp(event)) return;
    if (!fotoDrag || event.pointerId !== fotoDrag.pointerId) return;
    fotoDrag.frame.classList.remove("is-dragging");
    try { fotoDrag.frame.releasePointerCapture(event.pointerId); } catch (err) {}
    fotoDrag = null;
  }

  function onFotoKeyDown(event) {
    const frame = event.target.closest("[data-ed-foto-frame]");
    if (!frame || !ED.banner) return;
    const f = Jana.normalizeFoto(ED.banner.foto);
    const step = event.shiftKey ? 5 : 2;
    if (event.key === "ArrowUp") setFotoCampo("y", f.y + step);
    else if (event.key === "ArrowDown") setFotoCampo("y", f.y - step);
    else if (event.key === "ArrowLeft") setFotoCampo("x", f.x + step);
    else if (event.key === "ArrowRight") setFotoCampo("x", f.x - step);
    else if (event.key === "+" || event.key === "=") setFotoCampo("zoom", f.zoom + 0.1);
    else if (event.key === "-" || event.key === "_") setFotoCampo("zoom", f.zoom - 0.1);
    else if (event.key === "0") restaurarFoto("enquadramento");
    else return;
    event.preventDefault();
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
    document.addEventListener("pointerdown", onFotoPointerDown);
    document.addEventListener("pointermove", onFotoPointerMove);
    document.addEventListener("pointerup", onFotoPointerUp);
    document.addEventListener("pointercancel", onFotoPointerUp);
    document.addEventListener("keydown", onFotoKeyDown);
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
  global.JanaEditor = { state: ED, applyAreas: applyAreas, parsePreco: parsePreco, slugify: slugify, buildProduto: buildProduto, processImage: processImage, setFotoCampo: setFotoCampo };

  document.addEventListener("DOMContentLoaded", init);
})(window);
