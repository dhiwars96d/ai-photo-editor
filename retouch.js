
/* RETOUCH.JS — Offline Retouch v1 */
(() => {
  "use strict";

  if (window.Retouch) return;

  let originalSrc = "";
  let resultUrl = "";
  let beforeMode = false;
  let busy = false;

  const $ = (id) => document.getElementById(id);

  function status(message) {
    const el = $("status");
    if (el) {
      el.textContent = message;
      el.style.display = "block";
    }
  }

  function releaseResult() {
    if (resultUrl.startsWith("blob:")) {
      URL.revokeObjectURL(resultUrl);
    }
    resultUrl = "";
  }

  function addStyles() {
    if ($("retouch-v1-style")) return;

    const style = document.createElement("style");
    style.id = "retouch-v1-style";
    style.textContent = `
      #retouchV1 {
        position: relative;
        margin: 14px 0;
        padding: 16px;
        border: 1px solid #f0c4d8;
        border-radius: 16px;
        background: #fff8fc;
        color: #29232a;
        font-family: inherit;
      }
      #retouchV1 button {
        border: 1px solid #e6b1ca;
        border-radius: 10px;
        padding: 10px 12px;
        background: white;
        color: #29232a;
        font: inherit;
        cursor: pointer;
      }
      #retouchV1 button.primary {
        background: #e94f96;
        border-color: #e94f96;
        color: white;
      }
      #retouchV1 .rt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      #retouchV1 input[type="range"] {
        width: 100%;
        accent-color: #e94f96;
      }
      #retouchV1 .rt-note {
        font-size: 13px;
        opacity: .8;
        line-height: 1.45;
      }
    `;
    document.head.appendChild(style);
  }

  function makePanel() {
    addStyles();

    let panel = $("retouchV1");
    if (panel) {
      panel.style.display = "block";
      return panel;
    }

    panel = document.createElement("section");
    panel.id = "retouchV1";
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <strong style="font-size:18px">Offline Retouch</strong>
        <button type="button" id="rtClose">Close ✕</button>
      </div>

      <p class="rt-note">
        छोटे दाग कम करने का शुरुआती ऑफलाइन टूल।
        परिणाम फोटो के अनुसार अलग हो सकता है।
      </p>

      <label for="rtStrength">
        Retouch Strength: <strong id="rtStrengthValue">35%</strong>
      </label>
      <input id="rtStrength" type="range" min="10" max="60" value="35">

      <div class="rt-row">
        <button type="button" class="primary" id="rtApply">Auto Retouch</button>
        <button type="button" id="rtCompare">Before</button>
      </div>

      <div class="rt-row">
        <button type="button" id="rtUndo">Undo</button>
        <button type="button" id="rtReset">Reset</button>
        <button type="button" id="rtDownload">Download</button>
      </div>

      <p id="rtMessage" class="rt-note" aria-live="polite">
        पहले Auto Retouch दबाएँ।
      </p>
    `;

    const preview = $("preview");
    const host = preview?.parentElement;
    if (host && host.parentElement) {
      host.insertAdjacentElement("afterend", panel);
    } else {
      document.body.appendChild(panel);
    }

    $("rtClose").onclick = () => {
      panel.style.display = "none";
      restoreAfterMode();
    };

    $("rtStrength").oninput = () => {
      $("rtStrengthValue").textContent = $("rtStrength").value + "%";
    };

    $("rtApply").onclick = applyRetouch;
    $("rtCompare").onclick = toggleBefore;
    $("rtUndo").onclick = undo;
    $("rtReset").onclick = reset;
    $("rtDownload").onclick = download;

    return panel;
  }

  function message(text) {
    const el = $("rtMessage");
    if (el) el.textContent = text;
  }

  function restoreAfterMode() {
    const preview = $("preview");
    if (beforeMode && preview && originalSrc) {
      preview.src = originalSrc;
    }
    beforeMode = false;
    const button = $("rtCompare");
    if (button) button.textContent = "Before";
  }

  function open() {
    const preview = $("preview");

    if (!preview || !preview.src || preview.src === location.href) {
      status("पहले फोटो चुनें।");
      return;
    }

    makePanel();

    // नई फोटो चुनी गई हो तो उसी को शुरुआती फोटो मानें।
    if (!originalSrc || preview.src !== resultUrl) {
      originalSrc = preview.src;
      releaseResult();
      beforeMode = false;
    }

    message("Strength चुनें और Auto Retouch दबाएँ।");
    status("Offline Retouch खुल गया।");
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
    if (busy) return;

    const preview = $("preview");
    if (!preview || !originalSrc) {
      message("पहले फोटो चुनें।");
      return;
    }

    busy = true;
    $("rtApply").disabled = true;
    message("फोटो प्रोसेस हो रही है…");

    try {
      const img = await loadImage(originalSrc);

      // मोबाइल पर प्रोसेसिंग हल्की रखने के लिए आकार सीमित।
      const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = frame.data;
      const out = new Uint8ClampedArray(src);
      const w = canvas.width;
      const h = canvas.height;
      const strength = Number($("rtStrength").value) / 100;

      // Conservative local outlier reduction; face/skin detection नहीं है।
      for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
          const i = (y * w + x) * 4;
          const r = src[i], g = src[i + 1], b = src[i + 2];

          // केवल संभावित त्वचा जैसे रंगों पर काम करें।
          const skinLike =
            r > 75 && g > 35 &&
            r >= g * 0.88 &&
            r >= b * 1.04 &&
            Math.max(r, g, b) - Math.min(r, g, b) > 12;

          if (!skinLike) continue;

          let sr = 0, sg = 0, sb = 0, count = 0;
          let minL = 255, maxL = 0;

          // आसपास के 5x5 क्षेत्र का औसत; बीच का पिक्सेल छोड़ें।
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;

              const j = ((y + dy) * w + (x + dx)) * 4;
              const nr = src[j], ng = src[j + 1], nb = src[j + 2];
              const lum = (nr * 3 + ng * 6 + nb) / 10;

              sr += nr;
              sg += ng;
              sb += nb;
              count++;

              minL = Math.min(minL, lum);
              maxL = Math.max(maxL, lum);
            }
          }

          const ar = sr / count, ag = sg / count, ab = sb / count;
          const lum = (r * 3 + g * 6 + b) / 10;
          const avgLum = (ar * 3 + ag * 6 + ab) / 10;
          const difference = Math.abs(lum - avgLum);

          // बड़े contrast/edges को बचाएँ; सिर्फ अलग दिखने वाले छोटे spots घटाएँ।
          if (difference < 22 || maxL - minL > 95) continue;

          const amount = Math.min(0.6, strength * (difference - 18) / 35);
          out[i] = r * (1 - amount) + ar * amount;
          out[i + 1] = g * (1 - amount) + ag * amount;
          out[i + 2] = b * (1 - amount) + ab * amount;
        }
      }

      frame.data.set(out);
      ctx.putImageData(frame, 0, 0);

      releaseResult();
      resultUrl = canvas.toDataURL("image/jpeg", 0.94);
      preview.src = resultUrl;
      beforeMode = false;
      $("rtCompare").textContent = "Before";
      message("Retouch लागू हुआ। Before दबाकर तुलना करें।");
      status("Offline Retouch पूरा हुआ।");
    } catch (err) {
      console.error("Retouch error:", err);
      message("Retouch नहीं हो पाया। फोटो दोबारा चुनकर कोशिश करें।");
      status("Retouch में समस्या आई।");
    } finally {
      busy = false;
      $("rtApply").disabled = false;
    }
  }

  function toggleBefore() {
    const preview = $("preview");
    if (!preview || !originalSrc || !resultUrl) {
      message("पहले Auto Retouch चलाएँ।");
      return;
    }

    beforeMode = !beforeMode;
    preview.src = beforeMode ? originalSrc : resultUrl;
    $("rtCompare").textContent = beforeMode ? "After" : "Before";
  }

  function undo() {
    restoreAfterMode();
    const preview = $("preview");
    if (preview && originalSrc) preview.src = originalSrc;
    releaseResult();
    message("आखिरी Retouch हटाया गया।");
  }

  function reset() {
    restoreAfterMode();
    const preview = $("preview");
    if (preview && originalSrc) preview.src = originalSrc;
    releaseResult();
    message("मूल फोटो वापस आ गई।");
  }

  function download() {
    if (!resultUrl) {
      message("पहले Auto Retouch चलाएँ।");
      return;
    }

    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "retouched-photo.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  window.Retouch = { open };
})();
