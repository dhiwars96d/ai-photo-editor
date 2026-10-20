
/* SKIN.JS — Safe bridge
   Skin controls and image processing are handled by app.js.
   Do not attach duplicate button or slider listeners here.
*/

(() => {
  "use strict";

  window.Skin = {
    open() {
      const panel = document.getElementById("skinPanel");
      if (!panel) return;

      panel.style.display = "block";
      panel.style.visibility = "visible";
      panel.style.opacity = "1";
    },

    close() {
      const panel = document.getElementById("skinPanel");
      if (panel) panel.style.display = "none";
    }
  };
})();
