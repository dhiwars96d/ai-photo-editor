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

const skinPanel = document.getElementById("skinPanel");
const skinIntensitySlider = document.getElementById("skinIntensitySlider");
const skinIntensityValue = document.getElementById("skinIntensityValue");
const skinApplyButton = document.getElementById("skinApply");
const skinCancelButton = document.getElementById("skinCancel");


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

let smoothBaseBlob = null;
let skinBaseBlob = null;
let selectedSkinPreset = "none";
let skinPreviewTimer = null;
let skinPreviewSequence = 0;

function getCurrentPhotoBlob() {
  return window.__editedPhotoBlob || editedBlob || selectedFile;
}

function getCurrentPhotoFile() {
  const blob = getCurrentPhotoBlob();

  if (!blob) return null;

  if (typeof File !== "undefined" && blob instanceof File) {
    return blob;
  }

  return new File([blob], "edited-photo.jpg", {
    type: blob.type || "image/jpeg"
  });
}

function publishEditedBlob(blob) {
  if (!blob) return;

  window.__editedPhotoBlob = blob;

  if (
    window.Retouch &&
    typeof window.Retouch.setCurrentBlob === "function"
  ) {
    window.Retouch.setCurrentBlob(blob);
  }
}

/* =========================================================
   UNDO + REDO PHOTO
========================================================= */

const undoHistory = [];
const redoHistory = [];
const MAX_UNDO_STEPS = 15;

function saveUndoState(blob) {
  if (!blob) return;

  undoHistory.push(blob);

  if (undoHistory.length > MAX_UNDO_STEPS) {
    undoHistory.shift();
  }

  // Naye edit ke baad purana Redo history hatao
  redoHistory.length = 0;
}

function restorePhoto(blob) {
  if (!blob) return;

  editedBlob = blob;
  adjustmentBaseBlob = blob;
  window.__editedPhotoBlob = blob;

  if (preview) {
    preview.src = URL.createObjectURL(blob);
    preview.style.display = "block";
  }

  if (placeholder) {
    placeholder.style.display = "none";
  }

  if (downloadButton) {
    downloadButton.style.display = "block";
  }

  resetAdjustmentValues();

  if (statusBox) {
    statusBox.style.display = "none";
  }

  if (window.Retouch &&
      typeof window.Retouch.setCurrentBlob === "function") {
    window.Retouch.setCurrentBlob(blob);
  }
}

function undoLastEdit() {
  if (undoHistory.length === 0) {
    showStatus("Undo ke liye pichhla edit nahi hai.");
    return;
  }

  const currentPhoto = getCurrentPhotoBlob();
  const previousPhoto = undoHistory.pop();

  if (currentPhoto) {
    redoHistory.push(currentPhoto);
  }

  restorePhoto(previousPhoto);
  showStatus("Undo ho gaya ✓");
}

function redoLastEdit() {
  if (redoHistory.length === 0) {
    showStatus("Redo ke liye koi edit nahi hai.");
    return;
  }

  const currentPhoto = getCurrentPhotoBlob();
  const nextPhoto = redoHistory.pop();

  if (currentPhoto) {
    undoHistory.push(currentPhoto);
  }

  restorePhoto(nextPhoto);
  showStatus("Redo ho gaya ✓");
}

function resetToOriginalPhoto() {
  if (!selectedFile) {
    showStatus("Pehle photo select karo.");
    return;
  }

  undoHistory.length = 0;
  redoHistory.length = 0;

  restorePhoto(selectedFile);
  resetSmoothSlider();

  if (smoothControl) smoothControl.classList.remove("show");
  if (hairMenu) hairMenu.style.display = "none";
  if (hairColorPanel) hairColorPanel.style.display = "none";
  if (skinPanel) skinPanel.style.display = "none";

  if (window.Retouch && typeof window.Retouch.close === "function") {
    window.Retouch.close();
  }

  showStatus("Original photo restore ho gayi ✓");
}

/* BUTTON CONNECTIONS */

const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");

if (undoButton) {
  undoButton.addEventListener("click", undoLastEdit);
}

if (redoButton) {
  redoButton.addEventListener("click", redoLastEdit);
}


/* =========================================================
   UNDO + RESET BUTTONS
========================================================= */

document.querySelectorAll('.tool[data-tool="undo"]').forEach(button => {
  button.addEventListener("click", undoLastEdit);
});

