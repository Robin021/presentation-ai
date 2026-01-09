/**
 * Export infographics in various formats: HTML, PDF, PPT
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import pptxgen from 'pptxgenjs';
import { Infographic } from '@antv/infographic';

// ===== HTML Export =====

export function exportInfographicToHTML(dsl: string, topic: string): void {
    const html = generateHTMLTemplate(dsl, topic);
    downloadHTML(html, `${sanitizeFilename(topic)}-infographic.html`);
}

function generateHTMLTemplate(syntax: string, title: string): string {
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
        body, html { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            overflow: hidden; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

export async function exportInfographicToPPT(slides: string[], topic: string, onProgress?: (current: number, total: number) => void): Promise<void> {
    try {
        const pptx = new pptxgen();
        pptx.layout = 'LAYOUT_16x9';
        pptx.author = 'AI Infographic Generator';
        pptx.title = topic;

        // Create temporary container for rendering
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = '1920px';
        tempContainer.style.height = '1080px';
        document.body.appendChild(tempContainer);

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

            // Add slide to PPT
            const slide = pptx.addSlide();
            slide.addImage({
                data: imgData,
                x: 0,
                y: 0,
                w: '100%',
                h: '100%',
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
