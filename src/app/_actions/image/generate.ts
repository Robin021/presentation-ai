"use server";

import { utapi } from "@/app/api/uploadthing/core";
import { env } from "@/env";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import Together from "together-ai";
import { UTFile } from "uploadthing/server";

const together = env.TOGETHER_AI_API_KEY
  ? new Together({ apiKey: env.TOGETHER_AI_API_KEY })
  : null;

export type ImageModelList =
  | "black-forest-labs/FLUX1.1-pro"
  | "black-forest-labs/FLUX.1-schnell"
  | "black-forest-labs/FLUX.1-schnell-Free"
  | "black-forest-labs/FLUX.1-pro"
  | "black-forest-labs/FLUX.1-dev"
  | "qwen-image-plus"; // Added Aliyun model

async function generateWithAliyun(prompt: string) {
  if (!env.DASHSCOPE_API_KEY) throw new Error("DashScope API Key is missing");

  // Use official API format (synchronous, no async header)
  const response = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
        // No X-DashScope-Async header = synchronous mode
      },
      body: JSON.stringify({
        model: "qwen-image-plus",
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        },
        parameters: {
          negative_prompt: "",
          prompt_extend: true,
          watermark: false,
          size: "1024*1024",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Aliyun API Error Body: ${errorText}`);
    throw new Error(`Aliyun API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log("Aliyun image generation response:", JSON.stringify(data, null, 2));

  // The image URL should be in output.choices[0].message.content[0].image
  const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image
    || data.output?.results?.[0]?.url;

  if (!imageUrl) {
    throw new Error(`Aliyun did not return an image URL. Response: ${JSON.stringify(data)}`);
  }

  return imageUrl;
}

export async function generateImageAction(
  prompt: string,
  model: ImageModelList = "black-forest-labs/FLUX.1-schnell-Free",
) {
  // Get the current session
  const session = await auth();

  // Check if user is authenticated
  if (!session?.user?.id) {
    throw new Error("You must be logged in to generate images");
  }

  try {
    let imageUrl: string | undefined;

    // Prioritize Aliyun
    if (env.DASHSCOPE_API_KEY) {
      console.log(`Generating image with Aliyun (qwen-image-plus)`);
      imageUrl = await generateWithAliyun(prompt);
    } else if (together) {
      // Fallback to Together
      console.log(`Generating image with Together AI model: ${model}`);
      const response = (await together.images.create({
        model: model,
        prompt: prompt,
        width: 1024,
        height: 768,
        steps: model.includes("schnell") ? 4 : 28,
        n: 1,
      })) as unknown as {
        data: { url: string }[];
      };
      imageUrl = response.data[0]?.url;
    } else {
      throw new Error("No image generation provider configured");
    }

    if (!imageUrl) {
      throw new Error("Failed to generate image");
    }

    console.log(`Generated image URL: ${imageUrl}`);

    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to download image from provider");
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Generate a filename based on the prompt
    const filename = `${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.png`;

    // Create a UTFile from the downloaded image
    const utFile = new UTFile([new Uint8Array(imageBuffer)], filename);

    // Upload to UploadThing
    const uploadResult = await utapi.uploadFiles([utFile]);

    if (!uploadResult[0]?.data?.ufsUrl) {
      console.error("Upload error:", uploadResult[0]?.error);
      throw new Error("Failed to upload image to UploadThing");
    }

    console.log(uploadResult);
    const permanentUrl = uploadResult[0].data.ufsUrl;
    console.log(`Uploaded to UploadThing URL: ${permanentUrl}`);

    // Store in database with the permanent URL
    const generatedImage = await db.generatedImage.create({
      data: {
        url: permanentUrl, // Store the UploadThing URL
        prompt: prompt,
        userId: session.user.id,
      },
    });

    return {
      success: true,
      image: generatedImage,
    };
  } catch (error) {
    console.error("Error generating image:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate image",
    };
  }
}
