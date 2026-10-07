let Client = null;
let handle_file = null;


/* =========================================================
   DOM
========================================================= */

const fileInput =
  document.getElementById("fileInput");

const addPhoto =
  document.getElementById("addPhoto");

const preview =
  document.getElementById("preview");

const placeholder =
  document.getElementById("placeholder");

const statusBox =
  document.getElementById("status");

const downloadButton =
  document.getElementById("downloadButton");

const adjustmentsToggle =
  document.getElementById("adjustmentsToggle");

const adjustmentsPanel =
  document.getElementById("adjustmentsPanel");

const adjustmentsChevron =
  document.getElementById("adjustmentsChevron");

const adjustmentsFrame =
  document.getElementById("adjustmentsFrame");

const smoothControl =
  document.getElementById("smoothControl");

const smoothSlider =
  document.getElementById("smoothSlider");

const smoothValue =
  document.getElementById("smoothValue");

const hairMenu =
  document.getElementById("hairMenu");

const hairGrow =
  document.getElementById("hairGrow");

const hairColor =
  document.getElementById("hairColor");

const hairColorPanel =
  document.getElementById("hairColorPanel");

const hairIntensitySlider =
  document.getElementById("hairIntensitySlider");

const hairIntensityValue =
  document.getElementById("hairIntensityValue");


/* =========================================================
   PHOTO STATE
========================================================= */

let selectedFile = null;

let editedBlob = null;

let adjustmentBaseBlob = null;

let adjustmentTimer = null;

let smoothTimer = null;


/* =========================================================
   STATUS
========================================================= */

function showStatus(text) {

  if (!statusBox) return;

  statusBox.textContent = text;

  statusBox.style.display = "block";
}


/* =========================================================
   UI HELPERS
========================================================= */

function showSmoothControl() {

  if (smoothControl) {
    smoothControl.classList.add("show");
  }

}


function hideSmoothControl() {

  if (smoothControl) {
    smoothControl.classList.remove("show");
  }

}


function resetSmoothSlider() {

  if (!smoothSlider) return;

  smoothSlider.value = 50;

  if (smoothValue) {
    smoothValue.textContent = "50";
  }

}


/* =========================================================
   ADD PHOTO
========================================================= */

if (addPhoto && fileInput) {

  addPhoto.addEventListener("click", function (event) {

    event.preventDefault();

    fileInput.click();

  });

}


if (fileInput) {

  fileInput.addEventListener("change", function () {

    const file =
      fileInput.files &&
      fileInput.files[0];

    if (!file) {
      return;
    }


    if (!file.type.startsWith("image/")) {

      showStatus(
        "Please select an image file."
      );

      return;
    }


    selectedFile = file;

    window.__selectedPhotoFile = file;

    editedBlob = null;

    adjustmentBaseBlob = file;


    if (preview) {

      preview.src =
        URL.createObjectURL(file);

      preview.style.display =
        "block";

    }


    if (placeholder) {

      placeholder.style.display =
        "none";

    }


    if (downloadButton) {

      downloadButton.style.display =
        "none";

    }


    if (statusBox) {

      statusBox.style.display =
        "none";

    }


    hideSmoothControl();

    resetSmoothSlider();

    resetAdjustmentValues();

  });

}


/* =========================================================
   ENHANCE AI
========================================================= */

const HOCKMAN_SPACE =
  "Hockman/real-esrgan-upscaler";

let hockmanAppPromise = null;


async function getHockmanApp() {

  if (!hockmanAppPromise) {

    hockmanAppPromise =
      (async function () {

        showStatus(
          "Loading Enhance AI..."
        );


        const gradio =
          await import(
            "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.0/+esm"
          );


        Client =
          gradio.Client;

        handle_file =
          gradio.handle_file;


        return await Client.connect(
          HOCKMAN_SPACE,
          {
            events: [
              "data",
              "status"
            ],

            status_callback: function (s) {

              if (!s) return;


              if (s.status === "sleeping") {

                showStatus(
                  "Waking Enhance AI..."
                );

              }

              else if (
                s.status === "building"
              ) {

                showStatus(
                  "Enhance AI is starting..."
                );

              }

              else if (
                s.status === "running"
              ) {

                showStatus(
                  "Enhance AI is ready..."
                );

              }

              else if (
                s.status === "error" ||
                s.status === "space_error"
              ) {

                showStatus(
                  "Enhance AI Space error. Please try again."
                );

              }

            }

          }
        );

      })()
      .catch(function (error) {

        hockmanAppPromise = null;

        throw error;

      });

  }


  return await hockmanAppPromise;

}


