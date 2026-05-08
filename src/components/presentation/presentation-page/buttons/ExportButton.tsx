// components/export-ppt-button.tsx
"use client";

import { exportPresentationAsImagesClient } from "@/components/presentation/utils/exportToImageClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { themes } from "@/lib/presentation/themes";
import { usePresentationState } from "@/states/presentation-state";
import { Download } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

interface ExportPPTButtonProps {
  presentationId: string;
  fileName?: string;
}

export function ExportButton({
  presentationId,
  fileName = "presentation",
}: ExportPPTButtonProps) {
  const { resolvedTheme } = useTheme();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const state = usePresentationState.getState();
      const slides = state.slides;
      const isDark = resolvedTheme === "dark";

      const themeOptions = (() => {
        const rawColors = (() => {
          if (state.customThemeData) {
            return isDark
              ? state.customThemeData.colors.dark
              : state.customThemeData.colors.light;
          }
          if (typeof state.theme === "string" && state.theme in themes) {
            const t = themes[state.theme as keyof typeof themes];
            return isDark ? t.colors.dark : t.colors.light;
          }
          return null;
        })();
        if (!rawColors) return undefined;

        const headingFont = (() => {
          if (state.customThemeData) return state.customThemeData.fonts.heading;
          if (typeof state.theme === "string" && state.theme in themes)
            return themes[state.theme as keyof typeof themes].fonts.heading;
          return undefined;
        })();
        const bodyFont = (() => {
          if (state.customThemeData) return state.customThemeData.fonts.body;
          if (typeof state.theme === "string" && state.theme in themes)
            return themes[state.theme as keyof typeof themes].fonts.body;
          return undefined;
        })();
        return { themeColors: rawColors, headingFont, bodyFont, isDark };
      })();

      await exportPresentationAsImagesClient(
        presentationId,
        slides.length,
        fileName,
        themeOptions,
      );

      toast({
        title: "Export Successful",
        description: "Your presentation has been exported as images.",
        variant: "default",
      });
      setIsExportDialogOpen(false);
    } catch (error) {
      console.error("Image export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export presentation as images.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <Download className="mr-1 h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Presentation</DialogTitle>
          <DialogDescription>
            Export your presentation as high-quality images in a PowerPoint file.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="rounded-md border p-4">
            <div className="grid gap-1.5">
              <Label className="font-medium">
                Visual Fidelity (Images)
              </Label>
              <p className="text-sm text-muted-foreground">
                Export each slide as a high-quality image. Preserves exact
                visuals but content cannot be edited.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsExportDialogOpen(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export to PowerPoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
