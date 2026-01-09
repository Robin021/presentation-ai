"use client";

import { useEffect, useRef, useState } from "react";
import { Infographic } from "@antv/infographic";

// Known-working test DSL for debugging
const TEST_DSL = `infographic list-row-horizontal-icon-arrow
data
  title Test Infographic
  desc Testing the renderer
  items
    - label Step 1
      desc First step description
      icon mdi/numeric-1-circle
    - label Step 2
      desc Second step description
      icon mdi/numeric-2-circle
    - label Step 3
      desc Third step description
      icon mdi/numeric-3-circle
theme
  palette #3b82f6 #8b5cf6 #f97316`;

interface InfographicRendererProps {
    data: string;
    theme?: string;
    className?: string;
    streaming?: boolean;
    testMode?: boolean; // Enable to use TEST_DSL for debugging
}

export function InfographicRenderer({
    data,
    theme = "light",
    className = "w-full h-[500px]",
    streaming = false,
    testMode = false,
}: InfographicRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const infographicRef = useRef<Infographic | null>(null);
    const [error, setError] = useState<string | null>(null);
    const lastRenderedData = useRef<string>("");

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize only once
        if (!infographicRef.current) {
            try {
                // Register icon resource loader BEFORE creating Infographic instance
                if (typeof window !== 'undefined' && (window as any).AntVInfographic) {
                    const AntVInfographic = (window as any).AntVInfographic;

                    // Icon cache to avoid redundant fetches
                    const iconCache = new Map<string, any>();

                    AntVInfographic.registerResourceLoader(async (config: any) => {
                        const { data, scene } = config;

                        try {
                            // Handle MDI icons (mdi/icon-name format)
                            if (scene === 'icon' && data) {
                                const key = `${scene}::${data}`;

                                // Check cache first
                                if (iconCache.has(key)) {
                                    return iconCache.get(key);
                                }

                                // Fetch from Iconify API
                                const url = `https://api.iconify.design/${data}.svg`;
                                const response = await fetch(url, { referrerPolicy: 'no-referrer' });

                                if (!response.ok) {
                                    console.warn(`Failed to load icon: ${data}`);
                                    return null;
                                }

                                const svgText = await response.text();

                                if (!svgText || !svgText.trim().startsWith('<svg')) {
                                    console.warn(`Invalid SVG for icon: ${data}`);
                                    return null;
                                }

                                const resource = AntVInfographic.loadSVGResource(svgText);

                                if (resource) {
                                    iconCache.set(key, resource);
                                }

                                return resource;
                            }
                        } catch (error) {
                            console.error(`Error loading resource ${data}:`, error);
                            return null;
                        }

                        return null;
                    });
                }

                // Get container dimensions
                const rect = containerRef.current.getBoundingClientRect();
                const width = rect.width || 800;
                const height = rect.height || 500;

                console.log("[InfographicRenderer] Container dimensions:", { width, height });

                infographicRef.current = new Infographic({
                    container: containerRef.current,
                    width: width,
                    height: height,
                    editable: false,
                });
            } catch (err) {
                console.error("Failed to initialize Infographic:", err);
                setError("Failed to initialize renderer");
                return;
            }
        }

        const ig = infographicRef.current;

        // Use test DSL if testMode is enabled
        const renderData = testMode ? TEST_DSL : data;

        console.log("[InfographicRenderer] Init/Update", {
            dataLength: renderData?.length,
            hasContainer: !!containerRef.current,
            streaming
        });

        if (!renderData) {
            console.warn("[InfographicRenderer] No data provided");
            return;
        }

        // Skip if data hasn't changed (for streaming optimization)
        if (renderData === lastRenderedData.current) {
            console.log("[InfographicRenderer] Skipping render, data unchanged");
            return;
        }

        // For streaming: only render if we have meaningful content
        if (streaming && !testMode) {
            const hasValidStructure = renderData.includes("infographic ") && renderData.includes("data");
            if (!hasValidStructure) {
                console.log("[InfographicRenderer] Waiting for valid structure...");
                return;
            }
        }

        // Render with data
        try {
            setError(null);
            console.log("[InfographicRenderer] Rendering DSL:", renderData.substring(0, 100) + "...");
            ig.render(renderData);
            console.log("[InfographicRenderer] Render completed successfully");
            lastRenderedData.current = renderData;
        } catch (err) {
            console.error("[InfographicRenderer] Failed to render:", err);
            if (!streaming) {
                console.error("Failed to render infographic:", err);
                setError("Failed to render");
            }
        }

        return () => {
            // Cleanup checks
        };
    }, [data, theme, streaming, testMode]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (infographicRef.current) {
                try {
                    if (typeof (infographicRef.current as any).destroy === 'function') {
                        (infographicRef.current as any).destroy();
                    }
                    infographicRef.current = null;
                } catch (e) {
                    console.warn("Failed to destroy infographic instance", e);
                }
            }
        };
    }, []);

    if (error && !streaming) {
        return (
            <div className={`${className} flex items-center justify-center text-muted-foreground`}>
                <div className="text-center">
                    <p className="text-sm">{error}</p>
                    <p className="text-xs mt-1">Check console for details</p>
                </div>
            </div>
        );
    }

    return <div ref={containerRef} className={className} />;
}

