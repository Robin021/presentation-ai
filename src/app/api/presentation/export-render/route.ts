/**
 * Export Render API Route
 * Supports two modes:
 * 1. HTML mode (default) - Returns rendered HTML for screenshot
 * 2. Measure mode - Returns JSON with element measurements for accurate PPT positioning
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
    const themeName = (presentation.presentation as { themeName?: string })?.themeName ?? "default";
    const themeColors = themes[themeName as keyof typeof themes]?.colors?.light ?? themes.daktilo.colors.light;

    // Generate HTML response for measurement/screenshot
    const html = generateSlideHTML(slide, themeColors, slideIndex, mode);

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
  mode: string
): string {
  // Convert slide content to JSON for client-side rendering
  const slideData = JSON.stringify(slide);
  const themeData = JSON.stringify(themeColors);

  // Measurement script that extracts element positions
  const measurementScript = mode === "measure" ? `
    // Measurement function that returns element positions
    window.measureElements = function() {
      const container = document.getElementById('slide-content');
      if (!container) return [];
      
      const measurements = [];
      const slideRect = container.getBoundingClientRect();
      
      // Measure all content elements
      const elements = container.querySelectorAll('[data-element-type]');
      elements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        measurements.push({
          index: index,
          type: el.getAttribute('data-element-type'),
          x: rect.left - slideRect.left,
          y: rect.top - slideRect.top,
          width: rect.width,
          height: rect.height,
          text: el.textContent || '',
          styles: {
            fontSize: window.getComputedStyle(el).fontSize,
            fontWeight: window.getComputedStyle(el).fontWeight,
            color: window.getComputedStyle(el).color,
            textAlign: window.getComputedStyle(el).textAlign,
          }
        });
      });
      
      return measurements;
    };
    
    // Signal ready after measurement
    window.measurementsReady = false;
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide ${slideIndex + 1} - Export</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
      `background-image: url(${slide.rootImage.url}); background-size: cover; background-position: center;` : ''}
    }
    
    .content-area {
      flex: ${slide.rootImage && slide.layoutType !== 'background' ? '0 0 55%' : '1'};
      padding: 48px;
      display: flex;
      flex-direction: column;
      justify-content: ${slide.alignment === 'center' ? 'center' :
      slide.alignment === 'end' ? 'flex-end' : 'flex-start'};
    }
    
    .image-area {
      flex: 0 0 45%;
      background-size: cover;
      background-position: center;
    }
    
    h1 {
      font-size: 72px;
      font-weight: bold;
      color: ${themeColors.heading};
      margin-bottom: 24px;
      line-height: 1.2;
    }
    
    h2 {
      font-size: 48px;
      font-weight: bold;
      color: ${themeColors.heading};
      margin-bottom: 20px;
      line-height: 1.3;
    }
    
    h3 {
      font-size: 36px;
      font-weight: 600;
      color: ${themeColors.heading};
      margin-bottom: 16px;
      line-height: 1.3;
    }
    
    p {
      font-size: 24px;
      color: ${themeColors.text};
      margin-bottom: 16px;
      line-height: 1.6;
    }
    
    .bullet-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      margin: 16px 0;
    }
    
    .bullet-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    
    .bullet-number {
      width: 40px;
      height: 40px;
      background: ${themeColors.primary};
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 16px;
      flex-shrink: 0;
    }
    
    .bullet-text {
      font-size: 18px;
      color: ${themeColors.text};
      line-height: 1.5;
    }
    
    .column-group {
      display: flex;
      gap: 24px;
      width: 100%;
    }
    
    .column {
      flex: 1;
    }
    
    /* Loading state */
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
    // Slide data passed from server
    const slideData = ${slideData};
    const themeColors = ${themeData};
    const mode = '${mode}';
    
    ${measurementScript}
    
    // Render the slide
    function renderSlide() {
      const container = document.getElementById('slide-content');
      const loading = document.getElementById('loading');
      
      // Build content HTML
      let html = '<div class="content-area">';
      html += renderContent(slideData.content);
      html += '</div>';
      
      // Add image area if applicable
      if (slideData.rootImage && slideData.rootImage.url && slideData.layoutType && slideData.layoutType !== 'background') {
        html += '<div class="image-area" style="background-image: url(' + slideData.rootImage.url + ')"></div>';
      }
      
      container.innerHTML = html;
      loading.classList.add('hidden');
      
      // Wait for fonts and images, then signal ready
      Promise.all([
        document.fonts?.ready || Promise.resolve(),
        waitForImages()
      ]).then(() => {
        if (mode === 'measure') {
          window.measurementsReady = true;
        }
        window.slideReady = true;
      });
    }
    
    function renderContent(content) {
      if (!Array.isArray(content)) return '';
      
      let html = '';
      
      for (const node of content) {
        const type = node.type;
        const text = extractText(node);
        
        if (type === 'h1') {
          html += '<h1 data-element-type="h1">' + escapeHtml(text) + '</h1>';
        } else if (type === 'h2') {
          html += '<h2 data-element-type="h2">' + escapeHtml(text) + '</h2>';
        } else if (type === 'h3') {
          html += '<h3 data-element-type="h3">' + escapeHtml(text) + '</h3>';
        } else if (type === 'h4') {
          html += '<h4 data-element-type="h4" style="font-size:28px;font-weight:600;margin-bottom:12px;color:' + themeColors.heading + '">' + escapeHtml(text) + '</h4>';
        } else if (type === 'p') {
          html += '<p data-element-type="p">' + escapeHtml(text) + '</p>';
        } else if (type === 'bullets' && node.children) {
          html += '<div class="bullet-container" data-element-type="bullets">';
          node.children.forEach((bullet, i) => {
            if (bullet.type === 'bullet') {
              const bulletText = extractText(bullet);
              html += '<div class="bullet-item" data-element-type="bullet-item">';
              html += '<div class="bullet-number">' + (i + 1) + '</div>';
              html += '<div class="bullet-text">' + escapeHtml(bulletText) + '</div>';
              html += '</div>';
            }
          });
          html += '</div>';
        } else if (type === 'column_group' && node.children) {
          html += '<div class="column-group" data-element-type="column_group">';
          node.children.forEach(col => {
            if (col.type === 'column') {
              html += '<div class="column" data-element-type="column">';
              html += renderContent(col.children);
              html += '</div>';
            }
          });
          html += '</div>';
        } else if (text) {
          html += '<p data-element-type="text">' + escapeHtml(text) + '</p>';
        }
      }
      
      return html;
    }
    
    function extractText(node) {
      if (typeof node === 'string') return node;
      if (node.text) return node.text;
      if (Array.isArray(node.children)) {
        return node.children.map(extractText).join(' ').trim();
      }
      return '';
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function waitForImages() {
      return new Promise(resolve => {
        const images = document.querySelectorAll('img');
        const bgImages = document.querySelectorAll('[style*="background-image"]');
        
        if (images.length === 0 && bgImages.length === 0) {
          resolve();
          return;
        }
        
        let loaded = 0;
        const total = images.length + bgImages.length;
        
        const checkDone = () => {
          loaded++;
          if (loaded >= total) resolve();
        };
        
        images.forEach(img => {
          if (img.complete) checkDone();
          else {
            img.addEventListener('load', checkDone);
            img.addEventListener('error', checkDone);
          }
        });
        
        // For background images, wait a bit
        bgImages.forEach(() => {
          setTimeout(checkDone, 500);
        });
        
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      });
    }
    
    // Start rendering
    renderSlide();
  </script>
</body>
</html>`;
}
