export const INFOGRAPHIC_TEMPLATE_CATEGORIES = [
    {
        id: "sequence",
        name: "流程/顺序",
        nameEn: "Sequence/Flow",
        icon: "🔄",
        description: "展示步骤、流程、阶段",
        examples: ["sequence-zigzag-steps-underline-text", "sequence-circular-simple", "sequence-pyramid-simple"],
        color: { background: "rgba(59, 130, 246, 0.1)", color: "#3B82F6" },
    },
    {
        id: "compare",
        name: "对比",
        nameEn: "Compare",
        icon: "⚖️",
        description: "二元或多元对比分析",
        examples: ["compare-binary-horizontal-underline-text-vs", "compare-swot", "compare-binary-horizontal-badge-card-arrow"],
        color: { background: "rgba(239, 68, 68, 0.1)", color: "#EF4444" },
    },
    {
        id: "hierarchy",
        name: "层级/结构",
        nameEn: "Hierarchy",
        icon: "🌳",
        description: "组织架构、树形关系",
        examples: ["hierarchy-tree-tech-style-badge-card", "hierarchy-tree-curved-line-rounded-rect-node"],
        color: { background: "rgba(34, 197, 94, 0.1)", color: "#22C55E" },
    },
    {
        id: "chart",
        name: "数据图表",
        nameEn: "Chart",
        icon: "📊",
        description: "饼图、柱状图、折线图等",
        examples: ["chart-pie-plain-text", "chart-bar-plain-text", "chart-line-plain-text"],
        color: { background: "rgba(168, 85, 247, 0.1)", color: "#A855F7" },
    },
    {
        id: "list",
        name: "列表",
        nameEn: "List",
        icon: "📋",
        description: "项目列表、网格展示",
        examples: ["list-grid-badge-card", "list-row-horizontal-icon-arrow"],
        color: { background: "rgba(249, 115, 22, 0.1)", color: "#F97316" },
    },
    {
        id: "relation",
        name: "关系",
        nameEn: "Relation",
        icon: "🔗",
        description: "概念关系、连接展示",
        examples: ["relation-circle-icon-badge"],
        color: { background: "rgba(6, 182, 212, 0.1)", color: "#06B6D4" },
    },
    {
        id: "quadrant",
        name: "象限",
        nameEn: "Quadrant",
        icon: "⊞",
        description: "四象限、矩阵分析",
        examples: ["quadrant-quarter-simple-card", "quadrant-quarter-circular"],
        color: { background: "rgba(16, 185, 129, 0.1)", color: "#10B981" },
    }
] as const;

export type InfographicTemplateCategory = typeof INFOGRAPHIC_TEMPLATE_CATEGORIES[number]["id"];

// Complete template list from prompt.md (33+ templates)
export const ALL_VALID_TEMPLATES = [
    // Sequence (12 templates)
    "sequence-zigzag-steps-underline-text",
    "sequence-horizontal-zigzag-underline-text",
    "sequence-circular-simple",
    "sequence-filter-mesh-simple",
    "sequence-mountain-underline-text",
    "sequence-cylinders-3d-simple",
    "sequence-ascending-steps",
    "sequence-color-snake-steps-horizontal-icon-line",
    "sequence-pyramid-simple",
    "sequence-roadmap-vertical-simple",
    "sequence-zigzag-pucks-3d-simple",
    "sequence-ascending-stairs-3d-underline-text",

    // Compare (5 templates)
    "compare-binary-horizontal-simple-fold",
    "compare-hierarchy-left-right-circle-node-pill-badge",
    "compare-swot",
    "compare-binary-horizontal-badge-card-arrow",
    "compare-binary-horizontal-underline-text-vs",

    // Quadrant (2 templates)
    "quadrant-quarter-simple-card",
    "quadrant-quarter-circular",

    // List (5 templates)
    "list-grid-badge-card",
    "list-grid-candy-card-lite",
    "list-grid-ribbon-card",
    "list-row-horizontal-icon-arrow",
    "list-sector-plain-text",

    // Relation (1 template)
    "relation-circle-icon-badge",

    // Hierarchy (3 templates)
    "hierarchy-tree-tech-style-capsule-item",
    "hierarchy-tree-curved-line-rounded-rect-node",
    "hierarchy-tree-tech-style-badge-card",

    // Chart (7 templates)
    "chart-column-simple",
    "chart-bar-plain-text",
    "chart-line-plain-text",
    "chart-pie-plain-text",
    "chart-pie-compact-card",
    "chart-pie-donut-plain-text",
    "chart-pie-donut-pill-badge"
] as const;

export interface InfographicGenerateOptions {
    topic: string;
    description: string;
    templateHint?: string; // Optional hint for template category
    theme?: "default" | "dark" | "hand-drawn";
    itemsCount?: number;
    webSearchEnabled?: boolean;
}
