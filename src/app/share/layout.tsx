import type React from "react";

/**
 * Layout for shared/public presentation pages.
 * This layout is completely independent and does NOT include:
 * - PresentationHeader (with Export, Share, Present buttons)
 * - PresentationGenerationManager
 * - Any authentication-required components
 */
export default function ShareLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col supports-[(height:100dvh)]:min-h-[100dvh]">
            {children}
        </div>
    );
}
