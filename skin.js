
/* Skin panel layout only.
   Presets, preview, Apply and Cancel are handled by app.js. */
(() => {
  "use strict";

  function setupSkinPanel() {
    const tool = document.querySelector('.tool[data-tool="skin"]');
    const panel = document.getElementById("skinPanel");

    if (!tool || !panel || tool.dataset.skinLayoutBound === "1") {
      return;
    }

    tool.dataset.skinLayoutBound = "1";

    tool.addEventListener("click", () => {
      const photo =
        window.__editedPhotoBlob ||
        window.__selectedPhotoFile;

      if (!photo) return;

      panel.style.setProperty("position", "fixed", "important");
      panel.style.setProperty("left", "10px", "important");
      panel.style.setProperty("right", "10px", "important");
      panel.style.setProperty(
        "bottom",
        "calc(145px + env(safe-area-inset-bottom))",
        "important"
      );
      panel.style.setProperty("width", "auto", "important");
      panel.style.setProperty("max-height", "55dvh", "important");
      panel.style.setProperty("overflow-y", "auto", "important");
      panel.style.setProperty("z-index", "999999", "important");
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupSkinPanel, {
      once: true
    });
  } else {
    setupSkinPanel();
  }
})();
