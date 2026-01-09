import { env } from "@/env";
import { tavily } from "@tavily/core";

const tavilyService = env.TAVILY_API_KEY
    ? tavily({ apiKey: env.TAVILY_API_KEY })
    : null;

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
}

async function serperSearch(query: string): Promise<SearchResult[] | null> {
    // console.log("[Serper] Starting search for:", query);

    if (!env.SERPER_API_KEY) {
        console.warn("[Serper] No API key configured");
        return null;
    }

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

        if (!response.ok) {
            // specific error handling could go here
            return null;
        }

        const data = await response.json();
        const organic = data.organic || [];
        const news = data.news || [];

        return [...organic, ...news].slice(0, 5).map((item: any) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));
    } catch (error) {
        console.error("[Serper] Fetch error:", error);
        return null;
    }
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
    // 1. Try Serper
    if (env.SERPER_API_KEY) {
        const results = await serperSearch(query);
        if (results && results.length > 0) {
            return results;
        }
    }

    // 2. Fallback to Tavily
    if (tavilyService) {
        try {
            const response = await tavilyService.search(query, { max_results: 5 });
            return response.results.map((item: any) => ({
                title: item.title,
                link: item.url,
                snippet: item.content
            }));
        } catch (e) {
            console.error("Tavily search failed", e);
        }
    }

    return [];
}
