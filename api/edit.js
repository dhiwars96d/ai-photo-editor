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

    const imageBuffer = Buffer.from(await image.arrayBuffer());

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Kontext-dev",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": image.type || "image/jpeg"
        },
        body: imageBuffer
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: errorText
      });
    }

    const result = await response.arrayBuffer();

    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    return res.status(200).send(Buffer.from(result));

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
}
