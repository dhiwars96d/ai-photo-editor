import formidable from "formidable";
import fs from "fs";
import sharp from "sharp";
import { Client } from "@gradio/client";

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function getField(fields, name) {
  const value = fields[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value || "";
}

async function realEsrganEnhance(imageBuffer) {
  console.log("Connecting to Hockman Real-ESRGAN...");

  const hfToken = process.env.HF_TOKEN;

  const clientOptions = hfToken
    ? { hf_token: hfToken }
    : {};

  const app = await Client.connect(
    "Hockman/real-esrgan-upscaler",
    clientOptions
  );

  console.log("Connected to Hockman Space.");

  /*
   * Hockman currently uses unnamed Gradio button endpoints.
   * We inspect the API instead of guessing /predict.
   */
  const apiInfo = await app.view_api();

  console.log(
    "Hockman API:",
    JSON.stringify(apiInfo)
  );

  let endpoint = null;

  if (
    apiInfo &&
    apiInfo.named_endpoints &&
    Object.keys(apiInfo.named_endpoints).length > 0
  ) {
    endpoint = Object.keys(apiInfo.named_endpoints)[0];
  }

  if (!endpoint && apiInfo && apiInfo.unnamed_endpoints) {
    const unnamed = Object.keys(apiInfo.unnamed_endpoints);

    if (unnamed.length > 0) {
      endpoint = unnamed[0];
    }
  }

  if (!endpoint) {
    throw new Error(
      "Hockman Space me koi usable API endpoint nahi mila."
    );
  }

  console.log("Using endpoint:", endpoint);

  /*
   * Hockman ka input:
   * 1. Image
   * 2. Upscale scale
   *
   * Hum x2 use kar rahe hain.
   */
  const result = await app.predict(endpoint, [
    imageBuffer,
    2,
  ]);

  console.log(
    "Hockman result:",
    JSON.stringify(result)
  );

  if (
    !result ||
    !result.data ||
    !result.data.length
  ) {
    throw new Error(
      "Hockman se image result nahi mila."
    );
  }

  const output = result.data[0];

  let outputUrl = null;

  if (typeof output === "string") {
    outputUrl = output;
  } else if (output && output.url) {
    outputUrl = output.url;
  } else if (output && output.path) {
    outputUrl = output.path;
  }

  if (!outputUrl) {
    throw new Error(
      "Hockman output image URL nahi mili."
    );
  }

  console.log("Output URL:", outputUrl);

  /*
   * Agar Gradio ne direct URL diya hai to download karo.
   */
  if (
    outputUrl.startsWith("http://") ||
    outputUrl.startsWith("https://")
  ) {
    const response = await fetch(outputUrl);

    if (!response.ok) {
      throw new Error(
        `Hockman output download failed: ${response.status}`
      );
    }

    return Buffer.from(
      await response.arrayBuffer()
    );
  }

  /*
   * Local path mila to read karne ki koshish.
   */
  if (fs.existsSync(outputUrl)) {
    return fs.readFileSync(outputUrl);
  }

  throw new Error(
    "Hockman output file access nahi ho rahi."
  );
}

async function enhanceWithSharp(imageBuffer) {
  return await sharp(imageBuffer)
    .normalize()
    .modulate({
      brightness: 1.04,
      saturation: 1.04,
    })
    .sharpen({
      sigma: 1.0,
      m1: 1.0,
      m2: 2.0,
    })
    .png()
    .toBuffer();
}

async function smoothSkin(imageBuffer) {
  /*
   * Natural skin smoothing.
   * Face identity change nahi karta.
   */
  return await sharp(imageBuffer)
    .median(3)
    .modulate({
      brightness: 1.01,
      saturation: 1.01,
    })
    .sharpen({
      sigma: 0.6,
      m1: 0.6,
      m2: 1.0,
    })
    .png()
    .toBuffer();
}

async function improveHair(imageBuffer) {
  /*
   * Hair tool ke liye conservative enhancement.
   * Face ko AI se redraw nahi karta.
   */
  return await sharp(imageBuffer)
    .normalize()
    .sharpen({
      sigma: 1.1,
      m1: 1.0,
      m2: 1.5,
    })
    .modulate({
      brightness: 1.02,
      saturation: 1.03,
    })
    .png()
    .toBuffer();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { fields, files } = await parseForm(req);

    const prompt = getField(fields, "prompt");

    console.log("Prompt:", prompt);

    let imageFile =
      files.image ||
      files.file ||
      files.photo;

    if (Array.isArray(imageFile)) {
      imageFile = imageFile[0];
    }

    if (!imageFile) {
      return res.status(400).json({
        error: "Image file nahi mili.",
      });
    }

    const imagePath = imageFile.filepath;

    if (!imagePath) {
      return res.status(400).json({
        error: "Image path nahi mila.",
      });
    }

    const originalBuffer =
      fs.readFileSync(imagePath);

    /*
     * Prompt ke basis par tool select.
     */

    const promptLower =
      String(prompt || "").toLowerCase();

    let resultBuffer;
if (promptLower.includes("hair")) {

  console.log("Using Hair enhancement...");

  resultBuffer =
    await improveHair(originalBuffer);

} else if (promptLower.includes("smooth")) {

  console.log("Using Smooth Skin...");

  resultBuffer =
    await smoothSkin(originalBuffer);

} else {

  console.log(
    "Using Hockman Real-ESRGAN x4..."
  );

  try {

    resultBuffer =
      await realEsrganEnhance(originalBuffer);

    console.log(
      "Real-ESRGAN enhancement successful."
    );

  } catch (aiError) {

    console.error(
      "REAL-ESRGAN ERROR:",
      aiError
    );

    console.log(
      "Falling back to Sharp enhancement..."
    );

    resultBuffer =
      await enhanceWithSharp(originalBuffer);
  }
}

      resultBuffer =
        await improveHair(originalBuffer);

    } else {
      /*
       * Enhance:
       * Real-ESRGAN x4
       */
      console.log(
        "Using Hockman Real-ESRGAN x4..."
      );

      try {
        resultBuffer =
          await realEsrganEnhance(
            originalBuffer
          );

        console.log(
          "Real-ESRGAN enhancement successful."
        );

      } catch (aiError) {
        console.error(
          "REAL-ESRGAN ERROR:",
          aiError
        );

        /*
         * Agar Space temporary unavailable ho,
         * app completely fail na ho.
         */
        console.log(
          "Falling back to Sharp enhancement..."
        );

        resultBuffer =
          await enhanceWithSharp(
            originalBuffer
          );
      }
    }

    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.status(200).send(resultBuffer);

  } catch (error) {
    console.error(
      "AI EDIT ERROR:",
      error
    );

    res.status(500).json({
      error:
        error?.message ||
        "AI photo editing failed.",
    });
  }
}
