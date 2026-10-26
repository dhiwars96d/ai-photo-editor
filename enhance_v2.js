/* =========================================================
   ENHANCE v2  (standalone file)

   index.html me app.js ke BAAD ye line lagao:
     <script src="enhance_v2.js"></script>

   - Photo check: sharp / soft / blurry (automatic)
   - Local enhance: sharpen + clarity + vibrance (AI ke bina)
   - AI (Real-ESRGAN x2) sirf "detail layer" ke liye
     (rang aur skin tone hamesha original ke rehte hain)
   - Ek slider. AI ek hi baar chalta hai, slider sirf blend karta hai

   app.js se ye cheezein window.AppBridge se milti hain.
========================================================= */
(function () {
"use strict";

function B() { return window.AppBridge; }
function previewEl() { return B().getPreview(); }
function statusEl() { return B().getStatusBox(); }


/* =========================================================
   HUGGING FACE SPACE  (Real-ESRGAN)
========================================================= */

const HOCKMAN_SPACE = "Nick088/Real-ESRGAN_Pytorch";

let Client = null;
let handle_file = null;
let hockmanAppPromise = null;

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

async function runHockmanX2(file, scale) {
  if (!file) throw new Error("No photo selected");

  B().showStatus("Enhance your Image — Please wait...");
  const app = await getHockmanApp();

  B().showStatus("Enhance your Image — Please wait... Uploading photo");
  const image = await handle_file(file);

  B().showStatus("Enhance your Image — Please wait... Enhancing photo");

  let result;
  try {
    result = await app.predict("/predict", [image, scale || 2]);
    console.log("Real-ESRGAN API result:", result);
  } catch (error) {
    console.error("REAL-ESRGAN PREDICT ERROR:", error);
    const details = [
      "Name: " + (error && error.name || "unknown"),
      "Message: " + (error && error.message || String(error))
    ].join(" | ");
    B().showStatus("Enhance API error: " + details);
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


/* =========================================================
   ENHANCE ENGINE
========================================================= */

const ENH_MAX_SIDE = 2048;      // working size (long side)
const ENH_AI_INPUT_MAX = 1400;  // size sent to the Space
const ENH_SHARP_MIN = 99999;     // score >= this  -> "sharp"
const ENH_BLURRY_MAX = 80;      // score <  this  -> "blurry"
const ENH_LOWRES_SIDE = 900;    // smaller photo  -> treated as "blurry"

// Max values (at slider = 100). Tune these after testing.
const ENH_MODES = {
  sharp:  { label: "Sharp photo",       unsharp: 1.4, clarity: 0.55, vib: 0.25, ai: 0   },
  soft:   { label: "Thodi soft photo",  unsharp: 1.2, clarity: 0.45, vib: 0.20, ai: 1.4 },
  blurry: { label: "Blurry / low-res",  unsharp: 0.9, clarity: 0.35, vib: 0.20, ai: 1.8 }
};

let enhanceState = null;
let enhanceToken = 0;
let enhancePreviewSeq = 0;
let enhancePreviewURL = null;
let enhanceTimer = null;


/* ---------- helpers ---------- */

function canvasToBlob(canvas, quality) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error("Could not export image"));
    }, "image/jpeg", quality || 0.92);
  });
}

async function fileToCanvas(file, maxSide) {
  const img = await B().loadImage(file);
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

// Gaussian-like blur using the canvas filter (same approach as smoothSkin)
function blurCanvas(src, radius, down) {
  down = down || 1;
  const w = src.width;
  const h = src.height;
  const sw = Math.max(1, Math.round(w / down));
  const sh = Math.max(1, Math.round(h / down));

  const a = document.createElement("canvas");
  a.width = sw;
  a.height = sh;
  const actx = a.getContext("2d", { willReadFrequently: true });
  actx.imageSmoothingQuality = "high";
  actx.filter = "blur(" + (radius / down).toFixed(2) + "px)";
  actx.drawImage(src, 0, 0, sw, sh);
  actx.filter = "none";

  if (down === 1) return a;

  const b = document.createElement("canvas");
  b.width = w;
  b.height = h;
  const bctx = b.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(a, 0, 0, w, h);
  return b;
}

function lumArray(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const n = canvas.width * canvas.height;
  const out = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    out[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return out;
}


/* ---------- 1) photo check ---------- */

// Looks at the sharpest 10% of the image (so plain backgrounds
// do not make a sharp portrait look "blurry").
function measureSharpness(canvas) {
  const s = Math.min(1, 512 / Math.max(canvas.width, canvas.height));
  const w = Math.max(16, Math.round(canvas.width * s));
  const h = Math.max(16, Math.round(canvas.height * s));

  const t = document.createElement("canvas");
  t.width = w;
  t.height = h;
  const c = t.getContext("2d", { willReadFrequently: true });
  c.drawImage(canvas, 0, 0, w, h);

  const g = lumArray(t);
  const lap = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      lap[i] = v * v;
    }
  }

  const B = 32;
  const scores = [];
  for (let by = 0; by + B <= h; by += B) {
    for (let bx = 0; bx + B <= w; bx += B) {
      let sum = 0;
      for (let y = by; y < by + B; y++) {
        for (let x = bx; x < bx + B; x++) {
          sum += lap[y * w + x];
        }
      }
      scores.push(sum / (B * B));
    }
  }

  if (!scores.length) return 0;
  scores.sort(function (a, b) { return a - b; });
  return scores[Math.min(scores.length - 1, Math.floor(scores.length * 0.9))];
}


