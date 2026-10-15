/* ==========================================
   RETOUCH.JS — Offline Retouch v5
   Keeps existing app.js and hair-grow.js
   ========================================== */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let originalSrc = "";
  let resultUrl = "";
  let previousResultUrl = "";
  let showingBefore = false;
  let busy = false;
  let tapMode = false;
   let tapSize = 60;

  // Zoom and gesture state
  let scale = 1;
  let panX = 0;
  let panY = 0;
  const pointers = new Map();
  let gesture = null;

  function say(message) {
    if (typeof window.showStatus === "function") {
      window.showStatus(message);
      return;
    }

    const box = $("statusBox") || $("status");
    if (box) box.textContent = message;
  }

  function image(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load failed"));

      img.src = src;
    });
  }

  function revokeUrl(url) {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }

  function getPreview() {
    return $("preview");
  }

  function setPreviewSource(src) {
    const p = getPreview();
    if (!p || !src) return;

    p.src = src;
    p.style.transformOrigin = "0 0";
    applyTransform();
  }

  function keepUndo() {
    if (!resultUrl) return;

    revokeUrl(previousResultUrl);
    previousResultUrl = resultUrl;
  }

  function updateCompare() {
    const p = getPreview();
    if (!p) return;

    const src = showingBefore
      ? originalSrc
      : (resultUrl || originalSrc);

    if (src) setPreviewSource(src);

    const button = $("rtCompare");
    if (button) {
      button.textContent = showingBefore
        ? "Show After"
        : "Before / After";
    }
  }

  function clearResult() {
    revokeUrl(resultUrl);
    revokeUrl(previousResultUrl);

    resultUrl = "";
    previousResultUrl = "";
    showingBefore = false;
  }

  function resetZoom() {
    scale = 1;
    panX = 0;
    panY = 0;
    pointers.clear();
    gesture = null;
    applyTransform();
  }

  function applyTransform() {
    const p = getPreview();
    if (!p) return;

    p.style.transformOrigin = "0 0";
    p.style.transform =
      `translate(${panX}px, ${panY}px) scale(${scale})`;
    p.style.touchAction = tapMode ? "none" : "pan-y";
  }

  function makePanel() {
    if ($("retouchPanel")) return;

    const style = document.createElement("style");

    style.id = "retouchStyle";
    style.textContent = `
      #retouchPanel {
        display: none;
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
        margin-top: 12px;
        border-radius: 14px;
        background: var(--panel, #171717);
        color: var(--text, #ffffff);
        border: 1px solid #444;
      }

      #retouchPanel .rt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 9px;
      }

      #retouchPanel button {
        border: 1px solid #555;
        border-radius: 10px;
        padding: 10px 12px;
        background: #292929;
        color: white;
        font-size: 14px;
      }

      #retouchPanel button:disabled {
        opacity: .5;
      }

      #retouchPanel button.rt-active {
        background: #6c4dff;
        border-color: #8b75ff;
      }

      #retouchPanel .rt-help {
        font-size: 12px;
        opacity: .8;
        line-height: 1.5;
        margin-top: 8px;
      }

      #preview.rt-tap-mode {
        cursor: crosshair;
        user-select: none;
        -webkit-user-select: none;
      }
    `;

     #retouchPanel .rt-size-control {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid #444;
  border-radius: 10px;
}

#retouchPanel .rt-size-label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  margin-bottom: 7px;
}

