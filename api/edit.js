import { InferenceClient } from "@huggingface/inference";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const formData = await req.formData();
    const image = formData.get("image");
    const prompt =
      formData.get("prompt") ||
      "Improve this photo naturally, smooth skin slightly, enhance facial details, keep the person's identity and face unchanged.";

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    const hf = new InferenceClient(process.env.HF_TOKEN);

    const result = await hf.imageTextToImage({
      model: "black-forest-labs/FLUX.2-dev",
      inputs: image,
      prompt: prompt
    });

    const buffer = Buffer.from(await result.arrayBuffer());

    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(buffer);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "AI editing failed",
      details: error.message
    });
  }
}
