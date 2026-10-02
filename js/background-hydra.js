/**
 * Tiny Hydra field inside «Comprar» buttons only.
 * Storefront page background is the damask pattern — not Hydra.
 */
(function startButtonHydra() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (typeof Hydra !== "function" || prefersReducedMotion.matches) {
    return;
  }

  const MAX_DPR = 1.25;
  function mountButtons() {
    document.querySelectorAll(".btn--acquire").forEach(mountButton);
  }

  function resolveDpr() {
    const raw = window.devicePixelRatio || 1;
    return Math.min(Math.max(raw, 1), MAX_DPR);
  }

  function mountButton(button) {
    if (button.querySelector(".hydra-button-bg")) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.className = "hydra-button-bg";
    canvas.setAttribute("aria-hidden", "true");
    button.insertBefore(canvas, button.firstChild);
    const label = button.querySelector(".btn__label") || button;
    if (label !== button) {
      label.style.position = "relative";
      label.style.zIndex = "1";
    }

    function sizeCanvas() {
      const dpr = resolveDpr();
      const width = Math.max(120, Math.round(button.clientWidth || 180));
      const height = Math.max(40, Math.round(button.clientHeight || 44));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
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
      speed = 0.85;
      osc(8, 0.04, 0.9)
        .color(1.15, 0.55, 0.72)
        .rotate(0.12, 0.04)
        .modulate(noise(2.4, 0.08), 0.18)
        .contrast(0.7)
        .brightness(0.08)
        .out();
      if (typeof hydra.setResolution === "function") {
        window.addEventListener(
          "resize",
          function onResize() {
            const next = sizeCanvas();
            hydra.setResolution(next.width, next.height);
          },
          { passive: true }
        );
      }
    } catch (err) {
      canvas.remove();
    }
  }

  mountButtons();
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(mountButtons);
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