document.querySelectorAll('.tool[data-tool="reset"]').forEach(button => {
  button.addEventListener("click", resetToOriginalPhoto);
});


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

const changePhotoButton = document.getElementById("changePhoto");

if (changePhotoButton && fileInput) {
  changePhotoButton.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    fileInput.click();
  });
}

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

     undoHistory.length = 0;

     redoHistory.length = 0;

    window.__selectedPhotoFile = file;

    editedBlob = null;
    
     window.__editedPhotoBlob = file;

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
    if (skinPanel) skinPanel.style.display = "none";
    skinBaseBlob = null;

    resetSmoothSlider();

    resetAdjustmentValues();

  });

}



/* =========================================================
   ENHANCE AI - REAL-ESRGAN PYTORCH
========================================================= */

const HOCKMAN_SPACE =
  "Nick088/Real-ESRGAN_Pytorch";

let hockmanAppPromise = null;


async function getHockmanApp() {

  if (!hockmanAppPromise) {

    hockmanAppPromise = (async function () {

      showStatus("Enhance your Image — Please wait...");

      const gradio = await import(
        "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.0/+esm"
      );

      Client = gradio.Client;
      handle_file = gradio.handle_file;

      return await Client.connect(
        HOCKMAN_SPACE,
        {
          events: ["data", "status"],

          status_callback: function (s) {

            if (!s) return;

            if (
              s.status === "sleeping"
            ) {
              showStatus("Waking Enhance AI...");
            }

            else if (
              s.status === "building"
            ) {
              showStatus("Enhance AI is starting...");
            }

            else if (
              s.status === "running"
            ) {
              showStatus("Enhance AI is ready...");
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

    })().catch(function (error) {

      hockmanAppPromise = null;
      throw error;

    });

  }

  return await hockmanAppPromise;

}



async function runHockmanX2(file) {

  if (!file) {
    throw new Error("No photo selected");
  }

  showStatus("Enhance your Image — Please wait...");

  const app = await getHockmanApp();

  showStatus("Enhance your Image — Please wait... Uploading photo");

  const image = await handle_file(file);

  showStatus("Enhance your Image — Please wait... Enhancing photo");

  let result;

try {
   showStatus("Enhance your Image — Please wait...");
  
result = await app.predict("/predict", [
  image,
  4
]);


  console.log("Real-ESRGAN API result:", result);

} catch (error) {
  console.error("REAL-ESRGAN PREDICT ERROR:", error);
  console.error("Error name:", error?.name);
  console.error("Error message:", error?.message);
  console.error("Error stack:", error?.stack);

  

const details = [
  "Name: " + (error?.name || "unknown"),
  "Message: " + (error?.message || String(error)),
  "Cause: " + (error?.cause?.message || "none"),
  "Stack: " + (error?.stack || "unavailable")
].join(" | ");

showStatus("Enhance API error: " + details);
throw error;


}

  const output = result?.data?.[0];

  if (!output) {
    throw new Error(
      "API returned no image. Check the console result."
    );
  }

  let outputURL =
    output?.url ||
    output?.path ||
    output;

  if (typeof outputURL !== "string") {
    throw new Error("Invalid image result from Enhance AI");
  }

  if (outputURL.startsWith("/")) {
    outputURL =
      "https://nick088-real-esrgan-pytorch.hf.space" +
      outputURL;
  }

  if (outputURL.startsWith("http://")) {
    outputURL = "https://" + outputURL.slice(7);
  }

  showStatus("Downloading enhanced photo...");

  const response = await fetch(outputURL);

  if (!response.ok) {
    throw new Error("Could not download Enhance AI result");
  }

  const blob = await response.blob();

  if (!blob || blob.size === 0) {
    throw new Error("Downloaded image is empty");
  }

  return blob;
}




/* =========================================================
   SHOW RESULT
========================================================= */

function showResult(blob) {

  if (!blob) return;


  saveUndoState(getCurrentPhotoBlob());

editedBlob = blob;
adjustmentBaseBlob = blob;
publishEditedBlob(blob);


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

saveUndoState(getCurrentPhotoBlob());
  
  editedBlob =
    blob;

   adjustmentBaseBlob = blob;
publishEditedBlob(blob);

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

      const file = smoothBaseBlob || getCurrentPhotoBlob();


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

    if (window.Retouch && typeof window.Retouch.close === "function") {
      window.Retouch.close();
    }

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

   const sharpness =
  Number(
    adjustmentValues.sharpness
  );

const clarity =
  Number(
    adjustmentValues.clarity
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
      brightness * 0.5;


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

// Sharpness and Clarity processing
const sharpData = new Uint8ClampedArray(data);

const sharpAmount = sharpness / 100;
const clarityAmount = clarity / 100;

if (sharpAmount !== 0 || clarityAmount !== 0) {
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;

      const top = ((y - 1) * width + x) * 4;
      const bottom = ((y + 1) * width + x) * 4;
      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;

      const lum = (p) =>
        0.2126 * sharpData[p] +
        0.7152 * sharpData[p + 1] +
        0.0722 * sharpData[p + 2];

      const centerLum = lum(i);

      const avgLum = (
        lum(top) +
        lum(bottom) +
        lum(left) +
        lum(right)
      ) / 4;

      const detail = centerLum - avgLum;
      const clarityBoost = detail * clarityAmount * 3.5;

      for (let c = 0; c < 3; c++) {
        const average = (
          sharpData[top + c] +
          sharpData[bottom + c] +
          sharpData[left + c] +
          sharpData[right + c]
        ) / 4;

        const edge = sharpData[i + c] - average;

        data[i + c] = clamp(
          sharpData[i + c] +
          edge * sharpAmount * 4.1 +
          clarityBoost
        );
      }
    }
  }
  }
   
  ctx.putImageData(
    imageData,
    0,
    0
  );


  editedBlob = await new Promise(
  function (resolve) {
    canvas.toBlob(
      resolve,
      "image/jpeg",
      0.94
    );
  }
);

publishEditedBlob(editedBlob);


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

  if (!getCurrentPhotoBlob()) {

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


    const currentPhoto =
  getCurrentPhotoBlob();

if (!currentPhoto) {
  showStatus("Please select a photo first.");
  return;
}

const img =
  await loadImage(
    currentPhoto
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
     
     publishEditedBlob(blob);


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


    if (statusBox) statusBox.style.display = "none";

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
   SKIN FINISH — LOCAL BROWSER PRESETS
   This is a global color/finish effect, not AI face segmentation.
========================================================= */

const skinPresetSettings = {
  none:       { brightness: 0, contrast: 0, saturation: 0, warmth: 0, blur: 0 },
  refined:    { brightness: 2, contrast: 2, saturation: -3, warmth: 1, blur: 0.10 },
  glowy:      { brightness: 7, contrast: -3, saturation: 5, warmth: 3, blur: 0.35 },
  tanned:     { brightness: -2, contrast: 5, saturation: 8, warmth: 12, blur: 0.05 },
  glass:      { brightness: 6, contrast: 4, saturation: 2, warmth: -1, blur: 0.18 },
  foundation: { brightness: 3, contrast: -5, saturation: -7, warmth: 2, blur: 0.55 },
  porcelain:  { brightness: 10, contrast: -4, saturation: -10, warmth: -2, blur: 0.30 },
  dewy:       { brightness: 5, contrast: -1, saturation: 4, warmth: 2, blur: 0.25 }
};

function openSkinPanel() {
  skinBaseBlob = getCurrentPhotoBlob();
  selectedSkinPreset = "none";
  if (skinIntensitySlider) skinIntensitySlider.value = "50";
  if (skinIntensityValue) skinIntensityValue.textContent = "50";
  document.querySelectorAll(".skinPreset").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.skinPreset === "none");
  });
  if (skinPanel) skinPanel.style.display = "block";
  if (statusBox) statusBox.style.display = "none";
}

function closeSkinPanel(restoreBase = true) {
  clearTimeout(skinPreviewTimer);
  skinPreviewSequence++;
  if (restoreBase && skinBaseBlob && preview) {
    preview.src = URL.createObjectURL(skinBaseBlob);
  }
  if (skinPanel) skinPanel.style.display = "none";
  skinBaseBlob = null;
}


async function renderRefinedSkin(file, intensity = 50) {
  
   const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const strength = Math.max(0, Math.min(100, Number(intensity))) / 100;
  if (strength === 0) return file;

  // Work at a smaller resolution for mobile performance.
  const scale = Math.min(1, 1600 / w);
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const work = document.createElement("canvas");
  work.width = sw;
  work.height = sh;

  const ctx = work.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not supported");

  ctx.drawImage(img, 0, 0, sw, sh);

  const source = ctx.getImageData(0, 0, sw, sh);
  const src = source.data;
  const out = new Uint8ClampedArray(src);

  const ellipseContains = (x, y, cx, cy, rx, ry) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };

  const isProtectedFeature = (x, y) => {
    // Approximate eye and eyebrow protection.
    if (ellipseContains(x, y, sw * 0.405, sh * 0.395, sw * 0.095, sh * 0.050)) return true;
    if (ellipseContains(x, y, sw * 0.595, sh * 0.395, sw * 0.095, sh * 0.050)) return true;
    if (ellipseContains(x, y, sw * 0.405, sh * 0.345, sw * 0.105, sh * 0.027)) return true;
    if (ellipseContains(x, y, sw * 0.595, sh * 0.345, sw * 0.105, sh * 0.027)) return true;

    // Protect the mouth/lips region.
    if (ellipseContains(x, y, sw * 0.50, sh * 0.655, sw * 0.19, sh * 0.070)) return true;

    return false;
  };

  const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const median = values => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };

  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      const i = (y * sw + x) * 4;

      // Approximate central face area; not a true AI face/skin mask.
      if (!ellipseContains(x, y, sw * 0.50, sh * 0.465, sw * 0.405, sh * 0.475)) continue;
      if (isProtectedFeature(x, y)) continue;

      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];

      // Conservative skin-colour heuristic.
      if (!(r > 45 && g > 25 && r >= g * 0.92 && g >= b * 0.78)) continue;

      const reds = [];
      const greens = [];
      const blues = [];
      const lights = [];
const rednesses = [];
     
       for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const ni = ((y + dy) * sw + (x + dx)) * 4;
          const nr = src[ni];
          const ng = src[ni + 1];
          const nb = src[ni + 2];

          reds.push(nr);
          greens.push(ng);
          blues.push(nb);
          lights.push(luminance(nr, ng, nb));
           rednesses.push(nr - ng);
        }
      }

      
