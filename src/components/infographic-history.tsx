
"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Trash2, History, RotateCcw, FileText, BarChart3, Clock, X } from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InfographicSession, getHistory, deleteSession, clearHistory } from "@/lib/infographic-storage";
import { toast } from "sonner";

interface InfographicHistoryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (session: InfographicSession) => void;
    currentSessionId?: string;
}

export function InfographicHistory({
    open,
    onOpenChange,
    onSelect,
    currentSessionId
}: InfographicHistoryProps) {
    const [history, setHistory] = useState<InfographicSession[]>([]);

    const loadHistory = () => {
        setHistory(getHistory());
    };

    // Reload history when opened
    useEffect(() => {
        if (open) {
            loadHistory();
        }
    }, [open]);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        deleteSession(id);
        loadHistory();
        toast.success("已删除记录");
    };

    const handleClear = () => {
        if (confirm("确定要清空所有历史记录吗？")) {
            clearHistory();
            loadHistory();
            toast.success("已清空历史记录");
        }
    };

    const handleSelect = (session: InfographicSession) => {
        onSelect(session);
        onOpenChange(false);
        toast.success("已加载历史版本");
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
                <SheetHeader className="p-6 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        生成历史
                    </SheetTitle>
                    <SheetDescription>
                        最近保存的 20 条生成记录
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-hidden relative">
                    {history.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6">
                            <Clock className="h-12 w-12 mb-4 opacity-20" />
                            <p>暂无历史记录</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-full">
                            <div className="p-6 space-y-4">
                                {history.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelect(item)}
                                        className={`
                                            group relative border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md
                                            ${currentSessionId === item.id ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'hover:bg-muted/50 bg-card'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold text-sm line-clamp-1 pr-8">
                                                {item.topic || "未命名主题"}
                                            </h4>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                onClick={(e) => handleDelete(e, item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: zhCN })}
                                            </span>

                                            {item.theme && (
                                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded">
                                                    <span className="w-2 h-2 rounded-full" style={{
                                                        backgroundColor: item.theme === 'porsche' ? '#E60012' :
                                                            item.theme === 'nature' ? '#22c55e' : '#3b82f6'
                                                    }} />
                                                    {item.theme}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </div>

                {history.length > 0 && (
                    <SheetFooter className="p-6 border-t mt-auto">
                        <Button variant="outline" size="sm" onClick={handleClear} className="w-full text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            清空所有记录
                        </Button>
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
}
