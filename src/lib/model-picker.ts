import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModelV1 } from "ai";
import { createOllama } from "ollama-ai-provider";
import { env } from "@/env";

/**
 * Centralized model picker function for all presentation generation routes
 * Supports OpenAI, Ollama, and LM Studio models
 */
export function modelPicker(
  modelProvider: string,
  modelId?: string,
): LanguageModelV1 {
  if (modelProvider === "ollama" && modelId) {
    // Use Ollama AI provider
    const ollama = createOllama();
    return ollama(modelId) as unknown as LanguageModelV1;
  }

  if (modelProvider === "lmstudio" && modelId) {
    // Use LM Studio with OpenAI compatible provider
    const lmstudio = createOpenAI({
      name: "lmstudio",
      baseURL: "http://localhost:1234/v1",
      apiKey: "lmstudio",
    });
    return lmstudio(modelId) as unknown as LanguageModelV1;
  }

  // Default to OpenAI
  const baseURL = env.OPENAI_BASE_URL;
  const actualApiKey = env.ONEAPI_API_KEY;
  const apiKeyPreview = actualApiKey ? `${actualApiKey.substring(0, 15)}...` : "missing";

  // Prioritize simple boolean checks for empty strings
  const finalModelId = (modelId && modelId.trim() !== "")
    ? modelId
    : (env.OPENAI_MODEL || "gpt-4o-mini");

  console.log(`[ModelPicker] Initializing OpenAI provider. BaseURL: ${baseURL || "default"}, Model: ${finalModelId}, API Key: ${apiKeyPreview}`);

  const openai = createOpenAI({
    baseURL: env.OPENAI_BASE_URL,
    apiKey: env.ONEAPI_API_KEY,
    compatibility: 'compatible', // Relaxes validation for OpenAI-compatible APIs (e.g., Qwen, DeepSeek)
  });

  return openai(finalModelId) as unknown as LanguageModelV1;
}