const centerLight = luminance(r, g, b);
const localMedian = median(lights.slice());
const localSpread = Math.max(...lights) - Math.min(...lights);

// Compare redness against the surrounding pixels.
const localRedness = median(rednesses.slice());
const redExcess = (r - g) - localRedness;

// Avoid strong edges, shadows and major colour differences.
if (
  redExcess < 3 ||
  redExcess > 45 ||
  Math.abs(centerLight - localMedian) > 75 ||
  localSpread > 70
) continue;

// Gently reduce excess red while retaining texture.
const correction = strength * 0.90;
const redReduction = Math.min(28, redExcess) * correction;

out[i] = Math.round(r - redReduction);
out[i + 1] = Math.round(g + redReduction * 0.35);
out[i + 2] = Math.round(b + redReduction * 0.12);

    }
  }

  source.data.set(out);
  ctx.putImageData(source, 0, 0);

  // Return at the original photo dimensions.
  const output = document.createElement("canvas");
  output.width = w;
  output.height = h;

  const outCtx = output.getContext("2d");
  if (!outCtx) throw new Error("Could not create output canvas");

  outCtx.drawImage(work, 0, 0, w, h);

  return await new Promise((resolve, reject) => {
    output.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export refined photo"));
    }, "image/jpeg", 0.94);
  });
}



