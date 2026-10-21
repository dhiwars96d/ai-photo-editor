/* Skin / Smooth / Hair panels: keep the photo visible above any open panel.
   Presets, preview, Apply and Cancel are handled by app.js. */
(() => {
  "use strict";

  const PANEL_IDS = ["skinPanel", "smoothControl", "hairMenu", "hairColorPanel"];
  let queued = false;

  function updatePhotoSpace() {
    queued = false;
    let topMost = null;

    PANEL_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.height < 5) return;
      if (topMost === null || r.top < topMost) topMost = r.top;
    });

    const root = document.documentElement;
    if (topMost === null) {
      root.style.removeProperty("--photo-bottom");
    } else {
      const space = Math.max(0, window.innerHeight - topMost + 6);
      root.style.setProperty("--photo-bottom", space + "px");
    }
  }

  function queueUpdate() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(updatePhotoSpace);
  }

  function init() {
    const app = document.querySelector(".app");
    if (!app) return;

    new MutationObserver(queueUpdate).observe(app, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(queueUpdate);
      PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) ro.observe(el);
      });
    }

    window.addEventListener("resize", queueUpdate);

    // Opening another tool while Skin Finish is open: cancel the unapplied preview.
    document.querySelectorAll(".tool").forEach(tool => {
      if (tool.dataset.tool === "skin") return;
      tool.addEventListener("click", () => {
        const panel = document.getElementById("skinPanel");
        const cancel = document.getElementById("skinCancel");
        if (panel && cancel && panel.style.display === "block") cancel.click();
      }, true);
    });

    queueUpdate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
￼Enter