async function runHockmanX2(file) {

  if (!file) {

    throw new Error(
      "No photo selected"
    );

  }


  showStatus(
    "Connecting to Enhance AI..."
  );


  const app =
    await getHockmanApp();


  showStatus(
    "Uploading photo to Enhance AI..."
  );


  const image =
    handle_file(file);


  showStatus(
    "Enhancing photo..."
  );


  const job =
    app.submit(
      "/process_and_get_output",
      {
        img: image
      }
    );


  let finalData = null;


  for await (
    const message of job
  ) {

    if (message.type === "status") {

      const s =
        message.status || {};


      if (s.stage === "pending") {

        const position =
          Number.isFinite(
            s.position
          )
            ? ` (${s.position} in queue)`
            : "";


        showStatus(
          "Enhance AI is waiting" +
          position +
          "..."
        );

      }

      else if (
        s.stage === "generating"
      ) {

        showStatus(
          "AI is enhancing your photo..."
        );

      }

      else if (
        s.stage === "error"
      ) {

        throw new Error(
          s.message ||
          "Enhance AI processing failed"
        );

      }

    }


    if (
      message.type === "data" &&
      message.data
    ) {

      finalData =
        message.data;

    }

  }


  if (
    !finalData ||
    !finalData[0]
  ) {

    throw new Error(
      "No image returned from Enhance AI"
    );

  }


  const output =
    finalData[0];


  let outputURL =
    output?.url ||
    output?.path ||
    output;


  if (
    typeof outputURL !== "string"
  ) {

    throw new Error(
      "Enhance AI returned an invalid image result"
    );

  }


  if (
    outputURL.startsWith("/")
  ) {

    outputURL =
      "https://hockman-real-esrgan-upscaler.hf.space" +
      outputURL;

  }


  if (
    outputURL.startsWith("http://")
  ) {

    outputURL =
      "https://" +
      outputURL.slice(7);

  }


  const response =
    await fetch(outputURL);


  if (!response.ok) {

    throw new Error(
      "Could not download Enhance AI result"
    );

  }


  return await response.blob();

}


/* =========================================================
   SHOW RESULT
========================================================= */

function showResult(blob) {

  if (!blob) return;


  editedBlob = blob;

  adjustmentBaseBlob = blob;


  if (preview) {

    preview.src =
      URL.createObjectURL(blob);

    preview.style.display =
      "block";

  }


  if (placeholder) {

    placeholder.style.display =
      "none";

  }


  if (downloadButton) {

    downloadButton.style.display =
      "block";

  }


  resetAdjustmentValues();

}


/* =========================================================
   IMAGE LOADER
========================================================= */

function loadImage(file) {

  return new Promise(
    function (resolve, reject) {

      const image =
        new Image();

      const url =
        URL.createObjectURL(file);


      image.onload =
        function () {

          URL.revokeObjectURL(url);

          resolve(image);

        };


      image.onerror =
        function () {

          URL.revokeObjectURL(url);

          reject(
            new Error(
              "Could not load image"
            )
          );

        };


      image.src = url;

    }
  );

}


/* =========================================================
   SMOOTH SKIN
========================================================= */