/* ---------- 2) build cached layers (slider becomes fast) ---------- */

function buildEnhanceState(base, mode, score) {
  const w = base.width;
  const h = base.height;
  const n = w * h;
  const ctx = base.getContext("2d", { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h).data;

  const longSide = Math.max(w, h);
  const rSmall = Math.max(0.8, longSide / 1400);
  const rLarge = Math.max(8, longSide / 50);

  const blurS = lumArray(blurCanvas(base, rSmall, 1));
  const blurL = lumArray(blurCanvas(base, rLarge, 4));

  // Rough skin mask (YCbCr). Used only to go gentler on skin.
  const skin = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    if (r < 60) continue;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) skin[p] = 1;
  }

  return {
    w: w, h: h, n: n, src: src,
    blurS: blurS, blurL: blurL, skin: skin,
    aiDetail: null, aiReady: false,
    rSmall: rSmall, mode: mode, score: score
  };
}

// AI output -> only its fine-detail layer (colour is thrown away)
async function attachAiDetail(st, aiBlob) {
  const img = await B().loadImage(aiBlob);
  const c = document.createElement("canvas");
  c.width = st.w;
  c.height = st.h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, st.w, st.h);

  const lumA = lumArray(c);
  const lumB = lumArray(blurCanvas(c, st.rSmall, 1));
  const det = new Float32Array(st.n);
  for (let p = 0; p < st.n; p++) det[p] = lumA[p] - lumB[p];

  st.aiDetail = det;
  st.aiReady = true;
}

async function makeAiInputBlob(base) {
  const s = Math.min(1, ENH_AI_INPUT_MAX / Math.max(base.width, base.height));
  const w = Math.max(1, Math.round(base.width * s));
  const h = Math.max(1, Math.round(base.height * s));
  const t = document.createElement("canvas");
  t.width = w;
  t.height = h;
  const ctx = t.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(base, 0, 0, w, h);
  return await canvasToBlob(t, 0.92);
}


/* ---------- 3) render (this runs on every slider move) ---------- */

function renderEnhanceToCanvas(st, s) {
  const M = ENH_MODES[st.mode];
  const w = st.w;
  const h = st.h;
  const n = st.n;
  const src = st.src;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const out = ctx.createImageData(w, h);
  const o = out.data;

  const aiOn = st.aiDetail && M.ai > 0;

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const skin = st.skin[p] === 1;

    let add = 0;

    // fine sharpening (with a small noise gate)
    let d = lum - st.blurS[p];
    d *= Math.min(1, Math.abs(d) / 6);
    add += d * M.unsharp * s * (skin ? 0.55 : 1);

    // local contrast (clarity), mostly in mid-tones
    const dl = lum - st.blurL[p];
    const mid = Math.max(0, 1 - Math.abs(lum - 128) / 160);
    add += dl * M.clarity * s * mid * (skin ? 0.5 : 1);

    // AI detail layer
    if (aiOn) {
      let a = st.aiDetail[p];
      if (a > 35) a = 35;
      else if (a < -35) a = -35;
      add += a * M.ai * s * (skin ? 0.35 : 1);
    }

    if (add > 60) add = 60;
    else if (add < -60) add = -60;

    let nr = r + add;
    let ng = g + add;
    let nb = b + add;

    // vibrance: boosts dull colours more than strong ones
    const mx = Math.max(nr, ng, nb);
    const mn = Math.min(nr, ng, nb);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const boost = M.vib * s * (1 - sat) * (skin ? 0.5 : 1);
    if (boost > 0) {
      const gray = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      nr = gray + (nr - gray) * (1 + boost);
      ng = gray + (ng - gray) * (1 + boost);
      nb = gray + (nb - gray) * (1 + boost);
    }

    o[i] = nr;       // Uint8ClampedArray clamps 0-255 automatically
    o[i + 1] = ng;
    o[i + 2] = nb;
    o[i + 3] = 255;
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}


