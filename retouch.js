
/* ==========================================
   RETOUCH.JS — Offline Retouch v6
   Works with existing index.html and app.js
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

    const box = $("status") || $("statusBox");
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
   function saveMainUndoState() {
  const currentBlob = window.__editedPhotoBlob;

  if (currentBlob && typeof window.saveUndoState === "function") {
    window.saveUndoState(currentBlob);
     window.saveUndoState = saveUndoState;
  }
   }
   

   // Share the latest edited image with all other tools.
  function setCurrentBlob(blob) {
    if (!blob) return;

    revokeUrl(resultUrl);
    revokeUrl(previousResultUrl);

    resultUrl = URL.createObjectURL(blob);
    previousResultUrl = "";
    showingBefore = false;

    window.__editedPhotoBlob = blob;

    setPreviewSource(resultUrl);
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
        max-width: 100%;
        box-sizing: border-box;
        padding: 14px;
        margin: 12px 0;
        border-radius: 14px;
        background: #171717;
        color: #ffffff;
        border: 1px solid #444;
        position: relative;
        clear: both;
      }

      #retouchPanel .rt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      #retouchPanel button {
        border: 1px solid #555;
        border-radius: 10px;
        padding: 10px 12px;
        background: #292929;
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        touch-action: manipulation;
      }

      #retouchPanel button:disabled {
        opacity: .5;
      }

      #retouchPanel button.rt-active {
        background: #6c4dff;
        border-color: #8b75ff;
      }

      #retouchPanel .rt-size-control {
        margin-top: 12px;
        padding: 12px;
        border: 1px solid #444;
        border-radius: 10px;
      }

      #retouchPanel .rt-size-label {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        margin-bottom: 8px;
      }

      #retouchPanel #rtTapSize {
        display: block;
        width: 100%;
        min-height: 30px;
        accent-color: #8064ff;
        touch-action: pan-y;
      }

      #retouchPanel .rt-help {
        font-size: 12px;
        opacity: .85;
        line-height: 1.6;
        margin-top: 10px;
      }

      
      #preview.rt-tap-mode {
        cursor: crosshair;
        user-select: none;
        -webkit-user-select: none;
      }
    `;

    style.textContent += `
      @media (max-width: 600px) {
        .app:has(#preview[src]) #retouchPanel {
          position: fixed;
          left: 10px;
          right: 10px;
          bottom: calc(145px + env(safe-area-inset-bottom));
          width: auto;
          max-width: none;
          max-height: 55dvh;
          overflow-y: auto;
          overscroll-behavior: contain;
          z-index: 100;
          margin: 0;
          padding: 14px;
          box-sizing: border-box;
          background: #fff;
          color: #302531;
          border: 1px solid #f28ab9;
          border-radius: 18px;
          box-shadow: 0 8px 30px rgba(0,0,0,.18);
        }

        #retouchPanel button {
          color: #302531;
          background: #fff;
          border-color: #f1c6dc;
        }

        #retouchPanel button.rt-active {
          background: #fff0f7;
          border-color: #f42f91;
          color: #c21868;
        }

        #retouchPanel input[type="range"] {
          width: 100%;
          accent-color: #f42f91;
        }
      }
    `;

    document.head.appendChild(style);


    const panel = document.createElement("section");
    panel.id = "retouchPanel";

    panel.innerHTML = `
      <strong>Retouch Tools</strong>

      <div class="rt-row">
        <button id="rtAuto" type="button">Auto Retouch</button>
        <button id="rtCompare" type="button">Before / After</button>
      </div>

      <div class="rt-row">
        <button id="rtTap" type="button">Tap to Remove: OFF</button>
        <button id="rtUndo" type="button">Undo</button>
        <button id="rtReset" type="button">Reset</button>
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
        <button id="rtZoomOut" type="button">− Zoom</button>
        <button id="rtZoomReset" type="button">Reset Zoom</button>
        <button id="rtZoomIn" type="button">+ Zoom</button>
      </div>

      <div class="rt-row">
        <button id="rtDownload" type="button">Download</button>
        <button id="rtClose" type="button">Close</button>
      </div>

      <div class="rt-help">
        पहले Auto Retouch दबाएँ। फिर Tap to Remove चालू करके
        pimples या छोटे blemishes पर tap करें। Tap Size से
        retouch का क्षेत्र छोटा या बड़ा करें। Undo पिछला बदलाव
        वापस करता है।
      </div>
    `;

    // Put the panel BELOW the complete photo card.
    const photoCard = document.querySelector(".photoCard");

    if (photoCard) {
      photoCard.insertAdjacentElement("afterend", panel);
    } else {
      const app = document.querySelector(".app");
      if (app) app.appendChild(panel);
      else document.body.appendChild(panel);
    }

    $("rtAuto").addEventListener("click", () => {
      applyRetouch();
    });

    $("rtCompare").addEventListener("click", compare);
    $("rtTap").addEventListener("click", toggleTapMode);
    $("rtUndo").addEventListener("click", undo);
    $("rtReset").addEventListener("click", reset);

    $("rtTapSize").addEventListener("input", (event) => {
      tapSize = Number(event.target.value);
      $("rtTapSizeValue").textContent = String(tapSize);
    });

    $("rtZoomOut").addEventListener("click", () => {
      zoomBy(1 / 1.25);
    });

    $("rtZoomIn").addEventListener("click", () => {
      zoomBy(1.25);
    });

    $("rtZoomReset").addEventListener("click", resetZoom);
    $("rtDownload").addEventListener("click", download);
    $("rtClose").addEventListener("click", closePanel);

    installGestures();
  }

  function open() {
     const adjustmentsPanel =
  document.getElementById("adjustmentsPanel");

const adjustmentsToggle =
  document.getElementById("adjustmentsToggle");

const adjustmentsChevron =
  document.getElementById("adjustmentsChevron");

if (adjustmentsPanel) {
  adjustmentsPanel.classList.remove("open");
}

if (adjustmentsToggle) {
  adjustmentsToggle.classList.remove("open");
}

if (adjustmentsChevron) {
  adjustmentsChevron.textContent = "›";
}
    const p = getPreview();

    if (!p || !p.getAttribute("src") || !p.src) {
      say("पहले Add Photo से फोटो चुनें।");
      return;
    }

    if (!originalSrc) originalSrc = p.src;

    
makePanel();

const panel = $("retouchPanel");

if (panel) {
  panel.style.setProperty("display", "block", "important");
  panel.style.setProperty("position", "fixed", "important");
  panel.style.setProperty("left", "10px", "important");
  panel.style.setProperty("right", "10px", "important");
  panel.style.setProperty("bottom", "calc(145px + env(safe-area-inset-bottom))", "important");
  panel.style.setProperty("width", "auto", "important");
  panel.style.setProperty("max-height", "55dvh", "important");
  panel.style.setProperty("overflow-y", "auto", "important");
  panel.style.setProperty("z-index", "99999", "important");
  panel.style.setProperty("margin", "0", "important");
  panel.style.setProperty("background", "#fff", "important");
  panel.style.setProperty("color", "#302531", "important");
}


    if (resultUrl && !showingBefore) {
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
    if ($("rtAuto")) $("rtAuto").disabled = true;

    try {
      if (!originalSrc) originalSrc = p.src;

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

      const pixels = ctx.getImageData(0, 0, w, h);
      const original = new Uint8ClampedArray(pixels.data);

      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = w;
      blurCanvas.height = h;

      const blurCtx = blurCanvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!blurCtx) throw new Error("Blur canvas unavailable");

      const radius = Math.max(1, Math.min(3, Math.round(w / 500)));

      blurCtx.filter = `blur(${radius}px)`;
      blurCtx.drawImage(canvas, 0, 0);
      blurCtx.filter = "none";

      const blurred = blurCtx.getImageData(0, 0, w, h).data;
      const output = pixels.data;

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;

          const r = original[i];
          const g = original[i + 1];
          const b = original[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const brightness = (r + g + b) / 3;

          const likelySkin =
            r > 60 &&
            g > 30 &&
            b > 15 &&
            r >= g * 0.85 &&
            r >= b * 1.05 &&
            max - min > 10 &&
            brightness > 35;

          if (!likelySkin) continue;

          const edge =
            Math.abs(original[i - 4] - original[i + 4]) +
            Math.abs(original[i - w * 4] - original[i + w * 4]);

          if (edge > 95) continue;

          const blend = 0.18;

          output[i] = r * (1 - blend) + blurred[i] * blend;
          output[i + 1] =
            g * (1 - blend) + blurred[i + 1] * blend;
          output[i + 2] =
            b * (1 - blend) + blurred[i + 2] * blend;
        }
      }

      ctx.putImageData(pixels, 0, 0);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not create image"));
        }, "image/jpeg", 0.94);
      });

       saveMainUndoState();
            keepUndo();

      resultUrl = URL.createObjectURL(blob);
      window.__editedPhotoBlob = blob;
      showingBefore = false;

      setTapMode(false);
      setPreviewSource(resultUrl);
      resetZoom();

      say("Auto Retouch पूरा हुआ।");
    } catch (err) {
      console.error(err);
      say("Retouch नहीं हो पाया। दूसरी फोटो के साथ कोशिश करें।");
    } finally {
      busy = false;
      if ($("rtAuto")) $("rtAuto").disabled = false;
    }
  }

  function compare() {
    if (!originalSrc || !resultUrl) {
      say("पहले Auto Retouch करें।");
      return;
    }

    showingBefore = !showingBefore;

    if (showingBefore) setTapMode(false);

    setPreviewSource(showingBefore ? originalSrc : resultUrl);

    const button = $("rtCompare");
    if (button) {
      button.textContent = showingBefore
        ? "Show After"
        : "Before / After";
    }
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

    if (tapMode && !resultUrl) {
      tapMode = false;
      say("पहले Auto Retouch करें, फिर Tap to Remove चालू करें।");
    }

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

    if (!tapMode) {
      pointers.clear();
      gesture = null;
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
    scale = Math.max(1, Math.min(5, scale * factor));
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

      const nextScale = Math.max(
        1,
        Math.min(
          5,
          gesture.startScale *
            (distance / Math.max(1, gesture.distance))
        )
      );

      const rect = p.getBoundingClientRect();
      const localX = (gesture.cx - rect.left) / scale;
      const localY = (gesture.cy - rect.top) / scale;

      const oldScale = scale;
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
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      const rect = p.getBoundingClientRect();

      // The rectangle already includes the CSS translation.
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

      // Larger tap size means a larger retouch area.
      const radius = Math.max(
  8,
  Math.min(65, Math.round(w * tapSize / 1400))
);

      const innerRadius = Math.max(3, Math.round(radius * 0.55));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let samples = 0;

      // Sample surrounding pixels outside the central area.
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

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.hypot(dx, dy);
          if (distance > radius) continue;

          const sx = x + dx;
          const sy = y + dy;

          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;

          const feather = Math.max(
            0,
            Math.min(
              1,
              (radius - distance) /
                Math.max(1, radius - innerRadius)
            )
          );

          const strength = 0.38 * feather;
          const i = (sy * w + sx) * 4;

          data[i] = data[i] * (1 - strength) + avgR * strength;
          data[i + 1] =
            data[i + 1] * (1 - strength) + avgG * strength;
          data[i + 2] =
            data[i + 2] * (1 - strength) + avgB * strength;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Could not create retouched image"));
        }, "image/jpeg", 0.94);
      });

       saveMainUndoState();
            keepUndo();

      resultUrl = URL.createObjectURL(blob);
      window.__editedPhotoBlob = blob;
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

    if (!p || p.dataset.rtV6Gestures) return;

    p.dataset.rtV6Gestures = "1";
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
        Math.hypot(pt.x - start.x, pt.y - start.y) < 12;

      pointers.delete(e.pointerId);
      gesture = snapshot();

      if (isTap) {
        removeAtTap(e.clientX, e.clientY);
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

  function connectExistingButton() {
    const tool = document.querySelector('.tool[data-tool="retouch"]');

    if (tool && !tool.dataset.rtV6Connected) {
      tool.dataset.rtV6Connected = "1";

      // Capture phase prevents the main toolbar handler from
      // interfering with the Retouch tool click.
      tool.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
      }, true);
    }

    const button = [
      $("retouch"),
      $("retouchButton"),
      $("retouchBtn")
    ].find(Boolean);

    if (button && !button.dataset.rtV6Connected) {
      button.dataset.rtV6Connected = "1";
      button.addEventListener("click", open);
    }

    
    // Close Retouch when another editing tool is selected.
    document.querySelectorAll(".tool[data-tool]").forEach((tool) => {
      if (tool.dataset.rtCloseOnOtherTool) return;

      tool.dataset.rtCloseOnOtherTool = "1";

      tool.addEventListener("click", () => {
        if (tool.dataset.tool !== "retouch") {
          closePanel();
        }
      }, true);
    });

    installGestures();

  }

    window.Retouch = {
    open,
    close: closePanel,
    apply: applyRetouch,
    setCurrentBlob
  };
  window.closeRetouch = closePanel;
  window.applyRetouch = applyRetouch;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connectExistingButton, {
      once: true
    });
  } else {
    connectExistingButton();
  }

  // Keep the newly selected photo as the original.
  const fileInput = $("fileInput");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];

      if (!file || !file.type.startsWith("image/")) return;

      clearResult();
      setTapMode(false);
      resetZoom();

      // app.js is loaded first and handles this same input first.
      const p = getPreview();
      originalSrc = p && p.src ? p.src : "";

      // If app.js updates the preview asynchronously, sync once more.
      setTimeout(() => {
        const currentPreview = getPreview();
        if (currentPreview && currentPreview.src) {
          originalSrc = currentPreview.src;
        }
      }, 100);
    });
  }
})();
