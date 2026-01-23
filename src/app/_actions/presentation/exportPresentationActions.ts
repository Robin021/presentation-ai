"use server";

import { type PlateSlide } from "@/components/presentation/utils/parser";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import PptxGenJS from "pptxgenjs";

// Types
interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  heading: string;
  muted: string;
}

interface ExportResult {
  success: boolean;
  data?: string;
  fileName?: string;
  error?: string;
}

interface ElementMeasurement {
  index: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  styles: {
    fontSize: string;
    fontWeight: string;
    color: string;
    textAlign: string;
  };
}

// Layout Engine Types
interface RenderGroup {
  elements: ElementMeasurement[];
  x: number;
  y: number;
  w: number;
  hWeb: number; // Height as measured on Web
}

interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number; // Estimated occupied height in PPT
}

// Constants for conversion
const SLIDE_WIDTH_INCHES = 10;
const SLIDE_HEIGHT_INCHES = 5.625;
const RENDER_WIDTH_PX = 1920;
const RENDER_HEIGHT_PX = 1080;

// Convert pixels to inches based on render dimensions
const pxToInchX = (px: number) => (px / RENDER_WIDTH_PX) * SLIDE_WIDTH_INCHES;
const pxToInchY = (px: number) => (px / RENDER_HEIGHT_PX) * SLIDE_HEIGHT_INCHES;

/**
 * Export presentation using DOM measurement approach
 * Renders slides, measures element positions, creates PPT with accurate layout
 */
// Export presentation using Legacy converter (which supports Shapes/Wireframes)
export async function exportPresentation(
  presentationId: string,
  fileName?: string,
  theme?: Partial<ThemeColors>,
): Promise<ExportResult> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    const { convertPlateJSToPPTX } = await import(
      "@/components/presentation/utils/exportToPPT"
    );

    const presentationData = await fetchPresentationData(
      presentationId,
      session.user.id,
    );

    const arrayBuffer = await convertPlateJSToPPTX(
      { slides: presentationData.slides },
      theme,
    );

    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    return {
      success: true,
      data: base64,
      fileName: `${fileName ?? "presentation"}.pptx`,
    };
  } catch (error) {
    console.error("Error exporting presentation:", error);
    return { success: false, error: "Failed to export presentation" };
  }
}

// Helper to push group to queue
function pushGroup(elements: ElementMeasurement[], queue: RenderGroup[]) {
  if (elements.length === 0) return;

  // Calculate bounding box
  const first = elements[0];
  const last = elements[elements.length - 1];

  if (!first || !last) return;

  // Width: max width of elements
  const pElements = elements.filter(i => ["p", "text", "bullet-item"].includes(i.type));
  const refElements = pElements.length > 0 ? pElements : elements;
  const maxW = Math.max(...refElements.map(i => i.width));

  const x = first.x;
  const y = first.y;
  // Estimated Web Height: (Last Y + Last H) - First Y
  const hWeb = (last.y + last.height) - first.y;

  queue.push({
    elements,
    x,
    y,
    w: maxW,
    hWeb: Math.max(hWeb, 20) // Min height 20px
  });
}

/**
 * Add measured element helper (for single/legacy rendering)
 */
