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
   HAIR GROW
   DRAW + ERASER + HAIR STYLE
========================================================= */

let hairGrowPanel = null;
let hairDrawCanvas = null;
let hairDrawCtx = null;

let hairDrawing = false;
let hairErasing = false;

let hairCurrentSize = 6;
let hairCurrentStyle = "straight";

let hairStrokes = [];
let hairEraseStrokes = [];


/* ---------------------------------------------------------
   CREATE GROW UI
--------------------------------------------------------- */

function createHairGrowUI() {

  if (hairGrowPanel) {
    hairGrowPanel.style.display = "flex";
    return;
  }


  const previewBox =
    document.querySelector(".previewBox");

  if (!previewBox) return;


  previewBox.style.position = "relative";


  /* DRAW CANVAS */

  hairDrawCanvas =
    document.createElement("canvas");

  hairDrawCanvas.id =
    "hairGrowDrawCanvas";


  hairDrawCanvas.style.position =
    "absolute";

  hairDrawCanvas.style.left =
    "0";

  hairDrawCanvas.style.top =
    "0";

  hairDrawCanvas.style.width =
    "100%";

  hairDrawCanvas.style.height =
    "100%";

  hairDrawCanvas.style.zIndex =
    "20";

  hairDrawCanvas.style.touchAction =
    "none";

  hairDrawCanvas.style.pointerEvents =
    "auto";


  previewBox.appendChild(
    hairDrawCanvas
  );


  hairDrawCtx =
    hairDrawCanvas.getContext(
      "2d"
    );


  function resizeHairCanvas() {

    const rect =
      previewBox.getBoundingClientRect();

    const dpr =
      window.devicePixelRatio || 1;


    hairDrawCanvas.width =
      Math.round(
        rect.width * dpr
      );

    hairDrawCanvas.height =
      Math.round(
        rect.height * dpr
      );


    hairDrawCtx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );


    redrawHairStrokes();

  }


  resizeHairCanvas();


  window.addEventListener(
    "resize",
    resizeHairCanvas
  );


  /* -------------------------------------------------------
     BOTTOM PANEL
  ------------------------------------------------------- */

  hairGrowPanel =
    document.createElement(
      "div"
    );

  hairGrowPanel.id =
    "hairGrowPanel";


  hairGrowPanel.style.position =
    "fixed";

  hairGrowPanel.style.left =
    "0";

  hairGrowPanel.style.right =
    "0";

  hairGrowPanel.style.bottom =
    "0";

  hairGrowPanel.style.zIndex =
    "9999";

  hairGrowPanel.style.background =
    "#ffffff";

  hairGrowPanel.style.borderRadius =
    "22px 22px 0 0";

  hairGrowPanel.style.padding =
    "14px 14px 18px";

  hairGrowPanel.style.boxShadow =
    "0 -5px 25px rgba(0,0,0,.16)";

  hairGrowPanel.style.display =
    "flex";

  hairGrowPanel.style.flexDirection =
    "column";

  hairGrowPanel.style.gap =
    "12px";


  /* -------------------------------------------------------
     TOP TOOL ROW
  ------------------------------------------------------- */

  const toolRow =
    document.createElement(
      "div"
    );

  toolRow.style.display =
    "flex";

  toolRow.style.alignItems =
    "center";

  toolRow.style.gap =
    "12px";


  const brushButton =
    document.createElement(
      "button"
    );

  brushButton.type =
    "button";

  brushButton.textContent =
    "🖌️";

  brushButton.style.fontSize =
    "22px";

  brushButton.style.border =
    "0";

  brushButton.style.background =
    "transparent";


  const sizeSlider =
    document.createElement(
      "input"
    );

  sizeSlider.type =
    "range";

  sizeSlider.min =
    "1";

  sizeSlider.max =
    "30";

  sizeSlider.value =
    String(hairCurrentSize);

  sizeSlider.style.flex =
    "1";


  const sizeValue =
    document.createElement(
      "span"
    );

  sizeValue.textContent =
    String(hairCurrentSize);

  sizeValue.style.minWidth =
    "22px";

  sizeValue.style.textAlign =
    "center";


  const eraserButton =
    document.createElement(
      "button"
    );

  eraserButton.type =
    "button";

  eraserButton.textContent =
    "⌫";

  eraserButton.style.fontSize =
    "21px";

  eraserButton.style.border =
    "0";

  eraserButton.style.background =
    "transparent";


  toolRow.appendChild(
    brushButton
  );

  toolRow.appendChild(
    sizeSlider
  );

  toolRow.appendChild(
    sizeValue
  );

  toolRow.appendChild(
    eraserButton
  );


  /* -------------------------------------------------------
     STYLE BUTTONS
  ------------------------------------------------------- */

  const styleRow =
    document.createElement(
      "div"
    );

  styleRow.style.display =
    "flex";

  styleRow.style.justifyContent =
    "center";

  styleRow.style.gap =
    "12px";


  const styleButtons = {};


  [
    ["Bangs", "bangs"],
    ["Straight", "straight"],
    ["Curls", "curls"]
  ].forEach(
    function(item) {

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.textContent =
        item[0];

      button.style.padding =
        "8px 18px";

      button.style.borderRadius =
        "10px";

      button.style.border =
        "1px solid #ddd";

      button.style.background =
        "#ffffff";


      button.onclick =
        function() {

          hairCurrentStyle =
            item[1];


          Object.keys(
            styleButtons
          ).forEach(
            function(key) {

              styleButtons[key]
                .style.background =
                "#ffffff";

              styleButtons[key]
                .style.color =
                "#333";

            }
          );


          button.style.background =
            "#222";

          button.style.color =
            "#ffffff";

        };


      styleButtons[item[1]] =
        button;


      styleRow.appendChild(
        button
      );

    }
  );


  styleButtons.straight.style.background =
    "#222";

  styleButtons.straight.style.color =
    "#ffffff";


  /* -------------------------------------------------------
     BOTTOM BUTTON ROW
  ------------------------------------------------------- */

  const bottomRow =
    document.createElement(
      "div"
    );

  bottomRow.style.display =
    "flex";

  bottomRow.style.alignItems =
    "center";

  bottomRow.style.gap =
    "8px";


  const clearButton =
    document.createElement(
      "button"
    );

  clearButton.type =
    "button";

  clearButton.textContent =
    "Clear";

  clearButton.style.flex =
    "1";

  clearButton.style.padding =
    "12px";

  clearButton.style.borderRadius =
    "22px";

  clearButton.style.border =
    "1px solid #ddd";

  clearButton.style.background =
    "#ffffff";


  const startButton =
    document.createElement(
      "button"
    );

  startButton.type =
    "button";

  startButton.textContent =
    "✨ Start";

  startButton.style.flex =
    "2";

  startButton.style.padding =
    "12px";

  startButton.style.borderRadius =
    "22px";

  startButton.style.border =
    "0";

  startButton.style.background =
    "#ef4fa3";

  startButton.style.color =
    "#ffffff";

  startButton.style.fontWeight =
    "600";


  const doneButton =
    document.createElement(
      "button"
    );

  doneButton.type =
    "button";

  doneButton.textContent =
    "✓";

  doneButton.style.width =
    "45px";

  doneButton.style.height =
    "45px";

  doneButton.style.borderRadius =
    "50%";

  doneButton.style.border =
    "0";

  doneButton.style.background =
    "#ffffff";

  doneButton.style.fontSize =
    "22px";


  bottomRow.appendChild(
    clearButton
  );

  bottomRow.appendChild(
    startButton
  );

  bottomRow.appendChild(
    doneButton
  );


  hairGrowPanel.appendChild(
    toolRow
  );

  hairGrowPanel.appendChild(
    styleRow
  );

  hairGrowPanel.appendChild(
    bottomRow
  );


  document.body.appendChild(
    hairGrowPanel
  );


  /* -------------------------------------------------------
     SIZE
  ------------------------------------------------------- */

  sizeSlider.oninput =
    function() {

      hairCurrentSize =
        Number(
          sizeSlider.value
        );

      sizeValue.textContent =
        String(
          hairCurrentSize
        );

    };


  /* -------------------------------------------------------
     BRUSH
  ------------------------------------------------------- */

  brushButton.onclick =
    function() {

      hairErasing =
        false;

      brushButton.style.opacity =
        "1";

      eraserButton.style.opacity =
        ".45";

    };


  /* -------------------------------------------------------
     ERASER
  ------------------------------------------------------- */

  eraserButton.onclick =
    function() {

      hairErasing =
        true;

      eraserButton.style.opacity =
        "1";

      brushButton.style.opacity =
        ".45";

    };


  /* -------------------------------------------------------
     DRAWING
  ------------------------------------------------------- */

  function getPoint(event) {

    const rect =
      hairDrawCanvas
        .getBoundingClientRect();


    return {

      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top

    };

  }


  hairDrawCanvas.addEventListener(
  "pointerdown",
  function(event) {

    event.preventDefault();

    hairDrawing = true;

    hairDrawCanvas.setPointerCapture(
      event.pointerId
    );

    const p = getPoint(event);

    if (hairErasing) {

      hairEraseStrokes.push({
        points: [p],
        size: hairCurrentSize
      });

    } else {

      hairStrokes.push({
        points: [p],
        size: hairCurrentSize,
        style: hairCurrentStyle
      });

    }

    redrawHairStrokes();

  }
);


