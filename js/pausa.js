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
      datasBloqueadas: Array.isArray(data.datasBloqueadas)
        ? data.datasBloqueadas
            .map(function mapBloqueio(item) {
              if (!item || typeof item !== "object") return null;
              const dia = Jana.normalizePausaDate(item.data || item.date || item);
              if (!dia) return null;
              return { data: dia, motivo: String(item.motivo || "").trim().slice(0, 200) };
            })
            .filter(Boolean)
        : [],
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
    return !!Jana.desiredDateUnavailability(raw, pausa);
  };

  Jana.formatDateExtensoBR = function formatDateExtensoBR(ymd) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  };

  /* Motivo pelo qual uma data civil não pode ser escolhida (além da antecedência mínima). */
  Jana.desiredDateUnavailability = function desiredDateUnavailability(ymd, pausa) {
    const raw = String(ymd || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const cfg = Jana.pausaConfig(pausa);
    const blocked = (cfg.datasBloqueadas || []).find(function find(item) {
      return item.data === raw;
    });
    if (blocked) {
      return { kind: "bloqueada", motivo: blocked.motivo || "", data: raw };
    }
    if (cfg.ativo && (cfg.inicio || cfg.fim) && Jana.pausaInRange(raw, cfg.inicio, cfg.fim)) {
      return { kind: "pausa", motivo: cfg.mensagem || "", data: raw };
    }
    for (let i = 0; i < cfg.periodos.length; i++) {
      const periodo = cfg.periodos[i];
      if ((periodo.inicio || periodo.fim) && Jana.pausaInRange(raw, periodo.inicio, periodo.fim)) {
        return { kind: "pausa", motivo: periodo.mensagem || cfg.mensagem || "", data: raw };
      }
    }
    if (cfg.fimDeSemana) {
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
        return { kind: "fimDeSemana", motivo: cfg.mensagem || "", data: raw };
      }
    }
    return null;
  };

  Jana.desiredDateUnavailableMessage = function desiredDateUnavailableMessage(info, minYmd) {
    const minLabel = Jana.formatDateLongBR(minYmd);
    const next = minLabel ? " A próxima data livre é " + minLabel + "." : "";
    const motivo = info && info.motivo ? info.motivo : "";
    if (info && info.kind === "bloqueada") {
      return motivo
        ? "Esta data não está disponível (" + motivo + ")." + next
        : "Esta data não está disponível." + next;
    }
    if (info && (info.kind === "pausa" || info.kind === "fimDeSemana")) {
      return motivo
        ? "Esta data não está disponível (" + motivo + ")." + next
        : "Essa data não está disponível." + next;
    }
    return "Essa data não está disponível." + next;
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
    const unavail = Jana.desiredDateUnavailability(raw, pausa);
    if (unavail) {
      return { ok: false, min: min, message: Jana.desiredDateUnavailableMessage(unavail, min), reason: unavail };
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


  const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

  function ymdFromParts(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function shiftMonth(year, month, delta) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  }

  function monthLabel(year, month) {
    const date = new Date(Date.UTC(year, month - 1, 1, 12));
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }

  function mondayIndex(jsWeekday) {
    return (jsWeekday + 6) % 7;
  }

  Jana.mountDesiredDateCalendar = function mountDesiredDateCalendar(input, options) {
    if (!input || !input.parentNode) return null;
    const opt = options || {};
    const getPausa = typeof opt.getPausa === "function" ? opt.getPausa : function empty() { return null; };
    const getNow = typeof opt.getNow === "function" ? opt.getNow : function now() { return new Date(); };
    let root = input.parentNode.querySelector(".cal-encomenda");
    if (!root) {
      root = document.createElement("div");
      root.className = "cal-encomenda";
      root.setAttribute("data-cal", "encomenda");
      const hint = input.parentNode.querySelector(".checkout__hint");
      if (hint) input.parentNode.insertBefore(root, hint);
      else input.parentNode.appendChild(root);
    }
    input.classList.add("checkout__date-native");
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    const aparelhoHint = Array.prototype.find.call(input.parentNode.querySelectorAll(".checkout__hint"), function find(el) {
      return el.getAttribute("data-bind") !== "checkout-date-min";
    });
    if (aparelhoHint) aparelhoHint.hidden = true;

    const state = root._calState || { year: 0, month: 0, focusYmd: "" };
    root._calState = state;

    function refresh() {
      const pausa = getPausa();
      const now = getNow();
      const today = Jana.todayYmd(now);
      const min = Jana.firstAvailableDesiredDate(pausa, now);
      const selected = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : "";
      if (!state.year) {
        const base = selected && selected >= today ? selected : min || today;
        const m = base.match(/^(\d{4})-(\d{2})/);
        state.year = Number(m[1]);
        state.month = Number(m[2]);
      }
      const first = ymdFromParts(state.year, state.month, 1);
      const daysInMonth = new Date(Date.UTC(state.year, state.month, 0)).getUTCDate();
      const startWeekday = mondayIndex(new Date(Date.UTC(state.year, state.month - 1, 1)).getUTCDay());
      const minMonth = today.slice(0, 7);
      const curMonth = ymdFromParts(state.year, state.month, 1).slice(0, 7);
      const prevDisabled = curMonth <= minMonth;
      const maxMonthDate = shiftMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 18);
      const maxMonth = ymdFromParts(maxMonthDate.year, maxMonthDate.month, 1).slice(0, 7);
      const nextDisabled = curMonth >= maxMonth;

      if (!state.focusYmd || state.focusYmd.slice(0, 7) !== curMonth) {
        state.focusYmd = selected && selected.slice(0, 7) === curMonth ? selected : min && min.slice(0, 7) === curMonth ? min : first;
      }

      let cells = "";
      for (let i = 0; i < startWeekday; i++) {
        cells += '<div class="cal-encomenda__vazio" aria-hidden="true"></div>';
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const ymd = ymdFromParts(state.year, state.month, day);
        const ante = ymd < min;
        const unavail = Jana.desiredDateUnavailability(ymd, pausa);
        const blocked = ante || !!unavail;
        const motivo = unavail && unavail.motivo ? unavail.motivo : ante ? "Precisamos de pelo menos 2 dias para preparar a encomenda." : "";
        const extenso = Jana.formatDateExtensoBR(ymd);
        const label = motivo ? extenso + " — indisponível. " + motivo : extenso + (blocked ? " — indisponível" : " — disponível");
        const isSel = selected === ymd;
        const tab = state.focusYmd === ymd ? "0" : "-1";
        cells +=
          '<button type="button" class="cal-encomenda__dia' +
          (blocked ? " is-indisponivel" : "") +
          (isSel ? " is-selecionado" : "") +
          (ymd === today ? " is-hoje" : "") +
          '" data-ymd="' +
          ymd +
          '" role="gridcell" tabindex="' +
          tab +
          '" aria-label="' +
          escapeCal(label) +
          '"' +
          (blocked ? ' aria-disabled="true"' : "") +
          (isSel ? ' aria-selected="true"' : ' aria-selected="false"') +
          (motivo ? ' title="' + escapeCal(motivo) + '"' : "") +
          ">" +
          day +
          "</button>";
      }

      root.innerHTML =
        '<div class="cal-encomenda__topo">' +
        '<button type="button" class="cal-encomenda__nav" data-cal-nav="-1" aria-label="Mês anterior"' +
        (prevDisabled ? " disabled" : "") +
        ">‹</button>" +
        '<p class="cal-encomenda__mes" tabindex="-1" aria-live="polite">' +
        escapeCal(monthLabel(state.year, state.month)) +
        "</p>" +
        '<button type="button" class="cal-encomenda__nav" data-cal-nav="1" aria-label="Próximo mês"' +
        (nextDisabled ? " disabled" : "") +
        ">›</button></div>" +
        '<div class="cal-encomenda__semana" aria-hidden="true">' +
        WEEKDAYS.map(function wd(name) {
          return "<span>" + name + "</span>";
        }).join("") +
        "</div>" +
        '<div class="cal-encomenda__grade" role="grid" aria-label="Calendário para escolher a data">' +
        cells +
        "</div>" +
        '<p class="cal-encomenda__legenda"><span class="cal-encomenda__legenda-ok">Disponível</span>' +
        '<span class="cal-encomenda__legenda-off">Indisponível</span></p>';
    }

    function addDaysYmdLocal(ymd, days) {
      return Jana.addDaysYmd(ymd, days);
    }

    function escapeCal(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
    }

    function focusDay(ymd) {
      state.focusYmd = ymd;
      const match = ymd.match(/^(\d{4})-(\d{2})/);
      if (match) {
        state.year = Number(match[1]);
        state.month = Number(match[2]);
      }
      refresh();
      const btn = root.querySelector('.cal-encomenda__dia[data-ymd="' + ymd + '"]');
      if (btn) btn.focus();
    }

    if (!root._calBound) {
      root._calBound = true;
      root.addEventListener("click", function onClick(event) {
        const nav = event.target.closest("[data-cal-nav]");
        if (nav && !nav.disabled) {
          const next = shiftMonth(state.year, state.month, Number(nav.getAttribute("data-cal-nav")));
          state.year = next.year;
          state.month = next.month;
          state.focusYmd = "";
          refresh();
          const mes = root.querySelector(".cal-encomenda__mes");
          if (mes) mes.focus();
          return;
        }
        const day = event.target.closest(".cal-encomenda__dia");
        if (!day) return;
        if (day.getAttribute("aria-disabled") === "true") return;
        input.value = day.getAttribute("data-ymd");
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof opt.onChange === "function") opt.onChange(input.value);
        refresh();
      });
      root.addEventListener("keydown", function onKey(event) {
        const day = event.target.closest(".cal-encomenda__dia");
        if (!day) return;
        const ymd = day.getAttribute("data-ymd");
        let next = null;
        if (event.key === "ArrowLeft") next = Jana.addDaysYmd(ymd, -1);
        else if (event.key === "ArrowRight") next = Jana.addDaysYmd(ymd, 1);
        else if (event.key === "ArrowUp") next = Jana.addDaysYmd(ymd, -7);
        else if (event.key === "ArrowDown") next = Jana.addDaysYmd(ymd, 7);
        else if (event.key === "Home") next = ymd.slice(0, 8) + "01";
        else if (event.key === "End") {
          const last = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), 0)).getUTCDate();
          next = ymd.slice(0, 8) + pad2(last);
        } else if (event.key === "PageUp") {
          const s = shiftMonth(state.year, state.month, event.shiftKey ? -12 : -1);
          next = ymdFromParts(s.year, s.month, Math.min(Number(ymd.slice(8)), new Date(Date.UTC(s.year, s.month, 0)).getUTCDate()));
        } else if (event.key === "PageDown") {
          const s = shiftMonth(state.year, state.month, event.shiftKey ? 12 : 1);
          next = ymdFromParts(s.year, s.month, Math.min(Number(ymd.slice(8)), new Date(Date.UTC(s.year, s.month, 0)).getUTCDate()));
        } else if (event.key === "Enter" || event.key === " ") {
          if (day.getAttribute("aria-disabled") === "true") {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          day.click();
          return;
        }
        if (next) {
          event.preventDefault();
          focusDay(next);
        }
      });
    }
    refresh();
    return root;
  };

  global.Jana = Jana;
})(window);
