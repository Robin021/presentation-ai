"use client";

import { getSharedPresentation } from "@/app/_actions/presentation/sharedPresentationActions";
import { getCustomThemeById } from "@/app/_actions/presentation/theme-actions";
import { LoadingState } from "@/components/presentation/presentation-page/Loading";
import { PresentationLayout } from "@/components/presentation/presentation-page/PresentationLayout";
import { PresentationSlidesView } from "@/components/presentation/presentation-page/PresentationSlidesView";
import { type PlateSlide } from "@/components/presentation/utils/parser";
import {
    setThemeVariables,
    type ThemeProperties,
    type Themes,
    themes,
} from "@/lib/presentation/themes";
import { usePresentationState } from "@/states/presentation-state";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock, Play } from "lucide-react";

export default function SharedPresentationPage() {
    const params = useParams();
    const id = params.id as string;
    const { resolvedTheme } = useTheme();

    const setCurrentPresentation = usePresentationState(
        (s) => s.setCurrentPresentation,
    );
    const setSlides = usePresentationState((s) => s.setSlides);
    const setTheme = usePresentationState((s) => s.setTheme);
    const setOutline = usePresentationState((s) => s.setOutline);
    const theme = usePresentationState((s) => s.theme);
    const customThemeData = usePresentationState((s) => s.customThemeData);
    const setIsPresenting = usePresentationState((s) => s.setIsPresenting);
    const isPresenting = usePresentationState((s) => s.isPresenting);

    // Fetch shared presentation data
    const { data, isLoading, error } = useQuery({
        queryKey: ["shared-presentation", id],
        queryFn: async () => {
            const result = await getSharedPresentation(id);
            if (!result.success) {
                throw new Error(result.message ?? "Presentation not found or not public");
            }
            return result.presentation;
        },
        enabled: !!id,
    });

    // Update presentation state when data is fetched
    useEffect(() => {
        if (data) {
            setCurrentPresentation(data.id, data.title);

            // Load slides from the database
            const presentationContent = data.presentation?.content as unknown as {
                slides: PlateSlide[];
                config: Record<string, unknown>;
            };

            setSlides(presentationContent?.slides ?? []);

            // Set outline
            if (data.presentation?.outline) {
                setOutline(data.presentation.outline);
            }

            // Set theme if available
            if (data.presentation?.theme) {
                const themeId = data.presentation.theme;

                // Check if this is a predefined theme
                if (themeId in themes) {
                    setTheme(themeId as Themes);
                } else {
                    // If not in predefined themes, treat as custom theme
                    void getCustomThemeById(themeId)
                        .then((result) => {
                            if (result.success && result.theme) {
                                // Merge name and description into the theme data
                                const rawThemeData = result.theme.themeData as unknown as ThemeProperties;
                                const themeDataWithMeta: ThemeProperties = {
                                    ...rawThemeData,
                                    name: result.theme.name,
                                    description: result.theme.description ?? rawThemeData.description ?? "",
                                };
                                setTheme(themeId, themeDataWithMeta);
                            } else {
                                console.warn("Custom theme not found:", themeId);
                                setTheme("mystique");
                            }
                        })
                        .catch((error) => {
                            console.error("Failed to load custom theme:", error);
                            setTheme("mystique");
                        });
                }
            }

            // Load config if available
            if (presentationContent?.config) {
                const { setConfig } = usePresentationState.getState();
                setConfig(presentationContent.config as Record<string, unknown>);
            }
        }
    }, [data, setCurrentPresentation, setSlides, setTheme, setOutline]);

    // Set theme variables when theme changes
    useEffect(() => {
        if (theme && resolvedTheme) {
            const state = usePresentationState.getState();
            if (state.customThemeData) {
                setThemeVariables(state.customThemeData, resolvedTheme === "dark");
            } else if (typeof theme === "string" && theme in themes) {
                const currentTheme = themes[theme as keyof typeof themes];
                if (currentTheme) {
                    setThemeVariables(currentTheme, resolvedTheme === "dark");
                }
            }
        }
    }, [theme, resolvedTheme]);

    // Get the current theme data for font loading
    const currentThemeData = (() => {
        if (customThemeData) {
            return customThemeData;
        }
        if (typeof theme === "string" && theme in themes) {
            return themes[theme as keyof typeof themes];
        }
        return null;
    })();

    const handleStartPresentation = () => {
        setIsPresenting(true);
        // Set current slide to first slide when starting
        usePresentationState.getState().setCurrentSlideIndex(0);
    };

    if (isLoading) {
        return <LoadingState />;
    }

    if (error || !data) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="rounded-full bg-muted p-4">
                        <Lock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h1 className="text-2xl font-bold">Presentation Not Available</h1>
                    <p className="max-w-md text-muted-foreground">
                        This presentation is either private, has been removed, or the link is incorrect.
                    </p>
                </div>
                <Link href="/">
                    <Button variant="outline" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Go to Homepage
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col">
            {/* Header for shared view - hide when presenting */}
            {!isPresenting && (
                <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container flex h-14 items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/">
                                <Button variant="ghost" size="sm" className="gap-2">
                                    <ArrowLeft className="h-4 w-4" />
                                    Back
                                </Button>
                            </Link>
                            <div className="border-l pl-4">
                                <h1 className="text-lg font-semibold">{data.title}</h1>
                                {data.user?.name && (
                                    <p className="text-sm text-muted-foreground">
                                        by {data.user.name}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Present button */}
                        <Button
                            onClick={handleStartPresentation}
                            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            <Play className="h-4 w-4" />
                            Present
                        </Button>
                    </div>
                </header>
            )}

            {/* Content with PresentationLayout for DnD context (needed for Plate) */}
            <div className="flex-1 overflow-hidden">
                <PresentationLayout
                    isLoading={false}
                    themeData={currentThemeData ?? undefined}
                    isShared={true}
                >
                    <div className="mx-auto max-w-[90%] space-y-8 pt-8">
                        <PresentationSlidesView isGeneratingPresentation={false} readOnly={true} />
                    </div>
                </PresentationLayout>
            </div>
        </div>
    );
}

