import formidable from "formidable";
import fs from "fs";
import { InferenceClient } from "@huggingface/inference";

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

    const imageBuffer =
      fs.readFileSync(uploadedFile.filepath);


    const hf =
      new InferenceClient(
        process.env.HF_TOKEN
      );


    const prompt = `
Naturally smooth the skin of the person in this photo.

Keep the exact same person and preserve identity.
Keep the original face shape, facial proportions,
eyes, eyebrows, nose, lips, mouth, jawline and hair unchanged.

Only reduce minor skin texture, small blemishes,
uneven skin texture and roughness.

Keep natural pores and realistic skin texture.
Keep natural skin color and lighting.
Do not beautify excessively.
Do not reshape the face.
Do not change facial expression.
Do not make the skin plastic, waxy or airbrushed.

The final result should look like the same
real person with naturally smoother skin.
`;


    const negativePrompt = `
different person,
face reconstruction,
face reshaping,
changed eyes,
changed nose,
changed lips,
changed mouth,
changed expression,
changed hairstyle,
plastic skin,
waxy skin,
over retouched skin,
airbrushed face,
beauty filter,
unnatural skin,
artificial face,
identity change
`;


    const result =
      await hf.imageToImage({
        data: imageBuffer,

        model:
          "Qwen/Qwen-Image-Edit",

        prompt: prompt,

        negative_prompt:
          negativePrompt,

        parameters: {
          num_inference_steps: 20,
          guidance_scale: 4,
        },
      });


    const outputBuffer =
      Buffer.from(
        await result.arrayBuffer()
      );


    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(200).send(
      outputBuffer
    );

  }

  catch (error) {

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
