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

function getFile(files) {
  const image = files.image;

  if (Array.isArray(image)) {
    return image[0];
  }

  return image;
}

async function hockmanX2(imagePath) {
  console.log("Connecting to Hockman...");

  const app = await Client.connect(
    "Hockman/real-esrgan-upscaler"
  );

  console.log("Starting REAL X2 upscale...");

  const result = await app.predict(
    "/process_and_get_output",
    {
      img: handle_file(imagePath),
    }
  );

  console.log(
    "Hockman result:",
    JSON.stringify(result)
  );

  const data = result?.data;

  if (!data || !data[0]) {
    throw new Error(
      "Hockman did not return the X2 image."
    );
  }

  const output = data[0];

  let outputUrl = output?.url;

  if (!outputUrl && output?.path) {
    outputUrl =
      "https://hockman-real-esrgan-upscaler.hf.space/file=" +
      encodeURIComponent(output.path);
  }

  if (!outputUrl) {
    throw new Error(
      "Hockman X2 output URL not found."
    );
  }

  console.log(
    "Downloading REAL X2 result..."
  );

  const response = await fetch(outputUrl);

  if (!response.ok) {
    throw new Error(
      "Could not download Hockman result: " +
      response.status
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType:
      response.headers.get("content-type") ||
      "image/png",
  };
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

    const { fields, files } =
      await parseForm(req);

    const imageFile = getFile(files);

    if (!imageFile) {
      res.status(400).json({
        error: "Image file missing.",
      });
      return;
    }

    tempPath = imageFile.filepath;

    const prompt = Array.isArray(fields.prompt)
      ? fields.prompt[0]
      : fields.prompt || "";

    console.log("Prompt:", prompt);
    console.log("Image:", tempPath);

    const promptLower =
      prompt.toLowerCase();

    let resultBuffer;
    let contentType = "image/png";

    /*
      ENHANCE
      Hockman REAL-ESRGAN X2
    */
    if (
      promptLower.includes("enhance") ||
      promptLower.includes("improve overall")
    ) {
      console.log(
        "Using Hockman REAL X2..."
      );

      const result =
        await hockmanX2(tempPath);

      resultBuffer = result.buffer;
      contentType = result.contentType;
    }

    /*
      SMOOTH SKIN
      Temporary: return original image.
    */
    else if (
      promptLower.includes("smooth")
    ) {
      console.log(
        "Smooth Skin selected."
      );

      resultBuffer =
        fs.readFileSync(tempPath);

      contentType =
        imageFile.mimetype ||
        "image/jpeg";
    }

    /*
      HAIR
      Temporary: return original image.
    */
    else if (
      promptLower.includes("hair")
    ) {
      console.log(
        "Hair selected."
      );

      resultBuffer =
        fs.readFileSync(tempPath);

      contentType =
        imageFile.mimetype ||
        "image/jpeg";
    }

    /*
      DEFAULT
    */
    else {
      console.log(
        "Defaulting to Hockman REAL X2..."
      );

      const result =
        await hockmanX2(tempPath);

      resultBuffer = result.buffer;
      contentType = result.contentType;
    }

    console.log(
      "Sending REAL result to browser..."
    );

    res.setHeader(
      "Content-Type",
      contentType
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.status(200).send(
      resultBuffer
    );

  } catch (error) {
    console.error(
      "AI EDIT ERROR:",
      error
    );

    res.status(500).json({
      error:
        error?.message ||
        "AI photo edit failed.",
    });

  } finally {
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
