// RETOUCH.JS — separate Retouch module
(() => {
  "use strict";

  const retouchTool = document.querySelector(
    '.tool[data-tool="retouch"]'
  );

  if (!retouchTool) {
    console.warn("Retouch button not found.");
    return;
  }

  retouchTool.addEventListener("click", () => {
    if (typeof window.showStatus === "function") {
      window.showStatus(
        "Retouch module ready — blemish detection is the next step."
      );
    } else {
      console.log("Retouch module ready.");
    }
  });
})();
