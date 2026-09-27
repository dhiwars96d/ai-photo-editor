import formidable from "formidable";
import fs from "fs";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {

    // -----------------------------
    // 1. Read uploaded image
    // -----------------------------
    const form = formidable({
      multiples: false,
      keepExtensions: true,
    });

    const [fields, files] =
      await form.parse(req);

    const uploadedFile =
      files.image?.[0];

    if (!uploadedFile) {
      return res.status(400).json({
        error: "Image is required",
      });
    }


    // -----------------------------
    // 2. Read original image
    // -----------------------------
    const originalBuffer =
      fs.readFileSync(
        uploadedFile.filepath
      );


    // -----------------------------
    // 3. Resize image
    // Cloudflare requires input
    // smaller than 512x512
    // -----------------------------
    const imageBuffer =
      await sharp(originalBuffer)
        .resize({
          width: 511,
          height: 511,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 90,
        })
        .toBuffer();


    // -----------------------------
    // 4. Cloudflare credentials
    // -----------------------------
    const accountId =
      process.env.CF_ACCOUNT_ID;

    const apiToken =
      process.env.CF_API_TOKEN;

    if (!accountId || !apiToken) {
      return res.status(500).json({
        error:
          "Cloudflare Account ID or API Token is missing.",
      });
    }


    // -----------------------------
    // 5. Cloudflare endpoint
    // -----------------------------
    const apiURL =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`;


    // -----------------------------
    // 6. Multipart form
    // -----------------------------
    const cloudflareForm =
      new FormData();


    cloudflareForm.append(
      "input_image_0",
      new Blob([
        imageBuffer
      ], {
        type: "image/jpeg",
      }),
      "input.jpg"
    );


    cloudflareForm.append(
      "prompt",
      `
Improve this photo naturally.

Keep the exact same person.
Preserve identity completely.

Keep the original:
face shape,
facial proportions,
eyes,
eyebrows,
nose,
lips,
mouth,
jawline,
hair,
hairstyle,
facial expression,
skin color.

Only make a subtle natural improvement
to the skin appearance.

Do not change the person's identity.
Do not redesign the face.
Do not create a different person.
Do not make the skin plastic or artificial.
`
    );


    // -----------------------------
    // 7. Call Cloudflare
    // -----------------------------
    const aiResponse =
      await fetch(
        apiURL,
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${apiToken}`,
          },

          body: cloudflareForm,
        }
      );


    // -----------------------------
    // 8. Read response ONLY ONCE
    // -----------------------------
    const responseBuffer =
      Buffer.from(
        await aiResponse.arrayBuffer()
      );


    // -----------------------------
    // 9. Handle Cloudflare error
    // -----------------------------
    if (!aiResponse.ok) {

      const errorText =
        responseBuffer.toString(
          "utf8"
        );

      console.error(
        "CLOUDFLARE AI ERROR:",
        errorText
      );

      return res.status(500).json({
        error:
          `Cloudflare AI failed: ${errorText}`,
      });
    }


    // -----------------------------
    // 10. Return generated image
    // -----------------------------
    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(200)
      .send(responseBuffer);

  }

  catch (error) {

    console.error(
      "CLOUDFLARE TEST ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Cloudflare AI test failed",
    });
  }
}
