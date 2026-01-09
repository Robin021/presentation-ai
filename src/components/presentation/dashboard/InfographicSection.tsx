"use client";

import { INFOGRAPHIC_TEMPLATE_CATEGORIES } from "@/lib/infographic-constants";
import { BarChart3, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export function InfographicSection() {
    const router = useRouter();

    const handleCategoryClick = (categoryId: string) => {
        router.push(`/presentation/infographic?template=${categoryId}`);
    };

    const handleQuickCreate = () => {
        router.push("/presentation/infographic");
    };

    return (
        <div className="space-y-6">
            {/* Section Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            AI 信息图生成
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            使用 AI 快速创建专业信息图
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleQuickCreate}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-purple-600 hover:to-pink-600 hover:shadow-lg"
                >
                    <Sparkles className="h-4 w-4" />
                    快速创建
                </button>
            </div>

            {/* Template Categories Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {INFOGRAPHIC_TEMPLATE_CATEGORIES.map((category) => (
                    <button
                        key={category.id}
                        onClick={() => handleCategoryClick(category.id)}
                        className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center transition-all hover:border-primary hover:bg-accent hover:shadow-md"
                    >
                        <div
                            className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-transform group-hover:scale-110"
                            style={{
                                background: category.color.background,
                            }}
                        >
                            {category.icon}
                        </div>
                        <div>
                            <span className="block text-sm font-medium text-card-foreground group-hover:text-accent-foreground">
                                {category.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                                {category.nameEn}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
