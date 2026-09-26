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

    const [fields, files] = await form.parse(req);

    const uploadedFile = files.image?.[0];

    if (!uploadedFile) {
      return res.status(400).json({
        error: "Image is required",
      });
    }

    // -----------------------------
    // 2. Read image
    // -----------------------------
    const imageBuffer = fs.readFileSync(
      uploadedFile.filepath
    );

    // Convert image to Base64
    const imageBase64 =
      imageBuffer.toString("base64");

    // -----------------------------
    // 3. Smooth Skin prompt
    // -----------------------------
    const prompt = `
Naturally smooth the skin in this photo.

Keep the exact same person and preserve identity.

Only make subtle improvements to skin:
- reduce minor blemishes
- reduce rough skin texture
- reduce uneven skin texture
- make skin look naturally smoother

Preserve:
- exact face shape
- facial proportions
- eyes
- eyebrows
- nose
- lips
- mouth
- jawline
- hairstyle
- facial expression
- skin color
- lighting
- overall appearance

Keep realistic pores and natural skin texture.

Do not make the face look artificial.
The result must look like the same real person,
with only naturally smoother skin.
`;

    // -----------------------------
    // 4. Negative prompt
    // -----------------------------
    const negativePrompt = `
different person,
identity change,
face reconstruction,
face reshaping,
changed face shape,
changed facial proportions,
changed eyes,
changed eyebrows,
changed nose,
changed lips,
changed mouth,
changed jawline,
changed hairstyle,
changed expression,
beauty filter,
plastic skin,
waxy skin,
airbrushed skin,
over retouched skin,
artificial face,
unnatural skin,
smooth plastic face,
cartoon,
painting,
blurry face,
distorted face
`;

    // -----------------------------
    // 5. Cloudflare Workers AI
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

    const apiURL =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`;

    // -----------------------------
    // 6. AI request
    // -----------------------------
    const aiResponse = await fetch(apiURL, {
      method: "POST",

      headers: {
        "Authorization":
          `Bearer ${apiToken}`,

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        prompt: prompt,

        negative_prompt:
          negativePrompt,

        image_b64:
          imageBase64,

        // Low strength = keep original
        // image closer to input.
        strength: 0.18,

        // Maximum supported by model.
        num_steps: 20,

        // Moderate prompt guidance.
        guidance: 5,

        // Keep original image dimensions.
        // Cloudflare model supports 256-2048.
        width: 512,
        height: 512,
      }),
    });

    // -----------------------------
    // 7. Check Cloudflare response
    // -----------------------------
    if (!aiResponse.ok) {
      const errorText =
        await aiResponse.text();

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
    // 8. Get generated PNG
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
      "SMOOTH AI ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Smooth AI failed",
    });
  }
}