// --- Streaming Component ---

interface StreamingInfographicProps {
    streamingData: string;
    isStreaming: boolean;
    className?: string;
    aspectRatio?: string;
    onEditSlide?: (index: number, instruction: string) => Promise<void>;
    editingSlideIndex?: number | null;
}

// --- Edit Panel Component ---

interface EditPanelProps {
    onEdit: (instruction: string) => void;
    isEditing: boolean;
}

function EditPanel({ onEdit, isEditing }: EditPanelProps) {
    const [instruction, setInstruction] = useState("");

    const handleSubmit = () => {
        if (!instruction.trim()) return;
        onEdit(instruction);
        setInstruction("");
    };

    return (
        <div className="absolute inset-x-0 bottom-0 z-20 translate-y-[95%] px-6 pb-6 pt-12 transition-all duration-300 group-hover:translate-y-0">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent" />
            <div className="relative flex items-end gap-2">
                <div className="relative flex-1">
                    <div className="pointer-events-none absolute left-3 top-3 text-muted-foreground">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <textarea
                        className="min-h-[80px] w-full resize-none rounded-xl border bg-white pl-9 pr-3 pt-2.5 text-sm shadow-sm transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="输入修改建议 (例如：把标题改成中文，或把数据改成饼图)..."
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                    />
                </div>
                <Button
                    onClick={handleSubmit}
                    disabled={!instruction.trim() || isEditing}
                    className="h-[80px] px-6"
                >
                    {isEditing ? (
                        <div className="flex flex-col items-center gap-1">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-xs">修改中</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1">
                            <Send className="h-4 w-4" />
                            <span className="text-xs">应用</span>
                        </div>
                    )}
                </Button>
            </div>
        </div>
    );
}

