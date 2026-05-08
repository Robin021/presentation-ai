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
  themeOptions?: {
    themeColors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      text: string;
      heading: string;
      muted: string;
    };
    headingFont?: string;
    bodyFont?: string;
    isDark?: boolean;
  },
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = fileName || "Presentation";

  for (let i = 0; i < totalSlides; i++) {
    // Build URL with theme color overrides from the client
    let url = `/api/presentation/export-render?id=${presentationId}&slideIndex=${i}&mode=html`;
    if (themeOptions) {
      const { themeColors, headingFont, bodyFont, isDark } = themeOptions;
      url += `&primary=${encodeURIComponent(themeColors.primary)}`;
      url += `&secondary=${encodeURIComponent(themeColors.secondary)}`;
      url += `&accent=${encodeURIComponent(themeColors.accent)}`;
      url += `&background=${encodeURIComponent(themeColors.background)}`;
      url += `&text=${encodeURIComponent(themeColors.text)}`;
      url += `&heading=${encodeURIComponent(themeColors.heading)}`;
      url += `&muted=${encodeURIComponent(themeColors.muted)}`;
      if (headingFont) url += `&fontHeading=${encodeURIComponent(headingFont)}`;
      if (bodyFont) url += `&fontBody=${encodeURIComponent(bodyFont)}`;
      if (isDark) url += `&isDark=1`;
    }

    const res = await fetch(url);
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

    // Wait for the inline renderer to finish rendering and loading images
    try {
      await (iframe.contentDocument?.fonts?.ready ?? Promise.resolve());
    } catch {
      // Font loading is non-critical
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`Slide ${i + 1} render wait timed out, continuing`);
        resolve();
      }, 15000);
      const poll = () => {
        try {
          if ((iframe.contentWindow as any)?.slideReady) {
            clearTimeout(timeout);
            resolve();
            return;
          }
        } catch {
          // Cross-origin access check failed, fall back to timer
        }
        setTimeout(poll, 100);
      };
      poll();
    });

    // Capture the slide as a JPEG image
    let canvas;
    try {
      canvas = await html2canvas(
        iframe.contentDocument!.documentElement,
        {
          scale: 1,
          useCORS: true,
          backgroundColor: null,
          width: 1920,
          height: 1080,
          logging: false,
          allowTaint: false,
          imageTimeout: 15000,
        },
      );
    } catch {
      // Fallback: capture without CORS for same-origin images
      canvas = await html2canvas(
        iframe.contentDocument!.documentElement,
        {
          scale: 1,
          useCORS: false,
          backgroundColor: null,
          width: 1920,
          height: 1080,
          logging: false,
          allowTaint: false,
        },
      );
    }

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
