/* =========================================================
   ENHANCE (auto: sharp photo -> Real-ESRGAN, blurry -> CodeFormer)
   - Koi slider/panel nahi. Enhance dabao, result seedha lagta hai.
   - Sharp photo : Real-ESRGAN x2   (Nick088/Real-ESRGAN_Pytorch)
   - Blurry photo: CodeFormer       (sczhou/CodeFormer)
   - CodeFormer fail ho to apne aap Real-ESRGAN x2 chalta hai.

   Test ke liye ENHANCE_MODE badlo:
     "auto" | "esrgan" | "codeformer"

   index.html me app.js ke BAAD:
     <script src="enhance_v2.js"></script>
========================================================= */
(function () {
"use strict";

/* ---------- settings (yahin se tune karo) ---------- */

const ENHANCE_MODE = "auto";

// Sharpness score is se NEECHE ho to photo "blurry" maani jati hai.
// Status me score dikhta hai ("score 2086"). Apni photos dekh kar badlo.
const SHARP_SCORE_MIN = 600;

const ESRGAN_SPACE = "Nick088/Real-ESRGAN_Pytorch";
const ESRGAN_SCALE = 2;

const CODEFORMER_SPACE = "sczhou/CodeFormer";
// 0 = zyada AI-saaf, 1 = original chehra zyada. Natural ke liye 0.6 - 0.8
const CODEFORMER_FIDELITY = 0.7;
// CodeFormer Space isse bada input upscale nahi karta (sirf chehra sudharta hai)
const CF_MAX_LONG = 1450;
const CF_MAX_SHORT = 1050;


function B() { return window.AppBridge; }

let busy = false;
let gradioPromise = null;
const appPromises = {};


/* ---------- Gradio client ---------- */

function loadGradio() {
  if (!gradioPromise) {
    gradioPromise = import("https://cdn.jsdelivr.net/npm/@gradio/client@2.7.0/+esm")
      .catch(function (e) { gradioPromise = null; throw e; });
  }
  return gradioPromise;
}

function spaceHost(space) {
  return "https://" + space.toLowerCase().replace(/[\/_.]/g, "-") + ".hf.space";
}

function getApp(space, label) {
  if (!appPromises[space]) {
    appPromises[space] = (async function () {
      B().showStatus(label + " — connecting...");
      const gradio = await loadGradio();
      return await gradio.Client.connect(space, {
        events: ["data", "status"],
        status_callback: function (s) {
          if (!s) return;
          if (s.status === "sleeping") B().showStatus(label + " — waking up...");
          else if (s.status === "building") B().showStatus(label + " — starting...");
          else if (s.status === "error" || s.status === "space_error") {
            B().showStatus(label + " — Space error.");
          }
        }
      });
    })().catch(function (e) { delete appPromises[space]; throw e; });
  }
  return appPromises[space];
}

async function fileData(file) {
  const gradio = await loadGradio();
  return await gradio.handle_file(file);
}

// Gradio result -> image Blob (file 30s me delete ho jati hai, turant download)
async function resultToBlob(result, space) {
  const output = result && result.data && result.data[0];
  if (!output) throw new Error("Space ne image nahi di");

  let url = output.url || output.path || output;
  if (typeof url !== "string") throw new Error("Invalid image result");

  if (url.startsWith("/")) url = spaceHost(space) + url;
  if (url.startsWith("http://")) url = "https://" + url.slice(7);

  const response = await fetch(url);
  if (!response.ok) throw new Error("Result download nahi hua");

  const blob = await response.blob();
  if (!blob || blob.size === 0) throw new Error("Downloaded image empty hai");
  return blob;
}


/* ---------- Real-ESRGAN x2 ---------- */

async function runEsrgan(file) {
  const app = await getApp(ESRGAN_SPACE, "Real-ESRGAN");

  B().showStatus("Real-ESRGAN — uploading photo...");
  const image = await fileData(file);

  B().showStatus("Real-ESRGAN — enhancing (x" + ESRGAN_SCALE + ")...");
  const result = await app.predict("/predict", [image, ESRGAN_SCALE]);
  console.log("Real-ESRGAN result:", result);

  B().showStatus("Downloading enhanced photo...");
  return await resultToBlob(result, ESRGAN_SPACE);
}


/* ---------- CodeFormer ---------- */

// Photo ko itna chhota karo ki Space poora upscale + face restore chalaye
async function fitForCodeFormer(file) {
  const img = await B().loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const s = Math.min(
    1,
    CF_MAX_LONG / Math.max(w, h),
    CF_MAX_SHORT / Math.min(w, h)
  );
  if (s >= 1) return file;

  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);

  return await new Promise(function (resolve, reject) {
    c.toBlob(function (b) {
      if (b) resolve(new File([b], "photo.jpg", { type: "image/jpeg" }));
      else reject(new Error("Photo resize nahi hui"));
    }, "image/jpeg", 0.95);
  });
}

// Space ka asli endpoint naam dhoondho (default "/inference")
async function codeFormerEndpoint(app) {
  try {
    const info = await app.view_api();
    const names = Object.keys((info && info.named_endpoints) || {});
    console.log("CodeFormer endpoints:", names);
    const hit = names.find(function (n) { return /inference/i.test(n); });
    if (hit) return hit;
    if (names.length === 1) return names[0];
  } catch (e) {
    console.warn("view_api failed:", e);
  }
  return "/inference";
}

async function runCodeFormer(file) {
  const app = await getApp(CODEFORMER_SPACE, "CodeFormer");

  B().showStatus("CodeFormer — preparing photo...");
  const fitted = await fitForCodeFormer(file);
  const image = await fileData(fitted);

  const endpoint = await codeFormerEndpoint(app);

  B().showStatus("CodeFormer — restoring (10-30s)...");
  // inputs: image, face_align, background_enhance, face_upsample, upscale, fidelity
  const result = await app.predict(endpoint, [
    image, true, true, true, 2, CODEFORMER_FIDELITY
  ]);
  console.log("CodeFormer result:", result);

  B().showStatus("Downloading restored photo...");
  return await resultToBlob(result, CODEFORMER_SPACE);
}


/* ---------- photo kitni sharp hai ---------- */

// Photo ke sabse detail wale hisse (top 10%) ki sharpness naapta hai,
// taaki saaf background wali sharp photo "blurry" na lage.
async function sharpnessScore(file) {
  const img = await B().loadImage(file);
  const s = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(16, Math.round(img.naturalWidth * s));
  const h = Math.max(16, Math.round(img.naturalHeight * s));

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const g = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }

  const lap = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      lap[i] = v * v;
    }
  }

  const BLOCK = 32;
  const scores = [];
  for (let by = 0; by + BLOCK <= h; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= w; bx += BLOCK) {
      let sum = 0;
      for (let y = by; y < by + BLOCK; y++) {
        for (let x = bx; x < bx + BLOCK; x++) sum += lap[y * w + x];
      }
      scores.push(sum / (BLOCK * BLOCK));
    }
  }
  if (!scores.length) return 0;
  scores.sort(function (a, b) { return a - b; });
  return scores[Math.min(scores.length - 1, Math.floor(scores.length * 0.9))];
}


