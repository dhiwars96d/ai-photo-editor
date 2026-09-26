import formidable from "formidable";
import fs from "fs";

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
    // 2. Read image file
    // -----------------------------
    const imageBuffer =
      fs.readFileSync(
        uploadedFile.filepath
      );

    // -----------------------------
    // 3. Cloudflare credentials
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
    // 4. Cloudflare model endpoint
    // -----------------------------
    const apiURL =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`;

    // -----------------------------
    // 5. Multipart request
    // -----------------------------
    const formData =
      new FormData();

    formData.append(
      "input_image_0",
      new Blob([
        imageBuffer
      ]),
      uploadedFile.originalFilename ||
        "image.jpg"
    );

    formData.append(
      "prompt",
      "Improve this photo naturally. Keep the exact same person, identity, face shape, facial features, hairstyle and expression unchanged. Make only a subtle improvement to natural skin appearance and overall photo quality. Do not redesign or change the person's face."
    );

    // -----------------------------
    // 6. Call Cloudflare
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

          body: formData,
        }
      );

    // -----------------------------
    // 7. Check response
    // -----------------------------
    if (!aiResponse.ok) {

      const errorText =
        await aiResponse.text();

      console.error(
        "CLOUDFLARE TEST ERROR:",
        errorText
      );

      return res.status(500).json({
        error:
          `Cloudflare AI failed: ${errorText}`,
      });
    }

    // -----------------------------
    // 8. Get image output
    // -----------------------------
    const outputBuffer =
      Buffer.from(
        await aiResponse.arrayBuffer()
      );

    // -----------------------------
    // 9. Return image
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
      .send(outputBuffer);

  } catch (error) {

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
}￼Enter