async function smoothSkin(
  file,
  intensity = 50
) {

  const img =
    await loadImage(file);


  const w =
    img.naturalWidth;

  const h =
    img.naturalHeight;


  const canvas =
    document.createElement(
      "canvas"
    );


  canvas.width = w;

  canvas.height = h;


  const ctx =
    canvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  ctx.drawImage(
    img,
    0,
    0,
    w,
    h
  );


  const original =
    ctx.getImageData(
      0,
      0,
      w,
      h
    );


  const scale =
    Math.min(
      1,
      900 / w
    );


  const sw =
    Math.max(
      1,
      Math.round(w * scale)
    );


  const sh =
    Math.max(
      1,
      Math.round(h * scale)
    );


  const work =
    document.createElement(
      "canvas"
    );


  work.width = sw;

  work.height = sh;


  const wc =
    work.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  wc.drawImage(
    img,
    0,
    0,
    sw,
    sh
  );


  const blur1 =
    document.createElement(
      "canvas"
    );


  blur1.width = sw;

  blur1.height = sh;


  const c1 =
    blur1.getContext("2d");


  c1.filter =
    "blur(5px)";


  c1.drawImage(
    work,
    0,
    0
  );


  const blur2 =
    document.createElement(
      "canvas"
    );


  blur2.width = sw;

  blur2.height = sh;


  const c2 =
    blur2.getContext("2d");


  c2.filter =
    "blur(3px)";


  c2.drawImage(
    blur1,
    0,
    0
  );


  const blur3 =
    document.createElement(
      "canvas"
    );


  blur3.width = sw;

  blur3.height = sh;


  const c3 =
    blur3.getContext("2d");


  c3.filter =
    "blur(1.5px)";


  c3.drawImage(
    blur2,
    0,
    0
  );


  const blurred =
    document.createElement(
      "canvas"
    );


  blurred.width = w;

  blurred.height = h;


  const bc =
    blurred.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  bc.drawImage(
    blur3,
    0,
    0,
    w,
    h
  );


  const mask =
    document.createElement(
      "canvas"
    );


  mask.width = w;

  mask.height = h;


  const mc =
    mask.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  const fx = w * 0.50;

  const fy = h * 0.465;

  const fw = w * 0.405;

  const fh = h * 0.475;


  const gradient =
    mc.createRadialGradient(
      fx,
      fy,
      fw * 0.18,
      fx,
      fy,
      fw * 1.02
    );


  gradient.addColorStop(
    0,
    "rgba(255,255,255,1)"
  );

  gradient.addColorStop(
    0.48,
    "rgba(255,255,255,.98)"
  );

  gradient.addColorStop(
    0.68,
    "rgba(255,255,255,.82)"
  );

  gradient.addColorStop(
    0.82,
    "rgba(255,255,255,.48)"
  );

  gradient.addColorStop(
    0.93,
    "rgba(255,255,255,.16)"
  );

  gradient.addColorStop(
    1,
    "rgba(255,255,255,0)"
  );


  mc.fillStyle =
    gradient;


  mc.beginPath();

  mc.ellipse(
    fx,
    fy,
    fw,
    fh,
    0,
    0,
    Math.PI * 2
  );

  mc.fill();


  mc.globalCompositeOperation =
    "destination-out";


  function cut(
    x,
    y,
    rx,
    ry
  ) {

    mc.beginPath();

    mc.ellipse(
      x,
      y,
      rx,
      ry,
      0,
      0,
      Math.PI * 2
    );

    mc.fill();

  }


  cut(
    w * 0.405,
    h * 0.395,
    w * 0.092,
    h * 0.045
  );


  cut(
    w * 0.595,
    h * 0.395,
    w * 0.092,
    h * 0.045
  );


  cut(
    w * 0.405,
    h * 0.345,
    w * 0.105,
    h * 0.026
  );


  cut(
    w * 0.595,
    h * 0.345,
    w * 0.105,
    h * 0.026
  );


  cut(
    w * 0.50,
    h * 0.505,
    w * 0.078,
    h * 0.135
  );


  cut(
    w * 0.50,
    h * 0.625,
    w * 0.145,
    h * 0.060
  );


  cut(
    w * 0.50,
    h * 0.675,
    w * 0.18,
    h * 0.055
  );


  cut(
    w * 0.34,
    h * 0.695,
    w * 0.105,
    h * 0.065
  );


  cut(
    w * 0.66,
    h * 0.695,
    w * 0.105,
    h * 0.065
  );


  mc.globalCompositeOperation =
    "source-over";


  const softMask =
    document.createElement(
      "canvas"
    );


  softMask.width = w;

  softMask.height = h;


  const smc =
    softMask.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  smc.filter =
    "blur(8px)";


  smc.drawImage(
    mask,
    0,
    0
  );


  const maskData =
    smc.getImageData(
      0,
      0,
      w,
      h
    ).data;


  const blurData =
    bc.getImageData(
      0,
      0,
      w,
      h
    ).data;


  const source =
    original.data;


  const result =
    ctx.createImageData(
      w,
      h
    );


  const output =
    result.data;


  const amount =
    Math.max(
      1,
      Math.min(
        100,
        Number(intensity) || 50
      )
    );


  const strengthBase =
    0.08 +
    Math.pow(
      amount / 100,
      0.72
    ) * 0.92;


  for (
    let i = 0;
    i < source.length;
    i += 4
  ) {

    const maskValue =
      maskData[i + 3] / 255;


    if (maskValue <= 0.003) {

      output[i] =
        source[i];

      output[i + 1] =
        source[i + 1];

      output[i + 2] =
        source[i + 2];

      output[i + 3] =
        255;

      continue;

    }


    const r =
      source[i];

    const g =
      source[i + 1];

    const b =
      source[i + 2];


    const br =
      blurData[i];

    const bg =
      blurData[i + 1];

    const bb =
      blurData[i + 2];


    const difference =
      Math.abs(r - br) +
      Math.abs(g - bg) +
      Math.abs(b - bb);


    let strength =
      strengthBase *
      maskValue;


    if (difference > 95) {

      strength *= 0.36;

    }

    else if (difference > 70) {

      strength *= 0.52;

    }

    else if (difference > 48) {

      strength *= 0.72;

    }

    else if (difference > 30) {

      strength *= 0.88;

    }


    strength =
      Math.min(
        0.94,
        strength
      );


    output[i] =
      Math.round(
        r * (1 - strength) +
        br * strength
      );


    output[i + 1] =
      Math.round(
        g * (1 - strength) +
        bg * strength
      );


    output[i + 2] =
      Math.round(
        b * (1 - strength) +
        bb * strength
      );


    output[i + 3] =
      255;

  }


  ctx.putImageData(
    result,
    0,
    0
  );


  return await new Promise(
    function (resolve) {

      canvas.toBlob(
        resolve,
        "image/jpeg",
        0.94
      );

    }
  );

}


function showSmoothResult(blob) {

  if (!blob) return;


  editedBlob =
    blob;


  if (preview) {

    preview.src =
      URL.createObjectURL(blob);

    preview.style.display =
      "block";

  }


  if (placeholder) {

    placeholder.style.display =
      "none";

  }


  if (downloadButton) {

    downloadButton.style.display =
      "block";

  }


  showStatus(
    "Smooth Skin applied ✓"
  );

}


/* =========================================================
   SMOOTH SLIDER
========================================================= */

