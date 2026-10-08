/* =========================================================
   HAIR GROW - COMPACT
   Uses app.js: selectedFile, editedBlob, preview,
   downloadButton, showStatus, loadImage, getHairSegmenter
========================================================= */

(function () {
  let hgPanel = null;
  let hgCanvas = null;
  let hgCtx = null;
  let hgDrawing = false;
  let hgErase = false;
  let hgSize = 5;
  let hgStyle = "straight";
  let hgStrokes = [];

  const $ = id => document.getElementById(id);

  function imageRect() {
    const r = preview.getBoundingClientRect();
    const nw = preview.naturalWidth || 1;
    const nh = preview.naturalHeight || 1;
    const sx = r.width / nw;
    const sy = r.height / nh;
    const s = Math.min(sx, sy);
    const w = nw * s;
    const h = nh * s;

    return {
      left: r.left + (r.width - w) / 2,
      top: r.top + (r.height - h) / 2,
      width: w,
      height: h
    };
  }

  function point(e) {
    const r = imageRect();
    return {
      x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
      y: Math.max(0, Math.min(r.height, e.clientY - r.top))
    };
  }

  function resize() {
    if (!hgCanvas) return;

    const box = document.querySelector(".previewBox");
    if (!box) return;

    const r = box.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;

    hgCanvas.width = Math.max(1, Math.round(r.width * d));
    hgCanvas.height = Math.max(1, Math.round(r.height * d));
    hgCtx.setTransform(d, 0, 0, d, 0, 0);

    drawGuides();
  }

  function drawGuides() {
    if (!hgCtx || !hgCanvas) return;

    const box = document.querySelector(".previewBox");
    if (!box) return;

    const br = box.getBoundingClientRect();
    const ir = imageRect();

    hgCtx.clearRect(0, 0, br.width, br.height);

    hgStrokes.forEach(s => {
      if (!s.points.length) return;

      hgCtx.save();
      hgCtx.strokeStyle = "rgba(255,55,145,.75)";
      hgCtx.lineWidth = s.size;
      hgCtx.lineCap = "butt";
      hgCtx.lineJoin = "round";
      hgCtx.beginPath();

      s.points.forEach((p, i) => {
        const x = ir.left - br.left + p.x;
        const y = ir.top - br.top + p.y;

        if (!i) hgCtx.moveTo(x, y);
        else hgCtx.lineTo(x, y);
      });

      hgCtx.stroke();
      hgCtx.restore();
    });
  }

  function eraseAt(p) {
    const radius = hgSize * 1.5;
    const out = [];

    hgStrokes.forEach(s => {
      let part = [];

      function keep(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) /
            (len * len)
          )
        );

        const x = a.x + dx * t;
        const y = a.y + dy * t;

        return Math.hypot(p.x - x, p.y - y) > radius;
      }

      s.points.forEach((q, i) => {
        if (i === 0 || keep(s.points[i - 1], q)) {
          part.push(q);
        } else {
          if (part.length > 1) {
            out.push({
              points: part,
              size: s.size,
              style: s.style
            });
          }
          part = [];
        }
      });

      if (part.length > 1) {
        out.push({
          points: part,
          size: s.size,
          style: s.style
        });
      }
    });

    hgStrokes = out;
    drawGuides();
  }

  function makePanel() {
  if (hgPanel) {
    hgPanel.style.display = "flex";
    return;
  }

  hgPanel = document.createElement("div");
  hgPanel.id = "hairGrowPanel";

  Object.assign(hgPanel.style, {
    position: "fixed",
    left: "0",
    right: "0",
    bottom: "0",
    width: "100%",
    zIndex: "99999",
    background: "#fff",
    padding: "8px 8px calc(8px + env(safe-area-inset-bottom))",
    borderRadius: "16px 16px 0 0",
    boxShadow: "0 -4px 22px rgba(0,0,0,.18)",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    boxSizing: "border-box"
  });

  /* TOP TOOL ROW */
  const row = document.createElement("div");

  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%"
  });

  const brush = document.createElement("button");
  brush.type = "button";
  brush.textContent = "🖌️";

  Object.assign(brush.style, {
    width: "32px",
    height: "28px",
    padding: "0",
    border: "1px solid #ddd",
    borderRadius: "5px",
    background: "#fff",
    fontSize: "16px",
    flex: "0 0 32px"
  });

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "15";
  slider.value = hgSize;

  Object.assign(slider.style, {
    flex: "1",
    minWidth: "0",
    margin: "0",
    accentColor: "#1683ff"
  });

  const value = document.createElement("span");
  value.textContent = hgSize;

  Object.assign(value.style, {
    minWidth: "18px",
    textAlign: "center",
    fontSize: "13px",
    color: "#222"
  });

  /* REAL ERASER BUTTON */
  const eraser = document.createElement("button");
  eraser.type = "button";
  eraser.textContent = "🧽";
  eraser.title = "Eraser";

  Object.assign(eraser.style, {
    width: "32px",
    height: "28px",
    padding: "0",
    border: "1px solid #ccc",
    borderRadius: "5px",
    background: "#fff",
    fontSize: "17px",
    lineHeight: "1",
    flex: "0 0 32px"
  });

  row.append(brush, slider, value, eraser);

  /* STYLE ROW */
  const styles = document.createElement("div");

  Object.assign(styles.style, {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "7px",
    width: "100%"
  });

  const styleButtons = {};

  ["Bangs", "Straight", "Curls"].forEach(name => {
    const b = document.createElement("button");

    b.type = "button";
    b.textContent = name;

    Object.assign(b.style, {
      border: "1px solid #ddd",
      background: "#fff",
      color: "#222",
      borderRadius: "7px",
      padding: "5px 9px",
      fontSize: "11px",
      fontWeight: "500"
    });

    styleButtons[name.toLowerCase()] = b;

    b.onclick = () => {
      hgStyle = name.toLowerCase();
      hgErase = false;

      eraser.style.background = "#fff";
      eraser.style.borderColor = "#ccc";

      Object.keys(styleButtons).forEach(key => {
        styleButtons[key].style.background = "#fff";
        styleButtons[key].style.color = "#222";
      });

      b.style.background = "#222";
      b.style.color = "#fff";
    };

    styles.appendChild(b);
  });

  /* ACTION ROW */
  const actions = document.createElement("div");

  Object.assign(actions.style, {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    width: "100%"
  });

  const clear = document.createElement("button");
  clear.textContent = "Clear";
  clear.type = "button";

  Object.assign(clear.style, {
    width: "20%",
    minWidth: "55px",
    height: "32px",
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: "16px",
    fontSize: "11px"
  });

  const start = document.createElement("button");
  start.textContent = "✨ Start";
  start.type = "button";

  Object.assign(start.style, {
    flex: "1",
    height: "32px",
    background: "#ff3f91",
    color: "#fff",
    border: "0",
    borderRadius: "17px",
    fontSize: "12px",
    fontWeight: "600"
  });

  const done = document.createElement("button");
  done.textContent = "✓";
  done.type = "button";

  Object.assign(done.style, {
    width: "38px",
    height: "32px",
    border: "0",
    background: "#fff",
    color: "#111",
    borderRadius: "8px",
    fontSize: "22px",
    fontWeight: "500",
    flex: "0 0 38px"
  });

  actions.append(clear, start, done);

  hgPanel.append(row, styles, actions);
  document.body.appendChild(hgPanel);

  /* BRUSH */
  brush.onclick = () => {
    hgErase = false;

    eraser.style.background = "#fff";
    eraser.style.borderColor = "#ccc";
  };

  /* ERASER */
  eraser.onclick = () => {
    hgErase = true;

    eraser.style.background = "#f1f3f7";
    eraser.style.borderColor = "#6366f1";
  };

  /* SIZE */
  slider.oninput = () => {
    hgSize = +slider.value;
    value.textContent = hgSize;
  };

  /* CLEAR */
  clear.onclick = () => {
    hgStrokes = [];
    drawGuides();
  };

  /* START */
  start.onclick = process;

  /* DONE */
  done.onclick = close;

  /* DRAW CANVAS */
  hgCanvas = document.createElement("canvas");
  hgCanvas.id = "hairGrowCanvas";

  Object.assign(hgCanvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "50",
    touchAction: "none"
  });

  const box = document.querySelector(".previewBox");

  box.style.position = "relative";
  box.appendChild(hgCanvas);

  hgCtx = hgCanvas.getContext("2d");

  resize();

  /* DRAW */
  hgCanvas.onpointerdown = e => {
    e.preventDefault();

    hgDrawing = true;
    hgCanvas.setPointerCapture(e.pointerId);

    const p = point(e);

    if (hgErase) {
      eraseAt(p);
      return;
    }

    hgStrokes.push({
      points: [p],
      size: hgSize,
      style: hgStyle
    });

    drawGuides();
  };

  hgCanvas.onpointermove = e => {
    if (!hgDrawing || hgErase) return;

    const p = point(e);
    const s = hgStrokes[hgStrokes.length - 1];

    if (!s) return;

    const last = s.points[s.points.length - 1];

    if (Math.hypot(p.x - last.x, p.y - last.y) > 2) {
      s.points.push(p);
      drawGuides();
    }
  };

  hgCanvas.onpointerup = () => {
    hgDrawing = false;
  };

  hgCanvas.onpointercancel = () => {
    hgDrawing = false;
  };
  }

  function smooth(points) {
    if (points.length < 3) return points.slice();

    const a = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      a.push({
        x: (points[i - 1].x + points[i].x + points[i + 1].x) / 3,
        y: (points[i - 1].y + points[i].y + points[i + 1].y) / 3
      });
    }

    a.push(points[points.length - 1]);
    return a;
  }

  function colorAt(ctx, x, y) {
    const d = ctx.getImageData(
      Math.max(0, Math.floor(x - 2)),
      Math.max(0, Math.floor(y - 2)),
      5,
      5
    ).data;

    let r = 0, g = 0, b = 0, n = 0;

    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }

    return {
      r: Math.max(8, Math.round(r / n * .82)),
      g: Math.max(8, Math.round(g / n * .82)),
      b: Math.max(8, Math.round(b / n * .82))
    };
  }

  function strand(ctx, pts, color, width, alpha, seed) {
    if (pts.length < 2) return;

    ctx.save();
    ctx.fillStyle =
      `rgba(${color.r},${color.g},${color.b},${alpha})`;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;

      const nx = -dy / len;
      const ny = dx / len;

      const t = i / (pts.length - 1);
      const w = Math.max(.12, width * (1 - t) * (1 - t));

      const wobble =
        Math.sin(i * .75 + seed) *
        width * .35;

      const ax = a.x + nx * wobble;
      const ay = a.y + ny * wobble;
      const bx = b.x + nx * wobble;
      const by = b.y + ny * wobble;

      ctx.beginPath();
      ctx.moveTo(ax + nx * w, ay + ny * w);
      ctx.lineTo(bx + nx * w * .25, by + ny * w * .25);
      ctx.lineTo(bx - nx * w * .25, by - ny * w * .25);
      ctx.lineTo(ax - nx * w, ay - ny * w);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  async function process() {
    if (!selectedFile) {
      showStatus("Please select a photo first.");
      return;
    }

    if (!hgStrokes.length) {
      showStatus("Draw a hair direction first.");
      return;
    }

    try {
      showStatus("Creating realistic hair...");

      const img = await loadImage(selectedFile);

      const out = document.createElement("canvas");
      out.width = img.naturalWidth;
      out.height = img.naturalHeight;

      const ctx = out.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const segmenter = await getHairSegmenter();
      const result = segmenter.segment(img);

      const mask = result.categoryMask.getAsUint8Array();
      const mw = result.categoryMask.width;
      const mh = result.categoryMask.height;

      const ir = imageRect();

      let made = 0;

      for (const s of hgStrokes) {
        if (s.points.length < 2) continue;

        const root = s.points[0];

        const rx = Math.round(root.x / ir.width * img.naturalWidth);
        const ry = Math.round(root.y / ir.height * img.naturalHeight);

        let best = null;

const searchRadius = Math.max(
  40,
  Math.round(35 * img.naturalWidth / Math.max(1, ir.width))
);

for (let yy = -searchRadius; yy <= searchRadius; yy++) {
  for (let xx = -searchRadius; xx <= searchRadius; xx++) {
            const x = rx + xx;
            const y = ry + yy;

            if (x < 0 || y < 0 ||
                x >= img.naturalWidth ||
                y >= img.naturalHeight) continue;

            const mx = Math.floor(x / img.naturalWidth * mw);
            const my = Math.floor(y / img.naturalHeight * mh);

            if (mask[my * mw + mx] === 1) {
              const dist = xx * xx + yy * yy;

              if (!best || dist < best.d) {
                best = { x, y, d: dist };
              }
            }
          }
        }

        /* Stroke must start on real hair */
        if (!best) continue;

        const pts = smooth(s.points).map(p => ({
          x: p.x / ir.width * img.naturalWidth,
          y: p.y / ir.height * img.naturalHeight
        }));

        const dx = pts[0].x - best.x;
        const dy = pts[0].y - best.y;

        const shiftX = best.x - pts[0].x;
        const shiftY = best.y - pts[0].y;

        pts.forEach(p => {
          p.x += shiftX;
          p.y += shiftY;
        });

        const base = Math.max(
          1.2,
          s.size *
          img.naturalWidth /
          Math.max(1, ir.width) *
          .45
        );

        const color = colorAt(
          ctx,
          Math.max(0, Math.min(out.width - 1, best.x)),
          Math.max(0, Math.min(out.height - 1, best.y))
        );

        const count =
          s.style === "curls" ? 14 :
          s.style === "bangs" ? 12 : 10;

        for (let k = 0; k < count; k++) {
          const p = pts.map((p, i) => {
            const t = i / Math.max(1, pts.length - 1);
            const bend =
              Math.sin(t * Math.PI * 1.7 + k) *
              base *
              (s.style === "curls" ? 2.2 :
               s.style === "bangs" ? 1.1 : .45);

            const dx = i ?
              pts[i].x - pts[i - 1].x : pts[1].x - pts[0].x;
            const dy = i ?
              pts[i].y - pts[i - 1].y : pts[1].y - pts[0].y;

            const len = Math.hypot(dx, dy) || 1;

            return {
              x: p.x - dy / len * bend,
              y: p.y + dx / len * bend
            };
          });

          strand(
            ctx,
            p,
            color,
            base * (k < 3 ? 1.15 : .65),
            k < 3 ? .72 : .38,
            k * 1.71
          );
        }

        made++;
      }

      if (!made) {
        showStatus(
          "Hair root nahi mila. Stroke ko existing hair se start karein."
        );
        return;
      }

      const blob = await new Promise(resolve =>
        out.toBlob(resolve, "image/jpeg", .96)
      );

      if (!blob) throw new Error("Hair result create nahi hua.");

      editedBlob = blob;
      preview.src = URL.createObjectURL(blob);
      preview.style.display = "block";
      placeholder.style.display = "none";
      downloadButton.style.display = "block";

      close();
      showStatus("Realistic hair applied ✓");

    } catch (e) {
      console.error("Hair Grow:", e);
      showStatus(
        "Hair Grow failed: " +
        (e.message || "Please try again.")
      );
    }
  }

  function close() {
    if (hgCanvas) hgCanvas.style.display = "none";
    if (hgPanel) hgPanel.style.display = "none";
    hgDrawing = false;
  }

  /* HAIR GROW BUTTON */
  if (typeof hairGrow !== "undefined" && hairGrow) {
    hairGrow.addEventListener("click", function () {
      if (!selectedFile) {
        showStatus("Please select a photo first.");
        return;
      }

      if (hairMenu) hairMenu.style.display = "none";
      if (hairColorPanel) hairColorPanel.style.display = "none";

      hgStrokes = [];
      hgErase = false;

      makePanel();

      hgCanvas.style.display = "block";
      hgPanel.style.display = "flex";

      resize();

      showStatus("Hair se bahar ki taraf stroke draw karein.");
    });
  }

  window.addEventListener("resize", resize);
})();