/* ---------- 4) panel + preview ---------- */

function addEnhanceCss() {
  if (document.getElementById("enStyle")) return;
  const st = document.createElement("style");
  st.id = "enStyle";
  st.textContent =
    "#enhancePanel .enHead{font-size:14px;font-weight:800;color:#2b1d25;margin-bottom:4px}" +
    "#enhancePanel .enInfo{font-size:11px;color:#8a7480;margin-bottom:6px}" +
    "#enhancePanel .enRow{display:flex;align-items:center;gap:10px;margin:6px 0}" +
    "#enhancePanel .enRow label{width:70px;font-size:13px;font-weight:700;color:#2b1d25}" +
    "#enhancePanel .enRow input{flex:1;min-width:0;accent-color:#f42f91}" +
    "#enhancePanel .enRow span{width:30px;text-align:right;font-size:12px;font-weight:700;color:#c21868}" +
    "#enhancePanel .enHint{display:flex;justify-content:space-between;font-size:11px;color:#8a7480;margin:0 40px 0 80px}" +
    "#enhancePanel .enActions{display:flex;gap:8px;margin-top:10px}" +
    "#enhancePanel .enBtn{flex:1;min-height:40px;border:1.5px solid #f28ab9;border-radius:12px;" +
      "background:#fff;color:#c21868;font-size:13px;font-weight:700}" +
    "#enhancePanel .enBtn.enPrimary{background:linear-gradient(135deg,#f42f91,#ff6fb5);" +
      "border-color:#f42f91;color:#fff}";
  document.head.appendChild(st);
}

function ensureEnhancePanel() {
  let panel = document.getElementById("enhancePanel");
  if (panel && panel.querySelector("#enhanceSlider")) return panel;
  if (panel) panel.remove();   // purana (skin.js wala) panel ho to hata do

  addEnhanceCss();

  panel = document.createElement("div");
  panel.id = "enhancePanel";
  // Hair Color panel wali hi class: app ki CSS isse bottom sheet banati hai
  // aur skin.js photo ko panel ke upar visible rakhta hai.
  panel.className = "hairColorPanel enhancePanel";
  panel.style.display = "none";

  panel.innerHTML =
    '<div class="enHead">Enhance</div>' +
    '<div class="enInfo" id="enhanceInfo"></div>' +
    '<div class="enRow"><label for="enhanceSlider">Strength</label>' +
      '<input id="enhanceSlider" type="range" min="0" max="100" value="50">' +
      '<span id="enhanceValue">50</span></div>' +
    '<div class="enHint"><span>Natural</span><span>Strong</span></div>' +
    '<div class="enActions">' +
      '<button type="button" class="enBtn" id="enhanceKeep">Keep first</button>' +
      '<button type="button" class="enBtn enPrimary" id="enhanceApply">Apply ✓</button>' +
    '</div>';

  const anchor = document.getElementById("hairColorPanel");
  if (anchor && anchor.parentNode) {
    anchor.insertAdjacentElement("afterend", panel);
  } else {
    document.body.appendChild(panel);
  }

  const slider = panel.querySelector("#enhanceSlider");
  const value = panel.querySelector("#enhanceValue");

  slider.addEventListener("input", function () {
    value.textContent = slider.value;
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(updateEnhancePreview, 50);
  });

  panel.querySelector("#enhanceKeep").addEventListener("click", function () {
    closeEnhancePanel(true);
    B().showStatus("Enhance cancel kiya.");
  });

  panel.querySelector("#enhanceApply").addEventListener("click", applyEnhance);

  return panel;
}

function setEnhanceInfo() {
  const st = enhanceState;
  const el = document.getElementById("enhanceInfo");
  if (!st || !el) return;

  const M = ENH_MODES[st.mode];
  let text = "Auto: " + M.label + " (score " + Math.round(st.score) + ")";
  if (M.ai > 0) text += st.aiReady ? " + AI detail ✓" : " — AI detail aa raha hai...";
  el.textContent = text;
}

