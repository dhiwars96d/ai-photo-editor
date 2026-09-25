import formidable from "formidable";
import fs from "fs";
import { Client, handle_file } from "@gradio/client";

export const maxDuration = 300;

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
      if (err) {
        reject(err);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getField(field) {
  if (Array.isArray(field)) {
    return field[0];
  }

  return field || "";
}

function getFile(files) {
  const image = files.image;

  if (Array.isArray(image)) {
    return image[0];
  }

  return image;
}

async function realEsrganEnhance(imagePath) {
  console.log("Connecting to Hockman Real-ESRGAN...");

  const app = await Client.connect(
    "Hockman/real-esrgan-upscaler"
  );

  console.log("Sending image to Hockman x2...");

  // Hockman's /lambda endpoint is the x2 processing endpoint.
  const result = await app.predict("/lambda", {
    x: handle_file(imagePath),
  });

  console.log("Hockman result received.");

  console.log("RESULT:", JSON.stringify(result));

  const data = result?.data;

  if (!data || !data[0]) {
    throw new Error("Hockman did not return an image.");
  }

  const output = data[0];

  console.log("OUTPUT:", JSON.stringify(output));

  let outputUrl = output.url;

  if (!outputUrl && output.path) {
    // Usually Gradio returns URL as well.
    outputUrl =
      "https://hockman-real-esrgan-upscaler.hf.space/file=" +
      encodeURIComponent(output.path);
  }

  if (!outputUrl) {
    throw new Error("Hockman output image URL not found.");
  }

  console.log("Downloading result...");

  const response = await fetch(outputUrl);

  if (!response.ok) {
    throw new Error(
      "Could not download Hockman result: " +
      response.status
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method not allowed",
    });
    return;
  }

  let tempPath = null;

  try {
    console.log("API EDIT START");

    const { fields, files } = await parseForm(req);

    const imageFile = getFile(files);

    if (!imageFile) {
      res.status(400).json({
        error: "Image file missing.",
      });
      return;
    }

    tempPath = imageFile.filepath;

    const prompt = getField(fields.prompt);

    console.log("Prompt:", prompt);
    console.log("Image:", tempPath);

    let resultBuffer;

    const promptLower = prompt.toLowerCase();

    /*
     * Enhance
     */
    if (
      promptLower.includes("enhance") ||
      promptLower.includes("improve overall")
    ) {
      console.log("Using Hockman Real-ESRGAN x2...");

      resultBuffer = await realEsrganEnhance(
        tempPath
      );
    }

    /*
     * Smooth Skin
     *
     * फिलहाल original image return करेंगे।
     * बाद में dedicated skin model जोड़ेंगे।
     */
    else if (promptLower.includes("smooth")) {
      console.log("Smooth Skin selected.");

      // Temporary fallback:
      // original image
      resultBuffer = fs.readFileSync(tempPath);
    }

    /*
     * Hair
     *
     * फिलहाल original image return करेंगे।
     * बाद में dedicated hair model जोड़ेंगे।
     */
    else if (promptLower.includes("hair")) {
      console.log("Hair selected.");

      // Temporary fallback:
      // original image
      resultBuffer = fs.readFileSync(tempPath);
    }

    /*
     * Unknown option
     */
    else {
      console.log("Defaulting to Hockman Real-ESRGAN x2...");

      resultBuffer = await realEsrganEnhance(
        tempPath
      );
    }

    console.log("Sending image back to browser.");

    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.status(200).send(resultBuffer);

  } catch (error) {
    console.error("AI EDIT ERROR:", error);

    res.status(500).json({
      error:
        error?.message ||
        "AI photo edit failed.",
    });

  } finally {
    /*
     * Delete temporary uploaded file
     */
    if (tempPath) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        console.error(
          "Cleanup error:",
          cleanupError
        );
      }
    }
  }
}
