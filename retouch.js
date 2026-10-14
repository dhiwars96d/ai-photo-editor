
/* RETOUCH.JS — Offline Retouch v3 with Tap to Remove */
(() => {
  "use strict";

  let originalSrc = "";
  let resultUrl = "";
  let previousResultUrl = "";
  let showingBefore = false;
  let busy = false;
  let tapMode = false;

  const $ = (id) => document.getElementById(id);

  function say(text) {
    const message = $("rtMessage");
    if (message) message.textContent = text;

    const status = $("status");
    if (status) {
      status.textContent = text;
      status.style.display = "block";
    }
  }

  function releaseResult() {
    if (resultUrl.startsWith("blob:")) {
      URL.revokeObjectURL(resultUrl);
    }
    if (previousResultUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previousResultUrl);
    }

    resultUrl = "";
    previousResultUrl = "";
  }

  function installStyles() {
    if ($("retouchV2Styles")) return;

    const style = document.createElement("style");
    style.id = "retouchV2Styles";
    style.textContent = `
      #retouchV2Backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(25,12,20,.48);
        display: none;
        align-items: flex-end;
        justify-content: center;
      }

      #retouchV2 {
        box-sizing: border-box;
        width: 100%;
        max-width: 560px;
        max-height: 78dvh;
        overflow-y: auto;
        padding: 20px 18px calc(22px + env(safe-area-inset-bottom));
        background: #fff8fc;
        color: #30232b;
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -8px 35px rgba(0,0,0,.18);
        font-family: inherit;
      }

      #retouchV2 * { box-sizing: border-box; }

      #retouchV2 .rtHead {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      #retouchV2 .rtTitle {
        font-size: 20px;
        font-weight: 700;
      }

      #retouchV2 .rtSub {
        color: #786874;
        font-size: 13px;
        line-height: 1.5;
        margin: 0 0 18px;
      }

      #retouchV2 button {
        font: inherit;
        font-size: 14px;
        border: 1px solid #ebc5d8;
        background: white;
        color: #382934;
        border-radius: 12px;
        padding: 12px 14px;
        min-height: 44px;
        cursor: pointer;
      }

      #retouchV2 button.primary {
        background: #e84f99;
        color: white;
        border-color: #e84f99;
        font-weight: 600;
      }

      #retouchV2 button.active {
        background: #382934;
        color: white;
        border-color: #382934;
      }

      #retouchV2 button:disabled { opacity: .55; }

      #retouchV2 .rtClose {
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 22px;
      }

      #retouchV2 .rtLabel {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 14px;
        margin-bottom: 8px;
      }

      #retouchV2 input[type=range] {
        width: 100%;
        accent-color: #e84f99;
        margin: 0 0 8px;
      }

      #retouchV2 .rtButtons {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
        margin-top: 14px;
      }

      #retouchV2 .rtButtons button { width: 100%; }

      #retouchV2 #rtMessage {
        font-size: 13px;
        color: #79566b;
        line-height: 1.5;
        margin: 14px 0 0;
        overflow-wrap: anywhere;
      }

      @media (min-width: 700px) {
        #retouchV2Backdrop {
          align-items: center;
          padding: 18px;
        }
        #retouchV2 { border-radius: 24px; }
      }
    `;

    document.head.appendChild(style);
  }

  function createPanel() {
    installStyles();

    let backdrop = $("retouchV2Backdrop");

    if (backdrop) {
      backdrop.style.display = "flex";
      return;
    }

    backdrop = document.createElement("div");
    backdrop.id = "retouchV2Backdrop";

    backdrop.innerHTML = `
      <section id="retouchV2" role="dialog"
        aria-modal="true" aria-label="Offline Retouch">

        <div style="width:38px;height:4px;border-radius:5px;background:#e8cada;margin:0 auto 16px"></div>

        <div class="rtHead">
          <div class="rtTitle">✨ Offline Retouch</div>
          <button type="button" class="rtClose" id="rtClose">Close ✕</button>
        </div>

        <p class="rtSub">
          Auto Retouch से त्वचा को हल्का स्मूद करें।
          Tap to Remove से छूटे हुए छोटे दागों पर टैप करें।
          परिणाम फोटो और रोशनी के अनुसार बदल सकता है।
        </p>

        <div class="rtLabel">
          <label for="rtStrength">Skin smoothing</label>
          <strong id="rtStrengthValue">45%</strong>
        </div>

        <input id="rtStrength" type="range"
          min="10" max="70" value="45">

        <div class="rtButtons">
          <button type="button" class="primary" id="rtApply">
            Auto Retouch
          </button>

          <button type="button" id="rtCompare">
            Before / After
          </button>

          <button type="button" id="rtTapMode">
            Tap to Remove: OFF
          </button>

          <button type="button" id="rtUndo">
            Undo
          </button>

          <button type="button" id="rtReset">
            Reset
          </button>

          <button type="button" class="primary" id="rtDownload"
            style="grid-column:1 / -1">
            Download Retouched Photo
          </button>
        </div>

        <p id="rtMessage" aria-live="polite">
          Strength चुनें और Auto Retouch दबाएँ।
        </p>
      </section>
    `;

    document.body.appendChild(backdrop);

    $("rtClose").onclick = closePanel;

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closePanel();
    });

    $("rtStrength").addEventListener("input", () => {
      $("rtStrengthValue").textContent =
        $("rtStrength").value + "%";
    });

    $("rtApply").onclick = applyRetouch;
    $("rtCompare").onclick = compare;
    $("rtTapMode").onclick = toggleTapMode;
    $("rtUndo").onclick = undo;
    $("rtReset").onclick = reset;
    $("rtDownload").onclick = download;

    installTapListener();
  }

  function closePanel() {
    const backdrop = $("retouchV2Backdrop");
    if (backdrop) backdrop.style.display = "none";

    const preview = $("preview");

    if (showingBefore && preview && resultUrl) {
      preview.src = resultUrl;
    }

    showingBefore = false;
    setTapMode(false);
  }

  function open() {
    const preview = $("preview");

    if (!preview || !preview.src || !preview.complete ||
        !preview.naturalWidth) {
      say("पहले फोटो चुनें और उसके लोड होने का इंतज़ार करें।");
      return;
    }

    // नया फोटो चुना गया हो तो पुराना retouch history हटाएँ।
    if (!resultUrl ||
        (preview.src !== resultUrl &&
         preview.src !== originalSrc)) {
      originalSrc = preview.src;
      releaseResult();
      showingBefore = false;
    } else if (!originalSrc) {
      originalSrc = preview.src;
    }

    createPanel();
    $("retouchV2Backdrop").style.display = "flex";
    installTapListener();

    say("Strength चुनें या Tap to Remove इस्तेमाल करें।");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("फोटो लोड नहीं हुई।"));

      img.src = src;
    });
  }

  async function applyRetouch() {
    if (busy || !originalSrc) return;

    busy = true;
    $("rtApply").disabled = true;
    setTapMode(false);
    say("फोटो प्रोसेस हो रही है…");

    try {
      const img = await loadImage(originalSrc);

      const scale = Math.min(
        1,
        1400 / Math.max(img.naturalWidth, img.naturalHeight)
      );

      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!ctx) throw new Error("Canvas उपलब्ध नहीं है।");

      ctx.drawImage(img, 0, 0, w, h);
      const originalPixels = ctx.getImageData(0, 0, w, h);

      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = w;
      blurCanvas.height = h;

      const bctx = blurCanvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!bctx) throw new Error("Blur canvas उपलब्ध नहीं है।");

      bctx.filter = "blur(4px)";
      bctx.drawImage(canvas, 0, 0);
      bctx.filter = "none";

      const smoothPixels = bctx.getImageData(0, 0, w, h);
      const src = originalPixels.data;
      const blur = smoothPixels.data;
      const strength = Number($("rtStrength").value) / 100;

      for (let i = 0; i < src.length; i += 4) {
        const r = src[i];
        const g = src[i + 1];
        const b = src[i + 2];

        const skinLike =
          r > 70 &&
          g > 30 &&
          r >= g * 0.88 &&
          r >= b * 1.04 &&
          (r - b) > 12;

        if (!skinLike) continue;

        const difference = (
          Math.abs(r - blur[i]) +
          Math.abs(g - blur[i + 1]) +
          Math.abs(b - blur[i + 2])
        ) / 3;

        if (difference > 65) continue;

        const blend = strength *
          (difference > 10 ? 0.95 : 0.70);

        src[i] = r * (1 - blend) + blur[i] * blend;
        src[i + 1] = g * (1 - blend) + blur[i + 1] * blend;
        src[i + 2] = b * (1 - blend) + blur[i + 2] * blend;
      }

      ctx.putImageData(originalPixels, 0, 0);

      // Undo के लिए वर्तमान परिणाम सुरक्षित रखें।
      previousResultUrl = resultUrl;

      resultUrl = canvas.toDataURL("image/jpeg", 0.95);

      const preview = $("preview");
      if (preview) preview.src = resultUrl;

      showingBefore = false;
      updateCompareButton();

      say("Retouch पूरा हुआ। अब जरूरत हो तो Tap to Remove दबाएँ।");
    } catch (error) {
      console.error("Offline Retouch:", error);
      say("Retouch नहीं हो पाया। दूसरी फोटो पर कोशिश करें।");
    } finally {
      busy = false;
      $("rtApply").disabled = false;
    }
  }

  function updateCompareButton() {
    const button = $("rtCompare");
    if (button) {
      button.textContent = showingBefore ? "Show After" : "Before / After";
    }
  }

  function compare() {
    const preview = $("preview");

    if (!preview || !originalSrc || !resultUrl) {
      say("पहले Auto Retouch चलाएँ।");
      return;
    }

    showingBefore = !showingBefore;
    preview.src = showingBefore ? originalSrc : resultUrl;

    updateCompareButton();

    if (showingBefore) {
      setTapMode(false);
      say("Original फोटो दिख रही है। वापस आने के लिए Show After दबाएँ।");
    } else {
      say("Retouched फोटो दिख रही है।");
    }
  }

  function undo() {
    if (busy) return;

    if (!previousResultUrl) {
      say("Undo करने के लिए पिछला बदलाव नहीं है।");
      return;
    }

    const currentResult = resultUrl;
    resultUrl = previousResultUrl;
    previousResultUrl = "";

    const preview = $("preview");
    if (preview) preview.src = resultUrl;

    if (currentResult.startsWith("blob:")) {
      URL.revokeObjectURL(currentResult);
    }

    showingBefore = false;
    updateCompareButton();
    say("पिछला बदलाव Undo हो गया।");
  }

  function reset() {
    if (busy) return;

    setTapMode(false);

    const preview = $("preview");
    if (preview && originalSrc) preview.src = originalSrc;

    releaseResult();
    showingBefore = false;
    updateCompareButton();

    say("मूल फोटो वापस आ गई।");
  }

  function download() {
    if (!resultUrl) {
      say("पहले Auto Retouch चलाएँ।");
      return;
    }

    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = "retouched-photo.jpg";

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Tap to Remove controls
  function setTapMode(enabled) {
    tapMode = enabled;

    const button = $("rtTapMode");
    const preview = $("preview");

    if (button) {
      button.textContent = tapMode
        ? "Tap to Remove: ON"
        : "Tap to Remove: OFF";

      button.classList.toggle("active", tapMode);
    }

    if (preview) {
      preview.style.cursor = tapMode ? "crosshair" : "";
    }
  }

  function toggleTapMode() {
    if (busy) return;

    if (!resultUrl) {
      say("पहले Auto Retouch चलाएँ, फिर दाग पर टैप करें।");
      return;
    }

    if (showingBefore) {
      say("पहले Show After दबाएँ।");
      return;
    }

    setTapMode(!tapMode);

    say(tapMode
      ? "अब फोटो में छोटे दाग पर टैप करें। बंद करने के लिए बटन फिर दबाएँ।"
      : "Tap to Remove बंद है।");
  }

  function installTapListener() {
    const preview = $("preview");

    if (!preview || preview.dataset.rtTapReady === "1") return;

    preview.dataset.rtTapReady = "1";

    preview.addEventListener("click", (event) => {
      if (!tapMode || busy) return;

      event.preventDefault();
      event.stopPropagation();

      removeAtTap(event.clientX, event.clientY).catch((error) => {
        console.error("Tap retouch:", error);
        say("इस हिस्से को सुधार नहीं पाए।");
      });
    }, true);
  }

  // Preview के अंदर टैप की सही जगह को फोटो के pixels में बदलें।
  function getPhotoPoint(preview, img, clientX, clientY) {
    const rect = preview.getBoundingClientRect();

    const style = window.getComputedStyle(preview);
    const fit = style.objectFit || "fill";

    let drawW = rect.width;
    let drawH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (fit === "contain" || fit === "scale-down") {
      const scale = Math.min(
        rect.width / img.naturalWidth,
        rect.height / img.naturalHeight,
        fit === "scale-down" ? 1 : Infinity
      );

      drawW = img.naturalWidth * scale;
      drawH = img.naturalHeight * scale;
      offsetX = (rect.width - drawW) / 2;
      offsetY = (rect.height - drawH) / 2;
    } else if (fit === "cover") {
      const scale = Math.max(
        rect.width / img.naturalWidth,
        rect.height / img.naturalHeight
      );

      drawW = img.naturalWidth * scale;
      drawH = img.naturalHeight * scale;
      offsetX = (rect.width - drawW) / 2;
      offsetY = (rect.height - drawH) / 2;
    }

    const x = clientX - rect.left - offsetX;
    const y = clientY - rect.top - offsetY;

    if (x < 0 || y < 0 || x > drawW || y > drawH) return null;

    return {
      x: Math.round(x / drawW * img.naturalWidth),
      y: Math.round(y / drawH * img.naturalHeight)
    };
  }

  async function removeAtTap(clientX, clientY) {
    if (busy || !resultUrl || showingBefore) {
      say("पहले retouched फोटो दिखाएँ।");
      return;
    }

    const preview = $("preview");
    if (!preview) return;

    busy = true;
    $("rtTapMode").disabled = true;

    try {
      const img = await loadImage(resultUrl);
      const point = getPhotoPoint(preview, img, clientX, clientY);

      if (!point) {
        say("फोटो के अंदर दाग पर टैप करें।");
        return;
      }

      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const px = point.x;
      const py = point.y;

      // फोटो के आकार के अनुसार छोटा retouch क्षेत्र।
      const radius = Math.max(5, Math.min(28, Math.round(w * 0.012)));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!ctx) throw new Error("Canvas उपलब्ध नहीं है।");

      ctx.drawImage(img, 0, 0);

      const left = Math.max(0, px - radius * 2);
      const top = Math.max(0, py - radius * 2);
      const right = Math.min(w, px + radius * 2 + 1);
      const bottom = Math.min(h, py + radius * 2 + 1);

      const patchW = right - left;
      const patchH = bottom - top;

      const patch = ctx.getImageData(left, top, patchW, patchH);

      // दाग के आसपास के ring pixels का औसत रंग लें।
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let count = 0;

      for (let y = 0; y < patchH; y++) {
        for (let x = 0; x < patchW; x++) {
          const gx = left + x;
          const gy = top + y;
          const distance = Math.hypot(gx - px, gy - py);

          if (distance < radius * 1.15 ||
              distance > radius * 1.9) continue;

          const i = (y * patchW + x) * 4;

          rr += patch.data[i];
          gg += patch.data[i + 1];
          bb += patch.data[i + 2];
          count++;
        }
      }

      if (!count) {
        say("इस जगह को सुधार नहीं पाए। दूसरी जगह टैप करें।");
        return;
      }

      rr /= count;
      gg /= count;
      bb /= count;

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      for (
        let y = Math.max(0, py - radius);
        y <= Math.min(h - 1, py + radius);
        y++
      ) {
        for (
          let x = Math.max(0, px - radius);
          x <= Math.min(w - 1, px + radius);
          x++
        ) {
          const distance = Math.hypot(x - px, y - py);
          if (distance > radius) continue;

          const i = (y * w + x) * 4;

          // किनारों पर blend कम होगा ताकि गोल patch कम दिखे।
          const blend = 0.82 * Math.pow(1 - distance / radius, 1.5);

          data[i] = data[i] * (1 - blend) + rr * blend;
          data[i + 1] = data[i + 1] * (1 - blend) + gg * blend;
          data[i + 2] = data[i + 2] * (1 - blend) + bb * blend;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // Tap से पहले वाला परिणाम Undo के लिए रखें।
      previousResultUrl = resultUrl;
      resultUrl = canvas.toDataURL("image/jpeg", 0.95);

      preview.src = resultUrl;
      showingBefore = false;
      updateCompareButton();

      say("इस हिस्से को retouch किया। जरूरत हो तो दूसरे दाग पर भी टैप करें।");
    } finally {
      busy = false;

      if ($("rtTapMode")) {
        $("rtTapMode").disabled = false;
      }
    }
  }

  window.Retouch = { open };
})();
