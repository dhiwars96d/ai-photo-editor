import formidable from "formidable";
import fs from "fs";
import sharp from "sharp";
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

      const maskFile = Array.isArray(files.mask)
        ? files.mask[0]
        : files.mask;

      const prompt =
        Array.isArray(fields.prompt)
          ? fields.prompt[0]
          : fields.prompt ||
            "Enhance this photo naturally. Improve image quality, lighting, sharpness and facial details. Keep the person's identity and face unchanged.";

      const imageBuffer = fs.readFileSync(
        imageFile.filepath
      );

      /* =========================
         SMILE - INPAINTING
         ========================= */

      if (maskFile) {
        const maskBuffer = fs.readFileSync(
          maskFile.filepath
        );
const imageBase64 = (
  await sharp(imageBuffer)
    .resize(512, 576, {
      fit: "fill"
    })
    .jpeg({
      quality: 70
    })
    .toBuffer()
).toString("base64");

const maskRaw = await sharp(maskBuffer)
  .resize(512, 576, {
    fit: "fill"
  })
  .greyscale()
  .raw()
  .toBuffer();
        const cloudflareBody = {
          prompt:
            "Create a subtle natural smile. Change only the mouth expression. Preserve the exact same person, identity, eyes, nose, cheeks, jawline, face shape, skin and hair. Do not change any other part of the face.",

          negative_prompt:
            "different person, changed face, changed eyes, changed nose, changed jawline, changed hairstyle, distorted face, unrealistic mouth",

          image_b64: imageBase64,

mask: Array.from(maskRaw),

          width: 512,
height: 576,

          num_steps: 20,

          strength: 0.35,

          guidance: 7.5
        };

        const smileResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`,
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.CF_API_TOKEN}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(cloudflareBody),
          }
        );

        if (!smileResponse.ok) {
          const errorText =
            await smileResponse.text();

          console.error(
            "CLOUDFLARE SMILE ERROR:",
            errorText
          );

          return res.status(500).json({
            error:
              "Cloudflare Smile AI error",

            details:
              errorText ||
              "Smile editing failed",
          });
        }

        const outputBuffer =
          Buffer.from(
            await smileResponse.arrayBuffer()
          );

        res.setHeader(
          "Content-Type",
          "image/png"
        );

        return res
          .status(200)
          .send(outputBuffer);
      }

      /* =========================
         ENHANCE / SMOOTH
         ========================= */

      const imageBlob = new Blob(
        [imageBuffer],
        {
          type:
            imageFile.mimetype ||
            "image/jpeg",
        }
      );

      const cloudflareForm =
        new FormData();

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
