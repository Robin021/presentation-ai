"use client";

import { InfographicRenderer } from "@/components/infographic-renderer";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function InfographicModal() {
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const [dsl, setDsl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleGenerate = async () => {
        if (!topic || !description) return;

        setLoading(true);
        // Don't clear previous result immediately to avoid flickering empty state if re-generating
        // setDsl(null); 

        try {
            const res = await fetch("/api/infographic/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, description }),
            });

            const data = await res.json();
            if (data.dsl) {
                setDsl(data.dsl);
                toast.success("Infographic generated!");
            } else {
                console.error(data.error);
                toast.error("Failed to generate infographic");
            }
        } catch (e) {
            console.error(e);
            toast.error("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!dsl) return;
        navigator.clipboard.writeText(dsl);
        toast.success("Syntax copied to clipboard!");
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Generate Infographic">
                    <Sparkles className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[900px] w-full max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Generate Infographic</DialogTitle>
                    <DialogDescription>
                        Use AI to generate professional infographics using AntV.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 gap-6 overflow-hidden min-h-[500px]">
                    {/* Left Panel: Controls */}
                    <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Topic</label>
                            <Input
                                placeholder="e.g. Q3 Sales Performance"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Description (Data & Context)</label>
                            <Textarea
                                placeholder="Describe your data points, trends, and what you want to highlight..."
                                className="h-40 resize-none"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={handleGenerate}
                            disabled={loading || !topic || !description}
                            className="mt-2"
                        >
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? "Generating..." : "Generate"}
                        </Button>

                        {dsl && (
                            <div className="mt-6 pt-6 border-t">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-muted-foreground">RAW SYNTAX</span>
                                    <Button variant="ghost" size="sm" onClick={handleCopy}>
                                        <Copy className="h-3 w-3 mr-1" /> Copy
                                    </Button>
                                </div>
                                <pre className="text-[10px] bg-slate-900 text-slate-50 p-3 rounded h-40 overflow-auto">
                                    {dsl}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Preview */}
                    <div className="flex-1 bg-slate-50 rounded-lg border flex items-center justify-center p-4 overflow-hidden relative">
                        {loading && !dsl && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        )}

                        {dsl ? (
                            <div className="w-full h-full">
                                <InfographicRenderer data={dsl} className="w-full h-full" />
                            </div>
                        ) : (
                            <div className="text-muted-foreground text-sm text-center">
                                Enter details and generate to see preview
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
