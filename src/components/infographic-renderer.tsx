"use client";

import { useEffect, useRef, useState } from "react";
import { Infographic } from "@antv/infographic";
import { ALL_VALID_TEMPLATES } from "@/lib/infographic-constants";

// Map invalid template names to valid ones (learn from browser testing)
const TEMPLATE_FIXES: Record<string, string> = {
    "chart-line-mark": "chart-line-plain-text",
    "chart-line": "chart-line-plain-text",
    "chart-column": "chart-column-simple",
    "chart-bar": "chart-bar-plain-text",
    "chart-pie": "chart-pie-plain-text",
    // Add more mappings as discovered
};

// Validate and fix template name in DSL
function fixTemplateName(dsl: string): string {
    const match = dsl.match(/^infographic\s+(\S+)/);
    if (!match) return dsl;

    let templateName = match[1];
    if (!templateName) return dsl;

    // --- Safety Valve: Dense Data Check ---
    // Pie/Donut charts with too many items (>8) cause severe overlap.
    // We automatically switch them to Bar charts which handle density better.
    const isCircular = templateName.includes('chart-pie') || templateName.includes('chart-donut') || templateName.includes('rose');
    if (isCircular) {
        // Count items
        const count = (dsl.match(/- label/g) || []).length;
        if (count > 8) {
            console.warn(`[InfographicRenderer] Detected dense circular chart (${count} items). Auto-switching to chart-bar-plain-text to prevent overlap.`);
            let newDsl = dsl.replace(`infographic ${templateName}`, `infographic chart-bar-plain-text`);

            // Aggressive Data Cleaning for Density:
            // 1. Remove redundant percentage in parens e.g. "Label (30%)" -> "Label"
            // This saves horizontal space for axis labels.
            newDsl = newDsl.replace(/(\n\s*-\s*label\s+.*?)(\s*[(（]\d+[%％][)）])/g, '$1');

            // 2. Remove redundant "Value" text in label if it repeats the numeric value
            // (Heuristic: often users put "Sales 500" in label and 500 in value)

            return newDsl; // Return immediately with new template
        }
    }

    if (!templateName) return dsl;

    // If template is valid, return unchanged
    if (ALL_VALID_TEMPLATES.includes(templateName as any)) {
        return dsl;
    }

    // Try to fix with known mapping
    if (TEMPLATE_FIXES[templateName]) {
        console.log(`[InfographicRenderer] Fixing template: ${templateName} → ${TEMPLATE_FIXES[templateName]}`);
        return dsl.replace(`infographic ${templateName}`, `infographic ${TEMPLATE_FIXES[templateName]}`);
    }

    // Try fuzzy match - find closest valid template
    const category = templateName.split('-')[0]; // e.g., "chart", "sequence"
    const fallback = ALL_VALID_TEMPLATES.find(t => t.startsWith(category + '-'));
    if (fallback) {
        console.log(`[InfographicRenderer] Fuzzy fix template: ${templateName} → ${fallback}`);
        return dsl.replace(`infographic ${templateName}`, `infographic ${fallback}`);
    }

    console.warn(`[InfographicRenderer] Unknown template: ${templateName} - using as-is`);
    return dsl;
}

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
    // Use callback ref pattern - this guarantees the element exists when we initialize
    const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
    const infographicRef = useRef<Infographic | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [renderSuccess, setRenderSuccess] = useState(false);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const lastRenderedData = useRef<string>("");

    // Callback ref to capture DOM element when it mounts
    const containerRefCallback = (element: HTMLDivElement | null) => {
        if (element && element !== containerElement) {
            setContainerElement(element);
        }
    };

    // 0. Wait for CDN script to load
    useEffect(() => {
        const checkScript = () => {
            if (typeof window !== 'undefined' && (window as any).AntVInfographic) {
                setIsScriptLoaded(true);
            } else {
                setTimeout(checkScript, 100);
            }
        };
        checkScript();
    }, []);

    // 1. Initialize Infographic instance (Run when script is loaded and container is ready)
    useEffect(() => {
        if (!isScriptLoaded) {
            console.log("[InfographicRenderer] Waiting for AntVInfographic script...");
            return;
        }
        if (!containerElement) {
            console.warn("[InfographicRenderer] Container not ready");
            return;
        }

        // Clean up any existing instance first
        if (infographicRef.current) {
            try {
                if (typeof (infographicRef.current as any).destroy === 'function') {
                    (infographicRef.current as any).destroy();
                }
            } catch (e) {
                console.warn("Failed to destroy previous instance", e);
            }
            infographicRef.current = null;
        }

        try {
            const AntVInfographic = (window as any).AntVInfographic;

            // Register icon resource loader
            const iconCache = new Map<string, any>();
            AntVInfographic.registerResourceLoader(async (config: any) => {
                const { data, scene } = config;
                try {
                    if (scene === 'icon' && data) {
                        const key = `${scene}::${data}`;
                        if (iconCache.has(key)) return iconCache.get(key);
                        const url = `https://api.iconify.design/${data}.svg`;
                        const response = await fetch(url, { referrerPolicy: 'no-referrer' });
                        if (!response.ok) return null;
                        const svgText = await response.text();
                        if (!svgText || !svgText.trim().startsWith('<svg')) return null;
                        const resource = AntVInfographic.loadSVGResource(svgText);
                        if (resource) iconCache.set(key, resource);
                        return resource;
                    }
                } catch (error) {
                    return null;
                }
                return null;
            });

            const rect = containerElement.getBoundingClientRect();
            const width = rect.width || 800;
            const height = rect.height || 500;

            console.log("[InfographicRenderer] Initializing instance", { width, height, container: containerElement });

            infographicRef.current = new AntVInfographic.Infographic({
                container: containerElement,
                width: width,
                height: height,
                editable: false,
            });

            // Force immediate render if we have data
            if (data && data.includes("infographic ") && infographicRef.current) {
                console.log("[InfographicRenderer] Performing initial render with existing data");
                const renderData = testMode ? TEST_DSL : data;
                infographicRef.current.render(renderData);
                setRenderSuccess(true);
            }
        } catch (err) {
            console.error("Failed to initialize Infographic:", err);
            setError("Failed to initialize renderer");
        }

        // Cleanup function
        return () => {
            console.log("[InfographicRenderer] Destroying instance");
            if (infographicRef.current) {
                try {
                    if (typeof (infographicRef.current as any).destroy === 'function') {
                        (infographicRef.current as any).destroy();
                    }
                    infographicRef.current = null;
                } catch (e) {
                    console.warn("Destroy failed", e);
                }
            }
        };
    }, [isScriptLoaded, containerElement]); // Re-run when script loads OR container mounts

    // 2. Handle Data Updates - with instance recreation for template changes
    useEffect(() => {
        console.log("[InfographicRenderer] Update effect running. Data Len:", data?.length, "Container:", !!containerElement);

        if (!isScriptLoaded || !containerElement) {
            console.warn("[InfographicRenderer] Script or container not ready, skipping");
            return;
        }

        let renderData = testMode ? TEST_DSL : data;

        if (!renderData) return;

        // Strip any leading junk before "infographic " (like "plain\n" or "json\n")
        const dslStart = renderData.indexOf("infographic ");
        if (dslStart > 0) {
            renderData = renderData.substring(dslStart);
        }

        // Fix any invalid template names before rendering
        renderData = fixTemplateName(renderData);

        // Validation for streaming
        if (streaming && !testMode) {
            const hasValidStructure = renderData.includes("infographic ") && renderData.includes("data");
            if (!hasValidStructure) return;
        }

        // Check for minimal valid DSL
        if (!renderData || !renderData.trim().startsWith("infographic ")) {
            console.error("[InfographicRenderer] Invalid DSL - must start with 'infographic '", renderData?.substring(0, 100));
            setError("Invalid DSL format");
            setRenderSuccess(false);
            return;
        }

        // Extract template name from DSL (first line after "infographic ")
        const templateMatch = renderData.match(/^infographic\s+(\S+)/);
        const currentTemplate = templateMatch ? templateMatch[1] : "";
        const lastTemplate = lastRenderedData.current.match(/^infographic\s+(\S+)/)?.[1] || "";

        // Check if we need to recreate the instance (template changed)
        const needsRecreation = currentTemplate !== lastTemplate && lastRenderedData.current.length > 0;

        if (needsRecreation && infographicRef.current) {
            console.log("[InfographicRenderer] Template changed from", lastTemplate, "to", currentTemplate, "- recreating instance");
            try {
                if (typeof (infographicRef.current as any).destroy === 'function') {
                    (infographicRef.current as any).destroy();
                }
            } catch (e) {
                console.warn("Failed to destroy for recreation", e);
            }
            infographicRef.current = null;
        }

        // Create instance if needed
        if (!infographicRef.current) {
            const AntVInfographic = (window as any).AntVInfographic;
            const rect = containerElement.getBoundingClientRect();
            const width = rect.width || 800;
            const height = rect.height || 500;

            console.log("[InfographicRenderer] Creating new instance for template:", currentTemplate, { width, height });

            infographicRef.current = new AntVInfographic.Infographic({
                container: containerElement,
                width: width,
                height: height,
                editable: false,
            });
        }

        try {
            setError(null);
            console.log("[InfographicRenderer] Calling ig.render() with DSL:", renderData.substring(0, 200));
            infographicRef.current!.render(renderData);
            lastRenderedData.current = renderData;
            setRenderSuccess(true);
            console.log("[InfographicRenderer] Render call completed");
        } catch (err: any) {
            console.error("[InfographicRenderer] Render failed:", err);
            setError(`Render error: ${err?.message || 'Unknown error'}`);
            setRenderSuccess(false);
        }
    }, [data, streaming, testMode, isScriptLoaded, containerElement]);

    // --- Streaming Check ---
    // If we are streaming and render hasn't succeeded yet, show the raw text building up
    if (streaming && !renderSuccess) {
        return (
            <div className={`${className} bg-gray-50 rounded-lg p-4 font-mono text-xs overflow-hidden relative border border-gray-100`}>
                <div className="absolute top-2 right-2 flex items-center gap-2 px-2 py-1 bg-white rounded-md shadow-sm border border-gray-200">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Generating DSL</span>
                </div>
                <pre className="whitespace-pre-wrap text-gray-600 h-full overflow-auto pb-8">
                    {data || "Initializing..."}
                    <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                </pre>
            </div>
        );
    }

    // Error state - show DSL for debugging
    if (error && !streaming) {
        return (
            <div className={`${className} flex flex-col items-center justify-center bg-red-50 border border-red-200 rounded-lg p-4`}>
                <div className="text-center mb-4">
                    <p className="text-red-600 font-medium">{error}</p>
                    <p className="text-xs text-gray-500 mt-1">渲染失败，以下是原始数据：</p>
                </div>
                <div className="w-full max-h-[300px] overflow-auto bg-white rounded border p-2">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">{data}</pre>
                </div>
            </div>
        );
    }

    // Fallback: if render was never successful and we have data, show it
    if (!renderSuccess && data && !streaming && data.includes("infographic ")) {
        return (
            <div className={`${className} relative`}>
                <div ref={containerRefCallback} className="w-full h-full" />
                {/* Fallback overlay - will disappear once canvas renders */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 pointer-events-none">
                    <div className="text-center text-gray-500">
                        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-sm">正在渲染...</p>
                    </div>
                </div>
            </div>
        );
    }

    return <div ref={containerRefCallback} className={className} />;
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

// Helper to calculate resolution scale based on content density
// Returns scaling factor (e.g. 1.0, 1.5, 2.0). 
// Higher scale means we render at larger resolution and scale down, effectively making fonts smaller relative to chart.
function calculateContentDensityScale(dsl: string): number {
    // Count items
    const matches = dsl.match(/- label/g);
    const count = matches ? matches.length : 0;

    // Check for "dense" templates
    const isQuadrant = dsl.includes("quadrant-");
    const isVerticalSequence = dsl.includes("sequence-roadmap") || dsl.includes("sequence-vertical");
    const isComplexList = dsl.includes("list-") && count > 6;
    const isBarChart = dsl.includes("chart-bar") || dsl.includes("chart-column");

    // Base scale
    let scale = 1.0;

    // Charts with many items need high res to prevent label overlap
    if (isBarChart && count > 8) scale = 1.25;
    else if (isBarChart && count > 5) scale = 1.1;

    // Quadrants are crowded, give them space
    if (isQuadrant) return 1.25;

    // Vertical sequences often have overlap if squashed into 16:9
    if (isVerticalSequence && count > 4) return 1.25;

    // Complex lists
    if (isComplexList) return 1.25;

    // Fallback for heavy text
    if (dsl.length > 1500) scale = Math.max(scale, 1.25);

    return scale;
}

// Helper to clean DSL data (remove commas from numbers, etc)
function cleanDslData(dsl: string): string {
    return dsl.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('value ')) {
            // ... existing cleanDslData logic ...
            const valPart = trimmed.substring(6).trim();
            // Check if it looks like a number with commas (e.g. "1,200", "70,000")
            if (/^[\d,.]+$/.test(valPart)) {
                // Remove commas
                const cleanVal = valPart.replace(/,/g, '');
                // Replace strictly the value part
                return line.replace(valPart, cleanVal);
            }
        }
        return line;
    }).join('\n');
}