if (smoothSlider) {

  smoothSlider.addEventListener(
    "input",
    function () {

      const file =
        selectedFile;


      const value =
        Number(
          smoothSlider.value
        );


      if (smoothValue) {

        smoothValue.textContent =
          value;

      }


      if (!file) {

        showStatus(
          "Please select a photo first."
        );

        return;

      }


      clearTimeout(
        smoothTimer
      );


      smoothTimer =
        setTimeout(
          async function () {

            try {

              showStatus(
                "Applying Skin Smooth " +
                value +
                "%..."
              );


              const blob =
                await smoothSkin(
                  file,
                  value
                );


              showSmoothResult(
                blob
              );

            }

            catch (error) {

              console.error(
                error
              );


              showStatus(
                "Smooth Skin failed. Please try again."
              );

            }

          },
          120
        );

    }
  );

}


/* =========================================================
   ADJUSTMENTS
========================================================= */

const adjustmentIds = [
  "brightness",
  "contrast",
  "warmth",
  "saturation",
  "sharpness",
  "temperature",
  "vibrance",
  "tint",
  "shadows",
  "clarity"
];


const adjustmentValues = {};


adjustmentIds.forEach(
  function (id) {

    adjustmentValues[id] = 0;

  }
);


function resetAdjustmentValues() {

  adjustmentIds.forEach(
    function (id) {

      adjustmentValues[id] = 0;

    }
  );


  if (
    adjustmentsFrame &&
    adjustmentsFrame.contentWindow
  ) {

    adjustmentsFrame.contentWindow.postMessage(
      {
        type: "setValues",
        values: {
          ...adjustmentValues
        }
      },
      window.location.origin
    );

  }

}


if (adjustmentsToggle) {

  adjustmentsToggle.addEventListener(
    "click",
    function () {

      const opened =
        adjustmentsPanel.classList.toggle(
          "open"
        );


      adjustmentsToggle.classList.toggle(
        "open",
        opened
      );


      if (adjustmentsChevron) {

        adjustmentsChevron.textContent =
          opened
            ? "⌄"
            : "›";

      }

    }
  );

}


function sendAdjustmentState() {

  if (
    adjustmentsFrame &&
    adjustmentsFrame.contentWindow
  ) {

    adjustmentsFrame.contentWindow.postMessage(
      {
        type: "setValues",
        values: {
          ...adjustmentValues
        }
      },
      window.location.origin
    );

  }

}


window.addEventListener(
  "message",
  async function (event) {

    if (
      !adjustmentsFrame ||
      event.source !==
      adjustmentsFrame.contentWindow
    ) {

      return;

    }


    const data =
      event.data || {};


    if (
      data.type ===
      "adjustmentReady"
    ) {

      sendAdjustmentState();

      return;

    }


    if (
      data.type ===
      "adjustmentChange"
    ) {

      if (
        !adjustmentIds.includes(
          data.id
        )
      ) {

        return;

      }


      adjustmentValues[data.id] =
        Number(data.value) || 0;


      if (!adjustmentBaseBlob) {

        return;

      }


      clearTimeout(
        adjustmentTimer
      );


      adjustmentTimer =
        setTimeout(
          async function () {

            try {

              showStatus(
                "Applying adjustment..."
              );


              await applyAdjustments();

            }

            catch (error) {

              console.error(
                error
              );


              showStatus(
                "Adjustment failed. Please try again."
              );

            }

          },
          120
        );


      return;

    }


    if (
      data.type ===
      "resetAdjustments"
    ) {

      resetAdjustmentValues();

    }

  }
);


/* =========================================================
   COLOR HELPERS
========================================================= */

function clamp(value) {

  return Math.max(
    0,
    Math.min(
      255,
      value
    )
  );

}


function rgbToHsv(
  r,
  g,
  b
) {

  r /= 255;
  g /= 255;
  b /= 255;


  const max =
    Math.max(
      r,
      g,
      b
    );


  const min =
    Math.min(
      r,
      g,
      b
    );


  let h = 0;

  let s = 0;

  const v = max;

  const d =
    max - min;


  if (max !== 0) {

    s =
      d / max;

  }


  if (d !== 0) {

    if (max === r) {

      h =
        (g - b) /
        d +
        (g < b ? 6 : 0);

    }

    else if (max === g) {

      h =
        (b - r) /
        d +
        2;

    }

    else {

      h =
        (r - g) /
        d +
        4;

    }


    h /= 6;

  }


  return {
    h,
    s,
    v
  };

}


function hsvToRgb(
  h,
  s,
  v
) {

  let r;

  let g;

  let b;


  const i =
    Math.floor(
      h * 6
    );


  const f =
    h * 6 - i;


  const p =
    v * (1 - s);


  const q =
    v * (1 - f * s);


  const t =
    v *
    (1 - (1 - f) * s);


  switch (i % 6) {

    case 0:

      r = v;
      g = t;
      b = p;

      break;


    case 1:

      r = q;
      g = v;
      b = p;

      break;


    case 2:

      r = p;
      g = v;
      b = t;

      break;


    case 3:

      r = p;
      g = q;
      b = v;

      break;


    case 4:

      r = t;
      g = p;
      b = v;

      break;


    default:

      r = v;
      g = p;
      b = q;

  }


  return {
    r: r * 255,
    g: g * 255,
    b: b * 255
  };

}


