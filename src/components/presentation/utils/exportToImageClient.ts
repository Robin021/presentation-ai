/**
 * Client-side presentation image export.
 * Renders each slide in a hidden iframe, captures as JPEG via html2canvas,
 * and packages into a PPTX file — no server-side browser required.
 */
"use client";

import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas-pro";

export async function exportPresentationAsImagesClient(
  presentationId: string,
  totalSlides: number,
  fileName?: string,
  themeName?: string,
  isDark?: boolean,
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = fileName || "Presentation";

  for (let i = 0; i < totalSlides; i++) {
    // Fetch slide HTML from the same-origin render API with theme parameters
    const params = new URLSearchParams({
      id: presentationId,
      slideIndex: i.toString(),
      mode: "html",
    });
    
    // Pass theme information to ensure consistent rendering
    if (themeName) {
      params.append("themeName", themeName);
    }
    if (isDark !== undefined) {
      params.append("themeDark", isDark.toString());
    }
    
    const res = await fetch(
      `/api/presentation/export-render?${params.toString()}`,
    );
    if (!res.ok) {
      throw new Error(`Failed to load slide ${i + 1} (${res.status})`);
    }
    const html = await res.text();

    // Create hidden same-origin iframe to render the full slide HTML
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "1920px";
    iframe.style.height = "1080px";
    iframe.style.border = "none";
    iframe.style.background = "#ffffff";
    // Sandbox: allow scripts (needed for the inline renderer) and
    // same-origin (needed for html2canvas to read the DOM).
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    document.body.appendChild(iframe);

    // Load the HTML into the iframe
    iframe.srcdoc = html;

    // Wait for the iframe to finish loading
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn(`Slide ${i + 1} iframe load timed out, continuing`);
        resolve();
      }, 20000);

      iframe.addEventListener(
        "load",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });

    // Give fonts and async rendering time to settle
    try {
      await (iframe.contentDocument?.fonts?.ready ?? Promise.resolve());
    } catch {
      // Font loading is non-critical
    }
    
    // Wait longer for images and fonts to fully load
    await new Promise((r) => setTimeout(r, 2000));
    
    // Ensure all images are loaded
    const images = iframe.contentDocument?.querySelectorAll('img') || [];
    await Promise.all(
      Array.from(images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = () => resolve(null);
          img.onerror = () => resolve(null);
          // Timeout after 5 seconds
          setTimeout(() => resolve(null), 5000);
        });
      })
    );

    // Capture the slide as a JPEG image with higher quality
    const canvas = await html2canvas(
      iframe.contentDocument!.documentElement,
      {
        scale: 2, // Increase scale for better quality
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1920,
        height: 1080,
        logging: false,
        // Allow html2canvas to traverse into foreignObject / shadow roots
        // that the slide renderer may produce
        allowTaint: false,
        imageTimeout: 15000, // Increase image loading timeout
      },
    );

    const imgData = canvas.toDataURL("image/jpeg", 0.9);

    // Add as a full-slide image
    const slide = pptx.addSlide();
    slide.addImage({
      data: imgData,
      x: 0,
      y: 0,
      w: 10,
      h: 5.625,
      sizing: { type: "cover", w: 10, h: 5.625 },
    });

    // Clean up the iframe
    document.body.removeChild(iframe);
  }

  // Generate the PPTX blob and trigger a download
  const blob = await pptx.write({ outputType: "blob" });
  const url = URL.createObjectURL(blob as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName ?? "presentation"}.pptx`;
  document.body.appendChild(link);
  link.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
