/**
 * Export Render API Route
 * Generates standalone HTML for each slide at 1920x1080, matching the browser visual rendering.
 * Used by Puppeteer screenshot service for the image-based PPTX export.
 */

import { db } from "@/server/db";
import { type PlateSlide } from "@/components/presentation/utils/parser";
import { themes } from "@/lib/presentation/themes";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const presentationId = searchParams.get("id");
  const slideIndexParam = searchParams.get("slideIndex");
  const mode = searchParams.get("mode") || "html"; // "html" or "measure"
  const baseUrl = request.nextUrl.origin;

  if (!presentationId || slideIndexParam === null) {
    return NextResponse.json(
      { error: "Missing id or slideIndex parameter" },
      { status: 400 }
    );
  }

  const slideIndex = parseInt(slideIndexParam, 10);
  if (isNaN(slideIndex) || slideIndex < 0) {
    return NextResponse.json(
      { error: "Invalid slideIndex parameter" },
      { status: 400 }
    );
  }

  try {
    // Fetch presentation data
    const presentation = await db.baseDocument.findFirst({
      where: { id: presentationId },
      include: { presentation: true },
    });

    if (!presentation?.presentation?.content) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    const content = presentation.presentation.content as unknown as { slides: PlateSlide[] };
    const slides = content.slides;

    if (slideIndex >= slides.length || !slides[slideIndex]) {
      return NextResponse.json(
        { error: "Slide index out of range" },
        { status: 400 }
      );
    }

    const slide = slides[slideIndex];

    // Read optional theme overrides from client (preferred path)
    const overridePrimary = searchParams.get("primary");
    const overrideBackground = searchParams.get("background");
    const overrideText = searchParams.get("text");
    const overrideHeading = searchParams.get("heading");
    const overrideMuted = searchParams.get("muted");
    const overrideSecondary = searchParams.get("secondary");
    const overrideAccent = searchParams.get("accent");
    const fontHeading = searchParams.get("fontHeading") || undefined;
    const fontBody = searchParams.get("fontBody") || undefined;
    const isDark = searchParams.get("isDark") === "1";

    // Determine theme colors: prefer client-provided overrides, fall back to DB
    const themeColors: ThemeColors = (() => {
      if (overridePrimary && overrideBackground) {
        return {
          primary: overridePrimary,
          secondary: overrideSecondary || overridePrimary,
          accent: overrideAccent || overridePrimary,
          background: overrideBackground,
          text: overrideText || "#1F2937",
          heading: overrideHeading || "#111827",
          muted: overrideMuted || "#6B7280",
        };
      }
      // Fallback: resolve from DB — the field is 'theme', not 'themeName'
      const themeKey =
        (presentation.presentation as { theme?: string })?.theme ?? "daktilo";
      const themeObj = themes[themeKey as keyof typeof themes];
      return themeObj?.colors?.light ?? themes.daktilo.colors.light;
    })();

    const html = generateSlideHTML(
      slide,
      themeColors,
      slideIndex,
      mode,
      baseUrl,
      fontHeading,
      fontBody,
      isDark,
    );

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Error rendering slide:", error);
    return NextResponse.json(
      { error: "Failed to render slide" },
      { status: 500 }
    );
  }
}

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  heading: string;
  muted: string;
}

