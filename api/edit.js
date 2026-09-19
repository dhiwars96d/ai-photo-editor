import formidable from "formidable";
import fs from "fs";

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
        console.error("FORM ERROR:", err);

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
          details: "Frontend se image field nahi mili.",
        });
      }

      const prompt =
        Array.isArray(fields.prompt)
          ? fields.prompt[0]
          : fields.prompt ||
            "Improve this photo naturally, smooth skin slightly, enhance facial details, keep the person's identity and face unchanged.";

      const imageBuffer = fs.readFileSync(imageFile.filepath);

      const hfForm = new FormData();

      hfForm.append(
        "image",
        new Blob([imageBuffer], {
          type: imageFile.mimetype || "image/jpeg",
        }),
        imageFile.originalFilename || "photo.jpg"
      );

      hfForm.append("prompt", prompt);

      const hfResponse = await fetch(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Kontext-dev",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
          },
          body: hfForm,
        }
      );

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();

        console.error("HF ERROR:", errorText);

        return res.status(hfResponse.status).json({
          error: "Hugging Face error",
          details: errorText,
        });
      }

      const result = await hfResponse.arrayBuffer();

      res.setHeader(
        "Content-Type",
        hfResponse.headers.get("content-type") || "image/png"
      );

      return res.status(200).send(Buffer.from(result));

    } catch (error) {
      console.error("SERVER ERROR:", error);

      return res.status(500).json({
        error: "Server error",
        details: error.message,
      });
    }
  });
}