async function addMeasuredElement(
  slide: PptxGenJS.Slide,
  measurement: ElementMeasurement,
  themeColors: ThemeColors
): Promise<void> {
  const { type, x, y, width, height, text, styles } = measurement;

  // Convert px to inches
  const xInch = pxToInchX(x);
  const yInch = pxToInchY(y);
  const wInch = pxToInchX(width);
  const hInch = pxToInchY(height);

  // Parse font size (e.g., "72px" -> 54pt)
  const fontSizeMatch = styles.fontSize.match(/(\d+)/);
  const fontSizePx = fontSizeMatch && fontSizeMatch[1] ? parseInt(fontSizeMatch[1], 10) : 24;
  // Reduce conversion factor further (0.55) to strictly enforce no-overflow
  const fontSizePt = Math.round(fontSizePx * 0.55);

  // Determine if bold
  const isBold = styles.fontWeight === "bold" || parseInt(styles.fontWeight, 10) >= 600;

  // Use exact measured height
  const hInchAdjusted = hInch;

  // Parse color (rgb(r, g, b) -> hex)
  let color = themeColors.text;
  const rgbMatch = styles.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
    color = `${r}${g}${b}`;
  }

  // Text alignment
  type TextAlign = "left" | "center" | "right" | "justify" | undefined;
  const align: TextAlign = (styles.textAlign as TextAlign) || "left";

  // Common text options
  const commonOptions = {
    fontFace: "Inter",
    align,
    inset: 0,
    // Removed fixed lineSpacing to fix Header overlap
  };

  switch (type) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
      slide.addText(text, {
        x: xInch,
        y: yInch,
        w: wInch,
        h: hInchAdjusted,
        fontSize: fontSizePt,
        bold: true,
        color: themeColors.accent,
        valign: "middle",
        ...commonOptions,
      });
      break;

    case "p":
    case "text":
      slide.addText(text, {
        x: xInch,
        y: yInch,
        w: wInch,
        h: hInchAdjusted,
        fontSize: fontSizePt,
        bold: isBold,
        color,
        valign: "top",
        wrap: true,
        ...commonOptions,
      });
      break;

    default:
      if (text.trim()) {
        slide.addText(text, {
          x: xInch,
          y: yInch,
          w: wInch,
          h: hInch,
          fontSize: fontSizePt,
          color,
          fontFace: "Inter",
          align,
          valign: "top",
          wrap: true,
        });
      }
  }
}

/**
 * Add root image to slide
 */
async function addRootImageToSlide(
  slide: PptxGenJS.Slide,
  rootImage: { url?: string; query?: string },
  layoutType: string
): Promise<void> {
  if (!rootImage.url) return;

  let imageOptions: PptxGenJS.ImageProps = {
    path: rootImage.url,
    x: 0,
    y: 0,
    w: SLIDE_WIDTH_INCHES,
    h: SLIDE_HEIGHT_INCHES,
  };

  switch (layoutType) {
    case "left":
      imageOptions = {
        ...imageOptions,
        w: SLIDE_WIDTH_INCHES * 0.45,
        h: SLIDE_HEIGHT_INCHES,
      };
      break;
    case "right":
      imageOptions = {
        ...imageOptions,
        x: SLIDE_WIDTH_INCHES * 0.55,
        w: SLIDE_WIDTH_INCHES * 0.45,
        h: SLIDE_HEIGHT_INCHES,
      };
      break;
    case "vertical":
      imageOptions = {
        ...imageOptions,
        y: 0,
        w: SLIDE_WIDTH_INCHES,
        h: SLIDE_HEIGHT_INCHES * 0.4,
      };
      break;
    case "background":
      // Full slide background
      imageOptions.sizing = { type: "cover", w: SLIDE_WIDTH_INCHES, h: SLIDE_HEIGHT_INCHES };
      break;
  }

  try {
    slide.addImage(imageOptions);
  } catch (error) {
    console.warn("Failed to add root image:", error);
  }
}

/**
 * Legacy export using element-by-element conversion
 */
export async function exportPresentationLegacy(
  presentationId: string,
  fileName?: string,
  theme?: Partial<ThemeColors>,
): Promise<ExportResult> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    const { convertPlateJSToPPTX } = await import(
      "@/components/presentation/utils/exportToPPT"
    );

    const presentationData = await fetchPresentationData(
      presentationId,
      session.user.id,
    );

    const arrayBuffer = await convertPlateJSToPPTX(
      { slides: presentationData.slides },
      theme,
    );

    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    return {
      success: true,
      data: base64,
      fileName: `${fileName ?? "presentation"}.pptx`,
    };
  } catch (error) {
    console.error("Error exporting presentation (legacy):", error);
    return { success: false, error: "Failed to export presentation" };
  }
}

// Helper function to fetch presentation data
async function fetchPresentationData(presentationId: string, userId: string) {
  const presentation = await db.baseDocument.findFirst({
    where: { id: presentationId, userId: userId },
    include: { presentation: true },
  });

  return {
    id: presentation?.id,
    title: presentation?.title,
    slides: (
      presentation?.presentation?.content as unknown as { slides: PlateSlide[] }
    )?.slides ?? [],
  };
}

// Add type declaration for window.measureElements
declare global {
  interface Window {
    measureElements?: () => ElementMeasurement[];
  }
}
