import formidable from "formidable";
import fs from "fs";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ESRGAN_BASE =
  "https://nick088-real-esrgan-pytorch.hf.space";

async function realEsrganEnhance(imageBuffer) {
  /* =========================
     1. UPLOAD IMAGE TO GRADIO
     ========================= */

  const uploadForm = new FormData();

  uploadForm.append(
    "files",
    new Blob([imageBuffer], {
      type: "image/jpeg",
    }),
    "photo.jpg"
  );

  const uploadResponse = await fetch(
    `${ESRGAN_BASE}/gradio_api/upload`,
    {
      method: "POST",
      body: uploadForm,
    }
  );

  if (!uploadResponse.ok) {
    const errorText =
      await uploadResponse.text();

    throw new Error(
      `Real-ESRGAN upload failed: ${errorText}`
    );
  }

  const uploadData =
    await uploadResponse.json();

  console.log(
    "REAL-ESRGAN UPLOAD:",
    uploadData
  );

  const uploadedPath =
    Array.isArray(uploadData)
      ? uploadData[0]
      : uploadData.path;

  if (!uploadedPath) {
    throw new Error(
      "Real-ESRGAN upload path nahi mila."
    );
  }

  /* =========================
     2. START PREDICTION
     ========================= */

  const predictResponse = await fetch(
    `${ESRGAN_BASE}/gradio_api/call/predict`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        data: [
          {
            path: uploadedPath,
            meta: {
              _type: "gradio.FileData",
            },
          },
          "4",
        ],
      }),
    }
  );

  if (!predictResponse.ok) {
    const errorText =
      await predictResponse.text();

    throw new Error(
      `Real-ESRGAN prediction failed: ${errorText}`
    );
  }

  const predictData =
    await predictResponse.json();

  console.log(
    "REAL-ESRGAN PREDICT:",
    predictData
  );

  const eventId =
    predictData.event_id;

  if (!eventId) {
    throw new Error(
      "Real-ESRGAN event ID nahi mila."
    );
  }

  /* =========================
     3. WAIT FOR RESULT
     ========================= */

  const resultResponse = await fetch(
    `${ESRGAN_BASE}/gradio_api/call/predict/${eventId}`
  );

  if (!resultResponse.ok) {
    const errorText =
      await resultResponse.text();

    throw new Error(
      `Real-ESRGAN result failed: ${errorText}`
    );
  }

  const resultText =
    await resultResponse.text();

  console.log(
    "REAL-ESRGAN RESULT:",
    resultText
  );

  /* =========================
     4. FIND COMPLETE RESULT
     ========================= */

  const lines =
    resultText.split("\n");

  let outputData = null;

  for (const line of lines) {
    if (
      line.startsWith("data:") &&
      line.trim() !== "data:"
    ) {
      try {
        const parsed =
          JSON.parse(
            line.substring(5).trim()
          );

        if (
          Array.isArray(parsed) &&
          parsed.length > 0
        ) {
          outputData = parsed[0];
        }
      } catch (e) {
        // ignore non-JSON SSE lines
      }
    }
  }

  if (!outputData) {
    throw new Error(
      "Real-ESRGAN ne output image return nahi ki."
    );
  }

  console.log(
    "REAL-ESRGAN OUTPUT:",
    outputData
  );

  /* =========================
     5. GET OUTPUT IMAGE
     ========================= */

  let outputUrl = null;

  if (
    typeof outputData === "string"
  ) {
    outputUrl = outputData;
  }

  if (
    outputData &&
    typeof outputData === "object"
  ) {
    if (outputData.url) {
      outputUrl = outputData.url;
    } else if (outputData.path) {
      outputUrl = outputData.path;
    }
  }

  if (!outputUrl) {
    throw new Error(
      "Real-ESRGAN output URL nahi mila."
    );
  }

  if (
    outputUrl.startsWith("/")
  ) {
    outputUrl =
      ESRGAN_BASE + outputUrl;
  }

  const outputResponse =
    await fetch(outputUrl);

  if (!outputResponse.ok) {
    throw new Error(
      "Real-ESRGAN output image download nahi ho payi."
    );
  }

  return Buffer.from(
    await outputResponse.arrayBuffer()
  );
}

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

  form.parse(
    req,
    async (err, fields, files) => {
      try {
        if (err) {
          return res.status(400).json({
            error:
              "Form parsing failed",
            details: err.message,
          });
        }

        const imageFile =
          Array.isArray(files.image)
            ? files.image[0]
            : files.image;

        if (!imageFile) {
          return res.status(400).json({
            error:
              "Image not received",
          });
        }

        const maskFile =
          Array.isArray(files.mask)
            ? files.mask[0]
            : files.mask;

        const prompt =
          Array.isArray(fields.prompt)
            ? fields.prompt[0]
            : fields.prompt ||
              "Enhance this photo naturally.";

        const imageBuffer =
          fs.readFileSync(
            imageFile.filepath
          );

        /* =========================
           SMILE / MASK
           ========================= */

        if (maskFile) {
          const maskBuffer =
            fs.readFileSync(
              maskFile.filepath
            );

          const imageData =
            await sharp(imageBuffer)
              .resize(768, 864, {
                fit: "fill",
              })
              .jpeg({
                quality: 60,
              })
              .toBuffer();

          const maskData =
            await sharp(maskBuffer)
              .resize(768, 864, {
                fit: "fill",
              })
              .greyscale()
              .png()
              .toBuffer();

          const cloudflareBody = {
            prompt:
              "Create a subtle natural smile. Change only the mouth expression. Preserve the exact same person, identity, eyes, nose, cheeks, jawline, face shape, skin and hair. Do not change any other part of the face.",

            negative_prompt:
              "different person, changed face, changed eyes, changed nose, changed jawline, changed hairstyle, distorted face, unrealistic mouth",

            image:
              Array.from(imageData),

            mask:
              Array.from(maskData),

            width: 768,
            height: 864,
            num_steps: 20,
            strength: 0.35,
            guidance: 7.5,
          };

          const smileResponse =
            await fetch(
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
                  JSON.stringify(
                    cloudflareBody
                  ),
              }
            );

          if (!smileResponse.ok) {
            const errorText =
              await smileResponse.text();

            return res.status(500).json({
              error:
                "Cloudflare Smile AI error",
              details:
                errorText,
            });
          }

          const smileOutputBuffer =
            Buffer.from(
              await smileResponse.arrayBuffer()
            );

          const originalMeta =
            await sharp(
              imageBuffer
            ).metadata();

          const finalMaskBuffer =
            await sharp(maskBuffer)
              .resize(
                originalMeta.width,
                originalMeta.height,
                {
                  fit: "fill",
                }
              )
              .greyscale()
              .png()
              .toBuffer();

          const resizedSmileOutput =
            await sharp(
              smileOutputBuffer
            )
              .resize(
                originalMeta.width,
                originalMeta.height,
                {
                  fit: "fill",
                }
              )
              .png()
              .toBuffer();

          const finalBuffer =
            await sharp(imageBuffer)
              .composite([
                {
                  input:
                    resizedSmileOutput,
                  blend: "over",
                  mask: {
                    input:
                      finalMaskBuffer,
                  },
                },
              ])
              .png()
              .toBuffer();

          res.setHeader(
            "Content-Type",
            "image/png"
          );

          return res
            .status(200)
            .send(finalBuffer);
        }

        /* =========================
           ENHANCE = REAL ESRGAN 4X
           ========================= */

        const isSmooth =
          prompt
            .toLowerCase()
            .includes(
              "smooth the skin"
            );

        if (!isSmooth) {
          console.log(
            "REAL-ESRGAN: 4x enhancement started"
          );

          const enhancedBuffer =
            await realEsrganEnhance(
              imageBuffer
            );

          res.setHeader(
            "Content-Type",
            "image/png"
          );

          return res
            .status(200)
            .send(enhancedBuffer);
        }

        /* =========================
           SMOOTH SKIN
           ========================= */

        const imageBlob =
          new Blob(
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

        const response =
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`,
            {
              method: "POST",

              headers: {
                Authorization:
                  `Bearer ${process.env.CF_API_TOKEN}`,
              },

              body:
                cloudflareForm,
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          return res.status(500).json({
            error:
              "Cloudflare AI error",

            details:
              data.errors?.[0]?.message ||
              "AI editing failed.",
          });
        }

        if (
          !data.result ||
          !data.result.image
        ) {
          return res.status(500).json({
            error:
              "Invalid image response",
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
          "AI EDIT ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "AI editing failed",

          details:
            error.message,
        });
      }
    }
  );
}
