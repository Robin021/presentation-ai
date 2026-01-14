import { auth } from "@/server/auth";
import { NextResponse } from "next/server";
import { editInfographicSlide } from "@/lib/infographic-service";

interface EditSlideRequest {
    originalDsl: string;
    editInstruction: string;
    theme?: string;
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { originalDsl, editInstruction, theme } = await req.json() as EditSlideRequest;

        if (!originalDsl || !editInstruction) {
            return NextResponse.json(
                { error: "originalDsl and editInstruction are required" },
                { status: 400 }
            );
        }

        console.log("[Infographic Edit] Processing edit request:", {
            dslLength: originalDsl.length,
            instruction: editInstruction.substring(0, 100),
            theme
        });

        const modifiedDsl = await editInfographicSlide(originalDsl, editInstruction, theme);

        console.log("[Infographic Edit] Edit completed, new DSL length:", modifiedDsl.length);

        return NextResponse.json({ dsl: modifiedDsl });

    } catch (error) {
        console.error("[Infographic Edit] Error:", error);
        return NextResponse.json(
            { error: "Failed to edit slide" },
            { status: 500 }
        );
    }
}
