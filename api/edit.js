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
            "Enhance this photo naturally. Improve image quality, lighting, sharpness and facial details. Keep the person's identity and face unchanged.";

      const imageBuffer = fs.readFileSync(
        imageFile.filepath
      );

      const imageBlob = new Blob(
        [imageBuffer],
        {
          type:
            imageFile.mimetype ||
            "image/jpeg",
        }
      );

      const cloudflareForm = new FormData();

      cloudflareForm.append(
        "prompt",
        prompt
      );

      cloudflareForm.append(
        "input_image_0",
        imageBlob,
        "photo.jpg"
      );

      cloudflareForm.append(
        "width",
        "1024"
      );

      cloudflareForm.append(
        "height",
        "1024"
      );

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${process.env.CF_API_TOKEN}`,
          },

          body: cloudflareForm,
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {

        console.error(
          "CLOUDFLARE ERROR:",
          data
        );

        return res.status(500).json({
          error:
            "Cloudflare AI error",

          details:
            data.errors?.[0]?.message ||
            "AI editing failed",
        });
      }

      if (
        !data.result ||
        !data.result.image
      ) {
        return res.status(500).json({
          error:
            "Invalid image response",

          details:
            "Cloudflare did not return an image.",
        });
      }

      const outputBuffer =
        Buffer.from(
          data.result.image,
          "base64"
        );

      res.setHeader(
        "Content-Type",
        "image/png"
      );

      return res
        .status(200)
        .send(outputBuffer);

    } catch (error) {

      console.error(
        "CLOUDFLARE ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Cloudflare AI error",

        details:
          error.message,
      });
    }
  });
}
