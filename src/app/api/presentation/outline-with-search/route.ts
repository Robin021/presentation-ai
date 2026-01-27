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

// System prompt for outline generation (used after search results are obtained)
const outlineSystemPrompt = `You are an expert presentation outline generator. Your task is to create a comprehensive and engaging presentation outline based on the user's topic and the provided research information.

Current Date: {currentDate}

## Outline Requirements:
- First generate an appropriate title for the presentation
- Generate exactly {numberOfCards} main topics
- Each topic should be a clear, engaging heading
- Include 2-3 bullet points per topic
- Use {language} language
- Make topics flow logically from one to another
- Ensure topics are comprehensive and cover key aspects
- Incorporate relevant facts and statistics from the research data

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
- Practical application or takeaway`;

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

    // Step 1: Execute search first (before streaming)
    console.log("[Outline] Step 1: Executing web search for:", prompt);
    let searchResults = "";
    try {
      let searchResponse = "Search disabled";
      if (search_tool.execute) {
        searchResponse = await search_tool.execute({ query: prompt }, {
          toolCallId: "outline-search",
          messages: [],
        });
      }

      let parsedResponse: any = searchResponse;
      if (typeof searchResponse === 'string') {
        try {
          parsedResponse = JSON.parse(searchResponse);
        } catch (e) {
          console.error("Failed to parse search response JSON:", e);
        }
      }

      if (Array.isArray(parsedResponse)) {
        searchResults = parsedResponse.map((result: { title: string; link: string; snippet: string }) =>
          `- ${result.title}: ${result.snippet} (Source: ${result.link})`
        ).join("\n");
        console.log("[Outline] Search completed, found", parsedResponse.length, "results");
      }
    } catch (searchError) {
      console.error("[Outline] Search failed:", searchError);
      // Continue without search results
    }

    // Step 2: Generate outline with search results as context
    console.log("[Outline] Step 2: Generating outline with search context");
    const model = modelPicker(modelProvider, modelId);

    const userContent = searchResults
      ? `Create a presentation outline for: ${prompt}

## Research Information:
${searchResults}

Use the above research information to create a well-informed outline. Generate the complete outline now with <TITLE> and ${numberOfCards} main topics.`
      : `Create a presentation outline for: ${prompt}

Generate the complete outline now with <TITLE> and ${numberOfCards} main topics.`;

    const result = streamText({
      model,
      system: outlineSystemPrompt
        .replace("{numberOfCards}", numberOfCards.toString())
        .replace("{language}", actualLanguage)
        .replace("{currentDate}", currentDate),
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      // No tools - just generate the outline directly
      onStepFinish: (step) => {
        console.log("----------------------------------------");
        console.log("[Outline] Step finished!");
        console.log("[Outline] Step type:", step.stepType);
        console.log("[Outline] Text length:", step.text?.length ?? 0);
        console.log("----------------------------------------");
      },
      onFinish: (result) => {
        console.log("[Outline] ========== STREAM FINISHED ==========");
        console.log("[Outline] Text length:", result.text.length);
        console.log("[Outline] Text (first 500 chars):", result.text.substring(0, 500));
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
