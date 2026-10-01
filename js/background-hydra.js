(function startBackgroundHydra() {
  const canvas = document.getElementById("jana-hydra");
  if (!canvas) {
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_DIM = 768;
  const MAX_DPR = 1.5;
  const RESIZE_THROTTLE_MS = 200;
  const STATIC_COLOR = canvas.getAttribute("data-static-color") || "#efe6ea";

  function resolveDpr() {
    const raw = window.devicePixelRatio || 1;
    let cap = MAX_DPR;
    try {
      if (navigator.connection && navigator.connection.saveData) {
        cap = 1;
      }
    } catch (err) {
      /* ignore */
    }
    try {
      if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory > 0 && navigator.deviceMemory <= 4) {
        cap = Math.min(cap, 1);
      }
    } catch (err) {
      /* ignore */
    }
    try {
      if (window.matchMedia("(pointer: coarse)").matches) {
        cap = Math.min(cap, 1);
      }
    } catch (err) {
      /* ignore */
    }
    return Math.min(Math.max(raw, 1), cap);
  }

  function computeBufferSize() {
    const cssW = Math.max(1, canvas.clientWidth || window.innerWidth || 1);
    const cssH = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
    const dpr = resolveDpr();
    let width = cssW * dpr;
    let height = cssH * dpr;
    const longest = Math.max(width, height);
    if (longest > MAX_DIM) {
      const scale = MAX_DIM / longest;
      width *= scale;
      height *= scale;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  function applyCanvasBuffer(size) {
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
  }

  function applyHydraResolution(hydra, size) {
    if (!hydra) return;
    if (typeof hydra.setResolution === "function") {
      hydra.setResolution(size.width, size.height);
    } else if (typeof hydra.resize === "function") {
      hydra.resize(size.width, size.height);
    } else {
      applyCanvasBuffer(size);
    }
  }

  let hydraInstance = null;
  let resizeTimer = null;
  let lastSize = { width: 0, height: 0 };

  function sizesEqual(a, b) {
    return a.width === b.width && a.height === b.height;
  }

  function paintStatic() {
    const size = computeBufferSize();
    applyCanvasBuffer(size);
    lastSize = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = STATIC_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function startHydra() {
    if (typeof Hydra !== "function" || typeof window.runHydraSketch !== "function") {
      paintStatic();
      return;
    }
    const size = computeBufferSize();
    applyCanvasBuffer(size);
    lastSize = size;
    hydraInstance = new Hydra({
      canvas: canvas,
      width: size.width,
      height: size.height,
      detectAudio: false,
      enableStreamCapture: false,
    });
    window.runHydraSketch();
  }

  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function resizeHydra() {
      const size = computeBufferSize();
      if (sizesEqual(size, lastSize)) return;
      lastSize = size;
      if (hydraInstance && !prefersReducedMotion.matches) {
        applyHydraResolution(hydraInstance, size);
      } else if (prefersReducedMotion.matches) {
        paintStatic();
      }
    }, RESIZE_THROTTLE_MS);
  }

  if (!prefersReducedMotion.matches) {
    startHydra();
  } else {
    paintStatic();
  }

  window.addEventListener("resize", onResize, { passive: true });
  if (typeof ResizeObserver === "function") {
    try {
      new ResizeObserver(onResize).observe(canvas);
    } catch (err) {
      /* ignore */
    }
  }
  if (typeof prefersReducedMotion.addEventListener === "function") {
    prefersReducedMotion.addEventListener("change", function onMotionPref() {
      location.reload();
    });
  }
})();