/* =========================================================
   ADJUSTMENT ENGINE
========================================================= */

async function applyAdjustments() {

  if (!adjustmentBaseBlob) {
    return;
  }


  const img =
    await loadImage(
      adjustmentBaseBlob
    );


  const maxWidth = 1400;


  const scale =
    Math.min(
      1,
      maxWidth /
      img.naturalWidth
    );


  const width =
    Math.max(
      1,
      Math.round(
        img.naturalWidth *
        scale
      )
    );


  const height =
    Math.max(
      1,
      Math.round(
        img.naturalHeight *
        scale
      )
    );


  const canvas =
    document.createElement(
      "canvas"
    );


  canvas.width =
    width;

  canvas.height =
    height;


  const ctx =
    canvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  ctx.drawImage(
    img,
    0,
    0,
    width,
    height
  );


  const imageData =
    ctx.getImageData(
      0,
      0,
      width,
      height
    );


  const data =
    imageData.data;


  const brightness =
    Number(
      adjustmentValues.brightness
    );


  const contrast =
    Number(
      adjustmentValues.contrast
    );


  const warmth =
    Number(
      adjustmentValues.warmth
    );


  const saturation =
    Number(
      adjustmentValues.saturation
    );


  const temperature =
    Number(
      adjustmentValues.temperature
    );


  const vibrance =
    Number(
      adjustmentValues.vibrance
    );


  const tint =
    Number(
      adjustmentValues.tint
    );


  const shadows =
    Number(
      adjustmentValues.shadows
    );


  const contrastFactor =
    (
      259 *
      (contrast + 255)
    ) /
    (
      255 *
      (259 - contrast)
    );


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    let r =
      data[i];

    let g =
      data[i + 1];

    let b =
      data[i + 2];


    const bright =
      brightness * 2.55;


    r += bright;
    g += bright;
    b += bright;


    r =
      contrastFactor *
      (r - 128) +
      128;


    g =
      contrastFactor *
      (g - 128) +
      128;


    b =
      contrastFactor *
      (b - 128) +
      128;


    const warm =
      warmth * 0.65;


    r += warm;

    b -= warm;

    g += warm * 0.1;


    const temp =
      temperature * 0.55;


    r += temp * 0.75;

    g += temp * 0.08;

    b -= temp * 0.9;


    const tintAmount =
      tint * 0.6;


    r += tintAmount;

    b += tintAmount;

    g -= tintAmount;


    const luminance =
      0.2126 * r +
      0.7152 * g +
      0.0722 * b;


    const shadowFactor =
      Math.max(
        0,
        Math.min(
          1,
          (145 - luminance) /
          145
        )
      );


    const shadowAmount =
      shadows *
      1.25 *
      shadowFactor;


    r += shadowAmount;
    g += shadowAmount;
    b += shadowAmount;


    let hsv =
      rgbToHsv(
        clamp(r),
        clamp(g),
        clamp(b)
      );


    hsv.s =
      Math.max(
        0,
        Math.min(
          1,
          hsv.s *
          (
            saturation >= 0
              ? 1 + saturation / 100
              : 1 + saturation / 120
          )
        )
      );


    const vibranceAmount =
      vibrance / 100;


    if (vibranceAmount > 0) {

      hsv.s =
        Math.min(
          1,
          hsv.s +
          vibranceAmount *
          (1 - hsv.s) *
          0.75
        );

    }

    else {

      hsv.s =
        Math.max(
          0,
          hsv.s +
          vibranceAmount *
          0.35
        );

    }


    const rgb =
      hsvToRgb(
        hsv.h,
        hsv.s,
        hsv.v
      );


    data[i] =
      clamp(
        rgb.r
      );


    data[i + 1] =
      clamp(
        rgb.g
      );


    data[i + 2] =
      clamp(
        rgb.b
      );

  }


  ctx.putImageData(
    imageData,
    0,
    0
  );


  editedBlob =
    await new Promise(
      function (resolve) {

        canvas.toBlob(
          resolve,
          "image/jpeg",
          0.94
        );

      }
    );


  if (preview) {

    preview.src =
      URL.createObjectURL(
        editedBlob
      );

    preview.style.display =
      "block";

  }


  if (placeholder) {

    placeholder.style.display =
      "none";

  }


  if (downloadButton) {

    downloadButton.style.display =
      "block";

  }

}


/* =========================================================
   HAIR SEGMENTATION
========================================================= */

let FilesetResolver = null;

let ImageSegmenter = null;

let hairSegmenter = null;

let hairSegmenterPromise = null;


