/* Editor de foto reutilizável do painel: enquadramento, zoom, ajustes e export WebP. Sem bibliotecas externas. */
(function startFotoEditor(global) {
  const Jana = global.Jana;
  if (!Jana) return;

  const AJUSTES = [
    ["brilho", "Brilho"],
    ["contraste", "Contraste"],
    ["saturacao", "Saturação"],
    ["vibrancia", "Vibrância"],
    ["gamma", "Gama"],
  ];

  function esc(v) {
    return Jana.escapeHtml(v == null ? "" : v);
  }

  function clampFoto(foto) {
    return Jana.normalizeFoto(foto);
  }

  async function decodeSource(source) {
    if (!source) throw new Error("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
    const type = source.type || "";
    if (type && !/^image\//.test(type) && type !== "application/octet-stream") {
      throw new Error("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
    }
    if (source.size > 30 * 1024 * 1024) throw new Error("A imagem é grande demais (mais de 30 MB).");
    let blob = source;
    if (typeof source === "string") {
      const res = await fetch(source);
      if (!res.ok) throw new Error("Não consegui abrir esta imagem.");
      blob = await res.blob();
    }
    if (global.createImageBitmap) {
      try {
        return await createImageBitmap(blob, { imageOrientation: "from-image" });
      } catch (err) {
        /* cai no <img> */
      }
    }
    const url = blob instanceof Blob ? URL.createObjectURL(blob) : String(source);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch (err) {
      throw new Error("Não consegui abrir esta imagem. Use JPG, PNG ou WebP.");
    } finally {
      if (blob instanceof Blob) setTimeout(function revoke() { URL.revokeObjectURL(url); }, 1000);
    }
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function toBlob(resolve) {
      canvas.toBlob(resolve, type, quality);
    });
  }

  function applyGammaAndVibrance(ctx, w, h, foto) {
    const f = clampFoto(foto);
    const needG = Math.abs(f.gamma - 1) >= 0.0005;
    const needV = Math.abs(f.vibrancia - 1) >= 0.0005;
    if (!needG && !needV) return;
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    const exp = f.gamma;
    const vib = f.vibrancia;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      if (needG) {
        r = Math.pow(r, exp);
        g = Math.pow(g, exp);
        b = Math.pow(b, exp);
      }
      if (needV) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const amount = (vib - 1) * (1 - sat);
        const avg = (r + g + b) / 3;
        r = r + (r - avg) * amount;
        g = g + (g - avg) * amount;
        b = b + (b - avg) * amount;
      }
      data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    }
    ctx.putImageData(img, 0, 0);
  }

  async function compressCanvas(canvas, alvo) {
    let type = "image/webp";
    let quality = 0.86;
    let blob = await canvasBlob(canvas, type, quality);
    if (!blob || blob.type !== "image/webp") {
      type = "image/jpeg";
      blob = await canvasBlob(canvas, type, quality);
    }
    while (blob && blob.size > alvo && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, type, quality);
    }
    if (!blob) throw new Error("Não consegui preparar a imagem neste aparelho.");
    if (blob.size > 1500 * 1024) throw new Error("Mesmo reduzida, a imagem ficou pesada demais. Tente outra.");
    return { blob: blob, ext: type === "image/webp" ? "webp" : "jpg" };
  }

  async function exportEdited(source, opts) {
    const o = opts || {};
    const bitmap = await decodeSource(source);
    const w0 = bitmap.width || bitmap.naturalWidth;
    const h0 = bitmap.height || bitmap.naturalHeight;
    if (!w0 || !h0) {
      if (bitmap.close) bitmap.close();
      throw new Error("Não consegui ler o tamanho da imagem.");
    }
    const ratioW = (o.ratio && o.ratio[0]) || 0;
    const ratioH = (o.ratio && o.ratio[1]) || 0;
    const foto = clampFoto(o.foto);
    let sx = 0;
    let sy = 0;
    let sw = w0;
    let sh = h0;
    if (ratioW && ratioH && Jana.fotoCropRect) {
      const crop = Jana.fotoCropRect(w0, h0, ratioW, ratioH, foto);
      sx = crop.sx;
      sy = crop.sy;
      sw = crop.sw;
      sh = crop.sh;
    } else if (ratioW && ratioH && Jana.coverCropRect) {
      const crop = Jana.coverCropRect(w0, h0, ratioW, ratioH);
      sx = crop.sx;
      sy = crop.sy;
      sw = crop.sw;
      sh = crop.sh;
    }
    const maxW = o.maxW || 1400;
    const maxH = o.maxH || 1400;
    const scale = Math.min(1, maxW / sw, maxH / sh);
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    const css = [];
    if (Math.abs(foto.brilho - 1) >= 0.0005) css.push("brightness(" + foto.brilho + ")");
    if (Math.abs(foto.contraste - 1) >= 0.0005) css.push("contrast(" + foto.contraste + ")");
    if (Math.abs(foto.saturacao - 1) >= 0.0005) css.push("saturate(" + foto.saturacao + ")");
    if (css.length) ctx.filter = css.join(" ");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    ctx.filter = "none";
    applyGammaAndVibrance(ctx, w, h, foto);
    if (bitmap.close) bitmap.close();
    const main = await compressCanvas(canvas, o.alvo || 360 * 1024);
    const out = {
      blob: main.blob,
      ext: main.ext,
      width: w,
      height: h,
      origW: w0,
      origH: h0,
    };
    if (o.alsoW900 && w > 900) {
      const nw = 900;
      const nh = Math.max(1, Math.round((h * nw) / w));
      const narrow = document.createElement("canvas");
      narrow.width = nw;
      narrow.height = nh;
      const nctx = narrow.getContext("2d");
      nctx.fillStyle = "#ffffff";
      nctx.fillRect(0, 0, nw, nh);
      nctx.imageSmoothingQuality = "high";
      nctx.drawImage(canvas, 0, 0, nw, nh);
      try {
        const small = await compressCanvas(narrow, o.w900Alvo || 220 * 1024);
        out.w900 = { blob: small.blob, ext: small.ext, width: nw, height: nh };
      } catch (errWide) {
        out.w900 = null;
      }
    }
    return out;
  }

  function sliderHtml(key, label, foto, prefix) {
    const spec = Jana.FOTO_CAMPOS[key];
    const val = foto[key];
    const id = prefix + key;
    return (
      '<div class="ed-feditor__slider ed-foto__slider"><label for="' +
      id +
      '">' +
      esc(label) +
      '</label><input id="' +
      id +
      '" type="range" min="' +
      spec.min +
      '" max="' +
      spec.max +
      '" step="' +
      spec.step +
      '" value="' +
      val +
      '" data-fe-campo="' +
      key +
      '"><input type="number" inputmode="decimal" min="' +
      spec.min +
      '" max="' +
      spec.max +
      '" step="' +
      spec.step +
      '" value="' +
      val +
      '" data-fe-campo="' +
      key +
      '" aria-label="' +
      esc(label) +
      ' (número)"><button type="button" class="btn btn--outline btn--small ed-foto__reset" data-fe-action="reset-campo" data-campo="' +
      key +
      '" aria-label="Restaurar ' +
      esc(label) +
      '">Restaurar</button></div>'
    );
  }

  function buildDialog(opts, foto) {
    const dialog = document.createElement("dialog");
    dialog.className = "ed-feditor";
    dialog.setAttribute("data-ed", "foto-editor-modal");
    dialog.setAttribute("aria-labelledby", "ed-feditor-titulo");
    const ratio = opts.ratio && opts.ratio[0] && opts.ratio[1] ? opts.ratio : [1, 1];
    const z = Jana.FOTO_CAMPOS.zoom;
    dialog.innerHTML =
      '<form class="ed-feditor__form" data-fe="form" novalidate>' +
      '<header class="ed-feditor__topo">' +
      '<h2 id="ed-feditor-titulo">' +
      esc(opts.title || "Editar foto") +
      "</h2>" +
      '<button type="button" class="ed-fechar" data-fe-action="cancelar" aria-label="Fechar sem aplicar">×</button></header>' +
      '<div class="ed-feditor__corpo">' +
      '<div class="ed-feditor__palco">' +
      '<div class="ed-feditor__frame" data-fe-frame tabindex="0" role="group" aria-label="Enquadramento da foto" style="--fe-rw:' +
      ratio[0] +
      ";--fe-rh:" +
      ratio[1] +
      '"><img alt="Prévia da foto" draggable="false"></div></div>' +
      '<div class="ed-feditor__controles">' +
      (opts.hint ? '<p class="ed-dica">' + esc(opts.hint) + "</p>" : "") +
      '<p class="ed-dica">Arraste para enquadrar. Zoom 1 = sem ampliação; valores acima de 1 ampliam. Roda do mouse ou pinça para o zoom. Teclado: setas, + e −, 0 restaura, Esc cancela.</p>' +
      '<div data-fe="svg" hidden></div>' +
      '<div class="ed-foto__bloco"><p class="ed-foto__rotulo" id="ed-feditor-enq">Enquadramento</p>' +
      '<div class="ed-foto__setas" role="group" aria-labelledby="ed-feditor-enq">' +
      '<button type="button" data-fe-action="nudge" data-dir="up" data-eixo="y" data-delta="2" aria-label="Mover a foto para cima">↑</button>' +
      '<button type="button" data-fe-action="nudge" data-dir="left" data-eixo="x" data-delta="2" aria-label="Mover a foto para a esquerda">←</button>' +
      '<button type="button" data-fe-action="nudge" data-dir="right" data-eixo="x" data-delta="-2" aria-label="Mover a foto para a direita">→</button>' +
      '<button type="button" data-fe-action="nudge" data-dir="down" data-eixo="y" data-delta="-2" aria-label="Mover a foto para baixo">↓</button>' +
      "</div>" +
      '<div class="ed-foto__zoom"><label for="ed-feditor-zoom">Zoom (1 = imagem inteira)</label>' +
      '<button type="button" class="btn btn--outline" data-fe-action="zoom" data-delta="-0.1" aria-label="Diminuir zoom">−</button>' +
      '<input id="ed-feditor-zoom" type="range" min="' +
      z.min +
      '" max="' +
      z.max +
      '" step="' +
      z.step +
      '" value="' +
      foto.zoom +
      '" data-fe-campo="zoom">' +
      '<button type="button" class="btn btn--outline" data-fe-action="zoom" data-delta="0.1" aria-label="Aumentar zoom">+</button>' +
      '<input type="number" inputmode="decimal" min="' +
      z.min +
      '" max="' +
      z.max +
      '" step="' +
      z.step +
      '" value="' +
      foto.zoom +
      '" data-fe-campo="zoom" aria-label="Zoom (número)">' +
      "</div>" +
      '<button type="button" class="btn btn--outline btn--small" data-fe-action="restaurar-enquadramento">Restaurar enquadramento</button></div>' +
      '<div class="ed-foto__bloco"><p class="ed-foto__rotulo">Ajustes</p>' +
      AJUSTES.map(function row(item) {
        return sliderHtml(item[0], item[1], foto, "ed-feditor-");
      }).join("") +
      '<button type="button" class="btn btn--outline btn--small" data-fe-action="restaurar-ajustes">Restaurar ajustes</button>' +
      '<button type="button" class="btn btn--outline btn--small" data-fe-action="restaurar-tudo">Restaurar tudo</button></div></div></div>' +
      '<footer class="ed-feditor__acoes">' +
      '<button type="button" class="btn btn--outline" data-fe-action="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn--solid" data-fe-action="aplicar">Usar foto</button>' +
      "</footer></form>";
    return dialog;
  }

  function applyPreview(dialog, foto, filterId) {
    const img = dialog.querySelector(".ed-feditor__frame img");
    const host = dialog.querySelector('[data-fe="svg"]');
    if (host) host.innerHTML = Jana.fotoNeedsSvgFilter(foto) ? Jana.fotoSvgMarkup(filterId, foto) : "";
    if (img && Jana.applyFotoStyle) Jana.applyFotoStyle(img, foto, filterId);
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-fe-campo]"), function sync(input) {
      const key = input.getAttribute("data-fe-campo");
      if (!key || foto[key] == null) return;
      if (String(input.value) !== String(foto[key])) input.value = foto[key];
    });
  }

  function openEditor(opts) {
    const options = opts || {};
    return new Promise(function run(resolve, reject) {
      let settled = false;
      let foto = clampFoto(options.foto);
      let drag = null;
      let pointers = new Map();
      let pinch = null;
      const filterId = "jana-foto-modal";
      const dialog = buildDialog(options, foto);
      const frame = dialog.querySelector("[data-fe-frame]");
      const img = dialog.querySelector(".ed-feditor__frame img");
      const form = dialog.querySelector("[data-fe=form]");

      function finish(value) {
        if (settled) return;
        settled = true;
        teardown();
        dialog.close();
        dialog.remove();
        resolve(value);
      }

      function fail(err) {
        if (settled) return;
        settled = true;
        teardown();
        if (dialog.open) dialog.close();
        dialog.remove();
        reject(err);
      }

      function setFoto(next) {
        foto = clampFoto(next);
        applyPreview(dialog, foto, filterId);
      }

      function setCampo(key, value) {
        const next = Object.assign({}, foto);
        next[key] = Jana.clampFotoValue(key, value);
        setFoto(next);
      }

      function restaurar(modo) {
        const def = Jana.fotoDefaults();
        const next = Object.assign({}, foto);
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
        } else if (modo === "tudo") {
          setFoto(def);
          return;
        } else if (Jana.FOTO_CAMPOS[modo]) {
          next[modo] = def[modo];
        }
        setFoto(next);
      }

      function onAction(event) {
        const btn = event.target.closest("[data-fe-action]");
        if (!btn || !dialog.contains(btn)) return;
        const action = btn.getAttribute("data-fe-action");
        if (action === "cancelar") {
          event.preventDefault();
          finish(null);
        } else if (action === "nudge") {
          event.preventDefault();
          setCampo(btn.getAttribute("data-eixo"), foto[btn.getAttribute("data-eixo")] + Number(btn.getAttribute("data-delta")));
        } else if (action === "zoom") {
          event.preventDefault();
          setCampo("zoom", foto.zoom + Number(btn.getAttribute("data-delta")));
        } else if (action === "restaurar-enquadramento") {
          event.preventDefault();
          restaurar("enquadramento");
        } else if (action === "restaurar-ajustes") {
          event.preventDefault();
          restaurar("ajustes");
        } else if (action === "restaurar-tudo") {
          event.preventDefault();
          restaurar("tudo");
        } else if (action === "reset-campo") {
          event.preventDefault();
          restaurar(btn.getAttribute("data-campo"));
        }
      }

      function onInput(event) {
        const t = event.target;
        if (!dialog.contains(t) || !t.getAttribute("data-fe-campo")) return;
        setCampo(t.getAttribute("data-fe-campo"), t.value);
      }

      function onSubmit(event) {
        if (event.target !== form) return;
        event.preventDefault();
        const aplicar = form.querySelector('[data-fe-action="aplicar"]');
        if (aplicar) aplicar.disabled = true;
        exportEdited(options.source, Object.assign({}, options, { foto: foto }))
          .then(function ok(res) {
            finish(res);
          })
          .catch(function err(e) {
            if (aplicar) aplicar.disabled = false;
            const hint = dialog.querySelector(".ed-feditor__controles .ed-dica");
            if (hint) {
              const alerta = document.createElement("p");
              alerta.className = "ed-erro";
              alerta.setAttribute("role", "alert");
              alerta.textContent = e && e.message ? e.message : "Não consegui preparar a imagem.";
              hint.parentNode.insertBefore(alerta, hint);
            }
          });
      }

      function onPointerDown(event) {
        if (!frame.contains(event.target) && event.target !== frame) return;
        if (event.button && event.button !== 0) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try {
          frame.setPointerCapture(event.pointerId);
        } catch (err) {}
        if (pointers.size === 2) {
          const pts = Array.from(pointers.values());
          const dx = pts[1].x - pts[0].x;
          const dy = pts[1].y - pts[0].y;
          pinch = {
            dist: Math.hypot(dx, dy) || 1,
            midX: (pts[0].x + pts[1].x) / 2,
            midY: (pts[0].y + pts[1].y) / 2,
            foto: Object.assign({}, foto),
          };
          drag = null;
        } else if (pointers.size === 1) {
          const box = frame.getBoundingClientRect();
          drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            foto: Object.assign({}, foto),
            width: box.width,
            height: box.height,
          };
          frame.classList.add("is-dragging");
        }
        event.preventDefault();
      }

      function onPointerMove(event) {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch && pointers.size >= 2) {
          const pts = Array.from(pointers.values());
          const dx = pts[1].x - pts[0].x;
          const dy = pts[1].y - pts[0].y;
          const dist = Math.hypot(dx, dy) || 1;
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const nextZ = Jana.clampFotoValue("zoom", pinch.foto.zoom * (dist / pinch.dist));
          let next = Object.assign({}, pinch.foto, { zoom: nextZ });
          const box = frame.getBoundingClientRect();
          next = Jana.fotoPanFromDrag(
            next,
            midX - pinch.midX,
            midY - pinch.midY,
            box.width,
            box.height,
            img.naturalWidth,
            img.naturalHeight
          );
          setFoto(next);
          event.preventDefault();
          return;
        }
        if (!drag || event.pointerId !== drag.pointerId) return;
        const next = Jana.fotoPanFromDrag(
          drag.foto,
          event.clientX - drag.startX,
          event.clientY - drag.startY,
          drag.width,
          drag.height,
          img.naturalWidth,
          img.naturalHeight
        );
        setFoto(next);
        event.preventDefault();
      }

      function onPointerUp(event) {
        if (!pointers.has(event.pointerId)) return;
        pointers.delete(event.pointerId);
        try {
          frame.releasePointerCapture(event.pointerId);
        } catch (err) {}
        if (pointers.size < 2) pinch = null;
        if (drag && event.pointerId === drag.pointerId) {
          frame.classList.remove("is-dragging");
          drag = null;
        }
        if (pointers.size === 1) {
          const remain = Array.from(pointers.entries())[0];
          const box = frame.getBoundingClientRect();
          drag = {
            pointerId: remain[0],
            startX: remain[1].x,
            startY: remain[1].y,
            foto: Object.assign({}, foto),
            width: box.width,
            height: box.height,
          };
        }
      }

      function onWheel(event) {
        if (!frame.contains(event.target) && event.target !== frame) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        setCampo("zoom", foto.zoom + delta);
      }

      function onKeyDown(event) {
        if (!dialog.open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        const onFrame = event.target === frame || frame.contains(event.target);
        if (!onFrame && event.target && event.target.matches && event.target.matches("input, textarea, select, button")) return;
        const step = event.shiftKey ? 5 : 2;
        if (event.key === "ArrowUp") setCampo("y", foto.y + step);
        else if (event.key === "ArrowDown") setCampo("y", foto.y - step);
        else if (event.key === "ArrowLeft") setCampo("x", foto.x + step);
        else if (event.key === "ArrowRight") setCampo("x", foto.x - step);
        else if (event.key === "+" || event.key === "=") setCampo("zoom", foto.zoom + 0.1);
        else if (event.key === "-" || event.key === "_") setCampo("zoom", foto.zoom - 0.1);
        else if (event.key === "0") restaurar("enquadramento");
        else return;
        event.preventDefault();
      }

      function onCancel(event) {
        event.preventDefault();
        finish(null);
      }

      function teardown() {
        dialog.removeEventListener("click", onAction);
        dialog.removeEventListener("input", onInput);
        dialog.removeEventListener("change", onInput);
        dialog.removeEventListener("submit", onSubmit);
        frame.removeEventListener("pointerdown", onPointerDown);
        frame.removeEventListener("pointermove", onPointerMove);
        frame.removeEventListener("pointerup", onPointerUp);
        frame.removeEventListener("pointercancel", onPointerUp);
        frame.removeEventListener("wheel", onWheel);
        dialog.removeEventListener("keydown", onKeyDown);
        dialog.removeEventListener("cancel", onCancel);
      }

      dialog.addEventListener("click", onAction);
      dialog.addEventListener("input", onInput);
      dialog.addEventListener("change", onInput);
      dialog.addEventListener("submit", onSubmit);
      frame.addEventListener("pointerdown", onPointerDown);
      frame.addEventListener("pointermove", onPointerMove);
      frame.addEventListener("pointerup", onPointerUp);
      frame.addEventListener("pointercancel", onPointerUp);
      frame.addEventListener("wheel", onWheel, { passive: false });
      dialog.addEventListener("keydown", onKeyDown);
      dialog.addEventListener("cancel", onCancel);

      document.body.appendChild(dialog);
      decodeSource(options.source)
        .then(function ready(bitmap) {
          const w0 = bitmap.width || bitmap.naturalWidth;
          const h0 = bitmap.height || bitmap.naturalHeight;
          const url =
            options.previewUrl ||
            (options.source instanceof Blob ? URL.createObjectURL(options.source) : typeof options.source === "string" ? options.source : "");
          img.onload = function onload() {
            applyPreview(dialog, foto, filterId);
          };
          img.src = url;
          if (bitmap.close) bitmap.close();
          if (!dialog.open) dialog.showModal();
          frame.focus();
        })
        .catch(fail);
    });
  }

  Jana.FotoEditor = {
    open: openEditor,
    export: exportEdited,
    decode: decodeSource,
  };
})(typeof window !== "undefined" ? window : globalThis);
