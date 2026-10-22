/* Skin / Smooth / Hair panels: keep the photo visible above any open panel.
   Presets, preview, Apply and Cancel are handled by app.js. */
(() => {
  "use strict";

  const PANEL_IDS = ["skinPanel", "smoothControl", "hairMenu", "hairColorPanel", "adjustmentsPanel"];
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
nst rWide = blurData(skinImg, w, h, Math.max(3, w * 0.004));
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
      if (M0[s] <= 0/* Skin / Smooth / Hair panels: keep the photo visible above any open panel.
   Presets, preview, Apply and Cancel are handled by app.js. */
(() => {
  "use strict";

  const PANEL_IDS = ["skinPanel", "smoothControl", "hairMenu", "hairColorPanel", "adjustmentsPanel"];
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


/* Load the Beauty Presets module (beauty.js) */
(() => {
  if (document.querySelector("script[data-beauty]")) return;
  const el = document.createElement("script");
  el.src = "./beauty.js";
  el.dataset.beauty = "1";
  document.body.appendChild(el);
})();
￼Enter.5 || seen[s]) continue;
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