async function getHairSegmenter() {

  if (!hairSegmenterPromise) {

    hairSegmenterPromise =
      (async function () {

        showStatus(
          "Loading Hair AI..."
        );


        const mp =
          await import(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs"
          );


        FilesetResolver =
          mp.FilesetResolver;

        ImageSegmenter =
          mp.ImageSegmenter;


        if (
          !FilesetResolver ||
          !ImageSegmenter
        ) {

          throw new Error(
            "MediaPipe Image Segmenter could not be loaded."
          );

        }


        const vision =
          await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );


        const segmenter =
          await ImageSegmenter.createFromOptions(
            vision,
            {

              baseOptions: {

                modelAssetPath:
                  "./hair_segmenter.tflite"

              },


              runningMode:
                "IMAGE",


              outputCategoryMask:
                true,


              outputConfidenceMasks:
                true

            }
          );


        return segmenter;

      })()
      .catch(function (error) {

        hairSegmenterPromise =
          null;

        throw error;

      });

  }


  hairSegmenter =
    await hairSegmenterPromise;


  return hairSegmenter;

}


/* =========================================================
   HSL
========================================================= */

function rgbToHsl(
  r,
  g,
  b
) {

  r /= 255;
  g /= 255;
  b /= 255;


  const max =
    Math.max(
      r,
      g,
      b
    );


  const min =
    Math.min(
      r,
      g,
      b
    );


  let h = 0;

  let s = 0;


  const l =
    (max + min) / 2;


  if (max !== min) {

    const d =
      max - min;


    s =
      l > 0.5
        ? d / (2 - max - min)
        : d / (max + min);


    switch (max) {

      case r:

        h =
          (g - b) /
          d +
          (g < b ? 6 : 0);

        break;


      case g:

        h =
          (b - r) /
          d +
          2;

        break;


      case b:

        h =
          (r - g) /
          d +
          4;

        break;

    }


    h /= 6;

  }


  return {
    h,
    s,
    l
  };

}


function hueToRgb(
  p,
  q,
  t
) {

  if (t < 0) {
    t += 1;
  }


  if (t > 1) {
    t -= 1;
  }


  if (t < 1 / 6) {
    return p +
      (q - p) *
      6 *
      t;
  }


  if (t < 1 / 2) {
    return q;
  }


  if (t < 2 / 3) {
    return p +
      (q - p) *
      (2 / 3 - t) *
      6;
  }


  return p;

}


function hslToRgb(
  h,
  s,
  l
) {

  let r;
  let g;
  let b;


  if (s === 0) {

    r = l;
    g = l;
    b = l;

  }

  else {

    const q =
      l < 0.5
        ? l * (1 + s)
        : l + s - l * s;


    const p =
      2 * l - q;


    r =
      hueToRgb(
        p,
        q,
        h + 1 / 3
      );


    g =
      hueToRgb(
        p,
        q,
        h
      );


    b =
      hueToRgb(
        p,
        q,
        h - 1 / 3
      );

  }


  return {
    r: r * 255,
    g: g * 255,
    b: b * 255
  };

}


/* =========================================================
   HAIR COLOR
========================================================= */

let selectedHairColor =
  "#111111";


let selectedHairIntensity =
  50;