function generateSlideHTML(
  slide: PlateSlide,
  themeColors: ThemeColors,
  slideIndex: number,
  mode: string,
  baseUrl: string,
  fontHeading?: string,
  fontBody?: string,
  isDark?: boolean,
): string {
  const slideData = JSON.stringify(slide);
  const themeData = JSON.stringify(themeColors);

  // Build Google Fonts links based on theme fonts
  const googleFontsMap: Record<string, string> = {
    Inter: "Inter",
    Poppins: "Poppins",
    "Source Sans Pro": "Source+Sans+Pro",
    "Space Grotesk": "Space+Grotesk",
    "IBM Plex Sans": "IBM+Plex+Sans",
    "Playfair Display": "Playfair+Display",
    Lora: "Lora",
    Montserrat: "Montserrat",
    Raleway: "Raleway",
    "JetBrains Mono": "JetBrains+Mono",
    Merriweather: "Merriweather",
    "DM Serif Display": "DM+Serif+Display",
    "DM Sans": "DM+Sans",
    Bitter: "Bitter",
  };
  const loadedFonts = new Set<string>();
  const fontLinkTags: string[] = [];
  const addFont = (name: string) => {
    if (!name || loadedFonts.has(name)) return;
    const encoded = googleFontsMap[name];
    if (!encoded) return; // Not a Google Font (e.g. "Porsche Next TT")
    loadedFonts.add(name);
    fontLinkTags.push(
      `<link href="https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap" rel="stylesheet">`,
    );
  };
  addFont("Inter");
  if (fontHeading) addFont(fontHeading);
  if (fontBody && fontBody !== fontHeading) addFont(fontBody);
  const fontLinksStr = fontLinkTags.join("\n      ");

  // Build @font-face declarations for local TTF fonts
  const localFonts: Array<{ family: string; url: string }> = [];
  const ttfFontMap: Record<string, string> = {
    "Porsche Next TT": "/fonts/porsche-next.ttf",
    "Porsche Next": "/fonts/porsche-next.ttf",
  };
  const addLocalFont = (name: string) => {
    if (!name || localFonts.some((f) => f.family === name)) return;
    const ttfPath = ttfFontMap[name];
    if (!ttfPath) return;
    localFonts.push({ family: name, url: baseUrl + ttfPath });
  };
  if (fontHeading) addLocalFont(fontHeading);
  if (fontBody) addLocalFont(fontBody);
  const fontFaceDeclarations = localFonts
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';src:url('${f.url}') format('truetype');font-weight:normal;font-style:normal;}`,
    )
    .join("");

  // Scan slide for SVG images and inline their content (html2canvas doesn't support SVG <img>)
  const svgContentMap: Record<string, string> = {};
  const scanForSVGs = (nodes: unknown[]): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;
      if ((n.type === "img" || n.type === "image") && typeof n.url === "string") {
        const url = n.url;
        if (url.endsWith(".svg") && !svgContentMap[url]) {
          try {
            const fs = require("fs") as typeof import("fs");
            const path = require("path") as typeof import("path");
            const filePath = path.join(process.cwd(), "public", url);
            svgContentMap[url] = fs.readFileSync(filePath, "utf-8").replace(/<\?xml[^>]*\?>/g, "");
          } catch {
            console.warn("Failed to read SVG for export:", url);
          }
        }
      }
      if (Array.isArray(n.children)) scanForSVGs(n.children);
    }
  };
  scanForSVGs(slide.content ?? []);
  if (slide.rootImage?.url?.endsWith(".svg") && !svgContentMap[slide.rootImage.url]) {
    try {
      const fs = require("fs") as typeof import("fs");
      const path = require("path") as typeof import("path");
      const filePath = path.join(process.cwd(), "public", slide.rootImage.url);
      svgContentMap[slide.rootImage.url] = fs.readFileSync(filePath, "utf-8").replace(/<\?xml[^>]*\?>/g, "");
    } catch {
      console.warn("Failed to read root SVG for export:", slide.rootImage.url);
    }
  }
  const svgContentJson = JSON.stringify(svgContentMap);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide ${slideIndex + 1} - Export</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fontLinksStr}
  <style>
    ${fontFaceDeclarations}
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      font-family: '${fontBody || "Inter"}', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    :root {
      --presentation-primary: ${themeColors.primary};
      --presentation-secondary: ${themeColors.secondary};
      --presentation-accent: ${themeColors.accent};
      --presentation-background: ${themeColors.background};
      --presentation-text: ${themeColors.text};
      --presentation-heading: ${themeColors.heading};
      --presentation-muted: ${themeColors.muted};
      --presentation-border-radius: 0.5rem;
      --border: ${themeColors.muted};
      --chart-1: 215 100% 60%;
      --chart-2: 270 100% 65%;
      --chart-3: 330 100% 60%;
      --chart-4: 160 100% 40%;
      --chart-5: 30 100% 55%;
    }

    body {
      background: ${themeColors.background};
      color: ${themeColors.text};
    }

    #slide-container {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
    }

    #slide-content {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: ${slide.layoutType === 'vertical' ? 'column-reverse' :
        slide.layoutType === 'left' ? 'row-reverse' : 'row'};
      background-color: ${slide.bgColor || themeColors.background};
      ${slide.layoutType === 'background' && slide.rootImage?.url ?
        `background-image: url(${slide.rootImage.url.startsWith('/') ? baseUrl + slide.rootImage.url : slide.rootImage.url}); background-size: cover; background-position: center;` : ''}
    }

    .content-area {
      flex: ${slide.rootImage && slide.layoutType !== 'background' ? '0 0 55%' : '1'};
      padding: 48px;
      display: flex;
      flex-direction: column;
      justify-content: ${slide.alignment === 'center' ? 'center' :
        slide.alignment === 'end' ? 'flex-end' : 'flex-start'};
      gap: 12px;
      overflow: hidden;
    }

    .image-area {
      flex: 0 0 45%;
      background-size: cover;
      background-position: center;
    }

    /* === Shared Element Styles === */
    .presentation-heading {
      font-weight: 700;
      color: var(--presentation-heading);
      line-height: 1.2;
    }
    .presentation-paragraph {
      font-size: 22px;
      color: var(--presentation-text);
      line-height: 1.6;
    }
    .presentation-image {
      max-width: 100%;
      height: auto;
      object-fit: cover;
      border-radius: 8px;
      margin: 8px 0;
    }
    .presentation-image svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .chart-container {
      background: var(--presentation-background);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin: 8px 0;
      color: var(--presentation-text);
    }

    /* === Headings === */
    h1 { font-size: 64px; font-weight: 700; color: var(--presentation-heading); margin-bottom: 8px; }
    h2 { font-size: 44px; font-weight: 700; color: var(--presentation-heading); margin-bottom: 8px; }
    h3 { font-size: 34px; font-weight: 600; color: var(--presentation-heading); margin-bottom: 6px; }
    h4 { font-size: 28px; font-weight: 600; color: var(--presentation-heading); margin-bottom: 6px; }
    h5 { font-size: 24px; font-weight: 600; color: var(--presentation-heading); margin-bottom: 4px; }
    h6 { font-size: 20px; font-weight: 600; color: var(--presentation-heading); margin-bottom: 4px; }

    /* === Bullets === */
    .bullet-grid {
      display: grid;
      gap: 20px;
      margin: 8px 0;
    }
    .bullet-grid.cols-1 { grid-template-columns: 1fr; }
    .bullet-grid.cols-2 { grid-template-columns: 1fr 1fr; }
    .bullet-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .bullet-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
    }
    .bullet-number {
      width: 44px;
      height: 44px;
      background: var(--presentation-primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .bullet-text {
      font-size: 18px;
      color: var(--presentation-text);
      line-height: 1.5;
      padding-top: 8px;
    }

    /* === Columns === */
    .column-group {
      display: flex;
      gap: 24px;
      width: 100%;
    }
    .column {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    /* === Pyramid === */
    .pyramid-container {
      display: flex;
      flex-direction: column;
      gap: 0;
      width: 100%;
      margin: 8px 0;
    }
    .pyramid-row {
      display: flex;
      align-items: center;
      width: 100%;
      gap: 16px;
    }
    .pyramid-shape {
      height: 80px;
      display: grid;
      place-items: center;
      font-size: 24px;
      font-weight: 700;
      color: var(--presentation-background);
      flex-shrink: 0;
    }
    .pyramid-content {
      flex: 1;
      display: flex;
      align-items: center;
      min-height: 80px;
      border-bottom: 1px solid #94a3b8;
      font-size: 18px;
      color: var(--presentation-text);
      line-height: 1.5;
    }

    /* === Cycle === */
    .cycle-container {
      position: relative;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 16px;
      padding: 0 16px;
      margin: 8px 0;
    }
    .cycle-center {
      grid-column: 2;
      grid-row: 1 / span 3;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 256px;
      height: 256px;
      margin: 0 auto;
    }
    .cycle-left { grid-column: 1; }
    .cycle-right { grid-column: 3; }
    .cycle-row-1 { grid-row: 1; }
    .cycle-row-2 { grid-row: 2; }
    .cycle-row-3 { grid-row: 3; }
    .cycle-item-card {
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--presentation-primary) 20%, transparent);
      background: var(--presentation-background);
      padding: 16px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cycle-badge {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }
    .cycle-text {
      font-size: 16px;
      color: var(--presentation-text);
      line-height: 1.4;
    }

    /* === Timeline === */
    .timeline-v-single {
      display: flex;
      flex-direction: column;
      width: 100%;
      margin: 8px 0;
      position: relative;
    }
    .timeline-v-single-line {
      position: absolute;
      width: 2px;
      left: 24px;
      top: 16px;
      bottom: 16px;
    }
    .timeline-v-double {
      display: flex;
      flex-direction: column;
      width: 100%;
      margin: 8px 0;
      position: relative;
    }
    .timeline-v-double-line {
      position: absolute;
      width: 2px;
      left: 50%;
      top: 0;
      bottom: 0;
      transform: translateX(-50%);
    }
    .timeline-h-single {
      display: flex;
      justify-content: space-around;
      width: 100%;
      margin: 8px 0;
      position: relative;
    }
    .timeline-h-single-line {
      position: absolute;
      height: 2px;
      left: 0;
      right: 0;
      top: 24px;
    }
    .timeline-h-double {
      display: flex;
      justify-content: space-around;
      width: 100%;
      margin: 8px 0;
      position: relative;
    }
    .timeline-h-double-line {
      position: absolute;
      height: 2px;
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
    }
    .timeline-item-v-single {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 12px 0;
    }
    .timeline-item-v-double-even {
      width: calc(50% + 36px);
      place-self: end;
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 12px 0;
      padding-left: 16px;
    }
    .timeline-item-v-double-odd {
      width: calc(50% + 36px);
      place-self: start;
      display: flex;
      flex-direction: row-reverse;
      align-items: center;
      gap: 24px;
      padding: 12px 0;
      padding-left: 16px;
    }
    .timeline-item-h-single {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      padding-top: 0;
      flex: 1;
    }
    .timeline-item-h-double-even {
      display: flex;
      flex-direction: column;
      align-self: end;
      padding-top: 16px;
      flex: 1;
    }
    .timeline-item-h-double-odd {
      display: flex;
      flex-direction: column-reverse;
      align-self: start;
      padding-top: 16px;
      flex: 1;
    }
    .timeline-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: white;
      flex-shrink: 0;
      box-shadow: 0 0 0 2px white, 0 0 0 3px var(--presentation-primary);
    }
    .timeline-connector {
      width: 100%;
      height: 2px;
      min-height: 2px;
      border-radius: 1px;
    }
    .timeline-content {
      font-size: 16px;
      color: var(--presentation-text);
      line-height: 1.5;
    }

    /* === Staircase === */
    .staircase-container {
      display: flex;
      flex-direction: column;
      gap: 0;
      width: 100%;
      margin: 8px 0;
    }
    .stair-row {
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 1px solid #64748b;
      margin-bottom: 8px;
      padding-bottom: 8px;
    }
    .stair-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 700;
      min-height: 70px;
      border-radius: 6px;
      flex-shrink: 0;
    }
    .stair-content {
      flex: 1;
      font-size: 18px;
      color: var(--presentation-text);
      line-height: 1.5;
    }

    /* === Arrow List === */
    .arrows-container {
      display: flex;
      flex-direction: column;
      gap: 0;
      width: 100%;
      margin: 8px 0;
    }
    .arrow-row {
      display: flex;
      gap: 20px;
      margin-bottom: 8px;
      margin-left: 16px;
      align-items: center;
    }
    .arrow-svg-col {
      width: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .arrow-content {
      flex: 1;
      font-size: 18px;
      color: var(--presentation-text);
      line-height: 1.5;
    }

    /* === Icon List === */
    .icon-grid {
      display: grid;
      gap: 20px;
      margin: 8px 0;
    }
    .icon-grid.cols-1 { grid-template-columns: 1fr; }
    .icon-grid.cols-2 { grid-template-columns: 1fr 1fr; }
    .icon-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .icon-item {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 0 16px;
    }
    .icon-placeholder {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
      border: 1px solid rgba(0,0,0,0.1);
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .icon-text {
      font-size: 16px;
      color: var(--presentation-text);
      line-height: 1.4;
    }

    /* === Boxes === */
    .boxes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 8px 0;
      width: 100%;
    }
    .box-item {
      border-radius: 6px;
      border: 1px solid var(--border);
      padding: 16px;
    }

    /* === Compare === */
    .compare-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 20px;
      align-items: start;
      margin: 8px 0;
      width: 100%;
    }
    .compare-badge {
      grid-column: 2;
      grid-row: 1 / span 2;
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: center;
    }
    .compare-badge-inner {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 14px;
      font-weight: 700;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    }
    .compare-side-col1 { grid-column: 1; }
    .compare-side-col3 { grid-column: 3; }
    .compare-card {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--border);
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
      border-top: 4px solid var(--presentation-primary);
    }

    /* === Before-After === */
    .beforeafter-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 32px;
      align-items: start;
      margin: 8px 0;
      width: 100%;
    }
    .beforeafter-badge {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: center;
    }
    .beforeafter-badge-inner {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 20px;
      font-weight: 700;
    }
    .beforeafter-col1 { grid-column: 1; }
    .beforeafter-col3 { grid-column: 3; }
    .beforeafter-card {
      width: 100%;
      max-width: 520px;
      border-radius: 12px;
      border: 1px solid var(--border);
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
      border-top: 4px solid var(--presentation-primary);
      background: var(--presentation-background);
      color: var(--presentation-text);
    }

    /* === Pros-Cons === */
    .proscons-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 8px 0;
      width: 100%;
    }
    .pros-item {
      border-radius: 8px;
      padding: 20px;
      color: white;
      background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
      font-size: 18px;
      line-height: 1.5;
    }
    .cons-item {
      border-radius: 8px;
      padding: 20px;
      color: white;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      font-size: 18px;
      line-height: 1.5;
    }

    /* === Sequence Arrow (Vertical) === */
    .seqarrow-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      margin: 8px 0;
    }
    .seqarrow-item {
      width: 100%;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      font-size: 18px;
      line-height: 1.5;
    }
    .seqarrow-arrow {
      margin: 0 auto;
      width: 0;
      height: 0;
      border-left: 13px solid transparent;
      border-right: 13px solid transparent;
      filter: drop-shadow(0 6px 8px rgba(0,0,0,0.08));
    }

    /* === Button === */
    .presentation-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 6px;
      font-weight: 500;
      cursor: default;
    }

    /* === Table === */
    .export-table {
      width: 100%;
      border-collapse: collapse;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--presentation-background);
    }
    .export-table th, .export-table td {
      padding: 12px;
      border: 1px solid var(--border);
      text-align: left;
      font-size: 16px;
    }
    .export-table th {
      background: var(--presentation-primary);
      color: white;
      font-weight: 600;
    }
    .export-table td {
      color: var(--presentation-text);
    }

    /* === Chart === */
    .chart-bar-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .chart-bar-label {
      width: 80px;
      text-align: right;
      font-size: 14px;
      flex-shrink: 0;
    }
    .chart-bar-track {
      flex: 1;
      height: 24px;
      background: color-mix(in srgb, var(--presentation-muted) 30%, transparent);
      border-radius: 4px;
      overflow: hidden;
    }
    .chart-bar-fill {
      height: 100%;
      border-radius: 4px;
      min-width: 2px;
    }
    .chart-bar-value {
      width: 48px;
      font-size: 14px;
      text-align: right;
      flex-shrink: 0;
    }
    .chart-pie-wrapper {
      display: flex;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;
    }
    .chart-pie-visual {
      width: 180px;
      height: 180px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .chart-legend {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .chart-legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .chart-legend-swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .chart-data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 14px;
    }
    .chart-data-table th {
      padding: 6px 12px;
      text-align: left;
      border-bottom: 2px solid var(--border);
      font-weight: 600;
    }
    .chart-data-table td {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
    }

    /* === Loading === */
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 24px;
      color: ${themeColors.muted};
    }
    #loading.hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div id="slide-container">
    <div id="loading">Loading slide...</div>
    <div id="slide-content"></div>
  </div>

  <script>
    var slideData = ${slideData};
    var themeColors = ${themeData};
    var mode = '${mode}';
    var baseUrl = '${baseUrl}';
    var svgContents = ${svgContentJson};

    // === Utility Functions ===
    function escapeHtml(text) {
      if (typeof text !== 'string') return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function extractText(node) {
      if (typeof node === 'string') return node;
      if (node.text !== undefined && node.text !== null) return String(node.text);
      if (Array.isArray(node.children)) {
        return node.children.map(extractText).filter(Boolean).join(' ').trim();
      }
      return '';
    }

    function renderChildren(nodes) {
      if (!Array.isArray(nodes)) return '';
      var html = '';
      for (var i = 0; i < nodes.length; i++) {
        html += renderNode(nodes[i], i, nodes);
      }
      return html;
    }

    function renderRichText(children) {
      if (!Array.isArray(children)) return '';
      var html = '';
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.text !== undefined) {
          var text = escapeHtml(child.text);
          if (child.bold) text = '<strong>' + text + '</strong>';
          if (child.italic) text = '<em>' + text + '</em>';
          if (child.underline) text = '<u>' + text + '</u>';
          if (child.strikethrough) text = '<s>' + text + '</s>';
          html += text;
        } else if (child.children) {
          html += renderRichText(child.children);
        }
      }
      return html;
    }

    function renderTextContent(node) {
      if (node.children) return renderRichText(node.children);
      var t = extractText(node);
      return escapeHtml(t);
    }

    // === Element Renderers ===
    function renderHeading(type, node) {
      var sizeMap = {
        h1: '64px', h2: '44px', h3: '34px',
        h4: '28px', h5: '24px', h6: '20px'
      };
      var fontSize = sizeMap[type] || '28px';
      var tag = type || 'h3';
      var inner = renderTextContent(node);
      return '<' + tag + ' data-element-type="' + type + '" style="font-size:' + fontSize + '">' + inner + '</' + tag + '>';
    }

    function renderParagraph(node) {
      var inner = renderTextContent(node);
      if (!inner.trim()) return '';
      return '<p data-element-type="p" class="presentation-paragraph">' + inner + '</p>';
    }

    function resolveUrl(src) {
      if (!src) return '';
      if (src.indexOf('://') !== -1 || src.indexOf('//') === 0) return src;
      if (src.indexOf('/') === 0) return baseUrl + src;
      return src;
    }

    function renderImage(node) {
      var src = node.url || '';
      if (!src) return '';
      // Inline SVG content when available (html2canvas can't render SVG <img>)
      if (svgContents[src]) {
        var align = node.align || '';
        var svgStyle = 'display:block;max-width:100%;height:auto;margin:8px 0;' + (align === 'center' ? 'margin-left:auto;margin-right:auto;' : '');
        var svgContent = svgContents[src].replace('<svg', '<svg style="' + svgStyle + '"');
        return '<div data-element-type="img" class="presentation-image" style="text-align:' + align + '">' + svgContent + '</div>';
      }
      src = resolveUrl(src);
      return '<img data-element-type="img" class="presentation-image" src="' + escapeHtml(src) + '" alt="' + escapeHtml(node.query || '') + '" style="max-width:100%;height:auto;object-fit:cover;border-radius:8px;margin:8px 0;">';
    }

    function renderBullets(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var cols = children.length <= 1 ? 1 : (children.length <= 2 ? 2 : 3);
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="bullet-grid cols-' + cols + '" data-element-type="bullets">';
      for (var i = 0; i < children.length; i++) {
        var text = extractText(children[i]);
        html += '<div class="bullet-item" data-element-type="bullet-item">';
        html += '<div class="bullet-number" style="background:' + color + '">' + (i + 1) + '</div>';
        html += '<div class="bullet-text">' + escapeHtml(text) + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderColumnGroup(children) {
      if (!Array.isArray(children)) return '';
      var html = '<div class="column-group" data-element-type="column_group">';
      for (var i = 0; i < children.length; i++) {
        var colContent = renderChildren(children[i].children);
        html += '<div class="column" data-element-type="column">' + colContent + '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderPyramid(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var total = children.length;
      var increment = 40 / total;
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="pyramid-container" data-element-type="pyramid">';
      for (var i = 0; i < total; i++) {
        var text = extractText(children[i]);
        var clipPath;
        if (i === 0) {
          var c = 50 - increment;
          clipPath = 'polygon(50% 0%, ' + c + '% 100%, ' + (100 - c) + '% 100%)';
        } else {
          var prevLeft = 50 - increment * i;
          var prevRight = 50 + increment * i;
          var currLeft = 50 - increment * (i + 1);
          var currRight = 50 + increment * (i + 1);
          clipPath = 'polygon(' + prevLeft + '% 0%, ' + prevRight + '% 0%, ' + currRight + '% 100%, ' + currLeft + '% 100%)';
        }
        var offset = (40 - (i + 1) * increment) * 0.5;
        var marginLeft = offset + 37;
        html += '<div class="pyramid-row" data-element-type="pyramid-item">';
        html += '<div class="pyramid-shape" style="clip-path:' + clipPath + ';background:' + color + ';width:80px;">' + (i + 1) + '</div>';
        html += '<div class="pyramid-content" style="margin-left:' + marginLeft + 'px">' + escapeHtml(text) + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderCycle(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var total = children.length;
      var hasOdd = total % 2 !== 0;
      var color = parentColor || 'var(--presentation-primary)';
      var badgeColors = ['#3b82f6', '#a855f7', '#6366f1', '#ec4899'];

      var html = '<div class="cycle-container" data-element-type="cycle">';

      // SVG center wheel
      html += '<div class="cycle-center">';
      html += '<svg viewBox="0 0 100 125" width="200" height="250" style="fill:' + color + '">';
      html += '<path d="M23.25569,25.04785,28.119,36.65509A25.64562,25.64562,0,0,1,49.3597,24.379l7.62158-10.01624L49.384,4.37842A45.65079,45.65079,0,0,0,10.81752,26.63416Z"/>';
      html += '<path d="M89.82619,27.75232,84.98225,39.31543,72.50014,37.72351a25.59208,25.59208,0,0,1,.01,24.536l4.86279,11.60571,12.43573-1.58667a45.49257,45.49257,0,0,0,.01758-44.52624Z"/>';
      html += '<path d="M58.23714,14.36279,50.61586,24.37842A25.64474,25.64474,0,0,1,71.86818,36.635l12.48517,1.59253L89.199,26.66272A45.65056,45.65056,0,0,0,50.64009,4.379Z"/>';
      html += '<path d="M76.744,74.95312,71.88106,63.34521A25.64518,25.64518,0,0,1,50.64033,75.62146L43.01839,85.6377,50.616,95.62207a45.65067,45.65067,0,0,0,38.5661-22.25525Z"/>';
      html += '<path d="M15.01839,60.68555,27.50026,62.2774a25.59173,25.59173,0,0,1-.01013-24.53686l-4.86335-11.6048L10.19136,27.72192a45.49238,45.49238,0,0,0-.01764,44.52582Z"/>';
      html += '<path d="M41.76253,85.6377l7.62164-10.01563A25.6444,25.6444,0,0,1,28.13258,63.36646l-12.48529-1.593L10.801,73.33752a45.65051,45.65051,0,0,0,38.5589,22.28394Z"/>';
      html += '</svg></div>';

      // Items
      for (var i = 0; i < total; i++) {
        var text = extractText(children[i]);
        var colClass, rowClass;
        if (hasOdd && i === 0) {
          colClass = 'cycle-left';
          rowClass = 'cycle-row-2';
        } else {
          var adjusted = hasOdd ? i - 1 : i;
          colClass = adjusted % 2 === 0 ? 'cycle-left' : 'cycle-right';
          if (hasOdd && i > 0) {
            var ri = Math.floor((i - 1) / 2);
            rowClass = 'cycle-row-' + (ri + 1);
          } else {
            var ri2 = Math.floor(i / 2);
            rowClass = 'cycle-row-' + (ri2 + 1);
          }
        }
        var badgeColor = badgeColors[i % 4];
        html += '<div class="' + colClass + ' ' + rowClass + '" data-element-type="cycle-item">';
        html += '<div class="cycle-item-card">';
        html += '<div class="cycle-badge" style="background:' + badgeColor + '">' + (i + 1) + '</div>';
        html += '<div class="cycle-text">' + escapeHtml(text) + '</div>';
        html += '</div></div>';
      }

      html += '</div>';
      return html;
    }

    function renderTimeline(children, node) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var orientation = node.orientation || 'vertical';
      var sidedness = node.sidedness || 'single';
      var color = node.color || 'var(--presentation-primary)';
      var numbered = node.numbered !== false;
      var showLine = node.showLine !== false;
      var total = children.length;
      var html = '';

      if (orientation === 'vertical' && sidedness === 'single') {
        html += '<div class="timeline-v-single" data-element-type="timeline">';
        if (showLine) html += '<div class="timeline-v-single-line" style="background:' + color + '"></div>';
        for (var i = 0; i < total; i++) {
          var text = extractText(children[i]);
          html += '<div class="timeline-item-v-single" data-element-type="timeline-item">';
          html += '<div class="timeline-circle" style="background:' + color + ';box-shadow:0 0 0 2px white, 0 0 0 3px ' + color + '">';
          html += numbered ? (i + 1) : '';
          html += '</div>';
          if (showLine && i < total - 1) html += '<div class="timeline-connector" style="background:' + color + '"></div>';
          html += '<div class="timeline-content">' + escapeHtml(text) + '</div>';
          html += '</div>';
        }
        html += '</div>';
      } else if (orientation === 'vertical' && sidedness === 'double') {
        html += '<div class="timeline-v-double" data-element-type="timeline">';
        if (showLine) html += '<div class="timeline-v-double-line" style="background:' + color + '"></div>';
        for (var i = 0; i < total; i++) {
          var text = extractText(children[i]);
          var cls = (i + 1) % 2 === 0 ? 'timeline-item-v-double-even' : 'timeline-item-v-double-odd';
          html += '<div class="' + cls + '" data-element-type="timeline-item">';
          html += '<div class="timeline-circle" style="background:' + color + ';box-shadow:0 0 0 2px white, 0 0 0 3px ' + color + '">';
          html += numbered ? (i + 1) : '';
          html += '</div>';
          html += '<div class="timeline-content">' + escapeHtml(text) + '</div>';
          html += '</div>';
        }
        html += '</div>';
      } else if (orientation === 'horizontal' && sidedness === 'single') {
        html += '<div class="timeline-h-single" data-element-type="timeline">';
        if (showLine) html += '<div class="timeline-h-single-line" style="background:' + color + '"></div>';
        for (var i = 0; i < total; i++) {
          var text = extractText(children[i]);
          html += '<div class="timeline-item-h-single" data-element-type="timeline-item">';
          html += '<div class="timeline-circle" style="background:' + color + ';box-shadow:0 0 0 2px white, 0 0 0 3px ' + color + '">';
          html += numbered ? (i + 1) : '';
          html += '</div>';
          if (showLine && i < total - 1) html += '<div class="timeline-connector" style="background:' + color + '"></div>';
          html += '<div class="timeline-content">' + escapeHtml(text) + '</div>';
          html += '</div>';
        }
        html += '</div>';
      } else if (orientation === 'horizontal' && sidedness === 'double') {
        html += '<div class="timeline-h-double" data-element-type="timeline">';
        if (showLine) html += '<div class="timeline-h-double-line" style="background:' + color + '"></div>';
        for (var i = 0; i < total; i++) {
          var text = extractText(children[i]);
          var cls = (i + 1) % 2 === 0 ? 'timeline-item-h-double-even' : 'timeline-item-h-double-odd';
          html += '<div class="' + cls + '" data-element-type="timeline-item">';
          html += '<div class="timeline-circle" style="background:' + color + ';box-shadow:0 0 0 2px white, 0 0 0 3px ' + color + '">';
          html += numbered ? (i + 1) : '';
          html += '</div>';
          html += '<div class="timeline-content">' + escapeHtml(text) + '</div>';
          html += '</div>';
        }
        html += '</div>';
      }
      return html;
    }

    function renderStaircase(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var total = children.length;
      var baseWidth = 70, maxWidth = 220;
      var increment = (maxWidth - baseWidth) / Math.max(total - 1, 1);
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="staircase-container" data-element-type="staircase">';
      for (var i = 0; i < total; i++) {
        var text = extractText(children[i]);
        var w = baseWidth + i * increment;
        html += '<div class="stair-row" data-element-type="stair-item">';
        html += '<div class="stair-badge" style="width:' + w + 'px;background:' + color + ';color:var(--presentation-background)">' + (i + 1) + '</div>';
        html += '<div class="stair-content">' + escapeHtml(text) + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderArrows(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="arrows-container" data-element-type="arrows">';
      for (var i = 0; i < children.length; i++) {
        var text = extractText(children[i]);
        html += '<div class="arrow-row" data-element-type="arrow-item">';
        html += '<div class="arrow-svg-col">';
        html += '<svg viewBox="0 0 90 108" width="72" height="86"><path d="M0,90 L45,108 L90,90 L90,0 L45,18 L0,0 Z" fill="' + color + '"/></svg>';
        html += '</div>';
        html += '<div class="arrow-content">' + escapeHtml(text) + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderIcons(children) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var cols = children.length <= 2 ? 1 : 3;
      var html = '<div class="icon-grid cols-' + cols + '" data-element-type="icons">';
      for (var i = 0; i < children.length; i++) {
        var text = extractText(children[i]);
        var iconChildren = children[i].children || [];
        var iconQuery = '';
        for (var j = 0; j < iconChildren.length; j++) {
          if (iconChildren[j].type === 'icon') {
            iconQuery = iconChildren[j].query || iconChildren[j].name || '';
            break;
          }
        }
        var firstLetter = iconQuery ? iconQuery.charAt(0).toUpperCase() : '';
        html += '<div class="icon-item" data-element-type="icon-item">';
        html += '<div class="icon-placeholder" style="background:var(--presentation-primary)">' + escapeHtml(firstLetter) + '</div>';
        html += '<div class="icon-text">' + escapeHtml(text) + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderBoxes(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="boxes-grid" data-element-type="boxes">';
      for (var i = 0; i < children.length; i++) {
        var innerHtml = renderChildren(children[i].children || []);
        html += '<div class="box-item" data-element-type="box-item" style="background:' + color + ';color:var(--presentation-background);border-color:var(--border)">' + innerHtml + '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderCompare(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="compare-grid" data-element-type="compare">';
      html += '<div class="compare-badge"><div class="compare-badge-inner" style="background:' + color + ';color:var(--presentation-background)">VS</div></div>';
      for (var i = 0; i < children.length; i++) {
        var col = i % 2 === 0 ? 'compare-side-col1' : 'compare-side-col3';
        var innerHtml = renderChildren(children[i].children || []);
        html += '<div class="' + col + '" data-element-type="compare-side">';
        html += '<div class="compare-card" style="border-top-color:' + color + '">' + innerHtml + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderBeforeAfter(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="beforeafter-grid" data-element-type="before-after">';
      html += '<div class="beforeafter-badge"><div class="beforeafter-badge-inner" style="background:' + color + ';color:var(--presentation-background);box-shadow:0 10px 30px rgba(108,122,224,0.3), 0 0 0 6px rgba(108,122,224,0.08)">';
      html += '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      html += '</div></div>';
      for (var i = 0; i < children.length; i++) {
        var col = i % 2 === 0 ? 'beforeafter-col1' : 'beforeafter-col3';
        var innerHtml = renderChildren(children[i].children || []);
        html += '<div class="' + col + '" data-element-type="before-after-side">';
        html += '<div class="beforeafter-card" style="border-top-color:' + color + '">' + innerHtml + '</div>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderProsCons(children) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var html = '<div class="proscons-grid" data-element-type="pros-cons">';
      for (var i = 0; i < children.length; i++) {
        var text = extractText(children[i]);
        var type = children[i].type || '';
        var cls = type === 'cons-item' ? 'cons-item' : 'pros-item';
        var label = type === 'cons-item' ? '✗ ' : '✓ ';
        html += '<div class="' + cls + '" data-element-type="' + type + '">' + label + escapeHtml(text) + '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderArrowVertical(children, parentColor) {
      if (!Array.isArray(children) || children.length === 0) return '';
      var total = children.length;
      var color = parentColor || 'var(--presentation-primary)';
      var html = '<div class="seqarrow-container" data-element-type="arrow-vertical">';
      for (var i = 0; i < total; i++) {
        var innerHtml = renderChildren(children[i].children || []);
        html += '<div data-element-type="arrow-vertical-item">';
        html += '<div class="seqarrow-item" style="background:' + color + ';color:var(--presentation-background)">' + innerHtml + '</div>';
        if (i < total - 1) {
          html += '<div class="seqarrow-arrow" style="border-top-color:' + color + '"></div>';
        }
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderButton(node) {
      var variant = node.variant || 'filled';
      var size = node.size || 'md';
      var color = node.color || 'var(--presentation-primary)';
      var text = extractText(node);

      var paddingMap = { sm: '4px 12px', md: '8px 16px', lg: '12px 24px' };
      var fontSizeMap = { sm: '14px', md: '16px', lg: '18px' };
      var padding = paddingMap[size] || paddingMap.md;
      var fontSize = fontSizeMap[size] || fontSizeMap.md;

      var btnStyle;
      if (variant === 'outline') {
        btnStyle = 'color:' + color + ';background:transparent;border:2px solid ' + color;
      } else if (variant === 'ghost') {
        btnStyle = 'color:' + color + ';background:transparent;border:none';
      } else {
        btnStyle = 'color:var(--presentation-background);background:' + color + ';border:none';
      }

      return '<span data-element-type="button" class="presentation-button" style="padding:' + padding + ';font-size:' + fontSize + ';' + btnStyle + '">' + escapeHtml(text) + '</span>';
    }

    function renderTable(children) {
      if (!Array.isArray(children)) return '';
      var hasHeader = false;
      for (var r = 0; r < children.length; r++) {
        var cells = children[r].children || [];
        for (var c = 0; c < cells.length; c++) {
          if (cells[c].type === 'th') { hasHeader = true; break; }
        }
        if (hasHeader) break;
      }
      var html = '<table class="export-table" data-element-type="table"><tbody>';
      for (var r = 0; r < children.length; r++) {
        var row = children[r];
        var rowCells = row.children || [];
        html += '<tr>';
        for (var c = 0; c < rowCells.length; c++) {
          var cell = rowCells[c];
          var tag = cell.type === 'th' || (hasHeader && r === 0) ? 'th' : 'td';
          var innerHtml = renderChildren(cell.children || []);
          html += '<' + tag + '>' + innerHtml + '</' + tag + '>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      return html;
    }

    function renderChartBar(data) {
      if (!Array.isArray(data) || data.length === 0) return '';
      var labelKey = 'label' in data[0] ? 'label' : ('name' in data[0] ? 'name' : 'label');
      var valueKey = 'value' in data[0] ? 'value' : ('count' in data[0] ? 'count' : 'value');
      var maxVal = 0;
      for (var i = 0; i < data.length; i++) {
        if (data[i][valueKey] > maxVal) maxVal = data[i][valueKey];
      }
      if (maxVal === 0) maxVal = 1;
      var html = '<div class="chart-container" data-element-type="chart-bar">';
      for (var i = 0; i < data.length; i++) {
        var pct = (data[i][valueKey] / maxVal) * 100;
        var chartColor = 'hsl(var(--chart-' + ((i % 5) + 1) + '))';
        html += '<div class="chart-bar-item">';
        html += '<span class="chart-bar-label">' + escapeHtml(String(data[i][labelKey])) + '</span>';
        html += '<div class="chart-bar-track"><div class="chart-bar-fill" style="width:' + pct + '%;background:' + chartColor + '"></div></div>';
        html += '<span class="chart-bar-value">' + data[i][valueKey] + '</span>';
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderChartPie(data) {
      if (!Array.isArray(data) || data.length === 0) return '';
      var labelKey = 'label' in data[0] ? 'label' : ('name' in data[0] ? 'name' : 'label');
      var valueKey = 'value' in data[0] ? 'value' : ('count' in data[0] ? 'count' : 'value');
      var total = 0;
      for (var i = 0; i < data.length; i++) total += data[i][valueKey] || 0;
      if (total === 0) total = 1;
      var conicParts = [];
      var angleSum = 0;
      for (var i = 0; i < data.length; i++) {
        var pct = (data[i][valueKey] / total) * 100;
        var chartColor = 'hsl(var(--chart-' + ((i % 5) + 1) + '))';
        angleSum += pct;
        conicParts.push(chartColor + ' ' + (angleSum - pct) + '% ' + angleSum + '%');
      }
      var html = '<div class="chart-container" data-element-type="chart-pie">';
      html += '<div class="chart-pie-wrapper">';
      html += '<div class="chart-pie-visual" style="background:conic-gradient(' + conicParts.join(', ') + ')"></div>';
      html += '<div class="chart-legend">';
      for (var i = 0; i < data.length; i++) {
        var chartColor = 'hsl(var(--chart-' + ((i % 5) + 1) + '))';
        html += '<div class="chart-legend-item">';
        html += '<div class="chart-legend-swatch" style="background:' + chartColor + '"></div>';
        html += '<span>' + escapeHtml(String(data[i][labelKey])) + ' — ' + data[i][valueKey] + '</span>';
        html += '</div>';
      }
      html += '</div></div></div>';
      return html;
    }

    function renderChartDataTable(data) {
      if (!Array.isArray(data) || data.length === 0) return '';
      var keys = Object.keys(data[0]).filter(function(k) { return k !== 'id'; });
      var html = '<div class="chart-container" data-element-type="chart"><table class="chart-data-table">';
      html += '<thead><tr>';
      for (var k = 0; k < keys.length; k++) {
        html += '<th>' + escapeHtml(keys[k]) + '</th>';
      }
      html += '</tr></thead><tbody>';
      for (var r = 0; r < data.length; r++) {
        html += '<tr>';
        for (var k = 0; k < keys.length; k++) {
          html += '<td>' + escapeHtml(String(data[r][keys[k]])) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    }

    // === Main Dispatch ===
    function renderNode(node, index, siblings) {
      if (!node || typeof node !== 'object') return '';
      var type = node.type;
      var children = node.children || [];

      switch (type) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          return renderHeading(type, node);
        case 'p':
          return renderParagraph(node);
        case 'img':
          return renderImage(node);
        case 'bullets':
          return renderBullets(children, node.color);
        case 'column_group':
          return renderColumnGroup(children);
        case 'pyramid':
          return renderPyramid(children, node.color);
        case 'cycle':
          return renderCycle(children, node.color);
        case 'timeline':
          return renderTimeline(children, node);
        case 'staircase':
          return renderStaircase(children, node.color);
        case 'arrows':
          return renderArrows(children, node.color);
        case 'icons':
          return renderIcons(children);
        case 'boxes':
          return renderBoxes(children, node.color);
        case 'compare':
          return renderCompare(children, node.color);
        case 'before-after':
          return renderBeforeAfter(children, node.color);
        case 'pros-cons':
          return renderProsCons(children);
        case 'arrow-vertical':
          return renderArrowVertical(children, node.color);
        case 'button':
          return renderButton(node);
        case 'table':
          return renderTable(children);
        case 'chart-bar':
          return renderChartBar(node.data);
        case 'chart-pie':
          return renderChartPie(node.data);
        case 'chart-line': case 'chart-area': case 'chart-radar': case 'chart-scatter':
          return renderChartDataTable(node.data);
        default:
          if (children.length > 0) {
            return renderChildren(children);
          }
          var t = extractText(node);
          return t ? '<p class="presentation-paragraph">' + escapeHtml(t) + '</p>' : '';
      }
    }

    // === Build Slide ===
    function renderSlide() {
      var container = document.getElementById('slide-content');
      var loading = document.getElementById('loading');
      if (!container) return;

      var html = '<div class="content-area">';
      html += renderChildren(slideData.content);
      html += '</div>';

      // Image area for left/right/vertical layouts
      if (slideData.rootImage && slideData.rootImage.url && slideData.layoutType && slideData.layoutType !== 'background') {
        html += '<div class="image-area" style="background-image: url(' + resolveUrl(slideData.rootImage.url) + ')"></div>';
      }

      container.innerHTML = html;
      if (loading) loading.classList.add('hidden');

      // Signal ready
      Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        waitForImages()
      ]).then(function () {
        window.slideReady = true;
        if (mode === 'measure' && typeof window.measureElements === 'function') {
          window.measurementsReady = true;
        }
      });
    }

    function waitForImages() {
      return new Promise(function (resolve) {
        var images = document.querySelectorAll('#slide-content img');
        var bgEls = document.querySelectorAll('#slide-content [style*="background-image"]');
        if (images.length === 0 && bgEls.length === 0) {
          resolve(); return;
        }
        var loaded = 0;
        var total = images.length + bgEls.length;
        var checkDone = function () {
          loaded++;
          if (loaded >= total) resolve();
        };
        images.forEach(function (img) {
          if (img.complete) checkDone();
          else { img.addEventListener('load', checkDone); img.addEventListener('error', checkDone); }
        });
        bgEls.forEach(function () { setTimeout(checkDone, 500); });
        setTimeout(resolve, 5000);
      });
    }

    try { renderSlide(); } catch(e) {
      console.error('Slide render error:', e);
      document.getElementById('loading')?.remove();
      window.slideReady = true;
    }
  </script>
</body>
</html>`;
}
