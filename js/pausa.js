(function createPausa(global) {
  const Jana = global.Jana || {};
  const TZ = "America/Sao_Paulo";
  const CACHE_MS = 60 * 1000;
  const WEEKEND_MESSAGE = "Não aceitamos encomendas aos fins de semana. Volte na segunda!";
  let csvCache = { at: 0, value: null, url: "" };
  let modalLastFocus = null;
  let lockHook = null;
  let eventsBound = false;

  Jana.WEEKEND_PAUSA_MESSAGE = WEEKEND_MESSAGE;

  function pad2(value) {
    return ("0" + String(value)).slice(-2);
  }

  Jana.ymdInTimeZone = function ymdInTimeZone(date, timeZone) {
    const tz = timeZone || TZ;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date || new Date());
    const map = {};
    parts.forEach(function put(part) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    });
    return map.year + "-" + map.month + "-" + map.day;
  };

  Jana.weekdayInTimeZone = function weekdayInTimeZone(date, timeZone) {
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || TZ,
      weekday: "short",
    }).format(date || new Date());
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[label];
  };

  Jana.formatPausaDate = function formatPausaDate(iso) {
    const raw = String(iso || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return "";
    }
    return match[3] + "/" + match[2];
  };

  Jana.normalizePausaDate = function normalizePausaDate(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }
    const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
      return br[3] + "-" + pad2(br[2]) + "-" + pad2(br[1]);
    }
    return "";
  };

  Jana.parsePausaAtivo = function parsePausaAtivo(value) {
    const raw = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return raw === "sim" || raw === "s" || raw === "true" || raw === "1" || raw === "yes" || raw === "x";
  };

  Jana.pausaMensagemAutomatica = function pausaMensagemAutomatica(inicio, fim) {
    const start = Jana.formatPausaDate(inicio);
    const end = Jana.formatPausaDate(fim);
    if (start && end) {
      return "Não estamos aceitando encomendas entre " + start + " e " + end + ".";
    }
    if (end && !start) {
      return "Não estamos aceitando encomendas até " + end + ".";
    }
    if (start && !end) {
      return "Não estamos aceitando encomendas a partir de " + start + ".";
    }
    return "No momento não estamos aceitando encomendas.";
  };

  Jana.composePausaMensagem = function composePausaMensagem(inicio, fim, extra) {
    const base = Jana.pausaMensagemAutomatica(inicio, fim);
    const more = String(extra || "").trim();
    return more ? base + " " + more : base;
  };

  Jana.pausaInRange = function pausaInRange(ymd, inicio, fim) {
    const start = Jana.normalizePausaDate(inicio);
    const end = Jana.normalizePausaDate(fim);
    if (start && ymd < start) {
      return false;
    }
    if (end && ymd > end) {
      return false;
    }
    return true;
  };

  Jana.pausaConfig = function pausaConfig(raw) {
    const data = raw || {};
    return {
      ativo: data.ativo === true,
      inicio: Jana.normalizePausaDate(data.inicio),
      fim: Jana.normalizePausaDate(data.fim),
      mensagem: String(data.mensagem || "").trim(),
      periodos: Array.isArray(data.periodos)
        ? data.periodos.map(function mapPeriodo(item) {
            return {
              inicio: Jana.normalizePausaDate(item && item.inicio),
              fim: Jana.normalizePausaDate(item && item.fim),
              mensagem: String((item && item.mensagem) || "").trim(),
            };
          })
        : [],
      fimDeSemana: data.fimDeSemana === true,
      planilhaCsv: String(data.planilhaCsv || "").trim(),
    };
  };

  function splitCsvLine(line) {
    const out = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') {
            current += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        out.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out;
  }

  function headerKey(name) {
    return String(name || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  Jana.parsePausaCsv = function parsePausaCsv(text) {
    const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const lines = source.split("\n").filter(function keep(line) {
      return String(line).trim();
    });
    if (!lines.length) {
      return [];
    }
    const headers = splitCsvLine(lines[0]).map(headerKey);
    const idx = {
      ativo: headers.indexOf("ativo"),
      inicio: headers.indexOf("inicio"),
      fim: headers.indexOf("fim"),
      mensagem: headers.indexOf("mensagem"),
    };
    return lines.slice(1).map(function row(line) {
      const cols = splitCsvLine(line);
      function cell(index) {
        return index >= 0 ? String(cols[index] || "").trim() : "";
      }
      return {
        ativo: Jana.parsePausaAtivo(cell(idx.ativo)),
        inicio: Jana.normalizePausaDate(cell(idx.inicio)),
        fim: Jana.normalizePausaDate(cell(idx.fim)),
        mensagem: cell(idx.mensagem),
      };
    });
  };

  Jana.mergePausaFromCsv = function mergePausaFromCsv(json, rows) {
    const base = Jana.pausaConfig(json);
    const next = {
      ativo: false,
      inicio: "",
      fim: "",
      mensagem: "",
      periodos: [],
      fimDeSemana: base.fimDeSemana,
      planilhaCsv: base.planilhaCsv,
    };
    (rows || []).forEach(function apply(row) {
      if (!row || !row.ativo) {
        return;
      }
      if (!row.inicio && !row.fim) {
        next.ativo = true;
        next.mensagem = row.mensagem || next.mensagem;
        return;
      }
      next.periodos.push({
        inicio: row.inicio,
        fim: row.fim,
        mensagem: row.mensagem || "",
      });
    });
    return next;
  };

  Jana.evaluatePausa = function evaluatePausa(config, now) {
    const cfg = Jana.pausaConfig(config);
    const when = now || new Date();
    const ymd = Jana.ymdInTimeZone(when, TZ);
    const weekday = Jana.weekdayInTimeZone(when, TZ);
    if (cfg.ativo) {
      if (Jana.pausaInRange(ymd, cfg.inicio, cfg.fim)) {
        return {
          active: true,
          source: "manual",
          message: Jana.composePausaMensagem(cfg.inicio, cfg.fim, cfg.mensagem),
        };
      }
    }
    for (let i = 0; i < cfg.periodos.length; i++) {
      const periodo = cfg.periodos[i];
      if (Jana.pausaInRange(ymd, periodo.inicio, periodo.fim) && (periodo.inicio || periodo.fim)) {
        return {
          active: true,
          source: "periodo",
          message: Jana.composePausaMensagem(periodo.inicio, periodo.fim, periodo.mensagem || cfg.mensagem),
        };
      }
    }
    if (cfg.fimDeSemana && (weekday === 0 || weekday === 6)) {
      const extra = cfg.mensagem;
      return {
        active: true,
        source: "fimDeSemana",
        message: extra ? WEEKEND_MESSAGE + " " + extra : WEEKEND_MESSAGE,
      };
    }
    return { active: false, source: "", message: "" };
  };

  /* Dia civil (AAAA-MM-DD) cai numa pausa datada ou num fim de semana pausado?
     Pausa ligada sem datas (encomendas fechadas agora) não entra aqui: isso já bloqueia o carrinho. */
  Jana.isDesiredDateUnavailable = function isDesiredDateUnavailable(ymd, pausa) {
    const raw = String(ymd || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return false;
    }
    const cfg = Jana.pausaConfig(pausa);
    if (cfg.ativo && (cfg.inicio || cfg.fim) && Jana.pausaInRange(raw, cfg.inicio, cfg.fim)) {
      return true;
    }
    for (let i = 0; i < cfg.periodos.length; i++) {
      const periodo = cfg.periodos[i];
      if ((periodo.inicio || periodo.fim) && Jana.pausaInRange(raw, periodo.inicio, periodo.fim)) {
        return true;
      }
    }
    if (cfg.fimDeSemana) {
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
      const weekday = date.getUTCDay();
      if (weekday === 0 || weekday === 6) {
        return true;
      }
    }
    return false;
  };

  Jana.firstAvailableDesiredDate = function firstAvailableDesiredDate(pausa, now, days) {
    const start = Jana.minLeadDateYmd(now, days);
    let ymd = start;
    for (let i = 0; i < 60; i++) {
      if (!Jana.isDesiredDateUnavailable(ymd, pausa)) {
        return ymd;
      }
      ymd = Jana.addDaysYmd(ymd, 1);
    }
    return start;
  };

  Jana.desiredDateHint = function desiredDateHint(minYmd) {
    const label = Jana.formatDateLongBR(minYmd);
    return label ? "A partir de " + label + "." : "";
  };

  Jana.desiredDateError = function desiredDateError(minYmd) {
    const label = Jana.formatDateLongBR(minYmd);
    return "Precisamos de pelo menos 2 dias para preparar sua encomenda. Escolha a partir de " + label + ".";
  };

  Jana.validateDesiredDate = function validateDesiredDate(value, pausa, now, days) {
    const raw = String(value || "").trim();
    const min = Jana.firstAvailableDesiredDate(pausa, now, days);
    if (!raw) {
      return { ok: true, empty: true, min: min };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw < min) {
      return { ok: false, min: min, message: Jana.desiredDateError(min) };
    }
    if (Jana.isDesiredDateUnavailable(raw, pausa)) {
      return {
        ok: false,
        min: min,
        message: "Essa data não está disponível. Escolha a partir de " + Jana.formatDateLongBR(min) + ".",
      };
    }
    return { ok: true, min: min };
  };

  Jana.resetPausaCache = function resetPausaCache() {
    csvCache = { at: 0, value: null, url: "" };
  };

  Jana.loadPausaConfig = async function loadPausaConfig(json, fetchFn) {
    const base = Jana.pausaConfig(json);
    const url = base.planilhaCsv;
    if (!url) {
      return base;
    }
    const now = Date.now();
    if (csvCache.value && csvCache.url === url && now - csvCache.at < CACHE_MS) {
      return csvCache.value;
    }
    try {
      const fetchImpl = fetchFn || fetch;
      const response = await fetchImpl(url, { cache: "no-store" });
      if (!response || !response.ok) {
        return base;
      }
      const text = await response.text();
      const merged = Jana.mergePausaFromCsv(base, Jana.parsePausaCsv(text));
      csvCache = { at: now, value: merged, url: url };
      return merged;
    } catch (err) {
      return base;
    }
  };

  function focusableIn(root) {
    return Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function visible(node) {
      return node.getClientRects().length > 0;
    });
  }

  Jana.ensurePausaModal = function ensurePausaModal() {
    if (typeof document === "undefined") {
      return null;
    }
    let modal = document.getElementById("pausa-encomendas");
    if (modal) {
      return modal;
    }
    modal = document.createElement("div");
    modal.id = "pausa-encomendas";
    modal.className = "pausa-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "pausa-titulo");
    modal.hidden = true;
    modal.innerHTML =
      '<div class="pausa-modal__panel" tabindex="-1">' +
      '<h2 id="pausa-titulo">Encomendas pausadas</h2>' +
      '<p id="pausa-mensagem" data-bind="pausa-mensagem"></p>' +
      '<div class="pausa-modal__actions">' +
      '<a class="btn btn--solid btn--whatsapp" data-bind="pausa-whatsapp" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>' +
      '<button type="button" class="btn btn--outline" data-action="close-pausa">Fechar</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    return modal;
  };

  Jana.isPausaModalOpen = function isPausaModalOpen() {
    const modal = typeof document !== "undefined" ? document.getElementById("pausa-encomendas") : null;
    return !!(modal && !modal.hidden);
  };

  Jana.openPausaModal = function openPausaModal(result, site, hooks) {
    const modal = Jana.ensurePausaModal();
    if (!modal) {
      return;
    }
    const message = (result && result.message) || Jana.pausaMensagemAutomatica("", "");
    const text = modal.querySelector("[data-bind='pausa-mensagem']");
    if (text) {
      text.textContent = message;
    }
    const wa = modal.querySelector("[data-bind='pausa-whatsapp']");
    const number = site && site.contato && site.contato.whatsapp ? site.contato.whatsapp : "5561981246112";
    if (wa) {
      wa.setAttribute(
        "href",
        "https://wa.me/" +
          number +
          "?text=" +
          encodeURIComponent("Olá! Vi no site que as encomendas estão pausadas e gostaria de falar com a Jana.")
      );
    }
    modalLastFocus = document.activeElement;
    lockHook = hooks && typeof hooks.onLock === "function" ? hooks.onLock : null;
    modal.hidden = false;
    if (lockHook) {
      lockHook(true);
    }
    const panel = modal.querySelector(".pausa-modal__panel");
    window.setTimeout(function focusPanel() {
      const closeBtn = modal.querySelector('[data-action="close-pausa"]');
      if (closeBtn) {
        closeBtn.focus();
      } else if (panel) {
        panel.focus();
      }
    }, 0);
  };

  Jana.closePausaModal = function closePausaModal() {
    const modal = typeof document !== "undefined" ? document.getElementById("pausa-encomendas") : null;
    if (!modal) {
      return;
    }
    modal.hidden = true;
    if (lockHook) {
      lockHook(false);
    }
    const restore = modalLastFocus;
    modalLastFocus = null;
    if (restore && typeof restore.focus === "function") {
      restore.focus();
    }
  };

  Jana.bindPausaEvents = function bindPausaEvents() {
    if (eventsBound || typeof document === "undefined") {
      return;
    }
    eventsBound = true;
    document.addEventListener("click", function onClick(event) {
      const close = event.target.closest("[data-action='close-pausa']");
      if (close) {
        event.preventDefault();
        Jana.closePausaModal();
      }
    });
    document.addEventListener("keydown", function onKey(event) {
      if (!Jana.isPausaModalOpen()) {
        return;
      }
      const modal = document.getElementById("pausa-encomendas");
      if (event.key === "Escape") {
        event.preventDefault();
        Jana.closePausaModal();
        return;
      }
      if (event.key !== "Tab" || !modal) {
        return;
      }
      const focusable = focusableIn(modal);
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
  };

  global.Jana = Jana;
})(window);
