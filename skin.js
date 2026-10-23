/* Skin / Smooth / Hair panels: keep the photo visible above any open panel.
   Presets, preview, Apply and Cancel are handled by app.js. */
(() => {
  "use strict";

  const PANEL_IDS = ["skinPanel", "smoothControl", "hairMenu", "hairColorPanel", "hairStylePanel", "adjustmentsPanel"];
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


/* =========================================================
   SKIN FINISH ENGINE (replaces renderSkinFinish from app.js)
   - real skin-colour mask (YCbCr) instead of a fixed oval
   - Refined: removes small dark blemishes + adds fine pink pore texture
   - other presets: tone/smoothing applied on the skin mask
   Chrome/Android recommended (uses canvas blur filter).
========================================================= */
(() => {
  "use strict";

  const MAXW = 1600;
  const cache = new WeakMap();

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  const PRESETS = {
    charm:      { blem: 1.2, smooth: 0.78, tex: 0.30, bright: 22, contrast: -4, sat: 4, warm: -1, glow: 0.4, pink: 10 },
    natural:    { blem: 1.0, smooth: 0.50, tex: 0.55, bright: 14, contrast: -2, sat: 3, warm: 0, glow: 0.2, pink: 6 },
    beauty:     { blem: 1.2, smooth: 0.70, tex: 0.5, bright: 3, contrast: -2, sat: 0, warm: 1, glow: 0.1 },
    refined:    { blem: 1.0, smooth: 0.30, tex: 1.0, bright: 2,  contrast: 0,  sat: -2,  warm: 1,  glow: 0 },
    glowy:      { blem: 0.6, smooth: 0.35, tex: 0,   bright: 9,  contrast: -4, sat: 6,   warm: 4,  glow: 0.5 },
    tanned:     { blem: 0.4, smooth: 0.15, tex: 0.3, bright: -6, contrast: 6,  sat: 14,  warm: 18, glow: 0 },
    glass:      { blem: 0.8, smooth: 0.45, tex: 0,   bright: 8,  contrast: 6,  sat: 0,   warm: -2, glow: 0.35 },
    foundation: { blem: 1.0, smooth: 0.65, tex: 0,   bright: 4,  contrast: -6, sat: -8,  warm: 3,  glow: 0 },
    porcelain:  { blem: 0.9, smooth: 0.45, tex: 0,   bright: 16, contrast: -5, sat: -14, warm: -4, glow: 0 },
    dewy:       { blem: 0.6, smooth: 0.30, tex: 0.2, bright: 7,  contrast: -2, sat: 6,   warm: 2,  glow: 0.4 }
  };

  function mk(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // Blur an ImageData and return the blurred RGBA array.
  function blurData(imageData, w, h, px) {
    const a = mk(w, h);
    a.getContext("2d").putImageData(imageData, 0, 0);
    const b = mk(w, h);
    const bx = b.getContext("2d", { willReadFrequently: true });
    bx.filter = "blur(" + px + "px)";
    bx.drawImage(a, 0, 0);
    bx.filter = "none";
    return bx.getImageData(0, 0, w, h).data;
  }

  async function analyse(file) {
    const cached = cache.get(file);
    if (cached) return cached;

    const img = await loadImage(file);
    const scale = Math.min(1, MAXW / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const n = w * h;

    const base = mk(w, h);
    const bctx = base.getContext("2d", { willReadFrequently: true });
    bctx.drawImage(img, 0, 0, w, h);
    const baseImage = bctx.getImageData(0, 0, w, h);
    const src = baseImage.data;

    /* 1. Skin colour mask (strict) */
    const skinImg = bctx.createImageData(w, h);
    const sd = skinImg.data;
    const L = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      L[p] = y;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const skin =
        y > 50 && cb >= 75 && cb <= 130 && cr >= 134 && cr <= 175 &&
        r > g && b > r * 0.47;
      sd[i + 3] = skin ? 255 : 0;
    }

    /* 2. Skin neighbourhood ratio -> soft skin weight W */
    const rWide = blurData(skinImg, w, h, Math.max(3, w * 0.004));
    const R = new Float32Array(n);
    const W = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      R[p] = rWide[p * 4 + 3] / 255;
      W[p] = sstep(0.6, 0.9, R[p]);
    }

    /* 3. Blemish candidates: small dark spots inside skin */
    const lb = blurData(baseImage, w, h, Math.max(4, w * 0.007));
    const M0 = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const lumB = 0.299 * lb[i] + 0.587 * lb[i + 1] + 0.114 * lb[i + 2];
      M0[p] = sstep(10, 26, lumB - L[p]) * sstep(0.7, 0.9, R[p]);
    }

    /* 4. Keep only compact blobs (rejects hair strands, brows, lashes) */
    const keep = new Float32Array(n);
    const seen = new Uint8Array(n);
    const maxArea = Math.max(30, Math.round(w * w * 0.0001));
    const maxSide = Math.max(8, w * 0.02);
    for (let s = 0; s < n; s++) {
      if (M0[s] <= 0.5 || seen[s]) continue;
      const stack = [s];
      const pix = [];
      seen[s] = 1;
      let x0 = w, x1 = 0, y0 = h, y1 = 0;
      while (stack.length) {
        const p = stack.pop();
        pix.push(p);
        const x = p % w, y = (p / w) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (pix.length > maxArea * 3) { /* too big: keep marking only */ }
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1,
                    y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (let k = 0; k < 4; k++) {
          const q = nb[k];
          if (q >= 0 && !seen[q] && M0[q] > 0.5) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
      if (pix.length <= maxArea && aspect <= 2.6 && Math.max(bw, bh) <= maxSide) {
        for (let k = 0; k < pix.length; k++) keep[pix[k]] = M0[pix[k]];
      }
    }

    /* 5. Grow + soften blemish mask */
    const mImg = bctx.createImageData(w, h);
    for (let p = 0; p < n; p++) mImg.data[p * 4 + 3] = Math.round(keep[p] * 255);
    const mb = blurData(mImg, w, h, 1.4);
    const Mf = new Float32Array(n);
    for (let p = 0; p < n; p++) Mf[p] = clamp01((mb[p * 4 + 3] / 255) * 2.4);

    /* 6. Fill colour from surrounding skin (two passes) */
    const fillR = Math.max(3, w * 0.005);
    const f1 = blurData(baseImage, w, h, fillR);
    const c1 = bctx.createImageData(w, h);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const m = Mf[p];
      c1.data[i] = src[i] * (1 - m) + f1[i] * m;
      c1.data[i + 1] = src[i + 1] * (1 - m) + f1[i + 1] * m;
      c1.data[i + 2] = src[i + 2] * (1 - m) + f1[i + 2] * m;
      c1.data[i + 3] = 255;
    }
    const fill = blurData(c1, w, h, fillR);

    /* 7. Light smoothing layer */
    const soft = blurData(baseImage, w, h, Math.max(1.5, w * 0.0016));

    const result = { w, h, n, src, W, Mf, fill, soft };
    cache.set(file, result);
    return result;
  }

  async function renderSkinFinish(file, presetName, intensity) {
    const cfg = PRESETS[presetName];
    const f = clamp01((Number(intensity) || 50) / 100);
    if (!cfg || f === 0) return file;

    const A = await analyse(file);
    const { w, h, n, src, W, Mf, fill, soft } = A;

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d", { willReadFrequently: true });
    const outImg = octx.createImageData(w, h);
    const o = outImg.data;

    const blemK = cfg.blem * (0.4 + f * 1.2);
    const smK = Math.min(0.85, cfg.smooth * f * 1.4);
    const t0 = f * 2;
    const cK = 1 + (cfg.contrast / 100) * t0;
    const sK = 1 + (cfg.sat / 100) * t0;

    /* Pass 1: blemish removal, smoothing, tone */
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      let r = src[i], g = src[i + 1], b = src[i + 2];
      const wv = W[p];
      const m = Math.min(1, Mf[p] * blemK);

      if (m > 0.001) {
        r = r * (1 - m) + fill[i] * m;
        g = g * (1 - m) + fill[i + 1] * m;
        b = b * (1 - m) + fill[i + 2] * m;
      }

      if (wv > 0.01) {
        const sm = smK * wv;
        r = r * (1 - sm) + soft[i] * sm;
        g = g * (1 - sm) + soft[i + 1] * sm;
        b = b * (1 - sm) + soft[i + 2] * sm;

        const t = wv * t0;
        r = (r - 128) * (1 + (cK - 1) * wv) + 128 + cfg.bright * t * 0.5;
        g = (g - 128) * (1 + (cK - 1) * wv) + 128 + cfg.bright * t * 0.5;
        b = (b - 128) * (1 + (cK - 1) * wv) + 128 + cfg.bright * t * 0.5;

        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = 1 + (sK - 1) * wv;
        r = gray + (r - gray) * sat + cfg.warm * t * 0.55 * 0.5;
        g = gray + (g - gray) * sat + cfg.warm * t * 0.20 * 0.5;
        b = gray + (b - gray) * sat - cfg.warm * t * 0.45 * 0.5;

        if (cfg.pink) {
          r += cfg.pink * t * 0.5;
          g -= cfg.pink * t * 0.3;
          b += cfg.pink * t * 0.1;
        }

        if (cfg.glow) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const gl = cfg.glow * t * 14 * sstep(120, 230, lum);
          r += gl;
          g += gl * 0.92;
          b += gl * 0.9;
        }
      }

      o[i] = c255(r);
      o[i + 1] = c255(g);
      o[i + 2] = c255(b);
      o[i + 3] = 255;
    }

    /* Pass 2: fine pink/red pore texture (Refined etc.) */
    if (cfg.tex > 0) {
      const prob = 0.12 * cfg.tex * (0.5 + f);
      const k = cfg.tex * f * 2;
      const dot = (idx, a) => {
        o[idx] = c255(o[idx] - 5 * a);
        o[idx + 1] = c255(o[idx + 1] - 20 * a);
        o[idx + 2] = c255(o[idx + 2] - 13 * a);
      };
      for (let p = 0; p < n; p++) {
        if (W[p] < 0.6) continue;
        let hsh = Math.imul(p + 0x9e3779b9, 0x85ebca6b);
        hsh ^= hsh >>> 13;
        hsh = Math.imul(hsh, 0xc2b2ae35);
        hsh ^= hsh >>> 16;
        const u = (hsh >>> 0) / 4294967296;
        if (u >= prob) continue;
        const d = ((hsh >>> 8) & 255) / 255;
        const a = d * d * k * W[p];
        const i = p * 4;
        dot(i, a);
        const x = p % w;
        if (x < w - 1 && (hsh & 1)) dot(i + 4, a * 0.5);
        else if (p + w < n) dot(i + w * 4, a * 0.5);
      }
    }

    octx.putImageData(outImg, 0, 0);
    return await new Promise((resolve, reject) => {
      out.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export skin finish"));
      }, "image/jpeg", 0.94);
    });
  }

  // app.js calls renderSkinFinish by name; replace it globally.
  window.renderSkinFinish = renderSkinFinish;
})();



