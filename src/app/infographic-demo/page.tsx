"use client";

import { useState } from "react";
import { InfographicRenderer } from "@/components/infographic-renderer";

export default function InfographicDemoPage() {
    const [topic, setTopic] = useState("");
    const [description, setDescription] = useState("");
    const [dsl, setDsl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        if (!topic || !description) return;

        setLoading(true);
        setDsl(null);

        try {
            const res = await fetch("/api/infographic/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, description }),
            });

            const data = await res.json();
            if (data.dsl) {
                setDsl(data.dsl);
            } else {
                console.error(data.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-8">AntV Infographic AI Generator</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <label className="font-medium">Topic</label>
                        <input
                            className="border p-2 rounded"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g. 2024 Sales Report"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="font-medium">Description</label>
                        <textarea
                            className="border p-2 rounded h-32"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Q1 sales were 100k, Q2 were 150k. The trend is upward."
                        />
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                    >
                        {loading ? "Generating..." : "Generate Infographic"}
                    </button>
                </div>

                <div className="border p-4 rounded min-h-[500px] bg-gray-50 flex items-center justify-center">
                    {loading ? (
                        <div>Generating...</div>
                    ) : dsl ? (
                        <InfographicRenderer data={dsl} />
                    ) : (
                        <div className="text-gray-400">Infographic will appear here</div>
                    )}
                </div>
            </div>

            {dsl && (
                <div className="mt-8">
                    <h2 className="text-xl font-bold mb-2">Generated Syntax</h2>
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded overflow-auto max-h-64">
                        {dsl}
                    </pre>
                </div>
            )}
        </div>
    );
}
