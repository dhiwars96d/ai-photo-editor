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

  const PRESETS = [
    { id: "auto",    name: "Auto",    retouch: 55, reshape: 20, makeup: 35, lip: [217, 96, 127] },
    { id: "classic", name: "Classic", retouch: 45, reshape: 0,  makeup: 55, lip: [199, 47, 79] },
    { id: "daily",   name: "Daily",   retouch: 40, reshape: 10, makeup: 25, lip: [229, 138, 150] },
    { id: "charm",   name: "Charm",   retouch: 65, reshape: 35, makeup: 60, lip: [201, 58, 106] },
    { id: "natural", name: "Natural", retouch: 30, reshape: 0,  makeup: 15, lip: [227, 154, 138] }
  ];

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

  function polyPath(ctx, pts, idxs, w, h) {
    ctx.beginPath();
    idxs.forEach((i, k) => {
      const x = pts[i].x * w, y = pts[i].y * h;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  function applyLips(ctx, w, h, pts, amt, lip) {
    let minX = w, minY = h, maxX = 0, maxY = 0;
    LIP_OUTER.forEach(i => {
      const x = pts[i].x * w, y = pts[i].y * h;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    const pad = Math.max(6, (maxX - minX) * 0.15);
    const bx = Math.floor(clamp(minX - pad, 0, w - 1));
    const by = Math.floor(clamp(minY - pad, 0, h - 1));
    const bw = Math.min(w - bx, Math.ceil(maxX - minX + pad * 2));
    const bh = Math.min(h - by, Math.ceil(maxY - minY + pad * 2));
    if (bw < 2 || bh < 2) return;

    const m = document.createElement("canvas");
    m.width = w;
    m.height = h;
    const mc = m.getContext("2d");
    mc.fillStyle = "#fff";
    polyPath(mc, pts, LIP_OUTER, w, h);
    mc.fill();
    mc.globalCompositeOperation = "destination-out";
    polyPath(mc, pts, LIP_INNER, w, h);
    mc.fill();
    mc.globalCompositeOperation = "source-over";

    const m2 = document.createElement("canvas");
    m2.width = w;
    m2.height = h;
    const m2c = m2.getContext("2d", { willReadFrequently: true });
    m2c.filter = "blur(" + Math.max(0.8, w * 0.0015) + "px)";
    m2c.drawImage(m, 0, 0);
    m2c.filter = "none";

    const mask = m2c.getImageData(bx, by, bw, bh).data;
    const region = ctx.getImageData(bx, by, bw, bh);
    const d = region.data;

    for (let p = 0, i = 0; p < bw * bh; p++, i += 4) {
      const a = (mask[i + 3] / 255) * amt * 0.65;
      if (a <= 0.003) continue;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const k = 0.65 + 0.55 * (lum / 255);
      d[i]     = c255(d[i]     * (1 - a) + lip[0] * k * a);
      d[i + 1] = c255(d[i + 1] * (1 - a) + lip[1] * k * a);
      d[i + 2] = c255(d[i + 2] * (1 - a) + lip[2] * k * a);
    }
    ctx.putImageData(region, bx, by);
  }

  function applyBlush(ctx, w, h, pts, amt) {
    const fw = Math.hypot((pts[454].x - pts[234].x) * w, (pts[454].y - pts[234].y) * h);
    const R = fw * 0.16;
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
          const a = (1 - dist) * (1 - dist) * amt * 0.28;
          const i = (y * bw + x) * 4;
          d[i]     = c255(d[i]     * (1 - a) + 236 * a);
          d[i + 1] = c255(d[i + 1] * (1 - a) + 110 * a);
          d[i + 2] = c255(d[i + 2] * (1 - a) + 135 * a);
        }
      }
      ctx.putImageData(region, bx, by);
    });
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
        const i00 = (iy * w +/* =========================================================
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

  const PRESETS = [
    { id: "auto",    name: "Auto",    retouch: 55, reshape: 20, makeup: 35, lip: [217, 96, 127] },
    { id: "classic", name: "Classic", retouch: 45, reshape: 0,  makeup: 55, lip: [199, 47, 79] },
    { id: "daily",   name: "Daily",   retouch: 40, reshape: 10, makeup: 25, lip: [229, 138, 150] },
    { id: "charm",   name: "Charm",   retouch: 65, reshape: 35, makeup: 60, lip: [201, 58, 106] },
    { id: "natural", name: "Natural", retouch: 30, reshape: 0,  makeup: 15, lip: [227, 154, 138] }
  ];

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

  function polyPath(ctx, pts, idxs, w, h) {
    ctx.beginPath();
    idxs.forEach((i, k) => {
      const x = pts[i].x * w, y = pts[i].y * h;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  function applyLips(ctx, w, h, pts, amt, lip) {
    let minX = w, minY = h, maxX = 0, maxY = 0;
    LIP_OUTER.forEach(i => {
      const x = pts[i].x * w, y = pts[i].y * h;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    const pad = Math.max(6, (maxX - minX) * 0.15);
    const bx = Math.floor(clamp(minX - pad, 0, w - 1));
    const by = Math.floor(clamp(minY - pad, 0, h - 1));
    const bw = Math.min(w - bx, Math.ceil(maxX - minX + pad * 2));
    const bh = Math.min(h - by, Math.ceil(maxY - minY + pad * 2));
    if (bw < 2 || bh < 2) return;

    const m = document.createElement("canvas");
    m.width = w;
    m.height = h;
    const mc = m.getContext("2d");
    mc.fillStyle = "#fff";
    polyPath(mc, pts, LIP_OUTER, w, h);
    mc.fill();
    mc.globalCompositeOperation = "destination-out";
    polyPath(mc, pts, LIP_INNER, w, h);
    mc.fill();
    mc.globalCompositeOperation = "source-over";

    const m2 = document.createElement("canvas");
    m2.width = w;
    m2.height = h;
    const m2c = m2.getContext("2d", { willReadFrequently: true });
    m2c.filter = "blur(" + Math.max(0.8, w * 0.0015) + "px)";
    m2c.drawImage(m, 0, 0);
    m2c.filter = "none";

    const mask = m2c.getImageData(bx, by, bw, bh).data;
    const region = ctx.getImageData(bx, by, bw, bh);
    const d = region.data;

    for (let p = 0, i = 0; p < bw * bh; p++, i += 4) {
      const a = (mask[i + 3] / 255) * amt * 0.65;
      if (a <= 0.003) continue;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const k = 0.65 + 0.55 * (lum / 255);
      d[i]     = c255(d[i]     * (1 - a) + lip[0] * k * a);
      d[i + 1] = c255(d[i + 1] * (1 - a) + lip[1] * k * a);
      d[i + 2] = c255(d[i + 2] * (1 - a) + lip[2] * k * a);
    }
    ctx.putImageData(region, bx, by);
  }

  function applyBlush(ctx, w, h, pts, amt) {
    const fw = Math.hypot((pts[454].x - pts[234].x) * w, (pts[454].y - pts[234].y) * h);
    const R = fw * 0.16;
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
          const a = (1 - dist) * (1 - dist) * amt * 0.28;
          const i = (y * bw + x) * 4;
          d[i]     = c255(d[i]     * (1 - a) + 236 * a);
          d[i + 1] = c255(d[i + 1] * (1 - a) + 110 * a);
          d[i + 2] = c255(d[i + 2] * (1 - a) + 135 * a);
        }
      }
      ctx.putImageData(region, bx, by);
    });
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
      out = await window.renderSkinFinish(blob, "beauty", p.retouch);
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

    if (p.makeup > 0) {
      const amt = p.makeup / 100;
      applyBlush(ctx, w, h, pts, amt);
      applyLips(ctx, w, h, pts, amt, p.lip);
    }
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

  const state = { preset: "none", retouch: 0, reshape: 0, makeup: 0, lip: [217, 96, 127] };

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
      state.lip = p.lip;
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
￼Enter ix) * 4, i10 = i00 + 4;
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
      out = await window.renderSkinFinish(blob, "beauty", p.retouch);
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

    if (p.makeup > 0) {
      const amt = p.makeup / 100;
      applyBlush(ctx, w, h, pts, amt);
      applyLips(ctx, w, h, pts, amt, p.lip);
    }
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

  const state = { preset: "none", retouch: 0, reshape: 0, makeup: 0, lip: [217, 96, 127] };

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

