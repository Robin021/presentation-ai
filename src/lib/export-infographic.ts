/**
 * Export infographics in various formats: HTML, PDF, PPT
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import pptxgen from 'pptxgenjs';
import { Infographic } from '@antv/infographic';

// ===== HTML Export =====

export function exportInfographicToHTML(dsl: string, topic: string, theme?: string): void {
    const html = generateHTMLTemplate(dsl, topic, theme);
    downloadHTML(html, `${sanitizeFilename(topic)}-infographic.html`);
}

function generateHTMLTemplate(syntax: string, title: string, theme?: string): string {
    // Determine font family based on theme
    const isPorsche = theme === 'porsche';
    const fontFamily = isPorsche
        ? "'Porsche Next TT', 'porsche-next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // Font face declaration for Porsche font (embedded as base64 or external URL)
    const fontFaceDeclaration = isPorsche ? `
        @font-face {
            font-family: 'Porsche Next TT';
            src: url('/fonts/porsche-next.woff2') format('woff2');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
        }
        @font-face {
            font-family: 'porsche-next';
            src: url('/fonts/porsche-next.woff2') format('woff2');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
        }
    ` : '';
    // Split by ---SLIDE--- separator
    const slides = syntax.split('---SLIDE---').map(s => s.trim()).filter(Boolean);
    const slidesJSON = JSON.stringify(slides.map(s => escapeSyntax(s)));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - Infographic</title>
    <style>
        ${fontFaceDeclaration}
        body, html { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            overflow: hidden; 
            font-family: ${fontFamily};
        }
        #container { width: 100%; height: calc(100% - 60px); }
        #controls { 
            height: 60px; 
            background: #000; 
            color: #fff; 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            padding: 0 20px;
        }
        button { 
            background: #333; 
            color: #fff; 
            border: none; 
            padding: 8px 16px; 
            border-radius: 4px; 
            cursor: pointer;
            font-size: 14px;
        }
        button:hover:not(:disabled) { background: #555; }
        button:disabled { opacity: 0.3; cursor: not-allowed; }
        #slideCounter { font-size: 14px; }
        .nav-group { display: flex; gap: 10px; }
    </style>
</head>
<body>
<div id="container"></div>
<div id="controls">
    <div class="nav-group">
        <button id="prevBtn" onclick="previousSlide()">← Previous</button>
        <button id="nextBtn" onclick="nextSlide()">Next →</button>
    </div>
    <div id="slideCounter"></div>
</div>
<script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
<script>
// Slides data
const slides = ${slidesJSON};
let currentSlide = 0;

// Icon Resource Loader
const svgTextCache = new Map();
const pendingRequests = new Map();

AntVInfographic.registerResourceLoader(async (config) => {
    const { data, scene } = config;
    try {
        const key = \`\${scene}::\${data}\`;
        let svgText;

        if (svgTextCache.has(key)) {
            svgText = svgTextCache.get(key);
        } else if (pendingRequests.has(key)) {
            svgText = await pendingRequests.get(key);
        } else {
            const fetchPromise = (async () => {
                try {
                    let url;
                    if (scene === 'icon') {
                        url = \`https://api.iconify.design/\${data}.svg\`;
                    } else return null;

                    if (!url) return null;

                    const response = await fetch(url, { referrerPolicy: 'no-referrer' });
                    if (!response.ok) {
                        console.error(\`HTTP \${response.status}: Failed to load \${url}\`);
                        return null;
                    }

                    const text = await response.text();
                    if (!text || !text.trim().startsWith('<svg')) {
                        console.error(\`Invalid SVG content from \${url}\`);
                        return null;
                    }

                    svgTextCache.set(key, text);
                    return text;
                } catch (fetchError) {
                    console.error(\`Failed to fetch resource \${key}:\`, fetchError);
                    return null;
                }
            })();

            pendingRequests.set(key, fetchPromise);
            try {
                svgText = await fetchPromise;
            } finally {
                pendingRequests.delete(key);
            }
        }

        if (!svgText) return null;
        const resource = AntVInfographic.loadSVGResource(svgText);
        if (!resource) {
            svgTextCache.delete(key);
            return null;
        }
        return resource;
    } catch (error) {
        console.error('Unexpected error in resource loader:', error);
        return null;
    }
});

// Initialize infographic
const infographic = new AntVInfographic.Infographic({
    container: '#container',
    width: '100%',
    height: '100%',
});

function renderSlide(index) {
    infographic.render(slides[index]);
    document.getElementById('slideCounter').textContent = \`Slide \${index + 1} / \${slides.length}\`;
    document.getElementById('prevBtn').disabled = index === 0;
    document.getElementById('nextBtn').disabled = index === slides.length - 1;
}

function nextSlide() {
    if (currentSlide < slides.length - 1) {
        currentSlide++;
        renderSlide(currentSlide);
    }
}

function previousSlide() {
    if (currentSlide > 0) {
        currentSlide--;
        renderSlide(currentSlide);
    }
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') previousSlide();
});

// Initial render
renderSlide(0);
document.fonts?.ready.then(() => {
    renderSlide(0);
}).catch((error) => console.error('Error waiting for fonts to load:', error));
</script>
</body>
</html>`;
}

// ===== PDF Export =====

export async function exportInfographicToPDF(slides: string[], topic: string, onProgress?: (current: number, total: number) => void): Promise<void> {
    try {
        // Create temporary container for rendering
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = '1920px';
        tempContainer.style.height = '1080px';
        document.body.appendChild(tempContainer);

        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [1920, 1080],
        });

        for (let i = 0; i < slides.length; i++) {
            onProgress?.(i + 1, slides.length);

            // Render infographic
            tempContainer.innerHTML = '<div class="infographic-container" style="width:100%;height:100%"></div>';
            const container = tempContainer.querySelector('.infographic-container') as HTMLDivElement;

            // Use npm Infographic package to render
            const infographic = new Infographic({
                container: container,
                width: 1920,
                height: 1080,
                editable: false,
            });
            infographic.render(slides[i]);

            // Wait for rendering to complete
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Capture as image
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/png');

            if (i > 0) {
                pdf.addPage();
            }

            pdf.addImage(imgData, 'PNG', 0, 0, 1920, 1080);
        }

        // Cleanup
        document.body.removeChild(tempContainer);

        // Download
        pdf.save(`${sanitizeFilename(topic)}-infographic.pdf`);
    } catch (error) {
        console.error('PDF export failed:', error);
        throw error;
    }
}

// ===== PPT Export =====

// Helper interface for extracted text
interface ExtractedText {
    text: string;
    x: number | string;
    y: number | string;
    w: number | string;
    h: number | string;
    fontSize: number;
    fontFace: string;
    color: string;
    align: 'left' | 'center' | 'right';
    isRotated?: boolean;
    rotation?: number;
}

export async function exportInfographicToPPT(slides: string[], topic: string, onProgress?: (current: number, total: number) => void): Promise<void> {
    try {
        const pptx = new pptxgen();
        pptx.layout = 'LAYOUT_16x9';
        // 16x9 layout is 10 x 5.625 inches
        const PPT_WIDTH_INCH = 10;
        const PPT_HEIGHT_INCH = 5.625;

        // Canvas size used in rendering
        const CANVAS_WIDTH_PX = 1920;
        const CANVAS_HEIGHT_PX = 1080;

        pptx.author = 'AI Infographic Generator';
        pptx.title = topic;

        // Create temporary container for rendering
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = `${CANVAS_WIDTH_PX}px`;
        tempContainer.style.height = `${CANVAS_HEIGHT_PX}px`;
        // Ensure fonts are available
        tempContainer.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        document.body.appendChild(tempContainer);

        for (let i = 0; i < slides.length; i++) {
            onProgress?.(i + 1, slides.length);

            // --- Safety Valve: Dense Data Check (Same as Renderer) ---
            let slideDsl = slides[i] || ''; // explicit fallback
            const match = slideDsl.match(/^infographic\s+(\S+)/);
            if (match) {
                const templateName = match[1];
                if (templateName) {
                    const isCircular = templateName.includes('chart-pie') || templateName.includes('chart-donut') || templateName.includes('rose');
                    if (isCircular) {
                        const count = (slideDsl.match(/- label/g) || []).length;
                        if (count > 8) {
                            console.warn(`[Export] Auto-switching dense chart (${count} items) to chart-bar-plain-text.`);
                            slideDsl = slideDsl.replace(`infographic ${templateName}`, `infographic chart-bar-plain-text`);
                            // Data Cleaning: Remove (30%) from "Label (30%)" to save space
                            slideDsl = slideDsl.replace(/(\n\s*-\s*label\s+.*?)(\s*[(（]\d+[%％][)）])/g, '$1');
                        }
                    }
                }
            }

            // Render infographic
            tempContainer.innerHTML = '<div class="infographic-container" style="width:100%;height:100%"></div>';
            const container = tempContainer.querySelector('.infographic-container') as HTMLDivElement;

            // Use npm Infographic package to render
            const infographic = new Infographic({
                container: container,
                width: CANVAS_WIDTH_PX,
                height: CANVAS_HEIGHT_PX,
                editable: false,
            });
            infographic.render(slideDsl);

            // Wait for rendering to complete
            await new Promise(resolve => setTimeout(resolve, 1500));

            // --- Step 1: Extract Text ---
            const textNodes: ExtractedText[] = [];
            const svgElement = container.querySelector('svg');
            const canvasElement = container.querySelector('canvas');

            if (canvasElement && !svgElement) {
                console.warn('[InfographicExport] Rendered as Canvas, text extraction not possible directly.');
            }

            if (svgElement) {
                console.log('[InfographicExport] SVG found, extracting text...');
                // Find all text elements
                const textElements = svgElement.querySelectorAll('text');
                const foreignObjects = svgElement.querySelectorAll('foreignObject');

                console.log(`[InfographicExport] Found ${textElements.length} text elements and ${foreignObjects.length} foreignObjects.`);

                // Helper to process element
                const processTextNode = (el: SVGTextElement | SVGForeignObjectElement, isForeign: boolean) => {
                    const textContent = el.textContent?.trim();
                    if (!textContent) return;

                    // Get Layout and Styles
                    // For foreignObject, the style (color, font) is often on the inner standard HTML component (div/span)
                    // NOT on the foreignObject tag itself.
                    let targetEl: Element = el;
                    if (isForeign) {
                        // Robustly find the deepest element that actually contains the text
                        const findTextParent = (node: Element): Element | null => {
                            if (node.children.length === 0) return node;
                            // Prefer children that resemble text containers
                            for (let i = 0; i < node.children.length; i++) {
                                const child = node.children[i];
                                // If this child has the text content we are looking for (or a significant part), go deeper
                                if (child && child.textContent?.trim().length) {
                                    return findTextParent(child);
                                }
                            }
                            return node; // Fallback
                        };

                        const deepNode = findTextParent(el);
                        if (deepNode) targetEl = deepNode;
                    }

                    const style = window.getComputedStyle(targetEl);
                    if (!style) return;

                    const containerRect = container.getBoundingClientRect();
                    const elRect = el.getBoundingClientRect(); // Use the wrapper's rect for positioning

                    if (elRect.width === 0 || elRect.height === 0) return;

                    // Width/Height Buffers
                    // Increase width buffer to allow for wider PPT fonts without wrapping
                    const widthBufferScale = 1.15; // 15% wider
                    const heightBufferScale = 1.05; // 5% taller

                    const originalW = elRect.width / containerRect.width;
                    const originalH = elRect.height / containerRect.height;
                    const originalX = (elRect.left - containerRect.left) / containerRect.width;
                    const originalY = (elRect.top - containerRect.top) / containerRect.height;

                    const newW = originalW * widthBufferScale;
                    const newH = originalH * heightBufferScale;

                    // Adjust X and Y to maintain center
                    const newX = originalX - ((newW - originalW) / 2);
                    const newY = originalY - ((newH - originalH) / 2);

                    // Styles
                    const fontSizePx = parseFloat(style.fontSize) || 12;
                    // Slightly reduce font scale to prevent "bursting" in PPT (PPT fonts often render wider)
                    // Reduce to 0.65 based on user feedback that text looks too big
                    const fontSizePt = Math.max(6, fontSizePx * 0.65);

                    let align: 'left' | 'center' | 'right' = 'left';
                    const anchor = el.getAttribute('text-anchor');
                    if (anchor === 'middle') align = 'center';
                    if (anchor === 'end') align = 'right';

                    // For foreignObject (often HTML centered text), check textAlign
                    if (isForeign) {
                        const textAlign = style.textAlign;
                        if (textAlign === 'center') align = 'center';
                        if (textAlign === 'right') align = 'right';
                    }

                    // Extract accurate color (handle rgb/rgba/hex)
                    let finalColor = style.getPropertyValue('color') || '#000000';
                    // If fill is set on SVG text, use that
                    if (!isForeign && style.fill && style.fill !== 'none') {
                        finalColor = style.fill;
                    }

                    textNodes.push({
                        text: textContent,
                        x: newX,     // Store as number for calculation
                        y: newY,     // Store as number for calculation
                        w: newW,     // Store as number
                        h: newH,     // Store as number
                        fontSize: fontSizePt,
                        fontFace: (style.getPropertyValue('font-family') || 'Arial').split(',')[0].replace(/['"]/g, ''),
                        color: rgbToHex(finalColor),
                        align
                    });

                    // Hide the text for image capture
                    if (el instanceof HTMLElement || el instanceof SVGElement) {
                        // Use visibility hidden instead of opacity for stronger guarantee with html2canvas
                        el.style.visibility = 'hidden';
                    }
                };

                textElements.forEach(el => processTextNode(el, false));
                foreignObjects.forEach(el => processTextNode(el, true));

                // Iterative Collision Detection & Resolution
                // Run multiple passes to handle cascading shifts
                for (let pass = 0; pass < 3; pass++) {
                    // Sort by Y position to process top-down
                    textNodes.sort((a, b) => (a.y as number) - (b.y as number));

                    for (let i = 0; i < textNodes.length; i++) {
                        for (let j = i + 1; j < textNodes.length; j++) {
                            const topInfo = textNodes[i];
                            const bottomInfo = textNodes[j];

                            if (!topInfo || !bottomInfo) continue;

                            const topX = topInfo.x as number;
                            const topW = topInfo.w as number;
                            const topY = topInfo.y as number;
                            const topH = topInfo.h as number;

                            const bottomX = bottomInfo.x as number;
                            const bottomW = bottomInfo.w as number;
                            const bottomY = bottomInfo.y as number;

                            // Check if they are horizontally related (overlap in X range)
                            const overlapX = Math.max(0, Math.min(topX + topW, bottomX + bottomW) - Math.max(topX, bottomX));

                            // If they overlap horizontally significantly (> 20% of width of the smaller one), check vertical
                            // Using smaller width ensures we catch cases where a small title sits over a wide description
                            const minWidth = Math.min(topW, bottomW);
                            if (overlapX > (minWidth * 0.2)) {
                                const bottomOfTop = topY + topH;
                                const topOfBottom = bottomY;

                                // If overlapping vertically or too close
                                if (topOfBottom < bottomOfTop) {
                                    // Shift bottom node down
                                    const shift = bottomOfTop - topOfBottom + 0.01; // +1% buffer (increased from 0.5%)
                                    // Update the stored value
                                    textNodes[j] = { ...bottomInfo, y: bottomY + shift };
                                }
                            }
                        }
                    }
                }

                console.log(`[InfographicExport] Extracted ${textNodes.length} text nodes.`);
            } else {
                console.error('[InfographicExport] No SVG element found in container.');
            }

            // Wait for render/hide
            await new Promise(resolve => setTimeout(resolve, 100));

            // --- Step 2: Capture Background Image (without text) ---
            const canvas = await html2canvas(container, {
                useCORS: true,
                scale: 2, // Higher scale for better image quality
                backgroundColor: null, // Transparent background
                logging: false,
                ignoreElements: (element) => {
                    // Check if element is one of our hidden text nodes
                    return element instanceof HTMLElement && element.style.visibility === 'hidden';
                }
            });

            const imgData = canvas.toDataURL('image/png');

            // --- Step 3: Add to PPT ---
            const slide = pptx.addSlide();

            // Add background image (visuals without text)
            slide.addImage({
                data: imgData,
                x: 0,
                y: 0,
                w: '100%',
                h: '100%',
            });

            // Add Editable Text Overlays
            textNodes.forEach(node => {
                slide.addText(node.text || '', {
                    x: `${(node.x as number) * 100}%`,
                    y: `${(node.y as number) * 100}%`,
                    w: `${(node.w as number) * 100}%`,
                    h: `${(node.h as number) * 100}%`,
                    fontSize: node.fontSize,
                    fontFace: node.fontFace || 'Arial',
                    color: (node.color || '000000').replace('#', ''),
                    align: node.align,
                    valign: 'middle', // Vertically center text in the box
                    margin: 0, // CRITICAL: Remove default margins (0.1in) to prevent overflow/overlap
                    fill: { color: 'FFFFFF', transparency: 100 } // Transparent background alternate
                });
            });
        }

        // Cleanup
        document.body.removeChild(tempContainer);

        // Download
        await pptx.writeFile({ fileName: `${sanitizeFilename(topic)}-infographic.pptx` });
    } catch (error) {
        console.error('PPT export failed:', error);
        throw error;
    }
}

// Helper: RGB to Hex
function rgbToHex(color: string): string {
    if (!color) return '#000000';
    if (color.startsWith('#')) return color;

    const rgb = color.match(/\d+/g);
    if (!rgb || rgb.length < 3) return '#000000';

    const r = parseInt(rgb[0]).toString(16).padStart(2, '0');
    const g = parseInt(rgb[1]).toString(16).padStart(2, '0');
    const b = parseInt(rgb[2]).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
}

// ===== Utility Functions =====

function downloadHTML(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function sanitizeFilename(filename: string): string {
    return filename
        .replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeSyntax(syntax: string): string {
    return syntax
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
}