/* =========================================================
   RETOUCH PANEL STYLING HOOK
   retouch.js builds #retouchPanel itself; we only tag it with
   classes so style.css (.rtPanel) can give it the pink look + icons.
========================================================= */
(() => {
  "use strict";

  const BY_ID = {
    rtAuto: "auto", rtCompare: "compare", rtTap: "tap", rtUndo: "undo",
    rtReset: "reset", rtZoomOut: "zoomout", rtZoomReset: "zoomreset",
    rtZoomIn: "zoomin", rtDownload: "download", rtClose: "close"
  };

  function paintSlider(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const pct = ((Number(input.value) - min) / (max - min || 1)) * 100;
    input.style.setProperty("--p", pct + "%");
  }

  function decorate() {
    const panel = document.getElementById("retouchPanel");
    if (!panel) return;

    panel.classList.add("rtPanel");
    const title = panel.querySelector("strong");
    if (title) title.classList.add("rtTitle");

    panel.querySelectorAll("button").forEach(btn => {
      const k = BY_ID[btn.id];
      if (!k) return;
      btn.dataset.rt = k;
      if (k === "tap") {
        btn.dataset.on = /:\s*on/i.test(btn.textContent) ? "1" : "0";
      }
    });

    panel.querySelectorAll("#rtTapSize").forEach(input => {
      paintSlider(input);
      const box = input.parentElement;
      if (box && box !== panel) box.classList.add("rtSliderBox");
    });
  }

  let queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorate(); });
  }

  document.addEventListener("input", e => {
    if (e.target && e.target.id === "rtTapSize") paintSlider(e.target);
  });

  new MutationObserver(queue).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  queue();
})();


/* =========================================================
   EXTRA ADJUSTMENTS: Vignette + Vintage
   Adds two ids to app.js's adjustment list and wraps
   applyAdjustments() so the effects run after the normal pipeline.
========================================================= */
(() => {
  "use strict";

  if (typeof adjustmentIds === "undefined" || typeof adjustmentValues === "undefined") return;
  if (typeof window.applyAdjustments !== "function") return;

  ["vignette", "vintage"].forEach(id => {
    if (!adjustmentIds.includes(id)) adjustmentIds.push(id);
    if (adjustmentValues[id] === undefined) adjustmentValues[id] = 0;
  });

  const original = window.applyAdjustments;

  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  window.applyAdjustments = async function () {
    await original();

    const vg = Number(adjustmentValues.vignette) || 0;
    const vt = Number(adjustmentValues.vintage) || 0;
    if (!vg && !vt) return;
    if (!adjustmentBaseBlob || !editedBlob) return;

    const img = await loadImage(editedBlob);
    const w = img.naturalWidth, h = img.naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    const vgAmt = vg / 100;           // -1..1  (+ dark edges, - light edges)
    const vtAmt = Math.abs(vt) / 100; // 0..1
    const vtSign = vt >= 0 ? 1 : -1;  // + warm faded film, - cool faded film

    const cx = w / 2, cy = h / 2;
    const maxDist = Math.hypot(cx, cy);

    for (let y = 0, p = 0; y < h; y++) {
      for (let x = 0; x < w; x++, p++) {
        const i = p * 4;
        let r = d[i], g = d[i + 1], b = d[i + 2];

        if (vtAmt > 0) {
          // fade: lift blacks, soften contrast
          const lift = 38 * vtAmt;
          r = lift + r * (1 - lift / 255);
          g = lift + g * (1 - lift / 255);
          b = lift + b * (1 - lift / 255);

          // desaturate a little
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const ds = 0.28 * vtAmt;
          r += (gray - r) * ds;
          g += (gray - g) * ds;
          b += (gray - b) * ds;

          // colour cast
          r += 16 * vtAmt * vtSign;
          g += 5 * vtAmt * vtSign;
          b -= 14 * vtAmt * vtSign;

          // film grain (stable per pixel, so it doesn't flicker)
          let hs = Math.imul(p + 0x9e3779b9, 0x85ebca6b);
          hs ^= hs >>> 13;
          hs = Math.imul(hs, 0xc2b2ae35);
          hs ^= hs >>> 16;
          const grain = (((hs >>> 0) / 4294967296) - 0.5) * 34 * vtAmt;
          r += grain;
          g += grain;
          b += grain;
        }

        if (vgAmt !== 0) {
          const dist = Math.hypot(x - cx, y - cy) / maxDist;
          const m = smooth(0.30, 1.0, dist);
          if (vgAmt > 0) {
            const k = 1 - 0.8 * vgAmt * m;
            r *= k; g *= k; b *= k;
          } else {
            const k = 0.65 * -vgAmt * m;
            r += (255 - r) * k;
            g += (255 - g) * k;
            b += (255 - b) * k;
          }
        }

        d[i] = c255(r);
        d[i + 1] = c255(g);
        d[i + 2] = c255(b);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.94));
    if (!blob) return;

    editedBlob = blob;
    publishEditedBlob(blob);
    if (preview) preview.src = URL.createObjectURL(blob);
  };
})();


