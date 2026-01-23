import { auth } from "@/server/auth";
import { NextResponse } from "next/server";
import { createInfographicStream } from "@/lib/infographic-service";

interface InfographicStreamRequest {
    topic: string;
    description: string;
    templateHint?: string;
    theme?: "default" | "dark" | "hand-drawn"; // Align with service types
    itemsCount?: number;
    webSearchEnabled?: boolean;
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const requestBody = await req.json();

        // Handle both direct API calls and useChat hook format
        // useChat sends: { messages: [...], data: {...}, body: {...} }
        // Direct calls send: { topic, description, ... }
        const params = requestBody.body || requestBody;

        const {
            topic,
            description,
            templateHint,
            theme,
            itemsCount = 5,
            webSearchEnabled = false,
        } = params as InfographicStreamRequest;

        if (!topic || (!webSearchEnabled && !description)) {
            return NextResponse.json(
                { error: "Topic is required. Description is required when web search is disabled." },
                { status: 400 }
            );
        }

        // Create a ReadableStream that pulls from the generator
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const generator = createInfographicStream({
                        topic,
                        description,
                        templateHint,
                        theme,
                        itemsCount,
                        webSearchEnabled
                    });

                    for await (const chunk of generator) {
                        // Manual Data Stream Protocol (v1)
                        // 0:{string}\n -> Text part
                        // We must escape the chunk carefully so it fits valid JSON string
                        const protocolChunk = `0:${JSON.stringify(chunk)}\n`;
                        controller.enqueue(new TextEncoder().encode(protocolChunk));
                    }
                    controller.close();
                } catch (error) {
                    console.error("Stream generation failed:", error);
                    // Try to send error frame if possible
                    controller.error(error);
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-Vercel-AI-Data-Stream": "v1",
            },
        });

    } catch (error) {
        console.error("[Infographic Stream] Fatal error:", error);
        return NextResponse.json(
            { error: "Failed to generate infographic" },
            { status: 500 }
        );
    }
}
