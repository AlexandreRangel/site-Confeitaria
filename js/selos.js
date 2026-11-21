(function initSelos(global) {
  const doc = global.document;
  if (!doc) {
    return;
  }

  function closeAll(except) {
    doc.querySelectorAll(".selo.is-open").forEach(function close(item) {
      if (item === except) {
        return;
      }
      item.classList.remove("is-open");
      const btn = item.querySelector(".selo__btn");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function onClick(event) {
    const target = event.target;
    if (!target || !target.closest) {
      return;
    }
    const btn = target.closest(".selo__btn");
    if (btn) {
      const item = btn.closest(".selo");
      const open = item.classList.contains("is-open");
      closeAll(item);
      item.classList.toggle("is-open", !open);
      btn.setAttribute("aria-expanded", String(!open));
      return;
    }
    if (!target.closest(".selo")) {
      closeAll();
    }
  }

  function onKey(event) {
    if (event.key === "Escape") {
      closeAll();
    }
  }

  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKey);
})(window);
