'use client';

import { useState, useEffect } from 'react';
import { InfographicRenderer } from './infographic-renderer';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PresentModeProps {
    slides: string[]; // Array of DSL blocks
    onClose: () => void;
}

export function InfographicPresentMode({ slides, onClose }: PresentModeProps) {
    const [currentSlide, setCurrentSlide] = useState(0);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' && currentSlide < slides.length - 1) {
                setCurrentSlide(prev => prev + 1);
            } else if (e.key === 'ArrowLeft' && currentSlide > 0) {
                setCurrentSlide(prev => prev - 1);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSlide, slides.length, onClose]);

    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gray-100 border-b">
                <div className="text-gray-800 text-sm font-medium">
                    幻灯片 {currentSlide + 1} / {slides.length}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="text-gray-600 hover:bg-gray-200"
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Main Slide */}
            <div className="flex-1 flex items-center justify-center p-8 bg-white">
                <div className="w-full h-full max-w-7xl">
                    <InfographicRenderer
                        data={slides[currentSlide]}
                        className="w-full h-full"
                    />
                </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-4 p-4 bg-gray-100 border-t">
                <Button
                    variant="ghost"
                    onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                    disabled={currentSlide === 0}
                    className="text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                >
                    <ChevronLeft className="h-5 w-5 mr-2" />
                    上一页
                </Button>

                <div className="flex gap-2">
                    {slides.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentSlide(index)}
                            className={`w-2 h-2 rounded-full transition-all ${index === currentSlide
                                ? 'bg-primary w-8'
                                : 'bg-gray-400 hover:bg-gray-500'
                                }`}
                            aria-label={`跳转到幻灯片 ${index + 1}`}
                        />
                    ))}
                </div>

                <Button
                    variant="ghost"
                    onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
                    disabled={currentSlide === slides.length - 1}
                    className="text-gray-700 hover:bg-gray-200 disabled:opacity-30"
                >
                    下一页
                    <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}
