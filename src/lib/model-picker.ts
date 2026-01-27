import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModelV1 } from "ai";
import { createOllama } from "ollama-ai-provider";
import { env } from "@/env";

/**
 * Create a patched fetch that fixes tool_calls missing index field for Qwen/OpenAI-compatible APIs
 */
function createPatchedFetch(): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return fetch(input, init).then(response => {
      // Only process streaming responses
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        return response;
      }

      const reader = response.body.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Track tool call indices for each response
      let toolCallIndexCounter = 0;

      const transformedStream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              const transformedLines: string[] = [];

              for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const jsonStr = line.slice(6);
                    if (jsonStr.trim()) {
                      const data = JSON.parse(jsonStr);

                      // Patch tool_calls to add missing index field
                      if (data.choices?.[0]?.delta?.tool_calls) {
                        data.choices[0].delta.tool_calls = data.choices[0].delta.tool_calls.map(
                          (tc: { index?: number; id?: string }) => {
                            if (tc.id && tc.index === undefined) {
                              tc.index = toolCallIndexCounter++;
                            } else if (tc.index === undefined) {
                              tc.index = Math.max(0, toolCallIndexCounter - 1);
                            }
                            return tc;
                          }
                        );
                      }

                      transformedLines.push(`data: ${JSON.stringify(data)}`);
                    } else {
                      transformedLines.push(line);
                    }
                  } catch {
                    transformedLines.push(line);
                  }
                } else {
                  transformedLines.push(line);
                }
              }

              controller.enqueue(encoder.encode(transformedLines.join('\n')));
            }
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(transformedStream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    });
  };
}

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
    compatibility: 'compatible',
    fetch: createPatchedFetch(), // Fix Qwen tool_calls missing index
  });

  return openai(finalModelId) as unknown as LanguageModelV1;
}
