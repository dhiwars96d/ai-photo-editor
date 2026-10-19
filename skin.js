
/* ==========================================
   SKIN.JS — Phase 1 FIX
   Uses the existing Skin panel in index.html
   ========================================== */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function say(message) {
    if (typeof window.showStatus === "function") {
      window.showStatus(message);
      return;
    }

    const status = $("status") || $("statusBox");
    if (status) status.textContent = message;
  }

  function open() {
    const preview = $("preview");
    const panel = $("skinPanel");

    if (!panel) {
      say("Skin panel nahi mila. index.html check karein.");
      return;
    }

    if (!preview || !preview.getAttribute("src")) {
      say("Pehle Add Photo se photo select karein.");
      return;
    }

    // Close other editing panels without changing their code.
    const adjustments = $("adjustmentsPanel");
    if (adjustments) adjustments.classList.remove("open");

    
panel.style.setProperty("display", "block", "important");
panel.style.setProperty("position", "fixed", "important");
panel.style.setProperty("left", "10px", "important");
panel.style.setProperty("right", "10px", "important");
panel.style.setProperty("bottom", "calc(145px + env(safe-area-inset-bottom))", "important");
panel.style.setProperty("width", "auto", "important");
panel.style.setProperty("max-height", "55dvh", "important");
panel.style.setProperty("overflow-y", "auto", "important");
panel.style.setProperty("z-index", "999999", "important");
panel.style.setProperty("background", "#fff", "important");
panel.style.setProperty("color", "#302531", "important");
panel.style.setProperty("visibility", "visible", "important");
panel.style.setProperty("opacity", "1", "important");

say("Skin panel open ho gaya.");

  }

  function close() {
    const panel = $("skinPanel");
    if (panel) panel.style.display = "none";
  }

  function connectButton() {
    const tool = document.querySelector('.tool[data-tool="skin"]');

    if (!tool) {
      say("Skin button nahi mila.");
      return;
    }

    if (tool.dataset.skinConnected === "1") return;
    tool.dataset.skinConnected = "1";

    tool.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }, true);

    const cancel = $("skinCancel");
    if (cancel) {
      cancel.addEventListener("click", close);
    }

    const slider = $("skinIntensitySlider");
    const value = $("skinIntensityValue");

    if (slider && value) {
      slider.addEventListener("input", () => {
        value.textContent = slider.value;
      });
    }

    document.querySelectorAll("[data-skin-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-skin-preset]").forEach((item) => {
          item.classList.remove("selected");
        });

        button.classList.add("selected");

        say(
          button.dataset.skinPreset === "none"
            ? "None preset selected."
            : button.textContent.trim() + " selected. Effects agle phase mein enable honge."
        );
      });
    });

    const apply = $("skinApply");
    if (apply) {
      apply.addEventListener("click", () => {
        say("Skin processing abhi agle phase mein add karenge.");
      });
    }

    // Close Skin when another tool is selected.
    document.querySelectorAll(".tool[data-tool]").forEach((otherTool) => {
      if (otherTool === tool || otherTool.dataset.skinCloseBound === "1") {
        return;
      }

      otherTool.dataset.skinCloseBound = "1";
      otherTool.addEventListener("click", close, true);
    });
  }

  window.Skin = { open, close };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectButton, {
      once: true
    });
  } else {
    connectButton();
  }
})();
