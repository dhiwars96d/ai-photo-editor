
/* ==========================================
   SKIN.JS — Phase 1
   Independent Skin Panel
   Smooth Skin aur Retouch se alag
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

  function makePanel() {
    if ($("skinPanel")) return;

    const style = document.createElement("style");
    style.id = "skinPanelStyle";
    style.textContent = `
      #skinPanel {
        display: none;
        position: fixed;
        left: 10px;
        right: 10px;
        bottom: calc(145px + env(safe-area-inset-bottom));
        max-height: 55dvh;
        overflow-y: auto;
        z-index: 99999;
        box-sizing: border-box;
        padding: 16px;
        border: 1px solid #f1c6dc;
        border-radius: 18px;
        background: #fff;
        color: #302531;
        box-shadow: 0 8px 30px rgba(0,0,0,.18);
      }

      #skinPanel .skin-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      #skinPanel button {
        padding: 10px 14px;
        border: 1px solid #f1c6dc;
        border-radius: 10px;
        background: #fff;
        color: #302531;
        cursor: pointer;
      }

      #skinPanel button.skin-close {
        background: #fff0f7;
        color: #c21868;
      }

      #skinPanel .skin-note {
        margin-top: 12px;
        font-size: 13px;
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("section");
    panel.id = "skinPanel";

    panel.innerHTML = `
      <strong>Skin Finish</strong>

      <div class="skin-row">
        <button type="button" data-skin-preset="None">None</button>
        <button type="button" data-skin-preset="Refined">Refined</button>
        <button type="button" data-skin-preset="Glowy">Glowy</button>
        <button type="button" data-skin-preset="Glass">Glass</button>
        <button type="button" data-skin-preset="Foundation">Foundation</button>
        <button type="button" data-skin-preset="Porcelain">Porcelain</button>
        <button type="button" data-skin-preset="Dewy">Dewy</button>
        <button type="button" data-skin-preset="Tanned">Tanned</button>
      </div>

      <p class="skin-note">
        Phase 1: Skin panel connection test.
        Abhi presets photo ko edit nahi karte.
      </p>

      <div class="skin-row">
        <button type="button" class="skin-close" id="skinClose">
          Close
        </button>
      </div>
    `;

    const photoCard = document.querySelector(".photoCard");

    if (photoCard) {
      photoCard.insertAdjacentElement("afterend", panel);
    } else {
      (document.querySelector(".app") || document.body)
        .appendChild(panel);
    }

    $("skinClose").addEventListener("click", close);

    panel.querySelectorAll("[data-skin-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        say(button.dataset.skinPreset + " preset: next phase mein enable hoga.");
      });
    });
  }

  function open() {
    const preview = $("preview");

    if (!preview || !preview.getAttribute("src") || !preview.src) {
      say("Pehle Add Photo se photo select karein.");
      return;
    }

    makePanel();

    const panel = $("skinPanel");
    if (panel) panel.style.display = "block";

    say("Skin panel open ho gaya.");
  }

  function close() {
    const panel = $("skinPanel");
    if (panel) panel.style.display = "none";
  }

  function connectButton() {
     console.log("Skin button connection check");
    const tool = document.querySelector('.tool[data-tool="skin"]');

    if (!tool || tool.dataset.skinConnected) return;

    tool.dataset.skinConnected = "1";

    tool.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
       console.log("Skin button clicked");
      open();
    }, true);
  }

  window.Skin = { open, close };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectButton, {
      once: true
    });
  } else {
    connectButton();
     say("Skin button connected!");
  }
})();
￼Enter
