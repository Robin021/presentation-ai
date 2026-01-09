import { type Tool } from "ai";
import z from "zod";
import { searchWeb } from "@/lib/search-service";

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
      const results = await searchWeb(query);
      if (results && results.length > 0) {
        console.log(`[Search Tool] Returning ${results.length} results`);
        return JSON.stringify(results);
      }

      console.warn("[Search Tool] ⚠️ No search results returned.");
      return "Search functionality returned no results.";
    } catch (error) {
      console.error("[Search Tool] Fatal search error:", error);
      return "Search failed";
    }
  },
};