async function renderSkinFinish(file, presetName, intensity) {
  // Refined uses selective blemish correction.
  if (presetName === "refined") {
    return await renderRefinedSkin(file, intensity);
  }

  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  if (!ctx) throw new Error("Canvas is not supported");

  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const cfg = skinPresetSettings[presetName] ||
              skinPresetSettings.none;

  const f = Math.max(
    0,
    Math.min(1, (Number(intensity) || 50) / 100)
  );

  if (presetName === "none" || f === 0) {
    return file;
  }

  // Approximate face area; this is not AI face detection.
  const rx = w * 0.36;
  const ry = h * 0.43;
  const cx = w * 0.50;
  const cy = h * 0.46;

  const brightness = (cfg.brightness || 0) * f;
  const contrast = 1 + ((cfg.contrast || 0) / 100) * f;
  const saturation = 1 + ((cfg.saturation || 0) / 100) * f;
  const warmth = (cfg.warmth || 0) * f;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;

      // Outside approximate face oval: leave unchanged.
      if (dx * dx + dy * dy > 1) continue;

      const i = (y * w + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Conservative skin-colour estimate.
      if (!(r > 45 && g > 25 &&
            r >= g * 0.92 && g >= b * 0.78)) {
        continue;
      }

      // Apply the selected preset to estimated skin pixels only.
      r = ((r - 128) * contrast + 128) + brightness;
      g = ((g - 128) * contrast + 128) + brightness;
      b = ((b - 128) * contrast + 128) + brightness;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      r = gray + (r - gray) * saturation + warmth * 0.55;
      g = gray + (g - gray) * saturation + warmth * 0.20;
      b = gray + (b - gray) * saturation - warmth * 0.45;

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export skin finish"));
    }, "image/jpeg", 0.94);
  });
}


