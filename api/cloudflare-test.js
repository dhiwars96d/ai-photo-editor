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

    // 1. Upload image
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

    // 2. Original image
    const originalBuffer = fs.readFileSync(
      uploadedFile.filepath
    );

    // 3. Resize for Cloudflare
    const imageBuffer = await sharp(originalBuffer)
      .resize({
        width: 511,
        height: 511,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 92,
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

    // 6. Multipart request
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

    // 7. STRONG IDENTITY PRESERVATION PROMPT
    cloudflareForm.append(
      "prompt",
      `
EDIT THE EXISTING PHOTO.

IDENTITY PRESERVATION IS THE HIGHEST PRIORITY.

Keep EXACTLY the same person.

Do NOT regenerate, redesign, beautify, reconstruct,
or replace the face.

PRESERVE EXACTLY:
- both eyes
- iris shape and position
- pupils
- eyelids
- eyebrows
- nose shape
- nostrils
- lips
- mouth shape
- teeth if visible
- cheeks
- cheekbones
- jawline
- chin
- forehead
- face width
- face height
- facial proportions
- skin tone
- hair
- hairstyle
- earrings
- facial expression
- head position

Do NOT change the person's identity.

Do NOT change eye shape.
Do NOT change eye position.
Do NOT change the nose.
Do NOT change the lips.
Do NOT change the jaw.
Do NOT change facial proportions.

ONLY improve the natural appearance of the skin.

Reduce minor skin imperfections subtly.
Preserve natural pores and skin texture.
Keep realistic skin detail.

The result must look like the SAME ORIGINAL PHOTO
of the SAME PERSON after a very subtle skin improvement.

If changing the face is necessary, DO NOT change it.
Preserve the original face instead.

No beauty filter.
No face reconstruction.
No face enhancement.
No facial redesign.
No artificial skin.
No plastic skin.
No makeup changes.
`
    );

    // 8. Fixed seed for repeatable testing
    cloudflareForm.append(
      "seed",
      "24681357"
    );

    // 9. Lower guidance
    cloudflareForm.append(
      "guidance",
      "1.5"
    );

    // 10. Cloudflare AI
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

    // 11. Read response once
    const responseText = await aiResponse.text();

    // 12. Cloudflare error
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

    // 13. JSON parse
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {

      console.error(
        "INVALID CLOUDFLARE JSON:",
        responseText
      );

      return res.status(500).json({
        error:
          "Cloudflare returned invalid JSON.",
      });
    }

    // 14. Base64 image
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

    // 15. Remove data URL prefix if present
    const cleanBase64 =
      base64Image.includes(",")
        ? base64Image.split(",").pop()
        : base64Image;

    // 16. Decode Base64
    const outputBuffer = Buffer.from(
      cleanBase64,
      "base64"
    );

    if (
      !outputBuffer ||
      outputBuffer.length === 0
    ) {
      return res.status(500).json({
        error:
          "Generated image decode nahi ho payi.",
      });
    }

    // 17. Return PNG
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