hairDrawCanvas.addEventListener(
  "pointermove",
  function(event) {

    if (!hairDrawing) return;

    event.preventDefault();

    const p = getPoint(event);

    const list =
      hairErasing
        ? hairEraseStrokes
        : hairStrokes;

    if (!list.length) return;

    const stroke =
      list[list.length - 1];

    const last =
      stroke.points[stroke.points.length - 1];

    /*
      Avoid duplicate points.
    */

    const dx = p.x - last.x;
    const dy = p.y - last.y;

    if ((dx * dx + dy * dy) < 1.5) {
      return;
    }

    stroke.points.push(p);

    redrawHairStrokes();

  }
);


function stopDrawing(event) {

  hairDrawing = false;

  try {

    if (
      event &&
      hairDrawCanvas.hasPointerCapture(event.pointerId)
    ) {

      hairDrawCanvas.releasePointerCapture(
        event.pointerId
      );

    }

  } catch (e) {}

}


hairDrawCanvas.addEventListener(
  "pointerup",
  stopDrawing
);

hairDrawCanvas.addEventListener(
  "pointercancel",
  stopDrawing
);

hairDrawCanvas.addEventListener(
  "pointerleave",
  function() {

    /*
      Do not stop while captured.
      Pointer capture keeps drawing continuous.
    */

  }
);


  /* -------------------------------------------------------
     CLEAR
  ------------------------------------------------------- */

  clearButton.onclick =
    function() {

      hairStrokes =
        [];

      hairEraseStrokes =
        [];

      redrawHairStrokes();

      showStatus(
        "Drawing cleared."
      );

    };


  /* -------------------------------------------------------
     DONE / CLOSE
  ------------------------------------------------------- */

  doneButton.onclick =
    function() {

      hairGrowPanel.style.display =
        "none";

      hairDrawCanvas.style.display =
        "none";

      if (hairMenu) {

        hairMenu.style.display =
          "flex";

      }

    };


  /* -------------------------------------------------------
     START
  ------------------------------------------------------- */

  startButton.onclick =
    async function() {

      if (!hairStrokes.length) {

        showStatus(
          "Draw where you want new hair."
        );

        return;

      }


      await processDrawnHair();

    };


  redrawHairStrokes();

}


