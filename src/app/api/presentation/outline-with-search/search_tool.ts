import { env } from "@/env";
import { tavily } from "@tavily/core";
import { type Tool } from "ai";
import z from "zod";

// Debug: Log search provider configuration on startup
console.log("[Search Tool Init] SERPER_API_KEY configured:", !!env.SERPER_API_KEY);
console.log("[Search Tool Init] TAVILY_API_KEY configured:", !!env.TAVILY_API_KEY);

const tavilyService = env.TAVILY_API_KEY
  ? tavily({ apiKey: env.TAVILY_API_KEY })
  : null;

async function serperSearch(query: string) {
  console.log("[Serper] Starting search for:", query);

  if (!env.SERPER_API_KEY) {
    console.warn("[Serper] No API key configured");
    return null;
  }

  console.log("[Serper] API key present (length:", env.SERPER_API_KEY.length, ")");

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 5,
      }),
    });

    console.log("[Serper] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Serper] API error response:", errorText);
      throw new Error(`Serper API error: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log("[Serper] Response data keys:", Object.keys(data));
    console.log("[Serper] Organic results count:", data.organic?.length ?? 0);
    console.log("[Serper] News results count:", data.news?.length ?? 0);
    return data;
  } catch (error) {
    console.error("[Serper] Fetch error:", error);
    throw error;
  }
}

export const search_tool: Tool = {
  description:
    "A search engine optimized for comprehensive, accurate, and trusted results. Useful for when you need to answer questions about current events like news, weather, stock price etc. Input should be a search query.",
  parameters: z.object({
    query: z.string(),
  }),
  execute: async ({ query }: { query: string }) => {
    console.log("============================================");
    console.log("[Search Tool] 🔍 TOOL CALLED!");
    console.log("[Search Tool] Query:", query);
    console.log("[Search Tool] Timestamp:", new Date().toISOString());
    console.log("============================================");

    try {

      // Prioritize Serper if configured
      if (env.SERPER_API_KEY) {
        console.log("[Search Tool] Using Serper API");
        try {
          const serperResult = await serperSearch(query);
          if (serperResult) {
            console.log("[Search Tool] Serper search successful");
            // Parse specifically for organic or news results to keep context concise
            const organic = serperResult.organic || [];
            const news = serperResult.news || [];
            const combined = [...organic, ...news].slice(0, 5).map((item: any) => ({
              title: item.title,
              link: item.link,
              snippet: item.snippet
            }));
            const resultString = JSON.stringify(combined);
            console.log(`[Search Tool] Returning ${combined.length} results`);
            return resultString;
          }
        } catch (e) {
          console.error("[Search Tool] Serper search failed:", e);
        }
      }

      // Fallback to Tavily if configured
      if (tavilyService) {
        console.log("[Search Tool] Using Tavily API");
        const response = await tavilyService.search(query, { max_results: 5 });
        console.log("[Search Tool] Tavily search successful");
        return JSON.stringify(response);
      }

      console.warn("[Search Tool] ⚠️ No search provider configured!");
      console.warn("[Search Tool] SERPER_API_KEY:", env.SERPER_API_KEY ? "set" : "NOT SET");
      console.warn("[Search Tool] TAVILY_API_KEY:", env.TAVILY_API_KEY ? "set" : "NOT SET");
      return "Search functionality is currently unavailable (No Search API key configured).";
    } catch (error) {
      console.error("[Search Tool] Fatal search error:", error);
      return "Search failed";
    }
  },
};
