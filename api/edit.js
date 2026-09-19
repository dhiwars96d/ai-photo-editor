import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        return res.status(400).json({
          error: "Form parsing failed: " + err.message,
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

      const imageBuffer = fs.readFileSync(imageFile.filepath);

      const hfResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Kontext-dev",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            "Content-Type": imageFile.mimetype || "image/jpeg",
          },
          body: imageBuffer,
        }
      );

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();

        return res.status(hfResponse.status).json({
          error: errorText,
        });
      }

      const result = await hfResponse.arrayBuffer();

      res.setHeader(
        "Content-Type",
        hfResponse.headers.get("content-type") || "image/png"
      );

      return res.status(200).send(Buffer.from(result));

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error: error.message,
      });
    }
  });
}