// Reuse icons from page or import them if needed
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StreamingInfographic({
    streamingData,
    isStreaming,
    className = "w-full h-[500px]",
    aspectRatio,
    onEditSlide,
    editingSlideIndex,
}: StreamingInfographicProps) {
    // Clean markdown code blocks
    const cleanData = streamingData
        .replace(/```json\n?/g, "")
        .replace(/```plain\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

    // Split by ---SLIDE--- to get individual slides
    const rawChunks = cleanData.split("---SLIDE---");

    const parsedBlocks: string[] = [];
    let analysisText = "";

    // Process each chunk
    rawChunks.forEach((chunk, index) => {
        const trimmedChunk = chunk.trim();
        if (!trimmedChunk) return;

        // Check if this chunk contains DSL (starts with "infographic ")
        const dslStart = trimmedChunk.indexOf("infographic ");

        if (dslStart >= 0) {
            // This is a DSL block
            const dsl = trimmedChunk.substring(dslStart);
            parsedBlocks.push(dsl);

            // If there's text before the DSL in the first chunk, that's analysis
            if (index === 0 && dslStart > 0) {
                analysisText = trimmedChunk.substring(0, dslStart).trim();
            }
        } else if (index === 0 && parsedBlocks.length === 0) {
            // First chunk with no DSL yet - probably analysis or thinking text
            analysisText = trimmedChunk;
        }
    });

    const hasAnalysis = analysisText.length > 0;

    // Loading state while streaming with no parsed blocks yet
    if (parsedBlocks.length === 0 && streamingData.length > 0 && isStreaming) {
        return (
            <div className={`relative ${className}`}>
                <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground animate-in fade-in rounded-xl border bg-card/50">
                    <div className="mb-4 h-8 w-8 animate-spin text-primary opacity-50">
                        <LoaderIcon />
                    </div>
                    <div className="max-w-md space-y-2">
                        <p className="font-medium text-foreground">AI 正在构建数据结构...</p>
                        <p className="text-sm whitespace-pre-wrap opacity-80 text-left line-clamp-4">{analysisText || streamingData}</p>
                    </div>
                </div>
            </div>
        );
    }

    // Error State: No blocks parsed and not streaming
    if (parsedBlocks.length === 0 && !isStreaming) {
        return (
            <div className="p-8 text-red-500 bg-red-50 rounded-xl border border-red-200">
                <h3 className="font-bold mb-2">生成失败 (Empty Response)</h3>
                <p className="text-sm text-gray-600 mb-4">AI 未返回任何有效数据，可能是因为搜索超时或模型被截断。</p>
                <div className="bg-white p-4 rounded border text-xs font-mono text-gray-800 whitespace-pre-wrap max-h-96 overflow-auto">
                    {streamingData || "(Empty Content)"}
                </div>
            </div>
        );
    }

    // Success: Render all parsed slides
    return (
        <div className={`relative flex flex-col gap-12 ${className} h-auto min-h-[500px] overflow-visible px-4 pb-12`}>
            {/* Analysis Summary */}
            {hasAnalysis && (
                <div className="flex flex-col p-6 rounded-2xl bg-muted/30 text-muted-foreground/90 text-sm border-l-4 border-primary">
                    <div className="font-semibold text-foreground mb-3 flex items-center gap-2 text-base">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
                        AI 数据分析
                    </div>
                    <div className="whitespace-pre-wrap pl-2 leading-relaxed">
                        {analysisText}
                    </div>
                </div>
            )}

            {/* Render Infographic Slides */}
            {parsedBlocks.map((dsl, index) => {
                // Use stable key during streaming to prevent remounting/flickering
                // Use dynamic key during editing/static view to ensure updates are reflected
                const slideKey = isStreaming ? index : `${index}-${dsl.length}-${dsl.substring(0, 20)}`;

                return (
                    <div
                        key={slideKey}
                        className={`w-full rounded-2xl bg-white shadow-2xl relative group transition-all duration-300 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden ${aspectRatio ? aspectRatio : 'aspect-video'}`}
                        style={{ minHeight: '500px' }}
                    >
                        <div className="absolute -left-3 top-8 z-10 bg-primary text-primary-foreground px-4 py-1.5 rounded-r-full text-sm font-bold shadow-md flex items-center gap-2">
                            Slide {index + 1}
                        </div>

                        {/* Render Content */}
                        <div className="relative h-full w-full">
                            <InfographicRenderer
                                data={dsl}
                                streaming={false}
                                className="w-full h-full min-h-[500px]"
                                testMode={false}
                            />
                            {/* Loading Overlay when editing this specific slide */}{editingSlideIndex === index && (<div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"> <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary" /> <p className="font-medium text-primary">正在重新生成...</p> </div>)}
                        </div>

                        {/* Edit Panel - Only show if not currently streaming initial content and onEdit callback is provided */}
                        {!isStreaming && onEditSlide && (
                            <EditPanel
                                onEdit={(instruction) => onEditSlide(index, instruction)}
                                isEditing={editingSlideIndex === index}
                            />
                        )}
                    </div>
                );
            })}

            {isStreaming && (
                <div className="fixed bottom-8 right-8 flex items-center gap-3 rounded-full bg-black/90 backdrop-blur shadow-2xl px-6 py-4 text-sm text-white z-50 animate-in slide-in-from-bottom-5 border border-white/10">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-medium tracking-wide">
                        {parsedBlocks.length > 0
                            ? `正在渲染 Slide ${parsedBlocks.length + 1}...`
                            : "AI 思考中..."}
                    </span>
                </div>
            )}
        </div>
    );
}

function LoaderIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );
}