async function applyHairColorLocal() {

  if (!selectedFile) {

    showStatus(
      "Please select a photo first."
    );

    return;

  }


  try {

    showStatus(
      "Detecting hair..."
    );


    const segmenter =
      await getHairSegmenter();


    const img =
      await loadImage(
        selectedFile
      );


    const width =
      img.naturalWidth;


    const height =
      img.naturalHeight;


    const canvas =
      document.createElement(
        "canvas"
      );


    canvas.width =
      width;

    canvas.height =
      height;


    const ctx =
      canvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );


    ctx.drawImage(
      img,
      0,
      0,
      width,
      height
    );


    const result =
      segmenter.segment(
        img
      );


    let confidenceData =
      null;

    let categoryData =
      null;

    let maskWidth =
      0;

    let maskHeight =
      0;


    if (
      result.confidenceMasks &&
      result.confidenceMasks.length > 1
    ) {

      const hairMask =
        result.confidenceMasks[1];


      confidenceData =
        hairMask.getAsFloat32Array();


      maskWidth =
        hairMask.width;


      maskHeight =
        hairMask.height;

    }


    if (
      !confidenceData &&
      result.categoryMask
    ) {

      categoryData =
        result.categoryMask
          .getAsUint8Array();


      maskWidth =
        result.categoryMask.width;


      maskHeight =
        result.categoryMask.height;

    }


    if (
      !confidenceData &&
      !categoryData
    ) {

      if (
        result.close
      ) {

        result.close();

      }


      throw new Error(
        "Hair mask was not returned."
      );

    }


    const maskCanvas =
      document.createElement(
        "canvas"
      );


    maskCanvas.width =
      maskWidth;

    maskCanvas.height =
      maskHeight;


    const maskCtx =
      maskCanvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );


    const maskImage =
      maskCtx.createImageData(
        maskWidth,
        maskHeight
      );


    const maskPixels =
      maskImage.data;


    for (
      let i = 0;
      i < maskWidth * maskHeight;
      i++
    ) {

      let value = 0;


      if (confidenceData) {

        value =
          Math.max(
            0,
            Math.min(
              1,
              confidenceData[i]
            )
          );

      }

      else {

        value =
          categoryData[i] === 1
            ? 1
            : 0;

      }


      if (value < 0.35) {

        value = 0;

      }


      maskPixels[i * 4] =
        255;

      maskPixels[i * 4 + 1] =
        255;

      maskPixels[i * 4 + 2] =
        255;

      maskPixels[i * 4 + 3] =
        Math.round(
          value * 255
        );

    }


    maskCtx.putImageData(
      maskImage,
      0,
      0
    );


    const fullMask =
      document.createElement(
        "canvas"
      );


    fullMask.width =
      width;

    fullMask.height =
      height;


    const fullMaskCtx =
      fullMask.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );


    fullMaskCtx.filter =
      "blur(1.2px)";


    fullMaskCtx.drawImage(
      maskCanvas,
      0,
      0,
      width,
      height
    );


    const finalMask =
      fullMaskCtx.getImageData(
        0,
        0,
        width,
        height
      ).data;


    const imageData =
      ctx.getImageData(
        0,
        0,
        width,
        height
      );


    const data =
      imageData.data;


    const hex =
      selectedHairColor
        .replace(
          "#",
          ""
        );


    const tr =
      parseInt(
        hex.substring(0, 2),
        16
      );


    const tg =
      parseInt(
        hex.substring(2, 4),
        16
      );


    const tb =
      parseInt(
        hex.substring(4, 6),
        16
      );


    const targetHsl =
      rgbToHsl(
        tr,
        tg,
        tb
      );


    const intensity =
      selectedHairIntensity /
      100;


    let targetSaturation =
      targetHsl.s;


    let lightBoost =
      0;


    if (
      selectedHairColor ===
      "#111111"
    ) {

      targetSaturation = 0;

      lightBoost = -0.12;

    }


    else if (
      selectedHairColor ===
      "#5b321b"
    ) {

      targetSaturation =
        Math.min(
          1,
          targetHsl.s * 1.05
        );

      lightBoost = -0.02;

    }


    else if (
      selectedHairColor ===
      "#d6b36a"
    ) {

      targetSaturation =
        Math.min(
          1,
          targetHsl.s * 0.85
        );

      lightBoost = 0.10;

    }


    else if (
      selectedHairColor ===
      "#8b2f1f"
    ) {

      targetSaturation =
        Math.min(
          1,
          targetHsl.s * 1.05
        );

      lightBoost = 0.01;

    }


    for (
      let y = 0;
      y < height;
      y++
    ) {

      for (
        let x = 0;
        x < width;
        x++
      ) {

        const pixelIndex =
          (
            y * width +
            x
          ) * 4;


        const maskX =
          Math.min(
            maskWidth - 1,
            Math.floor(
              x *
              maskWidth /
              width
            )
          );


        const maskY =
          Math.min(
            maskHeight - 1,
            Math.floor(
              y *
              maskHeight /
              height
            )
          );


        const maskIndex =
          (
            maskY *
            maskWidth +
            maskX
          ) * 4;


        const rawAlpha =
          finalMask[
            maskIndex + 3
          ] / 255;


        if (
          rawAlpha < 0.30
        ) {

          continue;

        }


        const alpha =
          Math.min(
            1,
            Math.max(
              0,
              (
                rawAlpha -
                0.30
              ) / 0.70
            )
          );


        const r =
          data[pixelIndex];


        const g =
          data[pixelIndex + 1];


        const b =
          data[pixelIndex + 2];


        const originalHsl =
          rgbToHsl(
            r,
            g,
            b
          );


        let newLightness =
          originalHsl.l;


        if (
          lightBoost > 0
        ) {

          newLightness =
            Math.min(
              0.88,
              newLightness +
              lightBoost *
              intensity
            );

        }


        if (
          lightBoost < 0
        ) {

          newLightness =
            Math.max(
              0.06,
              newLightness +
              lightBoost *
              intensity
            );

        }


        const saturation =
          Math.min(
            1,
            originalHsl.s *
            0.35 +
            targetSaturation *
            0.65
          );


        const recolored =
          hslToRgb(
            targetHsl.h,
            saturation,
            newLightness
          );


        const strength =
          Math.min(
            0.72,
            alpha *
            (
              0.10 +
              intensity *
              0.62
            )
          );


        data[pixelIndex] =
          Math.round(
            r *
            (1 - strength) +
            recolored.r *
            strength
          );


        data[pixelIndex + 1] =
          Math.round(
            g *
            (1 - strength) +
            recolored.g *
            strength
          );


        data[pixelIndex + 2] =
          Math.round(
            b *
            (1 - strength) +
            recolored.b *
            strength
          );

      }

    }


    ctx.putImageData(
      imageData,
      0,
      0
    );


    if (
      result.close
    ) {

      result.close();

    }


    const blob =
      await new Promise(
        function (resolve) {

          canvas.toBlob(
            resolve,
            "image/jpeg",
            0.94
          );

        }
      );


    editedBlob =
      blob;


    if (preview) {

      preview.src =
        URL.createObjectURL(
          blob
        );

      preview.style.display =
        "block";

    }


    if (placeholder) {

      placeholder.style.display =
        "none";

    }


    if (downloadButton) {

      downloadButton.style.display =
        "block";

    }


    showStatus(
      "Hair Color applied ✓"
    );

  }

  catch (error) {

    console.error(
      error
    );


    showStatus(
      "Hair Color failed: " +
      (
        error.message ||
        "Please try again."
      )
    );

  }

}


