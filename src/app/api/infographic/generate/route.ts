import { type NextRequest, NextResponse } from "next/server";
import { generateInfographic } from "@/lib/infographic-service";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { topic, description, templateHint, theme } = body;

        if (!topic || !description) {
            return NextResponse.json(
                { error: "Topic and description are required" },
                { status: 400 },
            );
        }

        const dsl = await generateInfographic({ topic, description, templateHint, theme });

        return NextResponse.json({ dsl });
    } catch (error) {
        console.error("Error generating infographic:", error);
        return NextResponse.json(
            { error: "Failed to generate infographic" },
            { status: 500 },
        );
    }
}
