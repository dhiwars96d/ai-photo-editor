import formidable from "formidable";
import fs from "fs";
import { InferenceClient } from "@huggingface/inference";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only",
    });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        return res.status(400).json({
          error: "Form parsing failed",
          details: err.message,
        });
      }

      const imageFile = Array.isArray(files.image)
        ? files.image[0]
        : files.image;

      if (!imageFile) {
        return res.status(400).json({
          error: "Image not received",
        });
      }

      const prompt =
        Array.isArray(fields.prompt)
          ? fields.prompt[0]
          : fields.prompt ||
            "Improve this photo naturally, smooth skin slightly, enhance facial details, keep the person's identity and face unchanged.";

      const imageBuffer = fs.readFileSync(imageFile.filepath);

      const hf = new InferenceClient(process.env.HF_TOKEN);

      const result = await hf.imageToImage({
        provider: "fal-ai",
        model: "black-forest-labs/FLUX.2-dev",
        inputs: new Blob([imageBuffer], {
  type: imageFile.mimetype || "image/jpeg"
}),
        prompt: prompt,
      });

      const resultBuffer = Buffer.from(
        await result.arrayBuffer()
      );

      res.setHeader(
        "Content-Type",
        result.type || "image/png"
      );

      return res.status(200).send(resultBuffer);

    } catch (error) {
      console.error("HF ERROR:", error);

      return res.status(500).json({
        error: "Hugging Face error",
        details: error.message,
      });
    }
  });
}