/* =========================================================
   HAIR COLOR BUTTONS
========================================================= */

document
  .querySelectorAll(
    ".hairColorOption"
  )
  .forEach(
    function (button) {

      button.addEventListener(
        "click",
        function () {

          if (!selectedFile) {

            showStatus(
              "Please select a photo first."
            );

            return;

          }


          selectedHairColor =
            button.dataset.color;


          selectedHairIntensity =
            Number(
              hairIntensitySlider.value
            );


          applyHairColorLocal();

        }
      );

    }
  );


if (hairIntensitySlider) {

  hairIntensitySlider.addEventListener(
    "input",
    function () {

      selectedHairIntensity =
        Number(
          hairIntensitySlider.value
        );


      if (hairIntensityValue) {

        hairIntensityValue.textContent =
          selectedHairIntensity;

      }


      if (
        selectedFile &&
        selectedHairColor
      ) {

        clearTimeout(
          window.hairColorTimer
        );


        window.hairColorTimer =
          setTimeout(
            function () {

              applyHairColorLocal();

            },
            150
          );

      }

    }
  );

}


/* =========================================================
   AI TOOL BUTTONS
========================================================= */

document
  .querySelectorAll(".tool")
  .forEach(
    function (tool) {

      tool.addEventListener(
        "click",
        async function () {

          if (!selectedFile) {

            showStatus(
              "Please select a photo first."
            );

            return;

          }


          const type =
            tool.dataset.tool;


          if (
            type === "smooth"
          ) {

            if (hairMenu) {

              hairMenu.style.display =
                "none";

            }


            if (hairColorPanel) {

              hairColorPanel.style.display =
                "none";

            }


            showSmoothControl();


            showStatus(
              "Skin Smooth selected."
            );


            return;

          }


          hideSmoothControl();


          if (
            type === "enhance"
          ) {

            if (hairMenu) {

              hairMenu.style.display =
                "none";

            }


            if (hairColorPanel) {

              hairColorPanel.style.display =
                "none";

            }


            try {

              showStatus(
                "Starting Enhance AI..."
              );


              const blob =
                await runHockmanX2(
                  selectedFile
                );


              showResult(
                blob
              );


              showStatus(
                "AI Enhance complete ✓"
              );

            }

            catch (error) {

              console.error(
                error
              );


              showStatus(
                "Enhance failed: " +
                (
                  error.message ||
                  "Please try again."
                )
              );

            }


            return;

          }


          if (
            type === "hair"
          ) {

            hideSmoothControl();


            if (hairColorPanel) {

              hairColorPanel.style.display =
                "none";

            }


            if (hairMenu) {

              hairMenu.style.display =
                "flex";

            }


            showStatus(
              "Hair menu opened."
            );


            return;

          }


          if (
            type === "retouch"
          ) {

            if (hairMenu) {

              hairMenu.style.display =
                "none";

            }


            if (hairColorPanel) {

              hairColorPanel.style.display =
                "none";

            }


            showStatus(
              "Retouch tool is coming soon."
            );


            return;

          }

        }
      );

    }
  );




/* =========================================================
   HAIR COLOR OPEN
========================================================= */

if (hairColor) {

  hairColor.addEventListener(
    "click",
    function () {

      if (!selectedFile) {

        showStatus(
          "Please select a photo first."
        );

        return;

      }


      if (hairMenu) {

        hairMenu.style.display =
          "none";

      }


      if (hairColorPanel) {

        hairColorPanel.style.display =
          "block";

      }


      showStatus(
        "Hair Color selected."
      );

    }
  );

}


/* =========================================================
   DOWNLOAD
========================================================= */

if (downloadButton) {

  downloadButton.addEventListener(
    "click",
    function () {

      if (!editedBlob) {

        showStatus(
          "Please edit the photo first."
        );

        return;

      }


      const url =
        URL.createObjectURL(
          editedBlob
        );


      const link =
        document.createElement(
          "a"
        );


      link.href =
        url;


      link.download =
        "AI-Edited-Photo.jpg";


      document.body.appendChild(
        link
      );


      link.click();


      link.remove();


      setTimeout(
        function () {

          URL.revokeObjectURL(
            url
          );

        },
        1000
      );

    }
  );

}


/* =========================================================
   INITIAL STATE
========================================================= */

hideSmoothControl();

if (downloadButton) {

  downloadButton.style.display =
    "none";

}

if (statusBox) {

  statusBox.style.display =
    "none";

}
