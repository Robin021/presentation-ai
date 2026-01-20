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

    // Fetch presentation data
    const presentationData = await fetchPresentationData(
      presentationId,
      session.user.id,
    );

    if (!presentationData.slides || presentationData.slides.length === 0) {
      return { success: false, error: "No slides found in presentation" };
    }

    // Dynamically import Puppeteer (server-side only)
    const puppeteer = await import("puppeteer");

    // Get base URL for rendering
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    // Create PPTX
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";
    pptx.author = "Presentation AI";
    pptx.title = presentationData.title || "Presentation";
    pptx.theme = {
      headFontFace: "Inter",
      bodyFontFace: "Inter",
    };

    // Apply theme colors
    const themeColors: ThemeColors = {
      primary: theme?.primary || "3B82F6",
      secondary: theme?.secondary || "1F2937",
      accent: theme?.accent || "60A5FA",
      background: theme?.background || "FFFFFF",
      text: theme?.text || "1F2937",
      heading: theme?.heading || "111827",
      muted: theme?.muted || "6B7280",
    };

    // Launch browser
    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--font-render-hinting=none",
      ],
    });

    try {
      const page = await browser.newPage();

      // Set viewport for 16:9 presentation aspect ratio
      await page.setViewport({
        width: RENDER_WIDTH_PX,
        height: RENDER_HEIGHT_PX,
        deviceScaleFactor: 1,
      });

      // Process each slide
      for (let slideIndex = 0; slideIndex < presentationData.slides.length; slideIndex++) {
        const slideData = presentationData.slides[slideIndex];
        const url = `${baseUrl}/api/presentation/export-render?id=${presentationId}&slideIndex=${slideIndex}&mode=measure`;

        await page.goto(url, {
          waitUntil: "domcontentloaded", // Faster than 'load', doesn't wait for all images
          timeout: 120000,   // Increased to 2 minutes
        });

        // Explicitly wait for the slide container to ensure react has rendered
        await page.waitForSelector('#slide-content', { timeout: 30000 });

        // Wait for fonts and rendering
        await page.evaluate(() => document.fonts?.ready);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get element measurements
        const measurements = await page.evaluate(() => {
          if (typeof window.measureElements === 'function') {
            return window.measureElements();
          }
          return [];
        }) as ElementMeasurement[];

        // Create PPT slide with measured positions
        const slide = pptx.addSlide();

        // Add background
        if (slideData?.bgColor) {
          slide.background = { color: slideData.bgColor.replace("#", "") };
        } else {
          slide.background = { color: themeColors.background };
        }

        // Add root image if present
        if (slideData?.rootImage?.url && slideData?.layoutType) {
          await addRootImageToSlide(slide, slideData.rootImage, slideData.layoutType);
        }

        // --- Layout Engine Logic ---
        // 1. Bucket measurements into columns (to prevent vertical interleaving issues)
        // 2. Form groups within columns
        // 3. Collect all groups into a global list
        // 4. Sort by Y and perform collision detection to place them

        const columns: { x: number, eles: ElementMeasurement[] }[] = [];
        const ignorableTypes = ["column", "column_group", "bullets"];
        const textTypes = ["h1", "h2", "h3", "h4", "p", "text", "bullet-item"];
        const renderQueue: RenderGroup[] = [];

        // 1. Bucket
        for (const m of measurements) {
          if (!m || ignorableTypes.includes(m.type)) continue;
          const col = columns.find(c => Math.abs(c.x - m.x) < 50);
          if (col) {
            col.eles.push(m);
          } else {
            columns.push({ x: m.x, eles: [m] });
          }
        }

        // 2. Form Groups
        for (const col of columns) {
          col.eles.sort((a, b) => a.y - b.y);

          let currentGroup: ElementMeasurement[] = [];

          for (let i = 0; i < col.eles.length; i++) {
            const m = col.eles[i];
            if (!m) continue;

            const isText = textTypes.includes(m.type);

            if (!isText) {
              // Non-text elements are their own group
              if (currentGroup.length > 0) {
                pushGroup(currentGroup, renderQueue);
                currentGroup = [];
              }
              pushGroup([m], renderQueue);
              continue;
            }

            if (currentGroup.length > 0) {
              const last = currentGroup[currentGroup.length - 1];

              if (last) {
                const wDiff = Math.abs(m.width - last.width);

                // Split if width changes significantly (e.g. half col -> full width)
                if (wDiff < 100) {
                  currentGroup.push(m);
                } else {
                  pushGroup(currentGroup, renderQueue);
                  currentGroup = [m];
                }
              } else {
                currentGroup.push(m);
              }
            } else {
              currentGroup = [m];
            }
          }
          if (currentGroup.length > 0) {
            pushGroup(currentGroup, renderQueue);
          }
        }

        // 3. Sort & Place with Collision Detection
        // Sort primarily by Y, secondarily by X
        renderQueue.sort((a, b) => {
          if (Math.abs(a.y - b.y) < 10) return a.x - b.x;
          return a.y - b.y;
        });

        const placedRects: PlacedRect[] = [];

        for (const group of renderQueue) {
          const first = group.elements[0];
          if (!first) continue;

          // Initial position (inches)
          let xInch = pxToInchX(group.x);
          let yInch = pxToInchY(group.y);
          const wInch = pxToInchX(group.w);
          const hWebInch = pxToInchY(group.hWeb);

          // Estimated Occupied Height in PPT (Increased safety buffer to 1.6x)
          const hEstInch = hWebInch * 1.6;

          // Collision Detection
          // Check if this rect overlaps with any already placed rect
          let overlapFound = true;
          let attempts = 0;

          while (overlapFound && attempts < 10) {
            overlapFound = false;
            for (const rect of placedRects) {
              // Check intersection
              const xOverlap = xInch < rect.x + rect.w && xInch + wInch > rect.x;
              const yOverlap = yInch < rect.y + rect.h && yInch + hEstInch > rect.y;

              if (xOverlap && yOverlap) {
                // Collision! Push down.
                // Move to bottom of the colliding rect + 0.1 inch padding
                const newY = rect.y + rect.h + 0.1;
                if (newY > yInch) {
                  yInch = newY;
                  overlapFound = true; // Re-check collision at new position
                }
              }
            }
            if (overlapFound) attempts++;
          }

          // Register this placement
          placedRects.push({ x: xInch, y: yInch, w: wInch, h: hEstInch });

          // Render
          const singleEl = group.elements[0];
          if (group.elements.length === 1 && singleEl && !textTypes.includes(singleEl.type)) {
            await addMeasuredElement(slide, singleEl, themeColors);
          }

          // Render Text Group
          if (group.elements.length > 0) {
            const firstGroupEl = group.elements[0];
            if (!firstGroupEl) continue;

            const isTextGroup = textTypes.includes(firstGroupEl.type);
            if (!isTextGroup) continue;

            const textObjects = group.elements.map((m) => {
              const styles = m.styles;
              const fontSizeMatch = styles.fontSize.match(/(\d+)/);
              const fontSizePx = fontSizeMatch && fontSizeMatch[1] ? parseInt(fontSizeMatch[1], 10) : 24;
              const fontSizePt = Math.round(fontSizePx * 0.55);
              const isBold = styles.fontWeight === "bold" || parseInt(styles.fontWeight, 10) >= 600;

              let color = themeColors.text;
              if (["h1", "h2", "h3", "h4"].includes(m.type)) color = themeColors.accent;

              const rgbMatch = styles.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
                const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
                const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
                const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
                color = `${r}${g}${b}`;
              }

              const isBullet = m.type === "bullet-item";

              return {
                text: m.text,
                options: {
                  fontSize: fontSizePt,
                  bold: isBold,
                  color,
                  breakLine: true,
                  paraSpaceAfter: 6,
                  // Remove fixed lineSpacing 12. Using undefined or font-based.
                  // Default PPT line spacing is usually 1.0 lines (approx 1.2 * fontSize)
                  bullet: isBullet ? true : undefined,
                }
              };
            });

            slide.addText(textObjects, {
              x: xInch,      // Use the Collision-Adjusted Y
              y: yInch,
              w: wInch,
              valign: "top",
              align: (first.styles.textAlign as "left" | "center" | "right") || "left",
              wrap: true,
              inset: 0,
            });
          }
        }

      }
    } finally {
      await browser.close();
    }

    // Generate PPTX
    const pptxOutput = await pptx.write({ outputType: "arraybuffer" });

    // Convert to base64
    let base64: string;
    if (pptxOutput instanceof ArrayBuffer) {
      base64 = Buffer.from(pptxOutput).toString("base64");
    } else if (pptxOutput instanceof Uint8Array) {
      base64 = Buffer.from(pptxOutput).toString("base64");
    } else {
      base64 = Buffer.from(pptxOutput as string).toString("base64");
    }

    return {
      success: true,
      data: base64,
      fileName: `${fileName ?? "presentation"}.pptx`,
    };
  } catch (error) {
    console.error("Error exporting presentation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export presentation",
    };
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