/* =========================================================
   BEAUTY PRESETS  (BeautyPlus-style Retouch)
   Adds to the Retouch panel:
     - 5 one-tap presets: Auto, Classic, Daily, Charm, Natural
       (thumbnails are your own photo with the preset applied)
     - 3 sliders: Retouch (skin), Reshape (slim jaw + bigger eyes),
       Makeup (lips + blush)
   Retouch  -> skin engine in skin.js (renderSkinFinish, "beauty" preset)
   Reshape / Makeup -> MediaPipe Face Landmarker (loaded on first use)
   Needs globals from app.js: getCurrentPhotoBlob, loadImage, showResult, showStatus
========================================================= */
(() => {
  "use strict";

  const MP_VERSION = "0.10.14";
  const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  // skin = which skin engine setting to use (see skin.js), style = makeup look.
  // makeup slider 50 = the style exactly as written, 100 = twice as strong.
  const PRESETS = [
    { id: "auto", name: "Auto", retouch: 55, reshape: 15, makeup: 40, skin: "beauty",
      style: { lip: [217, 96, 127], lipA: 0.60, blush: [236, 110, 135], blushA: 0.28,
               eye: [170, 105, 105], eyeA: 0.30, liner: 0.30 } },
    { id: "classic", name: "Classic", retouch: 45, reshape: 0, makeup: 55, skin: "beauty",
      style: { lip: [199, 47, 79], lipA: 0.70, blush: [232, 100, 115], blushA: 0.22,
               eye: [120, 80, 75], eyeA: 0.25, liner: 0.35 } },
    { id: "daily", name: "Daily", retouch: 40, reshape: 5, makeup: 30, skin: "beauty",
      style: { lip: [229, 138, 150], lipA: 0.55, blush: [240, 130, 140], blushA: 0.22,
               eye: [190, 140, 125], eyeA: 0.22, liner: 0.15 } },
    { id: "charm", name: "Charm", retouch: 50, reshape: 0, makeup: 50, skin: "charm",
      style: { lip: [214, 100, 112], lipA: 0.65, blush: [238, 112, 135], blushA: 0.34,
               eye: [165, 100, 95], eyeA: 0.45, liner: 0.40 } },
    { id: "natural", name: "Natural", retouch: 50, reshape: 0, makeup: 40, skin: "natural",
      style: { lip: [226, 128, 128], lipA: 0.55, blush: [240, 140, 140], blushA: 0.26,
               eye: [195, 135, 120], eyeA: 0.28, liner: 0.20 } }
  ];
  const DEFAULT_STYLE = PRESETS[0].style;

  const LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
  const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
  const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
                     148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  const JAW = [58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288];
  const CHIN = [152, 148, 377, 176, 400];

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);

  /* ---------------- Face landmarks ---------------- */

  let landmarkerPromise = null;
  let faceAIFailed = false;
  const lmCache = new WeakMap();

  function getLandmarker() {
    if (!landmarkerPromise) {
      landmarkerPromise = (async () => {
        const base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION;
        const mp = await import(base + "/vision_bundle.mjs");
        const fileset = await mp.FilesetResolver.forVisionTasks(base + "/wasm");
        return await mp.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL },
          runningMode: "IMAGE",
          numFaces: 1
        });
      })().catch(err => {
        landmarkerPromise = null;
        faceAIFailed = true;
        throw err;
      });
    }
    return landmarkerPromise;
  }

  async function getLandmarks(blob) {
    if (lmCache.has(blob)) return lmCache.get(blob);
    let pts = null;
    try {
      const lm = await getLandmarker();
      const img = await loadImage(blob);
      const res = lm.detect(img);
      if (res && res.faceLandmarks && res.faceLandmarks[0]) pts = res.faceLandmarks[0];
    } catch (err) {
      console.error("Face landmarks failed:", err);
    }
    lmCache.set(blob, pts);
    return pts;
  }

  /* ---------------- Makeup ---------------- */

  const R_EYE_OUT = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
  const L_EYE_OUT = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
  const R_SHADOW  = [33, 246, 161, 160, 159, 158, 157, 173, 133, 190, 56, 28, 27, 29, 30, 247];
  const L_SHADOW  = [263, 466, 388, 387, 386, 385, 384, 398, 362, 414, 286, 258, 257, 259, 260, 467];
  const R_LINER   = [33, 246, 161, 160, 159, 158, 157, 173, 133];
  const L_LINER   = [263, 466, 388, 387, 386, 385, 384, 398, 362];

  function polyPath(ctx, pts, idxs, w, h) {
    ctx.beginPath();
    idxs.forEach((i, k) => {
      const x = pts[i].x * w, y = pts[i].y * h;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  // Paints `color` through a soft mask drawn by draw(ctx) (absolute image coordinates).
  function paintRegion(ctx, w, h, pts, idxs, draw, color, alpha, blurPx, keepLight) {
    if (alpha <= 0.003) return;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    idxs.forEach(i => {
      const x = pts[i].x * w, y = pts[i].y * h;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    const pad = Math.max(8, (maxX - minX) * 0.2);
    const bx = Math.floor(clamp(minX - pad, 0, w - 1));
    const by = Math.floor(clamp(minY - pad, 0, h - 1));
    const bw = Math.min(w - bx, Math.ceil(maxX - minX + pad * 2));
    const bh = Math.min(h - by, Math.ceil(maxY - minY + pad * 2));
    if (bw < 2 || bh < 2) return;

    const m = document.createElement("canvas");
    m.width = bw;
    m.height = bh;
    const mc = m.getContext("2d");
    mc.translate(-bx, -by);
    draw(mc);

    const m2 = document.createElement("canvas");
    m2.width = bw;
    m2.height = bh;
    const m2c = m2.getContext("2d", { willReadFrequently: true });
    m2c.filter = "blur(" + blurPx + "px)";
    m2c.drawImage(m, 0, 0);
    m2c.filter = "none";

    const mask = m2c.getImageData(0, 0, bw, bh).data;
    const region = ctx.getImageData(bx, by, bw, bh);
    const d = region.data;

    for (let p = 0, i = 0; p < bw * bh; p++, i += 4) {
      const a = (mask[i + 3] / 255) * alpha;
      if (a <= 0.003) continue;
      let k = 1;
      if (keepLight) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        k = 0.65 + 0.55 * (lum / 255);
      }
      d[i]     = c255(d[i]     * (1 - a) + color[0] * k * a);
      d[i + 1] = c255(d[i + 1] * (1 - a) + color[1] * k * a);
      d[i + 2] = c255(d[i + 2] * (1 - a) + color[2] * k * a);
    }
    ctx.putImageData(region, bx, by);
  }

  function applyBlush(ctx, w, h, pts, color, alpha) {
    if (alpha <= 0.003) return;
    const fw = Math.hypot((pts[454].x - pts[234].x) * w, (pts[454].y - pts[234].y) * h);
    const R = fw * 0.17;
    [50, 280].forEach(idx => {
      const cx = pts[idx].x * w, cy = pts[idx].y * h;
      const bx = Math.floor(clamp(cx - R, 0, w - 1));
      const by = Math.floor(clamp(cy - R, 0, h - 1));
      const bw = Math.min(w - bx, Math.ceil(R * 2));
      const bh = Math.min(h - by, Math.ceil(R * 2));
      if (bw < 2 || bh < 2) return;
      const region = ctx.getImageData(bx, by, bw, bh);
      const d = region.data;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const dist = Math.hypot(bx + x - cx, by + y - cy) / R;
          if (dist >= 1) continue;
          const a = (1 - dist) * (1 - dist) * alpha;
          const i = (y * bw + x) * 4;
          d[i]     = c255(d[i]     * (1 - a) + color[0] * a);
          d[i + 1] = c255(d[i + 1] * (1 - a) + color[1] * a);
          d[i + 2] = c255(d[i + 2] * (1 - a) + color[2] * a);
        }
      }
      ctx.putImageData(region, bx, by);
    });
  }

  // makeup: slider 0..100 (50 = style as written)
  function applyMakeup(ctx, w, h, pts, makeup, style) {
    const m = makeup / 50;
    const A = v => Math.min(0.9, v * m);

    applyBlush(ctx, w, h, pts, style.blush, A(style.blushA));

    // eyeshadow on the lid (eye opening is cut out)
    [[R_SHADOW, R_EYE_OUT], [L_SHADOW, L_EYE_OUT]].forEach(([shadow, eye]) => {
      paintRegion(ctx, w, h, pts, shadow, mc => {
        mc.fillStyle = "#fff";
        polyPath(mc, pts, shadow, w, h);
        mc.fill();
        mc.globalCompositeOperation = "destination-out";
        polyPath(mc, pts, eye, w, h);
        mc.fill();
        mc.globalCompositeOperation = "source-over";
      }, style.eye, A(style.eyeA), Math.max(1.5, w * 0.004), true);
    });

    // eyeliner along the upper lash line
    [R_LINER, L_LINER].forEach(line => {
      const a = pts[line[0]], b = pts[line[line.length - 1]];
      const eyeW = Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
      paintRegion(ctx, w, h, pts, line, mc => {
        mc.strokeStyle = "#fff";
        mc.lineWidth = Math.max(1.2, eyeW * 0.06);
        mc.lineJoin = "round";
        mc.lineCap = "round";
        mc.beginPath();
        line.forEach((i, k) => {
          const x = pts[i].x * w, y = pts[i].y * h;
          if (k) mc.lineTo(x, y); else mc.moveTo(x, y);
        });
        mc.stroke();
      }, [45, 28, 28], A(style.liner), Math.max(0.6, w * 0.0012), false);
    });

    // lips (mouth opening is cut out)
    paintRegion(ctx, w, h, pts, LIP_OUTER, mc => {
      mc.fillStyle = "#fff";
      polyPath(mc, pts, LIP_OUTER, w, h);
      mc.fill();
      mc.globalCompositeOperation = "destination-out";
      polyPath(mc, pts, LIP_INNER, w, h);
      mc.fill();
      mc.globalCompositeOperation = "source-over";
    }, style.lip, A(style.lipA), Math.max(0.8, w * 0.0015), true);
  }

  /* ---------------- Reshape (slim jaw + bigger eyes) ---------------- */

  function warpFace(ctx, w, h, pts, amount) {
    const P = i => ({ x: pts[i].x * w, y: pts[i].y * h });
    const fw = Math.hypot(P(454).x - P(234).x, P(454).y - P(234).y);
    const cxFace = (P(234).x + P(454).x) / 2;
    const sigma = fw * 0.09;
    const s2 = 2 * sigma * sigma;
    const reach2 = 9 * sigma * sigma;

    // jaw controls: content at each point moves toward the face centre
    const ctrls = JAW.map(i => {
      const p = P(i);
      const dxc = cxFace - p.x;
      const isChin = CHIN.includes(i);
      let dx = 0;
      if (Math.abs(dxc) > fw * 0.02) dx = Math.sign(dxc) * fw * 0.05 * amount * (isChin ? 0.4 : 1);
      const dy = -fw * 0.03 * amount * (isChin ? 1 : 0.3);
      return { x: p.x, y: p.y, dx, dy };
    });

    // eye bulge
    const eyes = [];
    const hasIris = pts.length > 473;
    [[33, 133, 468], [263, 362, 473]].forEach(([a, b, iris]) => {
      const A = P(a), B = P(b);
      const c = hasIris ? P(iris) : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      eyes.push({ x: c.x, y: c.y, R: Math.hypot(A.x - B.x, A.y - B.y) * 1.15 });
    });
    const eyeA = 0.25 * amount;

    // bounding box of everything that moves
    let minX = w, minY = h, maxX = 0, maxY = 0;
    ctrls.forEach(c => {
      minX = Math.min(minX, c.x - 3 * sigma); maxX = Math.max(maxX, c.x + 3 * sigma);
      minY = Math.min(minY, c.y - 3 * sigma); maxY = Math.max(maxY, c.y + 3 * sigma);
    });
    eyes.forEach(e => {
      minX = Math.min(minX, e.x - e.R); maxX = Math.max(maxX, e.x + e.R);
      minY = Math.min(minY, e.y - e.R); maxY = Math.max(maxY, e.y + e.R);
    });
    const x0 = Math.floor(clamp(minX, 0, w - 1)), x1 = Math.ceil(clamp(maxX, 0, w - 1));
    const y0 = Math.floor(clamp(minY, 0, h - 1)), y1 = Math.ceil(clamp(maxY, 0, h - 1));

    const src = ctx.getImageData(0, 0, w, h);
    const sd = src.data;
    const out = ctx.createImageData(w, h);
    const od = out.data;
    od.set(sd);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let ox = 0, oy = 0;

        for (let k = 0; k < ctrls.length; k++) {
          const c = ctrls[k];
          const ddx = x - c.x, ddy = y - c.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > reach2) continue;
          const g = Math.exp(-d2 / s2);
          ox -= c.dx * g;
          oy -= c.dy * g;
        }

        for (let k = 0; k < eyes.length; k++) {
          const e = eyes[k];
          const ddx = x - e.x, ddy = y - e.y;
          const r = Math.hypot(ddx, ddy) / e.R;
          if (r >= 1) continue;
          const f = 1 - r * r;
          ox -= ddx * eyeA * f;
          oy -= ddy * eyeA * f;
        }

        if (ox === 0 && oy === 0) continue;

        let sx = clamp(x + ox, 0, w - 1.001);
        let sy = clamp(y + oy, 0, h - 1.001);
        const ix = sx | 0, iy = sy | 0;
        const fx = sx - ix, fy = sy - iy;
        const i00 = (iy * w + ix) * 4, i10 = i00 + 4;
        const i01 = i00 + w * 4, i11 = i01 + 4;
        const oi = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          od[oi + c] =
            (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) +
            (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  /* ---------------- Pipeline ---------------- */

  function toBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Export failed"))), "image/jpeg", 0.94);
    });
  }

  // p = { retouch, reshape, makeup, lip }
  async function renderBeauty(blob, p) {
    let out = blob;

    if (p.retouch > 0 && typeof window.renderSkinFinish === "function") {
      out = await window.renderSkinFinish(blob, p.skin || "beauty", p.retouch);
    }
    if (p.reshape <= 0 && p.makeup <= 0) return out;

    const pts = await getLandmarks(blob);
    if (!pts) return out;

    const img = await loadImage(out);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    if (p.makeup > 0) applyMakeup(ctx, w, h, pts, p.makeup, p.style || DEFAULT_STYLE);
    if (p.reshape > 0) warpFace(ctx, w, h, pts, p.reshape / 100);

    return await toBlob(canvas);
  }

  async function makeFaceCrop(blob) {
    const img = await loadImage(blob);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const pts = await getLandmarks(blob);

    let cx = iw / 2, cy = ih * 0.4, bw = iw * 0.6;
    if (pts) {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      FACE_OVAL.forEach(i => {
        minX = Math.min(minX, pts[i].x); maxX = Math.max(maxX, pts[i].x);
        minY = Math.min(minY, pts[i].y); maxY = Math.max(maxY, pts[i].y);
      });
      cx = ((minX + maxX) / 2) * iw;
      cy = ((minY + maxY) / 2) * ih;
      bw = (maxX - minX) * iw;
    }

    let cw = Math.min(iw, bw * 1.7);
    let ch = cw / 0.8;
    if (ch > ih) { ch = ih; cw = ch * 0.8; }
    const sx = clamp(cx - cw / 2, 0, iw - cw);
    const sy = clamp(cy - ch / 2, 0, ih - ch);

    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 250;
    canvas.getContext("2d").drawImage(img, sx, sy, cw, ch, 0, 0, 200, 250);
    return await toBlob(canvas);
  }

  /* ---------------- UI ---------------- */

  const state = { preset: "none", retouch: 0, reshape: 0, makeup: 0, skin: "beauty", style: DEFAULT_STYLE };

  let base = null;          // photo the preview is computed from
  let dirty = false;        // preview differs from base
  let lastBlob = null;
  let previewUrl = "";
  let timer = null;
  let seq = 0;
  let thumbBase = null;
  let thumbBusy = false;

  function say(msg) {
    if (typeof showStatus === "function") showStatus(msg);
  }
  function hideSay() {
    const s = $("status");
    if (s) s.style.display = "none";
  }

  function addStyle() {
    if ($("bpStyle")) return;
    const st = document.createElement("style");
    st.id = "bpStyle";
    st.textContent = `
      #bpBlock { margin: 8px 0 10px; padding-bottom: 10px; border-bottom: 1px solid #f1d2e1; }
      #bpBlock .bpHead { font-size: 14px; font-weight: 800; color: #2b1d25; margin: 8px 0 6px; }
      #bpBlock .bpCards { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 8px; scrollbar-width: none; }
      #bpBlock .bpCards::-webkit-scrollbar { display: none; }
      #bpBlock .bpCard { flex: 0 0 auto; width: 68px; text-align: center; cursor: pointer;
        font-size: 12px; font-weight: 600; color: #5d4a55; }
      #bpBlock .bpThumb { display: flex; align-items: center; justify-content: center;
        width: 68px; height: 84px; border-radius: 12px; object-fit: cover; margin-bottom: 4px;
        background: linear-gradient(135deg, #fde4ef, #fff); border: 2px solid transparent; box-sizing: border-box; }
      #bpBlock .bpThumb svg { width: 26px; height: 26px; color: #c21868; }
      #bpBlock .bpCard.sel .bpThumb { border-color: #f42f91; box-shadow: 0 3px 10px rgba(244,47,145,.3); }
      #bpBlock .bpCard.sel { color: #c21868; }
      #bpBlock .bpRow { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
      #bpBlock .bpRow label { width: 64px; font-size: 13px; font-weight: 700; color: #2b1d25; }
      #bpBlock .bpRow input { flex: 1; min-width: 0; }
      #bpBlock .bpRow span { width: 30px; text-align: right; font-size: 12px; font-weight: 700; color: #c21868; }
      #bpBlock .bpActions { display: flex; gap: 8px; margin-top: 10px; }
      #retouchPanel .bpBtn { flex: 1; min-height: 38px; padding: 7px 10px !important;
        border: 1.5px solid #f28ab9 !important; border-radius: 12px !important;
        background: #fff !important; color: #c21868 !important; font-size: 13px; font-weight: 700; }
      #retouchPanel .bpBtn.bpPrimary { background: linear-gradient(135deg, #f42f91, #ff6fb5) !important;
        border-color: #f42f91 !important; color: #fff !important; }
      #bpBlock .bpNote { font-size: 11px; color: #8a7480; margin-top: 6px; line-height: 1.5; }
    `;
    document.head.appendChild(st);
  }

  function setSlider(id, value) {
    const input = $(id);
    if (!input) return;
    input.value = value;
    input.style.setProperty("--p", value + "%");
    const v = $(id + "V");
    if (v) v.textContent = value;
  }

  function syncSliders() {
    setSlider("bpRetouch", state.retouch);
    setSlider("bpReshape", state.reshape);
    setSlider("bpMakeup", state.makeup);
  }

  function markSelected() {
    document.querySelectorAll("#bpBlock .bpCard").forEach(c => {
      c.classList.toggle("sel", c.dataset.id === state.preset);
    });
  }

  function setNote(text) {
    const n = $("bpNote");
    if (n) n.textContent = text || "";
  }

  function currentBase() {
    const cur = typeof getCurrentPhotoBlob === "function" ? getCurrentPhotoBlob() : null;
    if (cur) base = cur;
    return base;
  }

  function setPreviewBlob(blob) {
    const p = $("preview");
    if (!p) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    p.src = previewUrl;
  }

  function restoreBase() {
    if (!dirty) return;
    const p = $("preview");
    if (p && base) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(base);
      p.src = previewUrl;
    }
    dirty = false;
    lastBlob = null;
  }

  function resetState() {
    state.preset = "none";
    state.retouch = state.reshape = state.makeup = 0;
    syncSliders();
    markSelected();
  }

  async function runPreview() {
    const b = currentBase();
    if (!b) { say("Please select a photo first."); return; }

    if (!state.retouch && !state.reshape && !state.makeup) {
      restoreBase();
      hideSay();
      return;
    }

    const mine = ++seq;
    say("Applying...");
    try {
      const blob = await renderBeauty(b, state);
      if (mine !== seq || !blob) return;
      lastBlob = blob;
      dirty = blob !== b;
      setPreviewBlob(blob);
      hideSay();

      if ((state.reshape > 0 || state.makeup > 0) && lmCache.get(b) === null) {
        setNote(faceAIFailed
          ? "Face AI load nahi hua (internet check karein). Abhi sirf Retouch chal raha hai."
          : "Chehra detect nahi hua. Reshape/Makeup ke liye saaf, seedhi photo try karein.");
      } else {
        setNote("");
      }
    } catch (err) {
      console.error(err);
      say("Beauty effect failed. Please try again.");
    }
  }

  function schedulePreview(delay) {
    clearTimeout(timer);
    timer = setTimeout(runPreview, delay);
  }

  function selectPreset(id) {
    state.preset = id;
    if (id === "none") {
      state.retouch = state.reshape = state.makeup = 0;
    } else {
      const p = PRESETS.find(x => x.id === id);
      state.retouch = p.retouch;
      state.reshape = p.reshape;
      state.makeup = p.makeup;
      state.skin = p.skin;
      state.style = p.style;
    }
    syncSliders();
    markSelected();
    schedulePreview(0);
  }

  async function applyResult() {
    if (!dirty || !lastBlob) { say("Pehle koi preset chunein."); return; }
    const blob = lastBlob;
    dirty = false;
    lastBlob = null;
    if (typeof showResult === "function") showResult(blob);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ""; }
    resetState();
    say("Beauty applied ✓");
    thumbBase = null;
    refreshThumbs();
  }

  function cancelResult() {
    clearTimeout(timer);
    seq++;
    restoreBase();
    resetState();
    hideSay();
  }

  function setThumb(id, blob) {
    const card = document.querySelector('#bpBlock .bpCard[data-id="' + id + '"]');
    if (!card) return;
    const old = card.querySelector("img.bpThumb");
    const url = URL.createObjectURL(blob);
    if (old) {
      if (old.dataset.url) URL.revokeObjectURL(old.dataset.url);
      old.src = url;
      old.dataset.url = url;
    }
  }

  async function refreshThumbs() {
    const cur = typeof getCurrentPhotoBlob === "function" ? getCurrentPhotoBlob() : null;
    if (!cur || cur === thumbBase || thumbBusy) return;
    thumbBusy = true;
    thumbBase = cur;
    try {
      setNote("Face AI pehli baar load hota hai, thoda time lag sakta hai...");
      const crop = await makeFaceCrop(cur);
      for (const p of PRESETS) {
        if (thumbBase !== cur) break;
        const out = await renderBeauty(crop, p);
        setThumb(p.id, out);
      }
      setNote(faceAIFailed ? "Face AI load nahi hua. Sirf Retouch slider chalega." : "");
    } catch (err) {
      console.error(err);
      setNote("");
    } finally {
      thumbBusy = false;
    }
  }

  function buildBlock(panel) {
    if ($("bpBlock")) return;
    const title = panel.querySelector("strong");
    if (!title) return;
    addStyle();

    const block = document.createElement("div");
    block.id = "bpBlock";

    const cards = ['<div class="bpCard sel" data-id="none"><div class="bpThumb">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M6.3 6.3l11.4 11.4"/></svg>' +
      '</div>Original</div>']
      .concat(PRESETS.map(p =>
        '<div class="bpCard" data-id="' + p.id + '"><img class="bpThumb" alt="' + p.name + '"><div>' +
        p.name + '</div></div>'));

    block.innerHTML =
      '<div class="bpHead">Beauty</div>' +
      '<div class="bpCards" id="bpCards">' + cards.join("") + '</div>' +
      '<div class="bpRow"><label for="bpRetouch">Retouch</label>' +
        '<input id="bpRetouch" type="range" min="0" max="100" value="0"><span id="bpRetouchV">0</span></div>' +
      '<div class="bpRow"><label for="bpReshape">Reshape</label>' +
        '<input id="bpReshape" type="range" min="0" max="100" value="0"><span id="bpReshapeV">0</span></div>' +
      '<div class="bpRow"><label for="bpMakeup">Makeup</label>' +
        '<input id="bpMakeup" type="range" min="0" max="100" value="0"><span id="bpMakeupV">0</span></div>' +
      '<div class="bpActions">' +
        '<button type="button" class="bpBtn" id="bpCancel">Cancel</button>' +
        '<button type="button" class="bpBtn bpPrimary" id="bpApply">Apply ✓</button></div>' +
      '<div class="bpNote" id="bpNote"></div>';

    title.insertAdjacentElement("afterend", block);

    block.querySelectorAll(".bpCard").forEach(card => {
      card.addEventListener("click", () => selectPreset(card.dataset.id));
    });

    [["bpRetouch", "retouch"], ["bpReshape", "reshape"], ["bpMakeup", "makeup"]].forEach(([id, key]) => {
      $(id).addEventListener("input", e => {
        state[key] = Number(e.target.value);
        setSlider(id, state[key]);
        schedulePreview(160);
      });
    });

    $("bpApply").addEventListener("click", applyResult);
    $("bpCancel").addEventListener("click", cancelResult);
  }

  function isOpen(panel) {
    return getComputedStyle(panel).display !== "none";
  }

  function watchPanel(panel) {
    if (panel.dataset.bpWatched) return;
    panel.dataset.bpWatched = "1";
    buildBlock(panel);

    let wasOpen = isOpen(panel);
    if (wasOpen) refreshThumbs();

    new MutationObserver(() => {
      const open = isOpen(panel);
      if (open && !wasOpen) refreshThumbs();
      if (!open && wasOpen && dirty) cancelResult();
      wasOpen = open;
    }).observe(panel, { attributes: true, attributeFilter: ["style", "class"] });
  }

  function init() {
    const existing = $("retouchPanel");
    if (existing) watchPanel(existing);

    new MutationObserver(() => {
      const panel = $("retouchPanel");
      if (panel && !panel.dataset.bpWatched) watchPanel(panel);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();


/* =========================================================
   HAIR STYLE  (Hair -> Style)
   Looks applied only on the hair (uses the same hair mask as Hair Color):
   Shine, Silky, Rich, Highlights, Ombre, Rose Gold.
   Needs from app.js: getHairSegmenter, getCurrentPhotoBlob, loadImage,
   showResult, showStatus.
========================================================= */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const c255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const STYLES = [
    { id: "shine",  name: "Shine",     kind: "shine",
      sw: "linear-gradient(135deg,#15110f 0%,#8a8480 45%,#15110f 70%)" },
    { id: "silky",  name: "Silky",     kind: "silky",
      sw: "linear-gradient(160deg,#241915 0%,#5c4a42 55%,#2b1f1a 100%)" },
    { id: "rich",   name: "Rich",      kind: "rich",
      sw: "linear-gradient(135deg,#1a0b10 0%,#4a1424 100%)" },
    { id: "streak", name: "Highlights", kind: "streak", color: [200, 140, 70],
      sw: "linear-gradient(135deg,#20150f 0%,#6b4a2a 30%,#20150f 45%,#9a6a36 62%,#20150f 80%)" },
    { id: "ombre",  name: "Ombre",     kind: "ombre", color: [201, 139, 61],
      sw: "linear-gradient(180deg,#20150f 0%,#20150f 35%,#c98b3d 100%)" },
    { id: "rose",   name: "Rose Gold", kind: "ombre", color: [217, 145, 143],
      sw: "linear-gradient(180deg,#20150f 0%,#20150f 35%,#d9918f 100%)" }
  ];

  const st = { style: null, level: 60 };
  let base = null, dirty = false, lastBlob = null, previewUrl = "";
  let timer = null, seq = 0;
  const maskCache = new WeakMap();

  function say(m) { if (typeof showStatus === "function") showStatus(m); }
  function hideSay() { const s = $("status"); if (s) s.style.display = "none"; }

  /* ---------- hair mask ---------- */

  async function hairAlpha(blob, w, h) {
    const hit = maskCache.get(blob);
    if (hit && hit.w === w && hit.h === h) return hit;

    const segmenter = await getHairSegmenter();
    const img = await loadImage(blob);
    const result = segmenter.segment(img);

    let values = null, mw = 0, mh = 0;
    if (result.confidenceMasks && result.confidenceMasks.length > 1) {
      const m = result.confidenceMasks[1];
      values = new Float32Array(m.getAsFloat32Array());
      mw = m.width;
      mh = m.height;
    } else if (result.categoryMask) {
      const cat = result.categoryMask.getAsUint8Array();
      mw = result.categoryMask.width;
      mh = result.categoryMask.height;
      values = new Float32Array(mw * mh);
      for (let i = 0; i < values.length; i++) values[i] = cat[i] === 1 ? 1 : 0;
    }
    if (result.close) result.close();
    if (!values) throw new Error("Hair mask was not returned");

    const small = document.createElement("canvas");
    small.width = mw;
    small.height = mh;
    const sctx = small.getContext("2d");
    const simg = sctx.createImageData(mw, mh);
    for (let i = 0; i < mw * mh; i++) {
      const v = clamp(values[i], 0, 1);
      simg.data[i * 4] = simg.data[i * 4 + 1] = simg.data[i * 4 + 2] = 255;
      simg.data[i * 4 + 3] = Math.round((v < 0.35 ? 0 : v) * 255);
    }
    sctx.putImageData(simg, 0, 0);

    const big = document.createElement("canvas");
    big.width = w;
    big.height = h;
    const bctx = big.getContext("2d", { willReadFrequently: true });
    bctx.filter = "blur(1.2px)";
    bctx.drawImage(small, 0, 0, w, h);
    bctx.filter = "none";
    const raw = bctx.getImageData(0, 0, w, h).data;

    const alpha = new Float32Array(w * h);
    let minY = h, maxY = 0;
    for (let p = 0; p < w * h; p++) {
      const a = raw[p * 4 + 3] / 255;
      const v = a < 0.30 ? 0 : clamp((a - 0.30) / 0.70, 0, 1);
      alpha[p] = v;
      if (v > 0.5) {
        const y = (p / w) | 0;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const out = { w, h, alpha, minY, maxY: Math.max(maxY, minY + 1) };
    maskCache.set(blob, out);
    return out;
  }

  /* ---------- noise for highlight streaks ---------- */

  function hash2(ix, iy) {
    let h = Math.imul(ix * 374761393 + iy * 668265263, 1274126177);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy), b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  }

  /* ---------- render ---------- */

  async function renderHair(blob, style, level) {
    const f = clamp(level / 100, 0, 1);
    const img = await loadImage(blob);
    const scale = Math.min(1, 1400 / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const mask = await hairAlpha(blob, w, h);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    let bl = null;
    if (style.kind === "silky" || style.kind === "streak") {
      const t = document.createElement("canvas");
      t.width = w;
      t.height = h;
      const tc = t.getContext("2d", { willReadFrequently: true });
      tc.filter = "blur(" + (style.kind === "streak"
        ? Math.max(2, w * 0.004) : Math.max(1.5, w * 0.002)) + "px)";
      tc.drawImage(canvas, 0, 0);
      tc.filter = "none";
      bl = tc.getImageData(0, 0, w, h).data;
    }

    const span = Math.max(1, mask.maxY - mask.minY);
    const alpha = mask.alpha;
    const cellBig = Math.max(24, w * 0.07);

    for (let y = 0, p = 0; y < h; y++) {
      const hn = (y - mask.minY) / span;
      const band = Math.exp(-Math.pow((hn - 0.30) / 0.10, 2)) +
                   0.6 * Math.exp(-Math.pow((hn - 0.62) / 0.08, 2));
      for (let x = 0; x < w; x++, p++) {
        const al = alpha[p];
        if (al < 0.01) continue;
        const i = p * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let nr = r, ng = g, nb = b;

        if (style.kind === "shine" || style.kind === "silky") {
          const lw = sstep(6, 50, lum) * (1 - sstep(150, 230, lum));
          let add;
          if (style.kind === "shine") {
            add = f * (26 * lw + 70 * band * lw);
          } else {
            add = f * (12 * lw + 30 * band * lw);
            nr = r + (bl[i] - r) * 0.75 * f;
            ng = g + (bl[i + 1] - g) * 0.75 * f;
            nb = b + (bl[i + 2] - b) * 0.75 * f;
          }
          nr += add;
          ng += add;
          nb += add * 1.08;
        } else if (style.kind === "rich") {
          const sat = 1 + 0.6 * f;
          nr = lum + (r - lum) * sat;
          ng = lum + (g - lum) * sat;
          nb = lum + (b - lum) * sat;
          const k = 1 + 0.3 * f;
          nr = (nr - 90) * k + 90 - 5 * f + 12 * f * sstep(0, 60, lum);
          ng = (ng - 90) * k + 90 - 5 * f - 2 * f * sstep(0, 60, lum);
          nb = (nb - 90) * k + 90 - 5 * f + 4 * f * sstep(0, 60, lum);
        } else if (style.kind === "streak") {
          // natural highlights: tint the strands that are brighter than their
          // surroundings, only inside soft irregular sections, more toward the ends
          const blum = 0.299 * bl[i] + 0.587 * bl[i + 1] + 0.114 * bl[i + 2];
          const s1 = sstep(0.06, 0.30, (lum - blum) / (blum + 10));
          const sec = sstep(0.35, 0.65,
            vnoise(x / cellBig, y / cellBig) * 0.75 +
            vnoise(x / (cellBig * 0.4), y / (cellBig * 0.4)) * 0.25);
          const ends = 0.5 + 0.5 * sstep(0.1, 0.6, hn);
          const lw = sstep(10, 60, lum);
          const a = f * lw * sec * ends * (0.18 + 0.82 * s1) * 0.95;
          const k = 0.55 + 0.9 * clamp(lum / 90, 0, 1.2);
          nr = r * (1 - a) + style.color[0] * k * a;
          ng = g * (1 - a) + style.color[1] * k * a;
          nb = b * (1 - a) + style.color[2] * k * a;
        } else if (style.kind === "ombre") {
          const a = f * sstep(0.35, 1.0, hn) * 0.85;
          const k = 0.5 + 0.6 * clamp(lum / 70, 0, 1.2);
          nr = r * (1 - a) + style.color[0] * k * a;
          ng = g * (1 - a) + style.color[1] * k * a;
          nb = b * (1 - a) + style.color[2] * k * a;
        }

        d[i]     = c255(r + (nr - r) * al);
        d[i + 1] = c255(g + (ng - g) * al);
        d[i + 2] = c255(b + (nb - b) * al);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(v => (v ? resolve(v) : reject(new Error("Export failed"))), "image/jpeg", 0.94);
    });
  }

  /* ---------- preview / apply ---------- */

  function currentBase() {
    const cur = typeof getCurrentPhotoBlob === "function" ? getCurrentPhotoBlob() : null;
    if (cur) base = cur;
    return base;
  }

  function setPreview(blob) {
    const p = $("preview");
    if (!p) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    p.src = previewUrl;
  }

  function restoreBase() {
    if (!dirty) return;
    const p = $("preview");
    if (p && base) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(base);
      p.src = previewUrl;
    }
    dirty = false;
    lastBlob = null;
  }

  function setNote(t) { const n = $("hsNote"); if (n) n.textContent = t || ""; }

  async function runPreview() {
    const b = currentBase();
    if (!b) { say("Please select a photo first."); return; }
    if (!st.style) return;

    const mine = ++seq;
    say("Applying hair style...");
    try {
      const blob = await renderHair(b, st.style, st.level);
      if (mine !== seq) return;
      lastBlob = blob;
      dirty = true;
      setPreview(blob);
      hideSay();
      setNote("");
    } catch (err) {
      console.error(err);
      say("Hair style failed. Please try again.");
      setNote("Baal detect nahi hue. Baalon wali saaf photo try karein.");
    }
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(runPreview, delay);
  }

  function markCards() {
    document.querySelectorAll("#hairStylePanel .hsCard").forEach(c => {
      c.classList.toggle("sel", !!st.style && c.dataset.id === st.style.id);
    });
  }

  function closePanel(cancel) {
    const panel = $("hairStylePanel");
    clearTimeout(timer);
    seq++;
    if (cancel) restoreBase();
    st.style = null;
    markCards();
    if (panel) panel.style.display = "none";
  }

  function applyStyle() {
    if (!dirty || !lastBlob) { say("Pehle koi style chunein."); return; }
    const blob = lastBlob;
    dirty = false;
    lastBlob = null;
    if (typeof showResult === "function") showResult(blob);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ""; }
    closePanel(false);
    say("Hair style applied ✓");
  }

  /* ---------- UI ---------- */

  function addCss() {
    if ($("hsStyle")) return;
    const s = document.createElement("style");
    s.id = "hsStyle";
    s.textContent = `
      #hairStylePanel .hsHead { font-size: 14px; font-weight: 800; color: #2b1d25; margin-bottom: 10px; }
      #hairStylePanel .hsCards { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 8px; scrollbar-width: none; }
      #hairStylePanel .hsCards::-webkit-scrollbar { display: none; }
      #hairStylePanel .hsCard { flex: 0 0 auto; width: 72px; text-align: center; cursor: pointer;
        font-size: 12px; font-weight: 600; color: #5d4a55; }
      #hairStylePanel .hsSw { width: 56px; height: 56px; margin: 0 auto 5px; border-radius: 50%;
        border: 2px solid #f1d2e1; box-sizing: border-box; }
      #hairStylePanel .hsCard.sel { color: #c21868; }
      #hairStylePanel .hsCard.sel .hsSw { border-color: #f42f91; box-shadow: 0 3px 10px rgba(244,47,145,.35); }
      #hairStylePanel .hsRow { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
      #hairStylePanel .hsRow label { width: 70px; font-size: 13px; font-weight: 700; color: #2b1d25; }
      #hairStylePanel .hsRow input { flex: 1; min-width: 0; accent-color: #f42f91; }
      #hairStylePanel .hsRow span { width: 30px; text-align: right; font-size: 12px; font-weight: 700; color: #c21868; }
      #hairStylePanel .hsActions { display: flex; gap: 8px; margin-top: 10px; }
      #hairStylePanel .hsBtn { flex: 1; min-height: 40px; border: 1.5px solid #f28ab9; border-radius: 12px;
        background: #fff; color: #c21868; font-size: 13px; font-weight: 700; }
      #hairStylePanel .hsBtn.hsPrimary { background: linear-gradient(135deg,#f42f91,#ff6fb5);
        border-color: #f42f91; color: #fff; }
      #hairStylePanel .hsNote { font-size: 11px; color: #8a7480; margin-top: 6px; line-height: 1.5; }
    `;
    document.head.appendChild(s);
  }

  function build() {
    const menu = $("hairMenu");
    const colorPanel = $("hairColorPanel");
    if (!menu || !colorPanel || $("hairStylePanel")) return;
    addCss();

    // Style button next to Color
    const btn = document.createElement("button");
    btn.className = "hairOption";
    btn.id = "hairStyleBtn";
    btn.type = "button";
    btn.innerHTML = '<span class="hairOptionIcon">💇</span><span>Style</span>';
    menu.appendChild(btn);

    // Style panel (same position/look as the Color panel)
    const panel = document.createElement("div");
    panel.id = "hairStylePanel";
    panel.className = "hairColorPanel hairStylePanel";
    panel.style.display = "none";
    panel.innerHTML =
      '<div class="hsHead">Hair Style</div>' +
      '<div class="hsCards">' +
        STYLES.map(s => '<div class="hsCard" data-id="' + s.id + '"><div class="hsSw" style="background:' +
          s.sw + '"></div>' + s.name + '</div>').join("") +
      '</div>' +
      '<div class="hsRow"><label for="hsSlider">Intensity</label>' +
        '<input id="hsSlider" type="range" min="0" max="100" value="60"><span id="hsVal">60</span></div>' +
      '<div class="hsActions"><button type="button" class="hsBtn" id="hsCancel">Cancel</button>' +
        '<button type="button" class="hsBtn hsPrimary" id="hsApply">Apply ✓</button></div>' +
      '<div class="hsNote" id="hsNote"></div>';
    colorPanel.insertAdjacentElement("afterend", panel);

    btn.addEventListener("click", () => {
      if (typeof getCurrentPhotoBlob !== "function" || !getCurrentPhotoBlob()) {
        say("Please select a photo first.");
        return;
      }
      menu.style.display = "none";
      colorPanel.style.display = "none";
      panel.style.display = "block";
      hideSay();
    });

    panel.querySelectorAll(".hsCard").forEach(card => {
      card.addEventListener("click", () => {
        st.style = STYLES.find(s => s.id === card.dataset.id);
        markCards();
        schedule(0);
      });
    });

    $("hsSlider").addEventListener("input", e => {
      st.level = Number(e.target.value);
      $("hsVal").textContent = st.level;
      if (st.style) schedule(150);
    });
    $("hsApply").addEventListener("click", applyStyle);
    $("hsCancel").addEventListener("click", () => { closePanel(true); hideSay(); });

    // Hair menu shown again (Hair tool tapped) -> close the style panel
    new MutationObserver(() => {
      if (menu.style.display !== "none" && panel.style.display !== "none") closePanel(true);
    }).observe(menu, { attributes: true, attributeFilter: ["style"] });

    // Any other tool -> close the style panel
    document.querySelectorAll(".tool").forEach(tool => {
      tool.addEventListener("click", () => {
        if (panel.style.display !== "none") closePanel(true);
      }, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build, { once: true });
  } else {
    build();
  }
})();
