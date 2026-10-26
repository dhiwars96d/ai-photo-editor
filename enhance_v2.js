/* =========================================================
   ENHANCE (simple)
   - Koi slider nahi, koi photo-check nahi, koi extra processing nahi
   - Har photo par sirf Hugging Face Space ko x2 par call karta hai
   - Result seedha photo ki jagah lagta hai (Undo se wapas aa sakta hai)

   index.html me app.js ke BAAD:
     <script src="enhance_v2.js"></script>
========================================================= */
(function () {
"use strict";

const HOCKMAN_SPACE = "Nick088/Real-ESRGAN_Pytorch";
const ENHANCE_SCALE = 2;

function B() { return window.AppBridge; }

let Client = null;
let handle_file = null;
let hockmanAppPromise = null;
let enhanceBusy = false;


async function getHockmanApp() {
  if (!hockmanAppPromise) {
    hockmanAppPromise = (async function () {
      B().showStatus("Enhance your Image — Please wait...");

      const gradio = await import(
        "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.0/+esm"
      );

      Client = gradio.Client;
      handle_file = gradio.handle_file;

      return await Client.connect(HOCKMAN_SPACE, {
        events: ["data", "status"],
        status_callback: function (s) {
          if (!s) return;
          if (s.status === "sleeping") B().showStatus("Waking Enhance AI...");
          else if (s.status === "building") B().showStatus("Enhance AI is starting...");
          else if (s.status === "running") B().showStatus("Enhance AI is ready...");
          else if (s.status === "error" || s.status === "space_error") {
            B().showStatus("Enhance AI Space error. Please try again.");
          }
        }
      });
    })().catch(function (error) {
      hockmanAppPromise = null;
      throw error;
    });
  }

  return await hockmanAppPromise;
}


async function runHockmanX2(file) {
  if (!file) throw new Error("No photo selected");

  const app = await getHockmanApp();

  B().showStatus("Enhance your Image — Please wait... Uploading photo");
  const image = await handle_file(file);

  B().showStatus("Enhance your Image — Please wait... Enhancing photo");

  let result;
  try {
    result = await app.predict("/predict", [image, ENHANCE_SCALE]);
    console.log("Real-ESRGAN API result:", result);
  } catch (error) {
    console.error("REAL-ESRGAN PREDICT ERROR:", error);
    B().showStatus(
      "Enhance API error: " + ((error && error.message) || String(error))
    );
    throw error;
  }

  const output = result && result.data && result.data[0];
  if (!output) throw new Error("API returned no image. Check the console result.");

  let outputURL = output.url || output.path || output;
  if (typeof outputURL !== "string") {
    throw new Error("Invalid image result from Enhance AI");
  }

  if (outputURL.startsWith("/")) {
    outputURL = "https://nick088-real-esrgan-pytorch.hf.space" + outputURL;
  }
  if (outputURL.startsWith("http://")) {
    outputURL = "https://" + outputURL.slice(7);
  }

  B().showStatus("Downloading enhanced photo...");
  const response = await fetch(outputURL);
  if (!response.ok) throw new Error("Could not download Enhance AI result");

  const blob = await response.blob();
  if (!blob || blob.size === 0) throw new Error("Downloaded image is empty");

  return blob;
}


// Enhance button dabane par ye chalta hai
async function startEnhance() {
  if (enhanceBusy) {
    B().showStatus("Enhance chal raha hai, thoda ruko...");
    return;
  }

  const file = B().getCurrentPhotoFile();
  if (!file) {
    B().showStatus("Pehle photo chuno.");
    return;
  }

  enhanceBusy = true;
  try {
    B().showStatus("Starting Enhance AI...");
    const blob = await runHockmanX2(file);

    B().showResult(blob);
    B().showStatus("AI Enhance complete ✓");
  } catch (error) {
    console.error("Enhance error:", error);
    B().showStatus("Enhance failed: " + (error.message || "Please try again."));
  } finally {
    enhanceBusy = false;
  }
}

// app.js dusre tool par ye call karta hai; ab koi panel nahi hai
function closeEnhancePanel() {}

window.startEnhance = startEnhance;
window.closeEnhancePanel = closeEnhancePanel;

})();
