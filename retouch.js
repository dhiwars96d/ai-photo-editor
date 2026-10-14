
/* RETOUCH.JS — Offline Retouch v2 */
(() => {
  "use strict";

  let originalSrc = "";
  let resultUrl = "";
  let showingBefore = false;
  let busy = false;

  const $ = (id) => document.getElementById(id);

  function say(text) {
    const el = $("rtMessage");
    if (el) el.textContent = text;

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
    resultUrl = "";
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
        background: rgba(25, 12, 20, .48);
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
        animation: rtV2Slide .22s ease-out;
      }
      @keyframes rtV2Slide {
        from { transform: translateY(35px); opacity: .7; }
        to { transform: translateY(0); opacity: 1; }
      }
      #retouchV2 * { box-sizing: border-box; }
      #retouchV2 .rtHead {
        display:flex; align-items:center; justify-content:space-between;
        gap:12px; margin-bottom:14px;
      }
      #retouchV2 .rtTitle { font-size:20px; font-weight:700; }
      #retouchV2 .rtSub {
        color:#786874; font-size:13px; line-height:1.5; margin:0 0 18px;
      }
      #retouchV2 button {
        font:inherit; font-size:14px; border:1px solid #ebc5d8;
        background:white; color:#382934; border-radius:12px;
        padding:12px 14px; min-height:44px;
      }
      #retouchV2 button.primary {
        background:#e84f99; color:white; border-color:#e84f99;
        font-weight:600;
      }
      #retouchV2 button:disabled { opacity:.55; }
      #retouchV2 .rtClose {
        min-height:38px; padding:8px 12px; border-radius:22px;
      }
      #retouchV2 .rtLabel {
        display:flex; justify-content:space-between; gap:10px;
        font-size:14px; margin-bottom:8px;
      }
      #retouchV2 input[type=range] {
        width:100%; accent-color:#e84f99; margin:0 0 8px;
      }
      #retouchV2 .rtButtons {
        display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
        gap:9px; margin-top:14px;
      }
      #retouchV2 .rtButtons button { width:100%; }
      #retouchV2 #rtMessage {
        font-size:13px; color:#79566b; line-height:1.5;
        margin:14px 0 0; overflow-wrap:anywhere;
      }
      @media (min-width:700px) {
        #retouchV2Backdrop { align-items:center; padding:18px; }
        #retouchV2 { border-radius:24px; }
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
          त्वचा को हल्का स्मूद करें। आँखों और बालों की डिटेल बचाने की कोशिश की जाती है।
          यह शुरुआती ऑफलाइन टूल है।
        </p>

        <div class="rtLabel">
          <label for="rtStrength">Skin smoothing</label>
          <strong id="rtStrengthValue">45%</strong>
        </div>
        <input id="rtStrength" type="range" min="10" max="70" value="45">

        <div class="rtButtons">
          <button type="button" class="primary" id="rtApply">Auto Retouch</button>
          <button type="button" id="rtCompare">Before / After</button>
          <button type="button" id="rtUndo">Undo</button>
          <button type="button" id="rtReset">Reset</button>
          <button type="button" class="primary" id="rtDownload"
            style="grid-column:1 / -1">Download Retouched Photo</button>
        </div>
        <p id="rtMessage" aria-live="polite">Strength चुनें और Auto Retouch दबाएँ।</p>
      </section>
    `;
    document.body.appendChild(backdrop);

    $("rtClose").onclick = closePanel;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closePanel();
    });

    $("rtStrength").addEventListener("input", () => {
      $("rtStrengthValue").textContent = $("rtStrength").value + "%";
    });

    $("rtApply").onclick = applyRetouch;
    $("rtCompare").onclick = compare;
    $("rtUndo").onclick = reset;
    $("rtReset").onclick = reset;
    $("rtDownload").onclick = download;
  }

  function closePanel() {
    const backdrop = $("retouchV2Backdrop");
    if (backdrop) backdrop.style.display = "none";

    const preview = $("preview");
    if (showingBefore && preview && resultUrl) preview.src = resultUrl;
    showingBefore = false;
  }

  function open() {
    const preview = $("preview");

    if (!preview || !preview.src || !preview.complete ||
        !preview.naturalWidth) {
      say("पहले फोटो चुनें और उसके लोड होने का इंतज़ार करें।");
      return;
    }

    // मौजूदा retouch result को मूल फोटो न मानें।
    if (!resultUrl || preview.src !== resultUrl) {
      originalSrc = preview.src;
      releaseResult();
      showingBefore = false;
    }

    createPanel();
    $("retouchV2Backdrop").style.display = "flex";
    say("Strength चुनें और Auto Retouch दबाएँ।");
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

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas उपलब्ध नहीं है।");

      ctx.drawImage(img, 0, 0, w, h);
      const originalPixels = ctx.getImageData(0, 0, w, h);

      // अलग canvas पर हल्का blur बनाते हैं।
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = w;
      blurCanvas.height = h;

      const bctx = blurCanvas.getContext("2d", { willReadFrequently: true });
      if (!bctx) throw new Error("Blur canvas उपलब्ध नहीं है।");

      bctx.filter = "blur(4px)";
      bctx.drawImage(canvas, 0, 0);
      bctx.filter = "none";

      const smoothPixels = bctx.getImageData(0, 0, w, h);
      const src = originalPixels.data;
      const blur = smoothPixels.data;
      const strength = Number($("rtStrength").value) / 100;

      // संभावित त्वचा वाले पिक्सल पर ही हल्का smoothing।
      // यह face detector नहीं है; गलत जगहों पर असर संभव है।
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

        const difference =
          (Math.abs(r - blur[i]) +
           Math.abs(g - blur[i + 1]) +
           Math.abs(b - blur[i + 2])) / 3;

        // बड़े edges और बहुत तेज़ बदलाव को काफी हद तक बचाएँ।
        if (difference > 65) continue;

        const blend = strength * (difference > 10 ? 0.95 : 0.70);

        src[i] = r * (1 - blend) + blur[i] * blend;
        src[i + 1] = g * (1 - blend) + blur[i + 1] * blend;
        src[i + 2] = b * (1 - blend) + blur[i + 2] * blend;
      }

      ctx.putImageData(originalPixels, 0, 0);

      releaseResult();
      resultUrl = canvas.toDataURL("image/jpeg", 0.95);

      const preview = $("preview");
      if (preview) preview.src = resultUrl;

      showingBefore = false;
      say("Retouch पूरा हुआ। Before / After दबाकर तुलना करें।");
    } catch (error) {
      console.error("Offline Retouch:", error);
      say("Retouch नहीं हो पाया। दूसरी फोटो पर कोशिश करें।");
    } finally {
      busy = false;
      $("rtApply").disabled = false;
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
    $("rtCompare").textContent = showingBefore ? "Show After" : "Before / After";
  }

  function reset() {
    const preview = $("preview");
    if (preview && originalSrc) preview.src = originalSrc;

    releaseResult();
    showingBefore = false;
    if ($("rtCompare")) $("rtCompare").textContent = "Before / After";
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

  window.Retouch = { open };
})();
