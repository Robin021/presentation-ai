// components/export-ppt-button.tsx
"use client";

import { exportPresentation } from "@/app/_actions/presentation/exportPresentationActions";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

type ExportMode = "editable" | "image";

export function ExportButton({
  presentationId,
  fileName = "presentation",
}: ExportPPTButtonProps) {
  const { resolvedTheme } = useTheme();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("editable");
  const { toast } = useToast();
  const theme = usePresentationState((s) => s.theme);
  const customThemeData = usePresentationState((s) => s.customThemeData);

  const handleExport = async () => {
    if (exportMode === "editable") {
      await handleEditableExport();
    } else {
      await handleImageExport();
    }
  };

  const handleImageExport = async () => {
    setIsExporting(true);
    try {
      const slides = usePresentationState.getState().slides;

      await exportPresentationAsImagesClient(
        presentationId,
        slides.length,
        fileName,
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

  const handleEditableExport = async () => {
    try {
      setIsExporting(true);

      // Build theme colors to pass to server
      const themeColors = (() => {
        const isDark = resolvedTheme === "dark";
        if (customThemeData) {
          const colors = isDark
            ? customThemeData.colors.dark
            : customThemeData.colors.light;
          return {
            primary: colors.primary.replace("#", ""),
            secondary: colors.secondary.replace("#", ""),
            accent: colors.accent.replace("#", ""),
            background: colors.background.replace("#", ""),
            text: colors.text.replace("#", ""),
            heading: colors.heading.replace("#", ""),
            muted: colors.muted.replace("#", ""),
          };
        }
        if (typeof theme === "string" && theme in themes) {
          const t = themes[theme as keyof typeof themes];
          const colors = isDark ? t.colors.dark : t.colors.light;
          return {
            primary: colors.primary.replace("#", ""),
            secondary: colors.secondary.replace("#", ""),
            accent: colors.accent.replace("#", ""),
            background: colors.background.replace("#", ""),
            text: colors.text.replace("#", ""),
            heading: colors.heading.replace("#", ""),
            muted: colors.muted.replace("#", ""),
          };
        }
        return undefined;
      })();

      // Get font face
      const fontFace = (() => {
        if (typeof theme === "string" && theme in themes) {
          return themes[theme as keyof typeof themes].fonts.body;
        }
        return "Inter";
      })();

      const result = await exportPresentation(
        presentationId,
        fileName,
        themeColors,
        fontFace,
      );

      if (result.success && result.data) {
        // Create blob from base64 data
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        });

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.fileName ?? `${fileName}.pptx`;
        document.body.appendChild(link);
        link.click();

        // Clean up
        URL.revokeObjectURL(url);
        document.body.removeChild(link);

        toast({
          title: "Export Successful",
          description: "Your presentation has been exported successfully.",
          variant: "default",
        });

        setIsExportDialogOpen(false);
      } else {
        throw new Error(result.error ?? "Export failed");
      }
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "There was an error exporting your presentation.",
        variant: "destructive",
      });
      console.error("Export error:", error);
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
            Choose how you want to export your presentation.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <RadioGroup
            defaultValue="editable"
            value={exportMode}
            onValueChange={(v) => setExportMode(v as ExportMode)}
            className="grid gap-4"
          >
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="editable" id="editable" className="mt-1" />
              <div className="grid gap-1.5">
                <Label htmlFor="editable" className="font-medium">
                  Editable PowerPoint
                </Label>
                <p className="text-sm text-muted-foreground">
                  Export as a standard PowerPoint file with editable text,
                  shapes, and images. Best for further editing.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <RadioGroupItem value="image" id="image" className="mt-1" />
              <div className="grid gap-1.5">
                <Label htmlFor="image" className="font-medium">
                  Visual Fidelity (Images)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Export each slide as a high-quality image. Preserves exact
                  visuals but content cannot be edited.
                </p>
              </div>
            </div>
          </RadioGroup>
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