function queueSkinPreview() {
  if (!skinBaseBlob) return;
  const seq = ++skinPreviewSequence;
  clearTimeout(skinPreviewTimer);
  const preset = selectedSkinPreset;
  const intensity = Number(skinIntensitySlider?.value || 50);
  if (skinIntensityValue) skinIntensityValue.textContent = String(intensity);
  skinPreviewTimer = setTimeout(async () => {
    try {
      const blob = await renderSkinFinish(skinBaseBlob, preset, intensity);
      if (!blob || seq !== skinPreviewSequence) return;
      if (preview) preview.src = URL.createObjectURL(blob);
      window.__skinPreviewBlob = blob;
    } catch (error) {
      console.error("Skin preview error:", error);
      showStatus("Skin preview failed. Please try again.");
    }
  }, 90);
}

document.querySelectorAll(".skinPreset").forEach(button => {
  button.addEventListener("click", () => {
    selectedSkinPreset = button.dataset.skinPreset || "none";
    document.querySelectorAll(".skinPreset").forEach(btn => {
      btn.classList.toggle("selected", btn === button);
    });
    queueSkinPreview();
  });
});

if (skinIntensitySlider) {
  skinIntensitySlider.addEventListener("input", queueSkinPreview);
}

if (skinCancelButton) {
  skinCancelButton.addEventListener("click", () => {
    closeSkinPanel(true);
    showStatus("Skin edits cancelled.");
  });
}

if (skinApplyButton) {
  skinApplyButton.addEventListener("click", async () => {
    if (!skinBaseBlob) {
      showStatus("Please select a photo first.");
      return;
    }
    try {
      skinApplyButton.disabled = true;
      showStatus("Applying Skin finish...");
      const blob = await renderSkinFinish(
        skinBaseBlob,
        selectedSkinPreset,
        Number(skinIntensitySlider?.value || 50)
      );
      if (!blob) throw new Error("Could not create edited photo");
      showResult(blob);
      closeSkinPanel(false);
      showStatus("Skin finish applied ✓");
    } catch (error) {
      console.error("Skin apply error:", error);
      showStatus("Skin effect failed: " + (error.message || "Please try again."));
    } finally {
      skinApplyButton.disabled = false;
    }
  });
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

           if (tool.id === "adjustmentsToggle") {
  return;
           }

           
if (
  type !== "retouch" &&
  window.Retouch &&
  typeof window.Retouch.close === "function"
) {
  window.Retouch.close();
}

           
           if (adjustmentsPanel) {
  adjustmentsPanel.classList.remove("open");
}

if (adjustmentsToggle) {
  adjustmentsToggle.classList.remove("open");
}

if (adjustmentsChevron) {
  adjustmentsChevron.textContent = "›";
}


          if (
            type === "smooth"
          ) {
smoothBaseBlob = getCurrentPhotoBlob();
            if (hairMenu) {

              hairMenu.style.display =
                "none";

            }


            if (hairColorPanel) {

              hairColorPanel.style.display =
                "none";

            }


            showSmoothControl();


            if (statusBox) statusBox.style.display = "none";


            return;

          }


          hideSmoothControl();

          if (type === "skin") {
            if (hairMenu) hairMenu.style.display = "none";
            if (hairColorPanel) hairColorPanel.style.display = "none";
            openSkinPanel();
            return;
          }

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


              const currentFile = getCurrentPhotoFile();

if (!currentFile) {
  showStatus("पहले फोटो चुनें।");
  return;
}

const blob = await runHockmanX2(currentFile);


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


            if (statusBox) statusBox.style.display = "none";

            return;

          }


                    if (type === "retouch") {

            if (hairMenu) {
              hairMenu.style.display = "none";
            }

            if (hairColorPanel) {
              hairColorPanel.style.display = "none";
            }

            if (
              window.Retouch &&
              typeof window.Retouch.open === "function"
            ) {
              window.Retouch.open();
            }

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


      if (statusBox) statusBox.style.display = "none";

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