// Helper to extract background color from DSL
function extractBackground(dsl: string): string | null {
    const match = dsl.match(/^\s*background\s+(#[a-fA-F0-9]{3,8})/m);
    return match?.[1] ?? null;
}

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
            let dsl = trimmedChunk.substring(dslStart);

            // Clean the DSL (fix number formats)
            dsl = cleanDslData(dsl);

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
                const densityScale = calculateContentDensityScale(dsl);
                const bg = extractBackground(dsl) || '#ffffff';

                return (
                    <div
                        key={slideKey}
                        className={`w-full rounded-2xl shadow-2xl relative group transition-all duration-300 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden ${aspectRatio ? aspectRatio : 'aspect-video'}`}
                        style={{ backgroundColor: bg }}
                    >
                        <div className="absolute -left-3 top-8 z-10 bg-primary text-primary-foreground px-4 py-1.5 rounded-r-full text-sm font-bold shadow-md flex items-center gap-2">
                            Slide {index + 1}
                        </div>

                        {/* Render Content with High-Res Scaling for Density */}
                        <div
                            className="relative origin-top-left"
                            style={{
                                width: `${densityScale * 100}%`,
                                height: `${densityScale * 100}%`,
                                transform: `scale(${1 / densityScale})`
                            }}
                        >
                            <InfographicRenderer
                                data={dsl}
                                streaming={isStreaming && index === parsedBlocks.length - 1}
                                className="w-full h-full"
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
