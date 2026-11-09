/**
 * Tiny Hydra field inside «Comprar» buttons only.
 * Storefront page background is the damask pattern — not Hydra.
 * At most a few visible buttons keep a live WebGL loop (battery / iOS).
 */
(function startButtonHydra() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_ACTIVE = 3;
  const MAX_DPR = 1;
  const instances = new Map();
  let hydraLoading = false;
  let hydraFailed = false;
  let observer = null;

  function canAnimate() {
    return typeof Hydra === "function" && !prefersReducedMotion.matches && !hydraFailed;
  }

  function resolveDpr() {
    const raw = window.devicePixelRatio || 1;
    return Math.min(Math.max(raw, 1), MAX_DPR);
  }

  function destroyButton(button) {
    const record = instances.get(button);
    if (!record) {
      return;
    }
    try {
      if (record.hydra && typeof record.hydra.hush === "function") {
        record.hydra.hush();
      }
    } catch (err) {
      /* ignore */
    }
    if (record.canvas && record.canvas.parentNode) {
      record.canvas.remove();
    }
    instances.delete(button);
  }

  function mountButton(button) {
    if (!canAnimate() || instances.has(button) || instances.size >= MAX_ACTIVE) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.className = "hydra-button-bg";
    canvas.setAttribute("aria-hidden", "true");
    button.insertBefore(canvas, button.firstChild);
    const label = button.querySelector(".btn__label");
    if (label) {
      label.style.position = "relative";
      label.style.zIndex = "1";
    }
    function sizeCanvas() {
      const dpr = resolveDpr();
      const width = Math.max(80, Math.round(button.clientWidth || 140));
      const height = Math.max(36, Math.round(button.clientHeight || 44));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      return { width: canvas.width, height: canvas.height };
    }
    const size = sizeCanvas();
    try {
      const hydra = new Hydra({
        canvas: canvas,
        width: size.width,
        height: size.height,
        detectAudio: false,
        enableStreamCapture: false,
      });
      speed = 0.7;
      osc(6, 0.03, 0.85)
        .color(1.15, 0.55, 0.72)
        .rotate(0.1, 0.03)
        .modulate(noise(2.2, 0.06), 0.14)
        .contrast(0.68)
        .brightness(0.08)
        .out();
      instances.set(button, { canvas: canvas, hydra: hydra });
    } catch (err) {
      canvas.remove();
      hydraFailed = true;
    }
  }

  function syncButtons() {
    if (!canAnimate()) {
      instances.forEach(function drop(_record, button) {
        destroyButton(button);
      });
      return;
    }
    const buttons = Array.from(document.querySelectorAll(".btn--acquire"));
    const visible = [];
    buttons.forEach(function check(button) {
      const rect = button.getBoundingClientRect();
      const onScreen =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < (window.innerHeight || 0) + 80 &&
        rect.left < (window.innerWidth || 0);
      if (onScreen) {
        visible.push(button);
      } else if (instances.has(button)) {
        destroyButton(button);
      }
    });
    visible.slice(0, MAX_ACTIVE).forEach(mountButton);
    Array.from(instances.keys()).forEach(function maybeDrop(button) {
      if (visible.indexOf(button) === -1) {
        destroyButton(button);
      }
    });
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver !== "function") {
      return;
    }
    observer = new IntersectionObserver(
      function onIntersect() {
        syncButtons();
      },
      { rootMargin: "80px", threshold: 0.01 }
    );
    document.querySelectorAll(".btn--acquire").forEach(function watch(button) {
      observer.observe(button);
    });
  }

  function loadSynth(then) {
    if (canAnimate()) {
      then();
      return;
    }
    if (prefersReducedMotion.matches || hydraFailed || hydraLoading) {
      return;
    }
    hydraLoading = true;
    const script = document.createElement("script");
    script.src = "https://unpkg.com/hydra-synth@1.4.0/dist/hydra-synth.js";
    script.async = true;
    script.onload = function onLoad() {
      hydraLoading = false;
      then();
    };
    script.onerror = function onError() {
      hydraLoading = false;
      hydraFailed = true;
    };
    document.head.appendChild(script);
  }

  function start() {
    if (prefersReducedMotion.matches) {
      return;
    }
    loadSynth(function afterSynth() {
      ensureObserver();
      syncButtons();
    });
  }

  if (prefersReducedMotion.addEventListener) {
    prefersReducedMotion.addEventListener("change", function onMotion(event) {
      if (event.matches) {
        instances.forEach(function drop(_record, button) {
          destroyButton(button);
        });
      } else {
        start();
      }
    });
  }

  window.addEventListener(
    "resize",
    function onResize() {
      syncButtons();
    },
    { passive: true }
  );

  if (typeof MutationObserver === "function") {
    const mut = new MutationObserver(function onDom(records) {
      const relevant = records.some(function hasButton(record) {
        return Array.from(record.addedNodes).some(function nodeHas(node) {
          return (
            node.nodeType === 1 &&
            (node.classList.contains("btn--acquire") || node.querySelector(".btn--acquire"))
          );
        });
      });
      if (!relevant) {
        return;
      }
      if (observer) {
        document.querySelectorAll(".btn--acquire").forEach(function watch(button) {
          observer.observe(button);
        });
      }
      syncButtons();
    });
    mut.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
