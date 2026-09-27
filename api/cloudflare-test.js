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

    // 1. Upload image read karo
    const form = formidable({
      multiples: false,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const uploadedFile = files.image?.[0];

    if (!uploadedFile) {
      return res.status(400).json({
        error: "Image is required",
      });
    }

    // 2. Original image read karo
    const originalBuffer = fs.readFileSync(
      uploadedFile.filepath
    );

    // 3. Cloudflare ke liye image ko 511x511 se chhota rakho
    const imageBuffer = await sharp(originalBuffer)
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

    // 4. Cloudflare credentials
    const accountId = process.env.CF_ACCOUNT_ID;
    const apiToken = process.env.CF_API_TOKEN;

    if (!accountId || !apiToken) {
      return res.status(500).json({
        error:
          "Cloudflare Account ID or API Token is missing.",
      });
    }

    // 5. Cloudflare model
    const apiURL =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`;

    // 6. Multipart form
    const cloudflareForm = new FormData();

    cloudflareForm.append(
      "input_image_0",
      new Blob(
        [imageBuffer],
        {
          type: "image/jpeg",
        }
      ),
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

    // 7. Cloudflare AI call
    const aiResponse = await fetch(
      apiURL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: cloudflareForm,
      }
    );

    // 8. Response ko TEXT ke roop me sirf ek baar read karo
    const responseText = await aiResponse.text();

    // 9. Cloudflare error
    if (!aiResponse.ok) {

      console.error(
        "CLOUDFLARE AI ERROR:",
        responseText
      );

      return res.status(500).json({
        error:
          `Cloudflare AI failed: ${responseText}`,
      });
    }

    // 10. JSON parse karo
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {

      console.error(
        "CLOUDFLARE INVALID JSON:",
        responseText
      );

      return res.status(500).json({
        error:
          "Cloudflare returned an invalid response.",
      });
    }

    // 11. Base64 image nikalo
    const base64Image =
      data?.result?.image;

    if (!base64Image) {

      console.error(
        "CLOUDFLARE RESPONSE:",
        data
      );

      return res.status(500).json({
        error:
          "Cloudflare response me image nahi mili.",
      });
    }

    // 12. Agar data:image prefix ho to hatao
    const cleanBase64 =
      base64Image.includes(",")
        ? base64Image.split(",").pop()
        : base64Image;

    // 13. Base64 ko actual image buffer me convert karo
    const outputBuffer = Buffer.from(
      cleanBase64,
      "base64"
    );

    if (!outputBuffer || outputBuffer.length === 0) {
      return res.status(500).json({
        error:
          "Generated image decode nahi ho payi.",
      });
    }

    // 14. Actual PNG return karo
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
}