function showEnhancePanel() {
  const panel = ensureEnhancePanel();

  // dusre panel/slider band karo taaki upar na chipkein
  const smoothBox = document.getElementById("smoothControl");
  if (smoothBox) smoothBox.classList.remove("show");
  ["hairMenu", "hairColorPanel", "hairStylePanel", "skinPanel"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  panel.style.display = "block";

  const slider = document.getElementById("enhanceSlider");
  const value = document.getElementById("enhanceValue");
  if (slider) slider.value = "50";
  if (value) value.textContent = "50";
  setEnhanceInfo();
}

async function updateEnhancePreview() {
  const st = enhanceState;
  if (!st) return;
  const slider = document.getElementById("enhanceSlider");
  const s = (Number(slider ? slider.value : 50) || 0) / 100;
  const seq = ++enhancePreviewSeq;

  const canvas = renderEnhanceToCanvas(st, s);
  const blob = await canvasToBlob(canvas, 0.9);

  if (st !== enhanceState || seq !== enhancePreviewSeq) return;

  const oldURL = enhancePreviewURL;
  enhancePreviewURL = URL.createObjectURL(blob);
  if (previewEl()) previewEl().src = enhancePreviewURL;
  if (oldURL) URL.revokeObjectURL(oldURL);
}

function closeEnhancePanel(restore) {
  enhanceToken++;
  clearTimeout(enhanceTimer);

  const panel = document.getElementById("enhancePanel");
  if (panel) panel.style.display = "none";

  if (restore && enhanceState && previewEl()) {
    const cur = B().getCurrentPhotoBlob();
    if (cur) previewEl().src = URL.createObjectURL(cur);
  }

  enhanceState = null;

  if (enhancePreviewURL) {
    URL.revokeObjectURL(enhancePreviewURL);
    enhancePreviewURL = null;
  }
}

async function applyEnhance() {
  const st = enhanceState;
  if (!st) return;

  const applyBtn = document.getElementById("enhanceApply");
  try {
    if (applyBtn) applyBtn.disabled = true;
    B().showStatus("Applying Enhance...");

    const slider = document.getElementById("enhanceSlider");
    const s = (Number(slider ? slider.value : 50) || 0) / 100;

    const canvas = renderEnhanceToCanvas(st, s);
    const blob = await canvasToBlob(canvas, 0.95);

    B().showResult(blob);
    closeEnhancePanel(false);
    B().showStatus("Enhance applied ✓");
  } catch (error) {
    console.error("Enhance apply error:", error);
    B().showStatus("Enhance failed: " + (error.message || "Please try again."));
  } finally {
    if (applyBtn) applyBtn.disabled = false;
  }
}


/* ---------- 5) entry point (called when Enhance is tapped) ---------- */

async function startEnhance() {
  const file = B().getCurrentPhotoFile();
  if (!file) {
    B().showStatus("Pehle photo chuno.");
    return;
  }

  closeEnhancePanel(false);
  const token = ++enhanceToken;

  try {
    B().showStatus("Photo check ho rahi hai...");

    const base = await fileToCanvas(file, ENH_MAX_SIDE);
    if (token !== enhanceToken) return;

    const score = measureSharpness(base);
    let mode = score >= ENH_SHARP_MIN ? "sharp"
             : score < ENH_BLURRY_MAX ? "blurry"
             : "soft";
    if (Math.max(base.width, base.height) < ENH_LOWRES_SIDE) mode = "blurry";

    console.log("Enhance check:", { score: score, mode: mode, w: base.width, h: base.height });

    const st = buildEnhanceState(base, mode, score);
    enhanceState = st;

    showEnhancePanel();
    await updateEnhancePreview();

    if (ENH_MODES[mode].ai <= 0) {
      if (statusEl()) statusEl().style.display = "none";
      return;
    }

    // Blurry / soft photos: get AI detail once, then slider only re-blends.
    try {
      B().showStatus("AI detail le rahe hain...");
      const inBlob = await makeAiInputBlob(base);
      const inFile = new File([inBlob], "enhance-input.jpg", { type: "image/jpeg" });

      const aiOut = await runHockmanX2(inFile, 2);
      if (token !== enhanceToken || enhanceState !== st) return;

      await attachAiDetail(st, aiOut);
      setEnhanceInfo();
      await updateEnhancePreview();
      B().showStatus("AI detail ready ✓");
    } catch (aiError) {
      console.error("AI detail failed:", aiError);
      if (token !== enhanceToken || enhanceState !== st) return;
      setEnhanceInfo();
      B().showStatus("AI nahi chala, normal enhance laga hai.");
    }
  } catch (error) {
    console.error("Enhance error:", error);
    B().showStatus("Enhance failed: " + (error.message || "Please try again."));
  }
}


window.startEnhance = startEnhance;
window.closeEnhancePanel = closeEnhancePanel;

})();