#retouchPanel #rtTapSize {
  display: block;
  width: 100%;
  min-height: 28px;
  accent-color: #8064ff;
  touch-action: pan-y;
}

    document.head.appendChild(style);

    const panel = document.createElement("section");
    panel.id = "retouchPanel";

    panel.innerHTML = `
      <strong>Retouch Tools</strong>

      <div class="rt-row">
        <button id="rtAuto">Auto Retouch</button>
        <button id="rtCompare">Before / After</button>
      </div>

      <div class="rt-size-control">
  <div class="rt-size-label">
    <label for="rtTapSize">Tap Size</label>
    <span id="rtTapSizeValue">60</span>
  </div>
  <input
    id="rtTapSize"
    type="range"
    min="15"
    max="100"
    value="60"
    step="5"
  >
  <div class="rt-size-label">
    <span>Small</span>
    <span>Large</span>
  </div>
</div>

      <div class="rt-row">
        <button id="rtZoomOut">− Zoom</button>
        <button id="rtZoomReset">Reset Zoom</button>
        <button id="rtZoomIn">+ Zoom</button>
      </div>

      <div class="rt-row">
        <button id="rtDownload">Download</button>
        <button id="rtClose">Close</button>
      </div>

      <div class="rt-help">
        पहले Auto Retouch दबाएँ। फिर Tap to Remove चालू करके
        छोटे pimples या blemishes पर tap करें। Zoom के लिए
        + Zoom / − Zoom इस्तेमाल करें। Undo पिछला बदलाव वापस करता है।
      </div>
    `;

    // Place Retouch panel below the photo card,
// not beside the photo preview.
const photoCard = document.querySelector(".photoCard");

if (photoCard) {
  photoCard.insertAdjacentElement("afterend", panel);
} else {
  const preview = getPreview();
  const parent = preview?.parentElement;
  if (parent) {
    parent.insertAdjacentElement("afterend", panel);
  } else {
    document.querySelector(".app")?.appendChild(panel);
  }
}

    $("rtAuto").addEventListener("click", () => {
      applyRetouch().catch((err) => {
        console.error(err);
        say("Auto Retouch नहीं हो पाया।");
      });
    });

    $("rtCompare").addEventListener("click", compare);
    $("rtTap").addEventListener("click", toggleTapMode);
    $("rtUndo").addEventListener("click", undo);
    $("rtReset").addEventListener("click", reset);
     const tapSizeSlider = $("rtTapSize");
const tapSizeValue = $("rtTapSizeValue");