/* =========================================================
   REDRAW DRAWING
========================================================= */

function redrawHairStrokes() {

  if (!hairDrawCtx || !hairDrawCanvas) return;

  const rect = hairDrawCanvas.getBoundingClientRect();

  hairDrawCtx.clearRect(
    0,
    0,
    rect.width,
    rect.height
  );

  /*
    DRAW GUIDE STROKES
    Every stroke keeps its own size.
  */

  hairStrokes.forEach(function(stroke) {

    const points = stroke.points;

    if (!points || points.length === 0) return;

    hairDrawCtx.save();

    hairDrawCtx.lineCap = "round";
    hairDrawCtx.lineJoin = "round";
    hairDrawCtx.lineWidth = stroke.size;
    hairDrawCtx.strokeStyle =
      "rgba(255,70,150,.72)";

    hairDrawCtx.beginPath();

    hairDrawCtx.moveTo(
      points[0].x,
      points[0].y
    );

    if (points.length === 1) {

      hairDrawCtx.arc(
        points[0].x,
        points[0].y,
        Math.max(1, stroke.size / 2),
        0,
        Math.PI * 2
      );

    } else {

      for (let i = 1; i < points.length; i++) {

        const p = points[i];

        hairDrawCtx.lineTo(
          p.x,
          p.y
        );

      }

      hairDrawCtx.stroke();

    }

    hairDrawCtx.restore();

  });

  /*
    SHOW ERASER GUIDE
  */

  hairEraseStrokes.forEach(function(stroke) {

    const points = stroke.points;

    if (!points || points.length === 0) return;

    hairDrawCtx.save();

    hairDrawCtx.lineCap = "round";
    hairDrawCtx.lineJoin = "round";
    hairDrawCtx.lineWidth =
      Math.max(4, stroke.size * 2);

    hairDrawCtx.strokeStyle =
      "rgba(255,80,80,.35)";

    hairDrawCtx.beginPath();

    hairDrawCtx.moveTo(
      points[0].x,
      points[0].y
    );

    for (let i = 1; i < points.length; i++) {

      hairDrawCtx.lineTo(
        points[i].x,
        points[i].y
      );

    }

    if (points.length === 1) {

      hairDrawCtx.arc(
        points[0].x,
        points[0].y,
        Math.max(2, stroke.size),
        0,
        Math.PI * 2
      );

    }

    hairDrawCtx.stroke();

    hairDrawCtx.restore();

  });

}


