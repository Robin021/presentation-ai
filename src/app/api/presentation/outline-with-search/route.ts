import { modelPicker } from "@/lib/model-picker";
import { auth } from "@/server/auth";
import { streamText } from "ai";
import { NextResponse } from "next/server";
import { search_tool } from "./search_tool";

interface OutlineRequest {
  prompt: string;
  numberOfCards: number;
  language: string;
  modelProvider?: string;
  modelId?: string;
}

const outlineSystemPrompt = `You are an expert presentation outline generator. Your task is to create a comprehensive and engaging presentation outline based on the user's topic.

Current Date: {currentDate}

## Your Process:
1. **Analyze the topic** - Understand what the user wants to present
2. **Research if needed** - Use web search to find current, relevant information that can enhance the outline
3. **Generate outline** - Create a structured outline with the requested number of topics

## Web Search Guidelines:
- Use web search to find current statistics, recent developments, or expert insights
- Search for information that will make the presentation more credible and engaging
- Limit searches to 2-5 queries maximum (you decide how many are needed)
- Focus on finding information that directly relates to the presentation topic

## Outline Requirements:
- First generate an appropriate title for the presentation
- Generate exactly {numberOfCards} main topics
- Each topic should be a clear, engaging heading
- Include 2-3 bullet points per topic
- Use {language} language
- Make topics flow logically from one to another
- Ensure topics are comprehensive and cover key aspects

## Output Format:
Start with the title in XML tags, then generate the outline in markdown format with each topic as a heading followed by bullet points.

Example:
<TITLE>Your Generated Presentation Title Here</TITLE>

# First Main Topic
- Key point about this topic
- Another important aspect
- Brief conclusion or impact

# Second Main Topic
- Main insight for this section
- Supporting detail or example
- Practical application or takeaway

## CRITICAL INSTRUCTION:
After you receive the search results, you MUST immediately generate the outline using the format above. Do NOT just call tools without producing the final outline. The outline text output is REQUIRED.`;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      prompt,
      numberOfCards,
      language,
      modelProvider = "openai",
      modelId,
    } = (await req.json()) as OutlineRequest;
    console.log("[Outline] Request:", { prompt, numberOfCards, language, modelProvider, modelId });

    if (!prompt || !numberOfCards || !language) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const languageMap: Record<string, string> = {
      "en-US": "English (US)",
      pt: "Portuguese",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
      ru: "Russian",
      hi: "Hindi",
      ar: "Arabic",
    };

    const actualLanguage = languageMap[language] ?? language;
    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Create model based on selection
    const model = modelPicker(modelProvider, modelId);

    const result = streamText({
      model,
      system: outlineSystemPrompt
        .replace("{numberOfCards}", numberOfCards.toString())
        .replace("{language}", actualLanguage)
        .replace("{currentDate}", currentDate),
      messages: [
        {
          role: "user",
          content: `Create a presentation outline for: ${prompt}`,
        },
      ],
      tools: {
        webSearch: search_tool,
      },
      maxSteps: 5, // Allow up to 5 tool calls
      toolChoice: "auto", // Let the model decide when to use tools
      onStepFinish: (step) => {
        console.log("----------------------------------------");
        console.log("[Outline] Step finished!");
        console.log("[Outline] Step type:", step.stepType);
        console.log("[Outline] Tool calls:", step.toolCalls?.length ?? 0);
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((tc, i) => {
            console.log(`[Outline] Tool call ${i}:`, tc.toolName, JSON.stringify(tc.args));
          });
        }
        console.log("[Outline] Tool results:", step.toolResults?.length ?? 0);
        if (step.toolResults && step.toolResults.length > 0) {
          step.toolResults.forEach((tr: any, i: number) => {
            const result = tr.result;
            console.log(`[Outline] Tool result ${i}:`, typeof result === 'string' ? result.substring(0, 200) + '...' : result);
          });
        }
        console.log("----------------------------------------");
      },
      onFinish: (result) => {
        console.log("[Outline] ========== STREAM FINISHED ==========");
        console.log("[Outline] Text length:", result.text.length);
        console.log("[Outline] Text (raw):", JSON.stringify(result.text));
        console.log("[Outline] Text (first 500 chars):", result.text.substring(0, 500));
        console.log("[Outline] Total steps:", result.steps?.length ?? 0);
        // Log each step's output
        result.steps?.forEach((step, i) => {
          console.log(`[Outline] Step ${i} text length:`, step.text?.length ?? 0);
          console.log(`[Outline] Step ${i} text:`, step.text?.substring(0, 200));
        });
        console.log("[Outline] =====================================");
      },
    });

    return result.toDataStreamResponse({
      getErrorMessage: (error) => {
        console.error("Stream error (Search):", error);
        if (error instanceof Error) return error.message;
        return String(error);
      }
    });
  } catch (error) {
    console.error("Error in outline generation with search:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to generate outline with search: ${errorMessage}` },
      { status: 500 },
    );
  }
}
