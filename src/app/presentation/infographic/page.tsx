"use client";

import { StreamingInfographic } from "@/components/infographic-renderer";
import { InfographicPresentMode } from "@/components/infographic-present";
import { InfographicHistory } from "@/components/infographic-history";
import { exportInfographicToHTML, exportInfographicToPDF, exportInfographicToPPT } from "@/lib/export-infographic";
import { saveSession, InfographicSession } from "@/lib/infographic-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { INFOGRAPHIC_TEMPLATE_CATEGORIES } from "@/lib/infographic-constants";
import { useChat } from "ai/react";
import { ArrowLeft, Copy, Download, Globe, Loader2, Sparkles, Presentation, History } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, Suspense, useMemo, useCallback } from 'react';
import { toast } from "sonner";

function InfographicPageContent() {
    const searchParams = useSearchParams();
    const initialTemplate = searchParams.get("template") || "";

    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const [templateHint, setTemplateHint] = useState(initialTemplate);
    const [theme, setTheme] = useState<"default" | "dark" | "hand-drawn" | "porsche" | "tech" | "nature" | "warm">("default");
    const [itemsCount, setItemsCount] = useState(5);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [aspectRatio, setAspectRatio] = useState("aspect-video");
    const [finalDsl, setFinalDsl] = useState<string | null>(null);
    const [isPresentMode, setIsPresentMode] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
    const [historyOpen, setHistoryOpen] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);

    // LocalStorage keys
    const STORAGE_KEY = 'infographic_last_session';

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const session = JSON.parse(saved);
                if (session.dsl && Date.now() - session.timestamp < 24 * 60 * 60 * 1000) { // 24 hours expiry
                    setFinalDsl(session.dsl);
                    setTopic(session.topic || '');
                    toast.info('已恢复上次生成的内容');
                }
            }
        } catch (e) {
            console.warn('Failed to load saved session:', e);
        }
    }, []);

    // Save to localStorage when finalDsl changes
    useEffect(() => {
        if (finalDsl) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    dsl: finalDsl,
                    topic: topic,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.warn('Failed to save session:', e);
            }
        }
    }, [finalDsl, topic]);

    // Track current state for onFinish callback (avoids stale closures)
    const stateRef = useRef({ topic, description, templateHint, theme });
    useEffect(() => {
        stateRef.current = { topic, description, templateHint, theme };
    }, [topic, description, templateHint, theme]);

    // Use streaming chat
    const { messages, append, isLoading, setMessages } = useChat({
        api: "/api/infographic/stream",
        onFinish: (message) => {
            // Extract final DSL from the completed message
            // For multi-slide content, we want to keep ALL slides
            const cleanDsl = cleanMarkdown(message.content);

            setFinalDsl(cleanDsl);

            const { topic, description, templateHint, theme } = stateRef.current;

            // Save to history
            const savedSession = saveSession({
                topic: topic || "未命名主题",
                dsl: cleanDsl,
                description,
                templateHint,
                theme,
            });
            setCurrentSessionId(savedSession.id);

            toast.success("信息图生成完成!");
        },
        onError: (error) => {
            console.error("Stream error:", error);
            toast.error("生成失败: " + error.message);
        },
    });

    // Get current streaming content
    const streamingContent = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("");

    const handleGenerate = async () => {
        if (!topic || (!webSearchEnabled && !description)) {
            toast.error("请输入主题和描述");
            return;
        }

        // Reset state and clear saved session for fresh generation
        setFinalDsl(null);
        setMessages([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            // Ignore localStorage errors
        }

        // Send request with all options
        await append(
            {
                role: "user",
                content: `主题: ${topic}${description ? `\n描述: ${description}` : ""}`,
            },
            {
                body: {
                    topic,
                    description,
                    templateHint: templateHint || undefined,
                    theme: theme !== "default" ? theme : undefined,
                    itemsCount,
                    webSearchEnabled,
                },
            }
        );
    };

    const handleCopy = () => {
        const dsl = finalDsl || streamingContent;
        if (!dsl) return;
        navigator.clipboard.writeText(dsl);
        toast.success("已复制到剪贴板!");
    };

    const handleExport = async (format: 'html' | 'pdf' | 'ppt') => {
        if (!finalDsl) {
            toast.error("请先生成信息图");
            return;
        }

        setIsExporting(true);
        setExportProgress({ current: 0, total: slides.length });

        try {
            if (format === 'html') {
                exportInfographicToHTML(finalDsl, topic || "infographic");
                toast.success("HTML 导出成功!");
            } else if (format === 'pdf') {
                await exportInfographicToPDF(
                    slides,
                    topic || "infographic",
                    (current, total) => setExportProgress({ current, total })
                );
                toast.success("PDF 导出成功!");
            } else if (format === 'ppt') {
                await exportInfographicToPPT(
                    slides,
                    topic || "infographic",
                    (current, total) => setExportProgress({ current, total })
                );
                toast.success("PPT 导出成功!");
            }
        } catch (error) {
            console.error("Export failed:", error);
            toast.error(`${format.toUpperCase()} 导出失败`);
        } finally {
            setIsExporting(false);
            setExportProgress({ current: 0, total: 0 });
        }
    };

    const handlePresent = () => {
        if (!finalDsl) {
            toast.error("请先生成信息图");
            return;
        }
        setIsPresentMode(true);
    };

    // Handle loading a session from history
    const handleSelectSession = useCallback((session: InfographicSession) => {
        setTopic(session.topic);
        setDescription(session.description || "");
        setTemplateHint(session.templateHint || "");
        if (session.theme) {
            setTheme(session.theme as any);
        }
        setFinalDsl(session.dsl);
        setCurrentSessionId(session.id);
        setMessages([]);
    }, [setMessages]);

    const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);

    // ... existing handleGenerate ...

    const handleEditSlide = async (index: number, instruction: string) => {
        if (!finalDsl) return;

        // Get current slides
        const currentSlides = finalDsl.split('---SLIDE---').map(s => s.trim()).filter(Boolean);
        const targetSlideDsl = currentSlides[index];

        if (!targetSlideDsl) {
            toast.error("未找到对应幻灯片");
            return;
        }

        setEditingSlideIndex(index);

        try {
            const response = await fetch('/api/infographic/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalDsl: targetSlideDsl,
                    editInstruction: instruction,
                    theme: theme !== "default" ? theme : undefined
                })
            });

            if (!response.ok) {
                throw new Error("编辑失败");
            }

            const data = await response.json();
            const modifiedSlideDsl = data.dsl;

            // Update local state with modified slide
            const newSlides = [...currentSlides];
            newSlides[index] = modifiedSlideDsl;
            const newFinalDsl = newSlides.join('\n\n---SLIDE---\n\n');

            setFinalDsl(newFinalDsl);
            toast.success("修改成功!");

        } catch (error) {
            console.error("Edit failed:", error);
            toast.error("修改失败，请重试");
        } finally {
            setEditingSlideIndex(null);
        }
    };

    // Parse slides from finalDsl
    const slides = useMemo(() => {
        if (!finalDsl) return [];
        return cleanMarkdown(finalDsl).split('---SLIDE---')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => {
                // Ensure each slide starts with "infographic "
                const start = s.indexOf("infographic ");
                return start >= 0 ? s.substring(start) : s;
            });
    }, [finalDsl]);

    const displayDsl = finalDsl || streamingContent;

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
                    <Link
                        href="/presentation"
                        className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span>返回主页</span>
                    </Link>
                    <div className="flex-1" />
                    <h1 className="text-lg font-semibold">AI 信息图生成器</h1>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
                        <History className="mr-2 h-4 w-4" />
                        历史
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="mx-auto px-6 py-8" style={{ maxWidth: '1800px' }}>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                    {/* Left Panel: Controls */}
                    <div className="space-y-6 lg:col-span-1 lg:sticky lg:top-8 self-start">
                        <div className="rounded-xl border bg-card p-6 shadow-sm">
                            <h2 className="mb-4 text-lg font-semibold">生成设置</h2>

                            <div className="space-y-5">
                                {/* Topic */}
                                <div className="space-y-2">
                                    <Label>主题 *</Label>
                                    <Input
                                        placeholder="例如：2024年度销售报告"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <Label>描述 {webSearchEnabled ? <span className="text-muted-foreground font-normal">(可选 - AI 将自动搜索)</span> : "*"}</Label>
                                    <Textarea
                                        placeholder={webSearchEnabled ? "可留空，或提供具体的搜索方向..." : "详细描述数据内容、趋势和需要展示的要点..."}
                                        className="h-28 resize-none"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>

                                {/* Template Type */}
                                <div className="space-y-2">
                                    <Label>模板类型</Label>
                                    <Select
                                        value={templateHint || "auto"}
                                        onValueChange={(v) => setTemplateHint(v === "auto" ? "" : v)}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="AI 自动选择" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">AI 自动选择</SelectItem>
                                            {INFOGRAPHIC_TEMPLATE_CATEGORIES.map((cat) => (
                                                <SelectItem key={cat.id} value={cat.id}>
                                                    {cat.icon} {cat.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Items Count */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label>生成页数 <span className="text-xs font-normal text-muted-foreground">(Slides)</span></Label>
                                        <span className="text-sm font-medium text-primary">{itemsCount} 页</span>
                                    </div>
                                    <Slider
                                        value={[itemsCount]}
                                        onValueChange={(val) => {
                                            if (val && val.length > 0 && val[0] !== undefined) {
                                                setItemsCount(val[0]);
                                            }
                                        }}
                                        min={1}
                                        max={20}
                                        step={1}
                                        disabled={isLoading}
                                        className="py-2"
                                    />
                                </div>

                                {/* Theme Style */}
                                <div className="space-y-2">
                                    <Label>主题配色 (Color Theme)</Label>
                                    <Select
                                        value={theme}
                                        onValueChange={(v) => setTheme(v as any)}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default">默认风格 (Default)</SelectItem>
                                            <SelectItem value="porsche">保时捷 (Porsche Red/Black)</SelectItem>
                                            <SelectItem value="tech">科技蓝 (Tech Blue)</SelectItem>
                                            <SelectItem value="nature">自然绿 (Nature Green)</SelectItem>
                                            <SelectItem value="warm">暖色系 (Warm Orange)</SelectItem>
                                            <SelectItem value="dark">深色模式 (Dark Mode)</SelectItem>
                                            <SelectItem value="hand-drawn">手绘风格 (Hand-Drawn)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Aspect Ratio */}
                                <div className="space-y-2">
                                    <Label>画布比例 (Aspect Ratio)</Label>
                                    <Select
                                        value={aspectRatio}
                                        onValueChange={(v) => setAspectRatio(v)}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="aspect-video">16:9 (宽屏演示)</SelectItem>
                                            <SelectItem value="aspect-[4/3]">4:3 (标准演示)</SelectItem>
                                            <SelectItem value="aspect-[9/16]">9:16 (手机长图)</SelectItem>
                                            <SelectItem value="aspect-square">1:1 (社交媒体)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Web Search Toggle */}
                                <div className="flex items-center justify-between rounded-lg border p-3">
                                    <div className="flex items-center gap-3">
                                        <Globe
                                            className={`h-4 w-4 ${webSearchEnabled ? "text-primary" : "text-muted-foreground"
                                                }`}
                                        />
                                        <div>
                                            <Label className="cursor-pointer">Web 搜索</Label>
                                            <p className="text-xs text-muted-foreground">
                                                搜索最新数据后生成
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={webSearchEnabled}
                                        onCheckedChange={setWebSearchEnabled}
                                        disabled={isLoading}
                                    />
                                </div>

                                {/* Generate Button */}
                                <Button
                                    onClick={handleGenerate}
                                    disabled={isLoading || !topic || (!webSearchEnabled && !description)}
                                    className="w-full gap-2"
                                    size="lg"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            生成中...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            生成信息图
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Raw Syntax */}
                        {displayDsl && (
                            <div className="rounded-xl border bg-card p-6 shadow-sm">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                                        原始语法
                                    </span>
                                    <Button variant="ghost" size="sm" onClick={handleCopy}>
                                        <Copy className="mr-1 h-3 w-3" />
                                        复制
                                    </Button>
                                </div>
                                <pre className="max-h-48 overflow-auto rounded bg-slate-900 p-3 text-[10px] text-slate-50">
                                    {displayDsl}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Preview */}
                    <div className="lg:col-span-3">
                        <div className="rounded-xl border bg-card shadow-sm">
                            <div className="flex items-center justify-between border-b px-6 py-4">
                                <h2 className="font-semibold">预览</h2>
                                {displayDsl && !isLoading && (
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={handlePresent}>
                                            <Presentation className="mr-2 h-4 w-4" />
                                            演示
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" size="sm" disabled={isExporting}>
                                                    {isExporting ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            导出中 {exportProgress.current}/{exportProgress.total}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download className="mr-2 h-4 w-4" />
                                                            导出
                                                        </>
                                                    )}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleExport('html')}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    HTML 文件
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    PDF 文档
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleExport('ppt')}>
                                                    <Download className="mr-2 h-4 w-4" />
                                                    PowerPoint 演示文稿
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )}
                            </div>
                            <div className="relative p-6">
                                {displayDsl ? (
                                    <StreamingInfographic
                                        streamingData={displayDsl}
                                        isStreaming={isLoading}
                                        aspectRatio={aspectRatio}
                                        className="w-full"
                                        onEditSlide={handleEditSlide}
                                        editingSlideIndex={editingSlideIndex}
                                    />
                                ) : (
                                    <div className="flex min-h-[600px] items-center justify-center text-muted-foreground">
                                        <div className="text-center">
                                            <Sparkles className="mx-auto mb-4 h-12 w-12 opacity-20" />
                                            <p>填写信息并点击生成</p>
                                            <p className="mt-1 text-sm">AI 将自动选择最合适的模板</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Present Mode */}
                {isPresentMode && slides.length > 0 && (
                    <InfographicPresentMode
                        slides={slides}
                        onClose={() => setIsPresentMode(false)}
                    />
                )}

                {/* History Drawer */}
                <InfographicHistory
                    open={historyOpen}
                    onOpenChange={setHistoryOpen}
                    onSelect={handleSelectSession}
                    currentSessionId={currentSessionId}
                />
            </div>
        </div>
    );
}

function LoadingFallback() {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
}

// Helper to clean Markdown fences
const cleanMarkdown = (text: string) => {
    let clean = text
        .replace(/```(?:json|plain|dsl|infographic-dsl)?\s*\n?/gi, "") // Remove opening fence
        .replace(/```\s*$/g, "") // Remove closing fence
        .trim();

    // Aggressively strip "plain", "json", etc. if they remain at the start
    // (Common issue if AI omits backticks or if regex misses)
    // We use a regex that matches these words followed by whitespace at the very start
    const junkPrefixRegex = /^(plain|json|dsl|infographic-dsl|markdown|text)\s+/i;
    while (junkPrefixRegex.test(clean)) {
        clean = clean.replace(junkPrefixRegex, '').trim();
    }

    return clean;
};

export default function InfographicPage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <InfographicPageContent />
        </Suspense>
    );
}