/* =========================================================
   PROCESS DRAWN HAIR
========================================================= */

async function processDrawnHair() {

  if (!selectedFile) {

    showStatus(
      "Please select a photo first."
    );

    return;

  }

  try {

    showStatus(
      "Creating realistic hair..."
    );

    const img =
      await loadImage(selectedFile);

    const width =
      img.naturalWidth;

    const height =
      img.naturalHeight;


    /*
      ORIGINAL PHOTO
    */

    const output =
      document.createElement("canvas");

    output.width = width;
    output.height = height;

    const ctx =
      output.getContext("2d");

    ctx.drawImage(
      img,
      0,
      0,
      width,
      height
    );


    /*
      TRANSPARENT HAIR LAYER

      Hair is generated separately
      and then placed over the original.
    */

    const hairLayer =
      document.createElement("canvas");

    hairLayer.width = width;
    hairLayer.height = height;

    const hctx =
      hairLayer.getContext("2d");


    const rect =
      hairDrawCanvas.getBoundingClientRect();

    const scaleX =
      width / rect.width;

    const scaleY =
      height / rect.height;


    /*
      SAMPLE A NATURAL HAIR COLOR
      FROM THE START OF EACH STROKE.
    */

    function getHairBaseColor(point) {

      const x =
        Math.max(
          0,
          Math.min(
            width - 1,
            Math.round(point.x * scaleX)
          )
        );

      const y =
        Math.max(
          0,
          Math.min(
            height - 1,
            Math.round(point.y * scaleY)
          )
        );

      try {

        const pixel =
          ctx.getImageData(
            x,
            y,
            1,
            1
          ).data;

        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];

        const brightness =
          (r + g + b) / 3;

        /*
          If sampled area is reasonably dark,
          use it as the hair base.

          Otherwise use a natural dark brown.
        */

        if (brightness < 150) {

          return {
            r: Math.max(8, Math.round(r * 0.72)),
            g: Math.max(6, Math.round(g * 0.72)),
            b: Math.max(5, Math.round(b * 0.72))
          };

        }

      } catch (e) {}

      return {
        r: 35,
        g: 24,
        b: 20
      };

    }


    /*
      DRAW ONE NATURAL HAIR STRAND
    */

    function drawHairStrand(
      points,
      size,
      style,
      strandIndex,
      strandCount,
      color,
      alpha
    ) {

      if (!points || points.length < 1) {
        return;
      }


      const scaled = [];

      for (
        let i = 0;
        i < points.length;
        i++
      ) {

        let x =
          points[i].x * scaleX;

        let y =
          points[i].y * scaleY;


        /*
          Small deterministic variation.
          This makes multiple strands
          look like individual hairs.
        */

        const phase =
          strandIndex * 1.73;


        if (style === "curls") {

          const wave =
            Math.sin(
              i * 0.55 + phase
            ) *
            Math.max(1.5, size * scaleX * 0.85);

          x += wave;

        }

        else if (style === "bangs") {

          const bend =
            Math.sin(
              i * 0.18 + phase
            ) *
            Math.max(1, size * scaleX * 0.30);

          x += bend;

        }

        else {

          const natural =
            Math.sin(
              i * 0.11 + phase
            ) *
            Math.max(0.5, size * scaleX * 0.16);

          x += natural;

        }


        /*
          Strand separation.
        */

        const separation =
          (
            strandIndex -
            (strandCount - 1) / 2
          ) *
          Math.max(
            0.5,
            size * scaleX * 0.32
          );

        x += separation;


        scaled.push({
          x: x,
          y: y
        });

      }


      /*
        DRAW AS MANY SHORT SEGMENTS
        WITH TAPERING.

        This gives the strand a
        natural pointed end.
      */

      for (
        let i = 1;
        i < scaled.length;
        i++
      ) {

        const a =
          scaled[i - 1];

        const b =
          scaled[i];


        const progress =
          i / Math.max(
            1,
            scaled.length - 1
          );


        /*
          Hair is thicker near the root
          and thinner toward the tip.
        */

        const rootFactor =
          0.90;

        const tipFactor =
          0.08;


        const taper =
          rootFactor +
          (tipFactor - rootFactor) *
          progress;


        const lineWidth =
          Math.max(
            0.35,
            size *
            scaleX *
            0.22 *
            taper
          );


        hctx.save();

        hctx.beginPath();

        hctx.moveTo(
          a.x,
          a.y
        );

        hctx.lineTo(
          b.x,
          b.y
        );

        hctx.lineWidth =
          lineWidth;

        hctx.lineCap =
          "round";

        hctx.lineJoin =
          "round";


        hctx.strokeStyle =
          "rgba(" +
          color.r +
          "," +
          color.g +
          "," +
          color.b +
          "," +
          alpha +
          ")";


        hctx.stroke();

        hctx.restore();

      }


      /*
        Pointed tip.

        A very tiny final segment makes
        the end fade naturally.
      */

      if (scaled.length >= 2) {

        const last =
          scaled[scaled.length - 1];

        const previous =
          scaled[scaled.length - 2];

        hctx.save();

        hctx.beginPath();

        hctx.moveTo(
          previous.x,
          previous.y
        );

        hctx.lineTo(
          last.x,
          last.y
        );

        hctx.lineWidth =
          Math.max(
            0.25,
            size *
            scaleX *
            0.04
          );

        hctx.lineCap =
          "round";

        hctx.strokeStyle =
          "rgba(" +
          color.r +
          "," +
          color.g +
          "," +
          color.b +
          ",.45)";

        hctx.stroke();

        hctx.restore();

      }

    }


    /*
      GENERATE EVERY USER STROKE
    */

    hairStrokes.forEach(
      function(stroke) {

        const points =
          stroke.points;

        if (
          !points ||
          points.length < 1
        ) {

          return;

        }


        const color =
          getHairBaseColor(
            points[0]
          );


        let strandCount = 9;


        if (
          stroke.style === "bangs"
        ) {

          strandCount = 11;

        }

        else if (
          stroke.style === "curls"
        ) {

          strandCount = 13;

        }


        /*
          Main hair bundle
        */

        for (
          let strand = 0;
          strand < strandCount;
          strand++
        ) {

          const variation =
            0.82 +
            (
              (
                strand * 17
              ) % 11
            ) / 100;


          drawHairStrand(
            points,
            stroke.size * variation,
            stroke.style,
            strand,
            strandCount,
            color,
            0.72
          );

        }


        /*
          Fine individual hairs.

          These are thinner and slightly
          more transparent.
        */

        for (
          let fine = 0;
          fine < 7;
          fine++
        ) {

          drawHairStrand(
            points,
            stroke.size * 0.45,
            stroke.style,
            strandCount + fine,
            strandCount + 7,
            {
              r: Math.min(
                255,
                color.r + 25
              ),
              g: Math.min(
                255,
                color.g + 20
              ),
              b: Math.min(
                255,
                color.b + 18
              )
            },
            0.28
          );

        }

      }
    );


    /*
      APPLY ERASER TO THE HAIR LAYER.

      IMPORTANT:
      It removes generated hair,
      not the original photograph.
    */

    hairEraseStrokes.forEach(
      function(stroke) {

        const points =
          stroke.points;

        if (
          !points ||
          points.length === 0
        ) {

          return;

        }


        hctx.save();

        hctx.globalCompositeOperation =
          "destination-out";

        hctx.lineWidth =
          Math.max(
            4,
            stroke.size *
            scaleX *
            2
          );

        hctx.lineCap =
          "round";

        hctx.lineJoin =
          "round";

        hctx.beginPath();

        hctx.moveTo(
          points[0].x * scaleX,
          points[0].y * scaleY
        );

        for (
          let i = 1;
          i < points.length;
          i++
        ) {

          hctx.lineTo(
            points[i].x * scaleX,
            points[i].y * scaleY
          );

        }

        if (points.length === 1) {

          hctx.arc(
            points[0].x * scaleX,
            points[0].y * scaleY,
            Math.max(
              2,
              stroke.size * scaleX
            ),
            0,
            Math.PI * 2
          );

        }

        hctx.stroke();

        hctx.restore();

      }
    );


    /*
      COMBINE HAIR WITH ORIGINAL PHOTO.
    */

    ctx.drawImage(
      hairLayer,
      0,
      0
    );


    /*
      FINAL IMAGE
    */

    const blob =
      await new Promise(
        function(resolve) {

          output.toBlob(
            resolve,
            "image/jpeg",
            0.96
          );

        }
      );


    if (!blob) {

      throw new Error(
        "Could not create hair result."
      );

    }


    editedBlob =
      blob;


    preview.src =
      URL.createObjectURL(blob);

    preview.style.display =
      "block";

    placeholder.style.display =
      "none";

    downloadButton.style.display =
      "block";


    /*
      Close Grow editor after success.
    */

    hairDrawCanvas.style.display =
      "none";

    hairGrowPanel.style.display =
      "none";


    showStatus(
      "Realistic hair applied ✓"
    );

  }

  catch (error) {

    console.error(
      "Hair Grow error:",
      error
    );

    showStatus(
      "Hair Grow failed: " +
      (
        error.message ||
        "Please try again."
      )
    );

  }

    }


/* =========================================================
   HAIR GROW BUTTON
========================================================= */

if (hairGrow) {

  hairGrow.addEventListener(
    "click",
    function() {

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
          "none";

      }


      /*
        Reset only when Grow is
        opened again.
      */

      hairStrokes =
        [];

      hairEraseStrokes =
        [];

      createHairGrowUI();


      if (hairDrawCanvas) {

        hairDrawCanvas.style.display =
          "block";

      }


      if (hairGrowPanel) {

        hairGrowPanel.style.display =
          "flex";

      }


      showStatus(
        "Draw where you want new hair."
      );

    }
  );

}


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