if (tapSizeSlider) {
  tapSizeSlider.addEventListener("input", () => {
    tapSize = Number(tapSizeSlider.value);

    if (tapSizeValue) {
      tapSizeValue.textContent = String(tapSize);
    }
  });
}
    $("rtZoomOut").addEventListener("click", () => zoomBy(1 / 1.25));
    $("rtZoomIn").addEventListener("click", () => zoomBy(1.25));
    $("rtZoomReset").addEventListener("click", resetZoom);
    $("rtDownload").addEventListener("click", download);
    $("rtClose").addEventListener("click", closePanel);

    installGestures();
  }

  function open() {
    const p = getPreview();

    if (!p || !p.src) {
      say("पहले Add Photo से फोटो चुनें।");
      return;
    }

    if (!originalSrc) originalSrc = p.src;

    makePanel();

    const panel = $("retouchPanel");
    if (panel) panel.style.display = "block";

    if (resultUrl) {
      setPreviewSource(resultUrl);
    }

    say("Retouch tools तैयार हैं।");
  }

  function closePanel() {
    const panel = $("retouchPanel");
    if (panel) panel.style.display = "none";

    setTapMode(false);
    resetZoom();
  }

  async function applyRetouch() {
    if (busy) return;

    const p = getPreview();

    if (!p || !p.src) {
      say("पहले फोटो चुनें।");
      return;
    }

    busy = true;
    $("rtAuto").disabled = true;

    try {
      if (!originalSrc) originalSrc = p.src;

      // Use the latest edited result if one exists.
      const source = resultUrl || originalSrc;
      const img = await image(source);

      const maxSize = 1400;
      const ratio = Math.min(
        1,
        maxSize / Math.max(img.naturalWidth, img.naturalHeight)
      );

      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!ctx) throw new Error("Canvas unavailable");

      ctx.drawImage(img, 0, 0, w, h);

      const sourcePixels = ctx.getImageData(0, 0, w, h);
      const originalPixels = new Uint8ClampedArray(sourcePixels.data);
      const output = sourcePixels.data;

      // Gentle smoothing; preserves most edges and texture.
      const radius = Math.max(1, Math.min(3, Math.round(w / 500)));
      const blurredCanvas = document.createElement("canvas");
      blurredCanvas.width = w;
      blurredCanvas.height = h;

      const blurredCtx = blurredCanvas.getContext("2d", {
        willReadFrequently: true
      });

      blurredCtx.filter = `blur(${radius}px)`;
      blurredCtx.drawImage(canvas, 0, 0);
      blurredCtx.filter = "none";

      const blurred = blurredCtx.getImageData(0, 0, w, h).data;

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;

          const r = originalPixels[i];
          const g = originalPixels[i + 1];
          const b = originalPixels[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const brightness = (r + g + b) / 3;

          // Approximate skin-color selection.
          const likelySkin =
            r > 60 &&
            g > 30 &&
            b > 15 &&
            r >= g * 0.85 &&
            r >= b * 1.05 &&
            max - min > 10 &&
            brightness > 35;

          if (!likelySkin) continue;

          // Preserve high-contrast edges.
          const edge =
            Math.abs(originalPixels[i - 4] - originalPixels[i + 4]) +
            Math.abs(originalPixels[i - w * 4] - originalPixels[i + w * 4]);

          if (edge > 95) continue;

          const blend = 0.18;

          output[i] =
            r * (1 - blend) + blurred[i] * blend;
          output[i + 1] =
            g * (1 - blend) + blurred[i + 1] * blend;
          output[i + 2] =
            b * (1 - blend) + blurred[i + 2] * blend;
        }
      }

      ctx.putImageData(sourcePixels, 0, 0);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not create image"));
        }, "image/jpeg", 0.94);
      });

      keepUndo();

      revokeUrl(resultUrl);
      resultUrl = URL.createObjectURL(blob);

      showingBefore = false;
      setPreviewSource(resultUrl);
      resetZoom();

      say("Auto Retouch पूरा हुआ।");
    } catch (err) {
      console.error(err);
      say("Retouch नहीं हो पाया। दूसरी फोटो के साथ कोशिश करें।");
    } finally {
      busy = false;

      if ($("rtAuto")) {
        $("rtAuto").disabled = false;
      }
    }
  }

  function compare() {
    if (!originalSrc || !resultUrl) {
      say("पहले Auto Retouch करें।");
      return;
    }

    showingBefore = !showingBefore;

    if (showingBefore) setTapMode(false);

    updateCompare();
  }

  function undo() {
    if (!previousResultUrl) {
      say("Undo करने के लिए पिछला बदलाव नहीं है।");
      return;
    }

    const current = resultUrl;
    resultUrl = previousResultUrl;
    previousResultUrl = current;

    showingBefore = false;
    setPreviewSource(resultUrl);

    say("पिछला बदलाव वापस किया गया।");
  }

  function reset() {
    if (!originalSrc) {
      say("पहले फोटो चुनें।");
      return;
    }

    clearResult();
    setTapMode(false);
    resetZoom();
    setPreviewSource(originalSrc);

    say("फोटो मूल स्थिति में वापस आ गई।");
  }

  function download() {
    const src = resultUrl || originalSrc;

    if (!src) {
      say("Download करने के लिए फोटो नहीं है।");
      return;
    }

    const a = document.createElement("a");
    a.href = src;
    a.download = "retouched-photo.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();

    say("Download शुरू किया गया।");
  }

  function setTapMode(enabled) {
    tapMode = Boolean(enabled);

    const p = getPreview();
    const button = $("rtTap");

    if (p) {
      p.classList.toggle("rt-tap-mode", tapMode);
      p.style.touchAction = tapMode ? "none" : "pan-y";
    }

    if (button) {
      button.textContent = tapMode
        ? "Tap to Remove: ON"
        : "Tap to Remove: OFF";

      button.classList.toggle("rt-active", tapMode);
    }

    if (tapMode && !resultUrl) {
      tapMode = false;

      if (p) p.classList.remove("rt-tap-mode");
      if (button) {
        button.textContent = "Tap to Remove: OFF";
        button.classList.remove("rt-active");
      }

      say("पहले Auto Retouch करें, फिर Tap to Remove चालू करें।");
      return;
    }

    applyTransform();
  }

  function toggleTapMode() {
    setTapMode(!tapMode);

    if (tapMode) {
      say("छोटे blemish पर tap करें।");
    } else {
      say("Tap to Remove बंद है।");
    }
  }

  function zoomBy(factor) {
    const next = Math.max(1, Math.min(5, scale * factor));

    if (next === scale) return;

    scale = next;
    applyTransform();
  }

  function snapshot() {
    const pts = [...pointers.values()];

    if (pts.length === 1) {
      return {
        count: 1,
        x: pts[0].x,
        y: pts[0].y,
        startX: panX,
        startY: panY,
        startScale: scale
      };
    }

    if (pts.length >= 2) {
      const a = pts[0];
      const b = pts[1];

      return {
        count: 2,
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        startX: panX,
        startY: panY,
        startScale: scale
      };
    }

    return null;
  }

  function moveGesture() {
    if (!gesture) return;

    const pts = [...pointers.values()];
    const p = getPreview();

    if (!p || !pts.length) return;

    if (pts.length === 1 && gesture.count === 1) {
      panX = gesture.startX + (pts[0].x - gesture.x);
      panY = gesture.startY + (pts[0].y - gesture.y);
      applyTransform();
      return;
    }

    if (pts.length >= 2 && gesture.count === 2) {
      const a = pts[0];
      const b = pts[1];

      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;

      const oldScale = scale;
      const nextScale = Math.max(
        1,
        Math.min(
          5,
          gesture.startScale *
            (distance / Math.max(1, gesture.distance))
        )
      );

      const rect = p.getBoundingClientRect();

      // Rect already reflects the current CSS transform.
      // Convert screen point to the preview's local coordinate space.
      const localX = (gesture.cx - rect.left) / oldScale;
      const localY = (gesture.cy - rect.top) / oldScale;

      scale = nextScale;

      panX =
        gesture.startX +
        (centerX - gesture.cx) +
        localX * (oldScale - nextScale);

      panY =
        gesture.startY +
        (centerY - gesture.cy) +
        localY * (oldScale - nextScale);

      applyTransform();
    }
  }

  async function removeAtTap(clientX, clientY) {
    if (busy || !resultUrl) return;

    const p = getPreview();
    if (!p) return;

    busy = true;

    try {
      const img = await image(resultUrl);

      // Natural image dimensions are the output canvas dimensions.
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      const rect = p.getBoundingClientRect();

      // Important fix:
      // rect already includes translate() and scale().
      // Do not subtract panX/panY a second time.
      const localX = (clientX - rect.left) / scale;
      const localY = (clientY - rect.top) / scale;

      const boxW = p.clientWidth || p.offsetWidth;
      const boxH = p.clientHeight || p.offsetHeight;

      const fit = Math.min(boxW / w, boxH / h);

      const displayedW = w * fit;
      const displayedH = h * fit;

      const offsetX = (boxW - displayedW) / 2;
      const offsetY = (boxH - displayedH) / 2;

      const x = Math.round((localX - offsetX) / fit);
      const y = Math.round((localY - offsetY) / fit);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 || y < 0 || x >= w || y >= h
      ) {
        say("फोटो के अंदर किसी जगह पर tap करें।");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!ctx) throw new Error("Canvas unavailable");

      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      // Small, soft local patch for blemish removal.
      const radius = Math.max(
  12,
  Math.min(100, Math.round(w * tapSize / 1000))
);

const innerRadius = Math.max(
  3,
  Math.round(radius * 0.55)
);

      // Sample nearby pixels outside the blemish area.
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let samples = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.hypot(dx, dy);

          if (distance < innerRadius || distance > radius) continue;

          const sx = x + dx;
          const sy = y + dy;

          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;

          const i = (sy * w + sx) * 4;

          sumR += data[i];
          sumG += data[i + 1];
          sumB += data[i + 2];
          samples++;
        }
      }

      if (!samples) {
        say("इस जगह को retouch नहीं कर पाए।");
        return;
      }

      const avgR = sumR / samples;
      const avgG = sumG / samples;
      const avgB = sumB / samples;

      // Blend the sampled color softly toward the tap center.
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.hypot(dx, dy);
          if (distance > radius) continue;

          const sx = x + dx;
          const sy = y + dy;

          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;

          const feather = Math.max(
            0,
            Math.min(1, (radius - distance) / Math.max(1, radius - innerRadius))
          );

          const strength = 0.82 * feather;
          const i = (sy * w + sx) * 4;

          data[i] = data[i] * (1 - strength) + avgR * strength;
          data[i + 1] = data[i + 1] * (1 - strength) + avgG * strength;
          data[i + 2] = data[i + 2] * (1 - strength) + avgB * strength;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not create retouched image"));
        }, "image/jpeg", 0.94);
      });

      keepUndo();

      revokeUrl(resultUrl);
      resultUrl = URL.createObjectURL(blob);

      showingBefore = false;
      setPreviewSource(resultUrl);

      say("Tap retouch पूरा हुआ।");
    } catch (err) {
      console.error(err);
      say("इस जगह को retouch नहीं कर पाए।");
    } finally {
      busy = false;
    }
  }

  function installGestures() {
    const p = getPreview();

    if (!p || p.dataset.rtV5Gestures) return;

    p.dataset.rtV5Gestures = "1";
    p.style.transformOrigin = "0 0";

    p.addEventListener("pointerdown", (e) => {
      if (!tapMode) return;

      e.preventDefault();

      try {
        p.setPointerCapture(e.pointerId);
      } catch (_) {}

      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY
      });

      gesture = snapshot();
    }, { passive: false });

    p.addEventListener("pointermove", (e) => {
      if (!tapMode || !pointers.has(e.pointerId)) return;

      e.preventDefault();

      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY
      });

      moveGesture();
    }, { passive: false });

    const end = (e) => {
      if (!tapMode || !pointers.has(e.pointerId)) return;

      e.preventDefault();

      const start = gesture;
      const pt = pointers.get(e.pointerId);

      const isTap =
        pointers.size === 1 &&
        start &&
        start.count === 1 &&
        Math.hypot(
          pt.x - start.x,
          pt.y - start.y
        ) < 12;

      pointers.delete(e.pointerId);
      gesture = snapshot();

      if (isTap) {
        removeAtTap(e.clientX, e.clientY).catch((err) => {
          console.error(err);
          say("इस जगह को retouch नहीं कर पाए।");
        });
      }
    };

    p.addEventListener("pointerup", end, { passive: false });
    p.addEventListener("pointercancel", end, { passive: false });

    p.addEventListener("touchmove", (e) => {
      if (tapMode) e.preventDefault();
    }, { passive: false });

    p.addEventListener("click", (e) => {
      if (!tapMode) return;

      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  // Public functions for the rest of the app.
  window.openRetouch = open;
  window.closeRetouch = closePanel;
  window.applyRetouch = applyRetouch;

  // Add a Retouch button only if the app does not already have one.
  function connectExistingButton() {
  // Actual Retouch tool in your index.html
  const tool = document.querySelector(
    '.tool[data-tool="retouch"]'
  );

  if (tool && !tool.dataset.rtV5Connected) {
    tool.dataset.rtV5Connected = "1";

    tool.addEventListener("click", (event) => {
      event.preventDefault();
      open();
    });
  }

  // Also support a separate Retouch button if one exists.
  const button = [
    $("retouch"),
    $("retouchButton"),
    $("retouchBtn")
  ].find(Boolean);

  if (button && !button.dataset.rtV5Connected) {
    button.dataset.rtV5Connected = "1";
    button.addEventListener("click", open);
  }

  installGestures();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectExistingButton, {
      once: true
    });
  } else {
    connectExistingButton();
  }

  // Handle photo selection/reset from the main app.
  const fileInput = $("fileInput");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file || !file.type.startsWith("image/")) return;

      clearResult();
      originalSrc = "";
      showingBefore = false;
      setTapMode(false);
      resetZoom();

      const reader = new FileReader();

      reader.onload = () => {
        originalSrc = String(reader.result || "");
      };

      reader.readAsDataURL(file);
    });
  }
})();