/* ---------- Enhance button ---------- */

async function startEnhance() {
  if (busy) {
    B().showStatus("Enhance chal raha hai, thoda ruko...");
    return;
  }

  const file = B().getCurrentPhotoFile();
  if (!file) {
    B().showStatus("Pehle photo chuno.");
    return;
  }

  busy = true;
  try {
    let mode = ENHANCE_MODE;
    let note = "";

    if (mode === "auto") {
      B().showStatus("Photo check ho rahi hai...");
      const score = await sharpnessScore(file);
      note = " (score " + Math.round(score) + ")";
      mode = score >= SHARP_SCORE_MIN ? "esrgan" : "codeformer";
      console.log("Enhance check:", { score: score, mode: mode });
    }

    let blob;
    let used;

    if (mode === "codeformer") {
      try {
        blob = await runCodeFormer(file);
        used = "CodeFormer";
      } catch (e) {
        console.error("CodeFormer failed, falling back:", e);
        B().showStatus("CodeFormer nahi chala (" + (e.message || "error") + "). Real-ESRGAN laga rahe hain...");
        blob = await runEsrgan(file);
        used = "Real-ESRGAN (fallback)";
      }
    } else {
      blob = await runEsrgan(file);
      used = "Real-ESRGAN";
    }

    B().showResult(blob);
    B().showStatus("AI Enhance complete ✓ — " + used + note);
  } catch (error) {
    console.error("Enhance error:", error);
    B().showStatus("Enhance failed: " + (error.message || "Please try again."));
  } finally {
    busy = false;
  }
}

// app.js dusre tool par ye call karta hai; ab koi panel nahi hai
function closeEnhancePanel() {}

window.startEnhance = startEnhance;
window.closeEnhancePanel = closeEnhancePanel;

})();
